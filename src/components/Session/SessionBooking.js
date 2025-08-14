import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp,
  onSnapshot,
  limit,
  orderBy,
  runTransaction,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { addDays, addHours, format, isToday, isTomorrow, endOfDay } from 'date-fns';
import { FiCalendar, FiClock, FiTarget, FiArrowLeft, FiUsers, FiZap } from 'react-icons/fi';
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
  const [partnersAvailable, setPartnersAvailable] = useState({});
  const [bookedSlots, setBookedSlots] = useState(new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);

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

  // Generate time slot ID for consistent matching
  const generateTimeSlotId = (startTime, duration) => {
    const date = new Date(startTime);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hour}:${minute}-${duration}min`;
  };

  const generateTimeSlots = useCallback(() => {
    const slots = [];
    const start = new Date(selectedDate);
    start.setHours(6, 0, 0, 0); // Start from 6 AM
    
    const now = new Date();
    const isSelectedToday = isToday(selectedDate);
    
    for (let i = 0; i < 32; i++) { // Generate slots till 10 PM
      const slotTime = addHours(start, i * 0.5);
      
      // Only show future slots if selected date is today
      if (!isSelectedToday || slotTime > now) {
        slots.push({
          time: format(slotTime, 'h:mm a'),
          value: slotTime.toISOString(),
          hour: slotTime.getHours(),
          slotId: generateTimeSlotId(slotTime, duration)
        });
      }
    }
    
    setAvailableSlots(slots);
  }, [selectedDate, duration]);

  const checkBookedSlots = useCallback(async () => {
    setLoadingSlots(true);
    
    // Set timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      setLoadingSlots(false);
      setBookedSlots(new Set());
      setPartnersAvailable({});
    }, 3000);

    try {
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      // Query time slots for this date
      const dayString = format(selectedDate, 'yyyy-MM-dd');
      const timeSlotsQuery = query(
        collection(db, 'timeSlots'),
        where('date', '==', dayString),
        where('duration', '==', duration),
        limit(50)
      );
      
      const snapshot = await getDocs(timeSlotsQuery);
      const booked = new Set();
      const partners = {};
      
      snapshot.docs.forEach(docSnap => {
        const slotData = docSnap.data();
        const slotTime = slotData.startTime;
        
        if (slotData.participants && slotData.participants.length >= 2) {
          // Slot is full
          booked.add(slotTime);
        } else if (slotData.participants && slotData.participants.length === 1) {
          // One person waiting for partner
          const waitingUser = slotData.participants[0];
          if (waitingUser.userId !== user.uid) {
            if (!partners[slotTime]) {
              partners[slotTime] = [];
            }
            partners[slotTime].push({
              id: docSnap.id,
              sessionId: slotData.sessionId,
              ...waitingUser
            });
          }
        }
      });
      
      clearTimeout(timeout);
      setBookedSlots(booked);
      setPartnersAvailable(partners);
    } catch (error) {
      console.error('Error checking booked slots:', error);
      clearTimeout(timeout);
      setBookedSlots(new Set());
      setPartnersAvailable({});
    } finally {
      setLoadingSlots(false);
    }
  }, [selectedDate, duration, user.uid]);

  useEffect(() => {
    generateTimeSlots();
  }, [selectedDate, generateTimeSlots]);

  useEffect(() => {
    checkBookedSlots();
  }, [selectedDate, duration, checkBookedSlots]);

  const formatDateLabel = (date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  const getTimeSlotClass = (slot) => {
    let className = 'time-slot';
    
    // Check if this slot is fully booked
    if (bookedSlots.has(slot.value)) {
      className += ' booked';
      return className;
    }
    
    // Popular times (peak study hours)
    if (slot.hour >= 9 && slot.hour <= 11) {
      className += ' popular morning';
    } else if (slot.hour >= 14 && slot.hour <= 17) {
      className += ' popular afternoon';
    } else if (slot.hour >= 19 && slot.hour <= 22) {
      className += ' popular evening';
    }
    
    // Check if partners are available
    const partnersCount = partnersAvailable[slot.value]?.length || 0;
    if (partnersCount > 0) {
      className += ' has-partners';
    }
    
    if (selectedTime === slot.value) {
      className += ' active';
    }
    
    return className;
  };

  const isSlotBooked = (slotValue) => {
    return bookedSlots.has(slotValue);
  };

  // Atomic booking function using Firestore transactions
  const bookSessionAtomic = async (startTime, sessionData) => {
    try {
      const slotId = generateTimeSlotId(startTime, duration);
      const timeSlotRef = doc(db, 'timeSlots', slotId);
      
      console.log('Attempting atomic booking for slot:', slotId);
      
      const result = await runTransaction(db, async (transaction) => {
        // Read the time slot document
        const timeSlotDoc = await transaction.get(timeSlotRef);
        
        if (!timeSlotDoc.exists()) {
          // Create new time slot with first participant
          console.log('Creating new time slot');
          const sessionRef = doc(collection(db, 'sessions'));
          
          // Create session data
          const newSessionData = {
            ...sessionData,
            createdAt: serverTimestamp(),
            status: 'scheduled',
            partnerId: null,
            partnerName: null,
            partnerPhoto: null
          };
          
          // Create session
          transaction.set(sessionRef, newSessionData);
          
          // Create time slot
          transaction.set(timeSlotRef, {
            slotId: slotId,
            date: format(new Date(startTime), 'yyyy-MM-dd'),
            startTime: startTime,
            duration: duration,
            maxParticipants: 2,
            sessionId: sessionRef.id,
            participants: [{
              userId: user.uid,
              userName: user.displayName || user.email?.split('@')[0] || 'User',
              userPhoto: user.photoURL || null,
              joinedAt: serverTimestamp()
            }],
            createdAt: serverTimestamp()
          });
          
          return {
            success: true,
            type: 'created',
            sessionId: sessionRef.id,
            partnerName: null
          };
          
        } else {
          // Time slot exists, try to join as partner
          const slotData = timeSlotDoc.data();
          
          if (!slotData.participants || slotData.participants.length === 0) {
            throw new Error('Invalid time slot data');
          }
          
          if (slotData.participants.length >= 2) {
            throw new Error('Time slot is already full');
          }
          
          // Check if user is already in this slot
          const userAlreadyBooked = slotData.participants.find(p => p.userId === user.uid);
          if (userAlreadyBooked) {
            throw new Error('You are already booked for this time slot');
          }
          
          console.log('Joining existing time slot as partner');
          const waitingParticipant = slotData.participants[0];
          const sessionRef = doc(db, 'sessions', slotData.sessionId);
          
          // Update session with partner info
          transaction.update(sessionRef, {
            partnerId: user.uid,
            partnerName: user.displayName || user.email?.split('@')[0] || 'User',
            partnerPhoto: user.photoURL || null,
            updatedAt: serverTimestamp()
          });
          
          // Update time slot with second participant
          transaction.update(timeSlotRef, {
            participants: [
              ...slotData.participants,
              {
                userId: user.uid,
                userName: user.displayName || user.email?.split('@')[0] || 'User',
                userPhoto: user.photoURL || null,
                joinedAt: serverTimestamp()
              }
            ],
            updatedAt: serverTimestamp()
          });
          
          return {
            success: true,
            type: 'joined',
            sessionId: slotData.sessionId,
            partnerName: waitingParticipant.userName || 'Study Partner'
          };
        }
      });
      
      return result;
      
    } catch (error) {
      console.error('Transaction failed:', error);
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
      // Find the next available session with a partner waiting
      const now = new Date();
      const endOfToday = endOfDay(now);
      
      // Look for time slots with one participant waiting
      const dayString = format(now, 'yyyy-MM-dd');
      const q = query(
        collection(db, 'timeSlots'),
        where('date', '==', dayString),
        where('duration', '==', duration),
        orderBy('startTime', 'asc'),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      
      for (const docSnap of snapshot.docs) {
        const slotData = docSnap.data();
        const slotTime = new Date(slotData.startTime);
        
        // Check if slot is in the future and has exactly one participant
        if (slotTime > now && 
            slotData.participants && 
            slotData.participants.length === 1 &&
            slotData.participants[0].userId !== user.uid) {
          
          try {
            const sessionData = {
              userId: user.uid,
              userName: user.displayName || user.email?.split('@')[0] || 'User',
              userPhoto: user.photoURL || null,
              startTime: slotData.startTime,
              endTime: addHours(new Date(slotData.startTime), duration / 60).toISOString(),
              duration: duration,
              goal: goal.trim()
            };
            
            const result = await bookSessionAtomic(slotData.startTime, sessionData);
            
            if (result.success && result.type === 'joined') {
              toast.success(`Quick match found! Paired with ${result.partnerName} 🎉`);
              navigate(`/session/${result.sessionId}`);
              return;
            }
          } catch (error) {
            console.log('Failed to join slot, trying next one:', error.message);
            continue;
          }
        }
      }
      
      // No quick match found, create a session for the next available slot
      const nextSlot = availableSlots.find(slot => {
        const slotTime = new Date(slot.value);
        return slotTime > addHours(now, 0.5) && !bookedSlots.has(slot.value);
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

        const result = await bookSessionAtomic(nextSlot.value, sessionData);
        
        if (result.success) {
          toast.success('Session created! Waiting for a study partner to join 📚');
          navigate(`/session/${result.sessionId}`);
        }
      } else {
        toast.error('No available slots for quick match today');
      }
      
    } catch (error) {
      console.error('Error in quick match:', error);
      toast.error('Failed to find quick match. Please try manual booking.');
    }
    
    setLoading(false);
  };

  const handleBookSession = async () => {
    if (!selectedTime) {
      toast.error('Please select a time');
      return;
    }
    if (!goal.trim()) {
      toast.error('Please enter your study goal');
      return;
    }

    // Check if slot is fully booked
    if (isSlotBooked(selectedTime)) {
      toast.error('This time slot is already fully booked. Please select another time.');
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

      const result = await bookSessionAtomic(selectedTime, sessionData);
      
      if (result.success) {
        if (result.type === 'joined') {
          toast.success(`Session booked with ${result.partnerName}! 🎯`);
        } else {
          toast.success('Session booked! Looking for a study partner... 📚');
          
          // Set up real-time listener for partner matching
          const unsubscribe = onSnapshot(doc(db, 'sessions', result.sessionId), (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (data.partnerId && data.partnerName && data.partnerId !== user.uid) {
                toast.success(`Partner found: ${data.partnerName}! 🤝`);
                unsubscribe();
              }
            }
          });
          
          // Stop listening after 5 minutes
          setTimeout(() => {
            unsubscribe();
          }, 300000);
        }
        
        navigate(`/session/${result.sessionId}`);
      }
    } catch (error) {
      console.error('Error booking session:', error);
      
      if (error.message === 'Time slot is already full') {
        toast.error('This time slot just got filled by someone else. Please select another time.');
        checkBookedSlots(); // Refresh slot availability
      } else if (error.message === 'You are already booked for this time slot') {
        toast.error('You already have a session at this time.');
      } else {
        toast.error('Failed to book session. Please try again.');
      }
    }
    
    setLoading(false);
  };

  const handleGoalSuggestionClick = (suggestion) => {
    setGoal(suggestion);
  };

  const handleTimeSlotClick = (slotValue) => {
    if (!isSlotBooked(slotValue)) {
      setSelectedTime(slotValue);
    }
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
            <h2 className="booking-title">Book Study Session</h2>
            <p className="booking-subtitle">Find a study partner and stay focused together</p>
          </div>
        </div>
        
        {/* Quick Match Option */}
        <div className="quick-match-section">
          <div className="quick-match-card">
            <div className="quick-match-icon">
              <FiZap />
            </div>
            <div className="quick-match-content">
              <h3>Quick Partner Match</h3>
              <p>Join an available study partner right now or create a session for others to join</p>
            </div>
            <button 
              className="btn-quick-match"
              onClick={handleQuickMatch}
              disabled={loading || !goal.trim()}
            >
              <FiUsers /> Find Partner
            </button>
          </div>
        </div>

        <div className="divider">
          <span>OR SCHEDULE A SPECIFIC TIME</span>
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
            {loadingSlots ? (
              <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading available times...</p>
              </div>
            ) : (
              <div className="time-grid">
                {availableSlots.map(slot => {
                  const partnersCount = partnersAvailable[slot.value]?.length || 0;
                  const isFullyBooked = isSlotBooked(slot.value);
                  
                  return (
                    <button
                      key={slot.value}
                      className={getTimeSlotClass(slot)}
                      onClick={() => handleTimeSlotClick(slot.value)}
                      disabled={isFullyBooked}
                      title={isFullyBooked ? 'This time slot is fully booked' : ''}
                    >
                      <span className="time-text">{slot.time}</span>
                      {isFullyBooked ? (
                        <span className="booked-indicator">
                          🚫 Full
                        </span>
                      ) : partnersCount > 0 ? (
                        <span className="partners-indicator">
                          👥 {partnersCount} waiting
                        </span>
                      ) : (
                        <span className="available-indicator">
                          ✨ Available
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {availableSlots.length === 0 && !loadingSlots && (
              <p className="no-slots">No available slots for this date</p>
            )}
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
                    <div className="duration-desc">{option.desc}</div>
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

          {/* Session Summary */}
          {selectedTime && goal && (
            <div className="session-summary">
              <h4>Session Summary</h4>
              <div className="summary-grid">
                <div className="summary-item">
                  <FiCalendar className="summary-icon" />
                  <div className="summary-content">
                    <span className="summary-label">Date & Time</span>
                    <span className="summary-value">
                      {format(new Date(selectedTime), 'MMM d, h:mm a')}
                    </span>
                  </div>
                </div>
                <div className="summary-item">
                  <FiClock className="summary-icon" />
                  <div className="summary-content">
                    <span className="summary-label">Duration</span>
                    <span className="summary-value">{duration} minutes</span>
                  </div>
                </div>
                <div className="summary-item">
                  <FiTarget className="summary-icon" />
                  <div className="summary-content">
                    <span className="summary-label">Goal</span>
                    <span className="summary-value">{goal}</span>
                  </div>
                </div>
                <div className="summary-item">
                  <FiUsers className="summary-icon" />
                  <div className="summary-content">
                    <span className="summary-label">Partner Status</span>
                    <span className="summary-value">
                      {partnersAvailable[selectedTime]?.length > 0 
                        ? `${partnersAvailable[selectedTime].length} partner(s) waiting`
                        : 'Will wait for partner'
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Book Button */}
          <button
            className="btn-primary btn-large"
            onClick={handleBookSession}
            disabled={loading || !selectedTime || !goal.trim() || isSlotBooked(selectedTime)}
          >
            {loading ? 'Booking...' : 
             isSlotBooked(selectedTime) ? 'Time Slot Full' : 
             partnersAvailable[selectedTime]?.length > 0 ? 'Join Study Partner' :
             'Create Session & Wait for Partner'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SessionBooking;