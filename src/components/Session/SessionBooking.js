import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  onSnapshot,
  limit,
  orderBy,
  runTransaction,
  doc,
  addDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { addDays, addHours, format, isToday, isTomorrow, startOfDay } from 'date-fns';
import { 
  FiCalendar, 
  FiClock, 
  FiTarget, 
  FiArrowLeft, 
  FiUsers, 
  FiZap, 
  FiLoader,
  FiRefreshCw,
  FiCheck,
  FiStar
} from 'react-icons/fi';
import toast from 'react-hot-toast';

// Session durations following FocusMate's approach
const SESSION_DURATIONS = [
  { 
    value: 25, 
    label: '25 min', 
    description: 'Quick focus sprint',
    icon: '⚡',
    popular: false
  },
  { 
    value: 50, 
    label: '50 min', 
    description: 'Standard session',
    icon: '📚',
    popular: true
  },
  { 
    value: 75, 
    label: '75 min', 
    description: 'Deep work session',
    icon: '🎯',
    popular: false
  }
];

// Task categories inspired by FocusMate
const TASK_CATEGORIES = {
  'Study': [
    'Complete assignment',
    'Read textbook chapter',
    'Review lecture notes',
    'Practice problems',
    'Prepare for exam',
    'Research paper'
  ],
  'Work': [
    'Email management',
    'Report writing',
    'Data analysis',
    'Project planning',
    'Presentation prep',
    'Code review'
  ],
  'Creative': [
    'Writing article',
    'Design mockups',
    'Video editing',
    'Music practice',
    'Art project',
    'Content creation'
  ],
  'Personal': [
    'Organize documents',
    'Plan schedule',
    'Learn new skill',
    'Side project',
    'Job applications',
    'Financial planning'
  ]
};

function SessionBooking() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Core state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState(50);
  const [goal, setGoal] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Study');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState(''); // 'quick-match' | 'create' | 'join'
  const [activeTab, setActiveTab] = useState('quick'); // 'quick' | 'schedule' | 'join'
  const [isMobile] = useState(window.innerWidth <= 768);
  
  // Available sessions for joining
  const [availableSessions, setAvailableSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  
  // Available time slots
  const timeSlots = useMemo(() => generateTimeSlots(selectedDate), [selectedDate]);

  // Generate available time slots
  function generateTimeSlots(date) {
    const slots = [];
    const start = new Date(date);
    start.setHours(6, 0, 0, 0); // 6 AM start
    
    const now = new Date();
    const isSelectedToday = isToday(date);
    
    // Generate 30-minute intervals until 10 PM
    for (let i = 0; i < 32; i++) {
      const slotTime = addHours(start, i * 0.5);
      
      // Only show future slots if today
      if (!isSelectedToday || slotTime > addHours(now, 0.5)) {
        slots.push({
          time: format(slotTime, 'h:mm a'),
          value: slotTime.toISOString(),
          hour: slotTime.getHours(),
          isPrime: (slotTime.getHours() >= 9 && slotTime.getHours() <= 11) ||
                   (slotTime.getHours() >= 14 && slotTime.getHours() <= 17) ||
                   (slotTime.getHours() >= 19 && slotTime.getHours() <= 22)
        });
      }
    }
    
    return slots;
  }

  // Fetch available sessions to join - FIXED QUERY
  const fetchAvailableSessions = useCallback(async () => {
    if (!user) return;
    
    setSessionsLoading(true);
    try {
      const now = new Date();
      
      // Query for sessions that need partners (simplified query)
      const q = query(
        collection(db, 'sessions'),
        where('status', '==', 'scheduled'),
        where('duration', '==', duration),
        orderBy('startTime', 'asc'),
        limit(20)
      );
      
      const snapshot = await getDocs(q);
      const sessions = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(session => {
          // Filter on client side for better compatibility
          return session.userId !== user.uid && 
                 !session.partnerId && 
                 new Date(session.startTime) > now;
        });
      
      console.log('Available sessions found:', sessions.length);
      setAvailableSessions(sessions);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      setAvailableSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [duration, user]);

  // Real-time updates for available sessions
  useEffect(() => {
    if (activeTab === 'join') {
      fetchAvailableSessions();
    }
  }, [activeTab, fetchAvailableSessions]);

  // Quick match - FIXED LOGIC
  const handleQuickMatch = async () => {
    if (!goal.trim()) {
      toast.error('Please enter your goal first');
      return;
    }

    setLoading(true);
    setLoadingType('quick-match');
    
    try {
      console.log('Starting quick match...');
      
      // Look for any available session with same duration
      const q = query(
        collection(db, 'sessions'),
        where('status', '==', 'scheduled'),
        where('duration', '==', duration),
        orderBy('startTime', 'asc'),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      const availableSessions = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(session => 
          session.userId !== user.uid && 
          !session.partnerId
        );
      
      console.log('Found available sessions:', availableSessions.length);
      
      if (availableSessions.length > 0) {
        // Join the first available session
        const sessionToJoin = availableSessions[0];
        const result = await joinSession(sessionToJoin.id, sessionToJoin.userName);
        
        if (result.success) {
          toast.success(`🎉 Quick match found! Joined ${result.partnerName}'s session!`);
          navigate('/dashboard');
          return;
        }
      }
      
      // No match found, create new session for immediate start
      const now = new Date();
      const startTime = new Date(now.getTime() + 2 * 60000); // 2 minutes from now
      
      const sessionData = {
        userId: user.uid,
        userName: user.displayName || user.email?.split('@')[0] || 'User',
        userPhoto: user.photoURL || null,
        startTime: startTime.toISOString(),
        endTime: addHours(startTime, duration / 60).toISOString(),
        duration: duration,
        goal: goal.trim(),
        category: selectedCategory
      };

      const result = await createSession(sessionData);
      
      if (result.success) {
        toast.success(`📚 Session created and ready to join! Starting in 2 minutes.`);
        navigate('/dashboard');
      }
      
    } catch (error) {
      console.error('Quick match error:', error);
      toast.error('Quick match failed. Please try manual booking.');
    } finally {
      setLoading(false);
      setLoadingType('');
    }
  };

  // Create session - SIMPLIFIED
  const createSession = async (sessionData) => {
    try {
      console.log('Creating session with data:', sessionData);
      
      const newSessionData = {
        ...sessionData,
        createdAt: serverTimestamp(),
        status: 'scheduled',
        partnerId: null,
        partnerName: null,
        partnerPhoto: null,
        participants: [user.uid],
        maxParticipants: 2
      };
      
      const docRef = await addDoc(collection(db, 'sessions'), newSessionData);
      console.log('Session created with ID:', docRef.id);
      
      return {
        success: true,
        sessionId: docRef.id
      };
    } catch (error) {
      console.error('Create session failed:', error);
      throw error;
    }
  };

  // Join existing session - FIXED LOGIC
  const joinSession = async (sessionId, partnerName) => {
    try {
      console.log('Attempting to join session:', sessionId);
      
      const sessionRef = doc(db, 'sessions', sessionId);
      
      const result = await runTransaction(db, async (transaction) => {
        const sessionDoc = await transaction.get(sessionRef);
        
        if (!sessionDoc.exists()) {
          throw new Error('Session no longer exists');
        }
        
        const sessionData = sessionDoc.data();
        console.log('Session data:', sessionData);
        
        if (sessionData.partnerId) {
          throw new Error('Session already has a partner');
        }
        
        if (sessionData.userId === user.uid) {
          throw new Error('Cannot join your own session');
        }
        
        // Get current participants array or create new one
        const currentParticipants = sessionData.participants || [sessionData.userId];
        
        // Add user to participants if not already there
        if (!currentParticipants.includes(user.uid)) {
          currentParticipants.push(user.uid);
        }
        
        // Update session with partner info
        transaction.update(sessionRef, {
          partnerId: user.uid,
          partnerName: user.displayName || user.email?.split('@')[0] || 'Study Partner',
          partnerPhoto: user.photoURL || null,
          participants: currentParticipants,
          updatedAt: serverTimestamp()
        });
        
        return {
          success: true,
          sessionId: sessionId,
          partnerName: partnerName
        };
      });
      
      console.log('Successfully joined session');
      return result;
    } catch (error) {
      console.error('Join session failed:', error);
      throw error;
    }
  };

  // Handle scheduled session creation
  const handleCreateScheduled = async () => {
    if (!selectedTime) {
      toast.error('Please select a time');
      return;
    }
    if (!goal.trim()) {
      toast.error('Please enter your goal');
      return;
    }

    setLoading(true);
    setLoadingType('create');
    
    try {
      const sessionData = {
        userId: user.uid,
        userName: user.displayName || user.email?.split('@')[0] || 'User',
        userPhoto: user.photoURL || null,
        startTime: selectedTime,
        endTime: addHours(new Date(selectedTime), duration / 60).toISOString(),
        duration: duration,
        goal: goal.trim(),
        category: selectedCategory
      };

      const result = await createSession(sessionData);
      
      if (result.success) {
        toast.success('📚 Session created! Check your dashboard.');
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error creating session:', error);
      toast.error('Failed to create session. Please try again.');
    } finally {
      setLoading(false);
      setLoadingType('');
    }
  };

  // Handle joining a specific session - SIMPLIFIED
  const handleJoinSpecific = async (sessionId, creatorName) => {
    if (!goal.trim()) {
      toast.error('Please enter your goal first');
      return;
    }

    setLoading(true);
    setLoadingType('join');
    
    try {
      const result = await joinSession(sessionId, creatorName);
      
      if (result.success) {
        toast.success(`🤝 Joined ${creatorName}'s session!`);
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error joining session:', error);
      if (error.message === 'Session already has a partner') {
        toast.error('This session is now full. Please try another one.');
        fetchAvailableSessions();
      } else if (error.message === 'Cannot join your own session') {
        toast.error('You cannot join your own session.');
      } else {
        toast.error('Failed to join session. Please try again.');
      }
    } finally {
      setLoading(false);
      setLoadingType('');
    }
  };

  // Format date label
  const formatDateLabel = (date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  // Handle goal suggestion
  const handleGoalSuggestion = (suggestion) => {
    setGoal(suggestion);
  };

  return (
    <div className="booking-container">
      <div className="booking-card">
        {/* Header */}
        <div className="booking-header">
          <button 
            className="back-button"
            onClick={() => navigate('/dashboard')}
          >
            <FiArrowLeft />
          </button>
          <div className="header-content">
            <h2>Book a Focus Session</h2>
            <p>Work alongside someone else to stay focused and motivated</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-nav">
          <button 
            className={`tab-btn ${activeTab === 'quick' ? 'active' : ''}`}
            onClick={() => setActiveTab('quick')}
          >
            <FiZap /> Quick Match
          </button>
          <button 
            className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
            onClick={() => setActiveTab('schedule')}
          >
            <FiCalendar /> Schedule
          </button>
          <button 
            className={`tab-btn ${activeTab === 'join' ? 'active' : ''}`}
            onClick={() => setActiveTab('join')}
          >
            <FiUsers /> Join ({availableSessions.length})
          </button>
        </div>

        <div className="tab-content">
          {/* Quick Match Tab */}
          {activeTab === 'quick' && (
            <div className="quick-match-section">
              <div className="quick-match-hero">
                <div className="hero-icon">⚡</div>
                <h3>Quick Match</h3>
                <p>We'll find you an available partner or create a session for others to join</p>
              </div>

              {/* Duration Selection */}
              <div className="form-section">
                <label>Session Duration</label>
                <div className="duration-grid">
                  {SESSION_DURATIONS.map(option => (
                    <button
                      key={option.value}
                      className={`duration-card ${duration === option.value ? 'active' : ''} ${option.popular ? 'popular' : ''}`}
                      onClick={() => setDuration(option.value)}
                    >
                      <div className="duration-icon">{option.icon}</div>
                      <div className="duration-label">{option.label}</div>
                      <div className="duration-desc">{option.description}</div>
                      {option.popular && <div className="popular-badge">Most Popular</div>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Goal Input */}
              <div className="form-section">
                <label><FiTarget /> What will you work on?</label>
                <textarea
                  className="goal-input"
                  placeholder="e.g., Complete math homework, Write report, Study for exam..."
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  maxLength={200}
                  rows={3}
                />
                
                {/* Category-based suggestions */}
                <div className="goal-suggestions">
                  <div className="category-tabs">
                    {Object.keys(TASK_CATEGORIES).map(category => (
                      <button
                        key={category}
                        className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(category)}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                  
                  <div className="suggestions-grid">
                    {TASK_CATEGORIES[selectedCategory].map((suggestion, i) => (
                      <button
                        key={i}
                        className="suggestion-chip"
                        onClick={() => handleGoalSuggestion(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="char-counter">
                  {goal.length}/200
                </div>
              </div>

              {/* Quick Match Button */}
              <button
                className="btn-primary btn-large quick-match-btn"
                onClick={handleQuickMatch}
                disabled={loading || !goal.trim()}
              >
                {loading && loadingType === 'quick-match' ? (
                  <>
                    <FiLoader className="spinning" />
                    Finding partner...
                  </>
                ) : (
                  <>
                    <FiZap />
                    Find Quick Match
                  </>
                )}
              </button>

              <div className="quick-match-info">
                <p>
                  <FiCheck className="check-icon" />
                  We'll match you with someone immediately, or create a session for others to join
                </p>
              </div>
            </div>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="schedule-section">
              {/* Date Selection */}
              <div className="form-section">
                <label><FiCalendar /> Select Date</label>
                <div className="date-grid">
                  {[0, 1, 2, 3, 4, 5, 6].map(days => {
                    const date = addDays(new Date(), days);
                    return (
                      <button
                        key={days}
                        className={`date-card ${selectedDate.toDateString() === date.toDateString() ? 'active' : ''}`}
                        onClick={() => setSelectedDate(date)}
                      >
                        <div className="date-label">{formatDateLabel(date)}</div>
                        <div className="date-number">{format(date, 'd')}</div>
                        <div className="date-day">{format(date, 'EEE')}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Selection */}
              <div className="form-section">
                <label><FiClock /> Select Time</label>
                <div className="time-grid">
                  {timeSlots.map(slot => (
                    <button
                      key={slot.value}
                      className={`time-slot ${selectedTime === slot.value ? 'active' : ''} ${slot.isPrime ? 'prime-time' : ''}`}
                      onClick={() => setSelectedTime(slot.value)}
                    >
                      <span className="time-text">{slot.time}</span>
                      {slot.isPrime && <span className="prime-badge">Popular</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="form-section">
                <label>Duration</label>
                <div className="duration-options">
                  {SESSION_DURATIONS.map(option => (
                    <button
                      key={option.value}
                      className={`duration-option ${duration === option.value ? 'active' : ''}`}
                      onClick={() => setDuration(option.value)}
                    >
                      {option.icon} {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Goal */}
              <div className="form-section">
                <label><FiTarget /> Your Goal</label>
                <textarea
                  className="goal-input"
                  placeholder="What will you work on during this session?"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  maxLength={200}
                  rows={3}
                />
                <div className="char-counter">{goal.length}/200</div>
              </div>

              {/* Create Button */}
              <button
                className="btn-primary btn-large"
                onClick={handleCreateScheduled}
                disabled={loading || !selectedTime || !goal.trim()}
              >
                {loading && loadingType === 'create' ? (
                  <>
                    <FiLoader className="spinning" />
                    Creating Session...
                  </>
                ) : (
                  <>
                    <FiCalendar />
                    Create Session
                  </>
                )}
              </button>
            </div>
          )}

          {/* Join Sessions Tab */}
          {activeTab === 'join' && (
            <div className="join-section">
              {/* Filters */}
              <div className="join-filters">
                <div className="filter-row">
                  <div className="filter-group">
                    <label>Duration</label>
                    <select 
                      value={duration} 
                      onChange={(e) => setDuration(parseInt(e.target.value))}
                      className="duration-select"
                    >
                      {SESSION_DURATIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <button 
                    onClick={fetchAvailableSessions}
                    className="refresh-btn"
                    disabled={sessionsLoading}
                  >
                    <FiRefreshCw className={sessionsLoading ? 'spinning' : ''} />
                    Refresh
                  </button>
                </div>

                {/* Goal for joining */}
                <div className="filter-group">
                  <label><FiTarget /> Your Goal</label>
                  <input
                    type="text"
                    placeholder="What will you work on?"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    maxLength={200}
                    className="goal-input-inline"
                  />
                </div>
              </div>

              {/* Available Sessions */}
              <div className="available-sessions">
                <div className="sessions-header">
                  <h3>Available Sessions</h3>
                </div>
                
                {sessionsLoading ? (
                  <div className="loading-state">
                    <FiLoader className="spinner" />
                    <p>Loading available sessions...</p>
                  </div>
                ) : availableSessions.length > 0 ? (
                  <div className="sessions-list">
                    {availableSessions.map(session => (
                      <div key={session.id} className="session-card">
                        <div className="session-time">
                          <div className="time">{format(new Date(session.startTime), 'h:mm a')}</div>
                          <div className="date">{formatDateLabel(new Date(session.startTime))}</div>
                        </div>
                        
                        <div className="session-info">
                          <div className="creator">
                            <div className="avatar">
                              {session.userPhoto ? (
                                <img src={session.userPhoto} alt={session.userName} />
                              ) : (
                                <span>{session.userName?.charAt(0) || 'S'}</span>
                              )}
                            </div>
                            <div className="creator-details">
                              <div className="name">{session.userName || 'Study Partner'}</div>
                              <div className="duration">
                                <FiClock /> {session.duration} min
                              </div>
                            </div>
                          </div>
                          
                          <div className="session-goal">
                            <strong>Goal:</strong> {session.goal}
                          </div>
                        </div>
                        
                        <button
                          className="btn-primary btn-small"
                          onClick={() => handleJoinSpecific(session.id, session.userName)}
                          disabled={loading || !goal.trim()}
                        >
                          {loading && loadingType === 'join' ? (
                            <FiLoader className="spinning" />
                          ) : (
                            <>
                              <FiUsers />
                              Join
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">👥</div>
                    <h4>No Available Sessions</h4>
                    <p>No sessions available with {duration}-minute duration.</p>
                    <p>Try a different duration, or create your own session!</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SessionBooking;