import React, { useState, useEffect, useCallback } from 'react';
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
  addDoc
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { addDays, addHours, format, isToday, isTomorrow } from 'date-fns';
import { 
  FiCalendar, 
  FiClock, 
  FiTarget, 
  FiArrowLeft, 
  FiUsers, 
  FiZap, 
  FiEye, 
  FiUserPlus,
  FiRefreshCw,
  FiLoader
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function SessionBooking() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Form state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState(50);
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [availableSessions, setAvailableSessions] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [activeTab, setActiveTab] = useState('create');
  const [refreshing, setRefreshing] = useState(false);

  // Enhanced goal suggestions categorized by exam/subject
  const goalCategories = {
    'JEE/NEET': [
      'Physics numericals practice',
      'Chemistry organic reactions',
      'Mathematics calculus problems',
      'Biology diagrams and notes',
      'Previous year questions',
      'Mock test analysis'
    ],
    'Board Exams': [
      'Complete chapter revision',
      'Important questions practice',
      'Project work completion',
      'Notes preparation',
      'Diagram practice',
      'Formula memorization'
    ],
    'Competitive': [
      'Reasoning practice',
      'Quantitative aptitude',
      'English comprehension',
      'Current affairs study',
      'Mock test practice',
      'Speed improvement'
    ],
    'General': [
      'Assignment completion',
      'Research work',
      'Presentation preparation',
      'Reading and notes',
      'Skill development',
      'Language learning'
    ]
  };

  const [selectedCategory, setSelectedCategory] = useState('General');
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Generate time slots for the day
  const generateTimeSlots = useCallback(() => {
    const slots = [];
    const start = new Date(selectedDate);
    start.setHours(6, 0, 0, 0); // Start from 6 AM
    
    const now = new Date();
    const isSelectedToday = isToday(selectedDate);
    
    for (let i = 0; i < 32; i++) { // Generate slots till 10 PM
      const slotTime = addHours(start, i * 0.5);
      
      // Only show future slots if selected date is today
      if (!isSelectedToday || slotTime > addHours(now, 0.5)) {
        slots.push({
          time: format(slotTime, 'h:mm a'),
          value: slotTime.toISOString(),
          hour: slotTime.getHours(),
          slotId: `${format(slotTime, 'yyyy-MM-dd-HH-mm')}-${duration}min`
        });
      }
    }
    
    setAvailableSlots(slots);
  }, [selectedDate, duration]);

  // Fetch available sessions that users can join
  const fetchAvailableSessions = useCallback(async (showLoader = true) => {
    if (!user) return;
    
    if (showLoader) setLoadingSessions(true);
    try {
      const now = new Date();
      const dayStart = new Date(selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(selectedDate);
      dayEnd.setHours(23, 59, 59, 999);
      
      // Query for sessions created by others that need partners
      const q = query(
        collection(db, 'sessions'),
        where('status', '==', 'scheduled'),
        where('partnerId', '==', null),
        where('userId', '!=', user.uid),
        where('startTime', '>=', dayStart.toISOString()),
        where('startTime', '<=', dayEnd.toISOString()),
        where('duration', '==', duration),
        orderBy('startTime', 'asc'),
        limit(20)
      );
      
      const snapshot = await getDocs(q);
      const sessions = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(session => {
          const sessionTime = new Date(session.startTime);
          return sessionTime > addHours(now, 0.25); // At least 15 minutes in future
        });
      
      setAvailableSessions(sessions);
    } catch (error) {
      console.error('Error fetching available sessions:', error);
      setAvailableSessions([]);
      if (showLoader) {
        toast.error('Failed to load available sessions');
      }
    } finally {
      setLoadingSessions(false);
    }
  }, [selectedDate, duration, user]);

  useEffect(() => {
    generateTimeSlots();
  }, [selectedDate, generateTimeSlots]);

  useEffect(() => {
    if (activeTab === 'join') {
      fetchAvailableSessions();
    }
  }, [activeTab, selectedDate, duration, fetchAvailableSessions]);

  // Set up real-time listener for available sessions
  useEffect(() => {
    if (activeTab !== 'join' || !user) return;

    const now = new Date();
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'sessions'),
      where('status', '==', 'scheduled'),
      where('partnerId', '==', null),
      where('userId', '!=', user.uid),
      where('startTime', '>=', dayStart.toISOString()),
      where('startTime', '<=', dayEnd.toISOString()),
      where('duration', '==', duration),
      orderBy('startTime', 'asc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(session => {
          const sessionTime = new Date(session.startTime);
          return sessionTime > addHours(now, 0.25);
        });
      
      setAvailableSessions(sessions);
      setLoadingSessions(false);
    });

    return () => unsubscribe();
  }, [activeTab, selectedDate, duration, user]);

  const formatDateLabel = (date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  // Atomic session creation using Firestore transactions
  const createSession = async (sessionData) => {
    try {
      const sessionRef = doc(collection(db, 'sessions'));
      
      const result = await runTransaction(db, async (transaction) => {
        const newSessionData = {
          ...sessionData,
          id: sessionRef.id,
          createdAt: serverTimestamp(),
          status: 'scheduled',
          partnerId: null,
          partnerName: null,
          partnerPhoto: null,
          participants: [user.uid],
          maxParticipants: 2
        };
        
        transaction.set(sessionRef, newSessionData);
        
        return {
          success: true,
          sessionId: sessionRef.id,
          type: 'created'
        };
      });
      
      return result;
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  };

  // Join an existing session atomically
  const joinExistingSession = async (existingSessionId) => {
    try {
      const sessionRef = doc(db, 'sessions', existingSessionId);
      
      const result = await runTransaction(db, async (transaction) => {
        const sessionDoc = await transaction.get(sessionRef);
        
        if (!sessionDoc.exists()) {
          throw new Error('Session no longer exists');
        }
        
        const sessionData = sessionDoc.data();
        
        if (sessionData.partnerId) {
          throw new Error('Session already has a partner');
        }
        
        if (sessionData.userId === user.uid) {
          throw new Error('Cannot join your own session');
        }
        
        // Update session with partner info
        transaction.update(sessionRef, {
          partnerId: user.uid,
          partnerName: user.displayName || user.email?.split('@')[0] || 'Study Partner',
          partnerPhoto: user.photoURL || null,
          participants: [sessionData.userId, user.uid],
          updatedAt: serverTimestamp()
        });
        
        return {
          success: true,
          sessionId: existingSessionId,
          type: 'joined',
          creatorName: sessionData.userName || 'Study Partner'
        };
      });
      
      return result;
    } catch (error) {
      console.error('Join session failed:', error);
      throw error;
    }
  };

  const handleQuickMatch = async () => {
    if (!goal.trim()) {
      toast.error('Please enter your study goal first');
      return;
    }

    setLoading(true);
    
    try {
      // Look for any available session with a partner waiting
      const now = new Date();
      const q = query(
        collection(db, 'sessions'),
        where('status', '==', 'scheduled'),
        where('partnerId', '==', null),
        where('userId', '!=', user.uid),
        where('duration', '==', duration),
        orderBy('startTime', 'asc'),
        limit(5)
      );
      
      const snapshot = await getDocs(q);
      
      for (const docSnap of snapshot.docs) {
        const sessionData = docSnap.data();
        const sessionTime = new Date(sessionData.startTime);
        
        // Check if session is in the future (at least 15 minutes)
        if (sessionTime > addHours(now, 0.25)) {
          try {
            const result = await joinExistingSession(docSnap.id);
            
            if (result.success) {
              toast.success(`Quick match found! Joined ${result.creatorName}'s session! 🎉`);
              navigate(`/session/${result.sessionId}`);
              return;
            }
          } catch (error) {
            console.log('Failed to join session, trying next one:', error.message);
            continue;
          }
        }
      }
      
      // No quick match found, create a new session for the next available slot
      const nextSlot = availableSlots.find(slot => {
        const slotTime = new Date(slot.value);
        return slotTime > addHours(now, 0.5);
      });
      
      if (nextSlot) {
        const sessionData = {
          userId: user.uid,
          userName: user.displayName || user.email?.split('@')[0] || 'User',
          userPhoto: user.photoURL || null,
          startTime: nextSlot.value,
          endTime: addHours(new Date(nextSlot.value), duration / 60).toISOString(),
          duration: duration,
          goal: goal.trim()
        };

        const result = await createSession(sessionData);
        
        if (result.success) {
          toast.success('Session created! Waiting for a study partner to join 📚');
          navigate(`/session/${result.sessionId}`);
        }
      } else {
        toast.error('No available time slots for quick match');
      }
      
    } catch (error) {
      console.error('Error in quick match:', error);
      toast.error('Failed to find quick match. Please try manual booking.');
    }
    
    setLoading(false);
  };

  const handleCreateSession = async () => {
    if (!selectedTime) {
      toast.error('Please select a time');
      return;
    }
    if (!goal.trim()) {
      toast.error('Please enter your study goal');
      return;
    }

    setLoading(true);
    
    try {
      const sessionData = {
        userId: user.uid,
        userName: user.displayName || user.email?.split('@')[0] || 'User',
        userPhoto: user.photoURL || null,
        startTime: selectedTime,
        endTime: addHours(new Date(selectedTime), duration / 60).toISOString(),
        duration: duration,
        goal: goal.trim()
      };

      const result = await createSession(sessionData);
      
      if (result.success) {
        toast.success('Session created! Others can now join your session 📚');
        navigate(`/session/${result.sessionId}`);
      }
    } catch (error) {
      console.error('Error creating session:', error);
      toast.error('Failed to create session. Please try again.');
    }
    
    setLoading(false);
  };

  const handleJoinSession = async (sessionId, creatorName) => {
    if (!goal.trim()) {
      toast.error('Please enter your study goal first');
      return;
    }

    setLoading(true);
    
    try {
      const result = await joinExistingSession(sessionId);
      
      if (result.success) {
        toast.success(`Joined ${creatorName}'s session! 🤝`);
        navigate(`/session/${result.sessionId}`);
      }
    } catch (error) {
      console.error('Error joining session:', error);
      if (error.message === 'Session already has a partner') {
        toast.error('This session is now full. Please try another one.');
        fetchAvailableSessions(false); // Refresh the list
      } else if (error.message === 'Session no longer exists') {
        toast.error('This session is no longer available.');
        fetchAvailableSessions(false); // Refresh the list
      } else {
        toast.error('Failed to join session. Please try again.');
      }
    }
    
    setLoading(false);
  };

  const handleGoalSuggestionClick = (suggestion) => {
    setGoal(suggestion);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'join') {
      fetchAvailableSessions(false).finally(() => setRefreshing(false));
    } else {
      generateTimeSlots();
      setRefreshing(false);
    }
    toast.success('Refreshed!');
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
            <h2 className="booking-title">Study Sessions</h2>
            <p className="booking-subtitle">Create a session or join an existing one</p>
          </div>
          <button 
            className="refresh-button"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <FiRefreshCw className={refreshing ? 'spinning' : ''} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="tab-switcher">
          <button 
            className={`tab-button ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            <FiUserPlus /> Create Session
          </button>
          <button 
            className={`tab-button ${activeTab === 'join' ? 'active' : ''}`}
            onClick={() => setActiveTab('join')}
          >
            <FiEye /> Join Sessions ({availableSessions.length})
          </button>
        </div>

        {activeTab === 'create' ? (
          <>
            {/* Quick Match Option */}
            <div className="quick-match-section">
              <div className="quick-match-card">
                <div className="quick-match-icon">
                  <FiZap />
                </div>
                <div className="quick-match-content">
                  <h3>Quick Partner Match</h3>
                  <p>Find an available partner or create a session for others to join</p>
                </div>
                <button 
                  className="btn-quick-match"
                  onClick={handleQuickMatch}
                  disabled={loading || !goal.trim()}
                >
                  {loading ? <FiLoader className="spinning" /> : <FiUsers />}
                  Quick Match
                </button>
              </div>
            </div>

            <div className="divider">
              <span>OR CREATE A SPECIFIC TIME</span>
            </div>
            
            <div className="booking-form">
              {/* Date Selection */}
              <div className="form-group">
                <label><FiCalendar /> Select Date</label>
                <div className="date-picker">
                  {[0, 1, 2, 3, 4, 5, 6].map(days => {
                    const date = addDays(new Date(), days);
                    return (
                      <button
                        key={days}
                        className={`date-btn ${selectedDate.toDateString() === date.toDateString() ? 'active' : ''}`}
                        onClick={() => setSelectedDate(date)}
                      >
                        <div className="date-day">{formatDateLabel(date)}</div>
                        <div className="date-num">{format(date, 'd')}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Selection */}
              <div className="form-group">
                <label><FiClock /> Select Time</label>
                <div className="time-grid">
                  {availableSlots.map(slot => (
                    <button
                      key={slot.value}
                      className={`time-slot ${selectedTime === slot.value ? 'active' : ''} ${
                        slot.hour >= 9 && slot.hour <= 11 ? 'popular morning' :
                        slot.hour >= 14 && slot.hour <= 17 ? 'popular afternoon' :
                        slot.hour >= 19 && slot.hour <= 22 ? 'popular evening' : ''
                      }`}
                      onClick={() => setSelectedTime(slot.value)}
                    >
                      <span className="time-text">{slot.time}</span>
                      {!isMobile && <span className="available-indicator">✨ Available</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="form-group">
                <label>Session Duration</label>
                <div className="duration-options">
                  {[
                    { value: 25, label: '25 min', desc: 'Quick sprint', icon: '⚡' },
                    { value: 50, label: '50 min', desc: 'Standard session', icon: '📚' },
                    { value: 90, label: '90 min', desc: 'Deep focus', icon: '🎯' }
                  ].map(option => (
                    <button
                      key={option.value}
                      className={`duration-btn ${duration === option.value ? 'active' : ''}`}
                      onClick={() => setDuration(option.value)}
                    >
                      <div className="duration-icon">{option.icon}</div>
                      <div className="duration-content">
                        <div className="duration-label">{option.label}</div>
                        {!isMobile && <div className="duration-desc">{option.desc}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Goal Category */}
              <div className="form-group">
                <label>Study Category</label>
                <div className="category-tabs">
                  {Object.keys(goalCategories).map(category => (
                    <button
                      key={category}
                      className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              {/* Goal */}
              <div className="form-group">
                <label><FiTarget /> Study Goal</label>
                <textarea
                  className="goal-input"
                  placeholder="What will you work on during this session?"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  maxLength={200}
                  rows={3}
                />
                
                <div className="goal-suggestions">
                  <h4>Quick suggestions for {selectedCategory}:</h4>
                  <div className="suggestions-grid">
                    {goalCategories[selectedCategory].map((suggestion, i) => (
                      <button
                        key={i}
                        className="suggestion-btn"
                        onClick={() => handleGoalSuggestionClick(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="char-counter">
                  <span>{goal.length}/200</span>
                </div>
              </div>

              {/* Create Button */}
              <button
                className="btn-primary btn-large"
                onClick={handleCreateSession}
                disabled={loading || !selectedTime || !goal.trim()}
              >
                {loading ? (
                  <>
                    <FiLoader className="spinning" />
                    Creating Session...
                  </>
                ) : (
                  <>
                    <FiUserPlus />
                    Create Session & Wait for Partner
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          // Join Available Sessions Tab
          <div className="join-sessions-section">
            {/* Date and Duration filters */}
            <div className="filters-section">
              <div className="form-group">
                <label><FiCalendar /> Date</label>
                <div className="date-picker">
                  {[0, 1, 2, 3, 4, 5, 6].map(days => {
                    const date = addDays(new Date(), days);
                    return (
                      <button
                        key={days}
                        className={`date-btn ${selectedDate.toDateString() === date.toDateString() ? 'active' : ''}`}
                        onClick={() => setSelectedDate(date)}
                      >
                        <div className="date-day">{formatDateLabel(date)}</div>
                        <div className="date-num">{format(date, 'd')}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label>Duration Filter</label>
                <div className="duration-options">
                  {[
                    { value: 25, label: '25 min', icon: '⚡' },
                    { value: 50, label: '50 min', icon: '📚' },
                    { value: 90, label: '90 min', icon: '🎯' }
                  ].map(option => (
                    <button
                      key={option.value}
                      className={`duration-btn ${duration === option.value ? 'active' : ''}`}
                      onClick={() => setDuration(option.value)}
                    >
                      <div className="duration-icon">{option.icon}</div>
                      <div className="duration-label">{option.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Goal for joining */}
              <div className="form-group">
                <label><FiTarget /> Your Study Goal</label>
                <textarea
                  className="goal-input"
                  placeholder="What will you work on during this session?"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  maxLength={200}
                  rows={2}
                />
                <div className="char-counter">
                  <span>{goal.length}/200</span>
                </div>
              </div>
            </div>

            {/* Available Sessions List */}
            <div className="available-sessions">
              <div className="sessions-header">
                <h3>
                  <FiUsers /> Available Sessions ({availableSessions.length})
                </h3>
                <button 
                  className="refresh-sessions"
                  onClick={() => fetchAvailableSessions(false)}
                  disabled={loadingSessions}
                >
                  <FiRefreshCw className={loadingSessions ? 'spinning' : ''} />
                </button>
              </div>
              
              {loadingSessions ? (
                <div className="loading-container">
                  <FiLoader className="spinner" />
                  <p>Loading available sessions...</p>
                </div>
              ) : availableSessions.length > 0 ? (
                <div className="sessions-list">
                  {availableSessions.map(session => (
                    <div key={session.id} className="available-session-card">
                      <div className="session-time">
                        <div className="time-display">
                          {format(new Date(session.startTime), 'h:mm a')}
                        </div>
                        <div className="date-display">
                          {formatDateLabel(new Date(session.startTime))}
                        </div>
                      </div>
                      
                      <div className="session-details">
                        <div className="creator-info">
                          <div className="creator-avatar">
                            {session.userPhoto ? (
                              <img src={session.userPhoto} alt={session.userName} />
                            ) : (
                              <div className="avatar-placeholder">
                                {session.userName?.charAt(0).toUpperCase() || 'S'}
                              </div>
                            )}
                          </div>
                          <div className="creator-details">
                            <div className="creator-name">
                              {session.userName || 'Study Partner'}
                            </div>
                            <div className="session-duration">
                              <FiClock /> {session.duration} minutes
                            </div>
                          </div>
                        </div>
                        
                        <div className="session-goal">
                          <strong>Goal:</strong> {session.goal}
                        </div>
                      </div>
                      
                      <div className="session-actions">
                        <button
                          className="btn-primary"
                          onClick={() => handleJoinSession(session.id, session.userName)}
                          disabled={loading || !goal.trim()}
                        >
                          {loading ? (
                            <FiLoader className="spinning" />
                          ) : (
                            <>
                              <FiUsers />
                              {isMobile ? 'Join' : 'Join Session'}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-sessions">
                  <div className="empty-icon">👥</div>
                  <h4>No Available Sessions</h4>
                  <p>No sessions available for {formatDateLabel(selectedDate)} with {duration}-minute duration.</p>
                  <p>Try selecting a different date or duration, or create your own session!</p>
                  <button 
                    className="btn-secondary"
                    onClick={() => setActiveTab('create')}
                  >
                    <FiUserPlus /> Create New Session
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionBooking;