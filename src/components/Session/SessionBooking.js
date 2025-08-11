import React, { useState, useEffect } from 'react';
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
  orderBy
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { addDays, addHours, format, isToday, isTomorrow, startOfDay, endOfDay } from 'date-fns';
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
  const [quickMatch, setQuickMatch] = useState(false);

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

  useEffect(() => {
    generateTimeSlots();
    if (selectedTime) {
      checkPartnerAvailability();
    }
  }, [selectedDate, selectedTime, duration]);

  const generateTimeSlots = () => {
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
          hour: slotTime.getHours()
        });
      }
    }
    
    setAvailableSlots(slots);
  };

  const checkPartnerAvailability = async () => {
    if (!selectedTime) return;

    try {
      const startTime = new Date(selectedTime);
      const endTime = addHours(startTime, duration / 60);
      
      // Look for sessions in the same time range
      const q = query(
        collection(db, 'sessions'),
        where('startTime', '>=', startTime.toISOString()),
        where('startTime', '<=', endTime.toISOString()),
        where('status', '==', 'scheduled'),
        where('partnerId', '==', null),
        limit(20)
      );
      
      const snapshot = await getDocs(q);
      const availablePartners = {};
      
      snapshot.docs.forEach(doc => {
        const sessionData = doc.data();
        if (sessionData.userId !== user.uid) {
          const timeSlot = sessionData.startTime;
          if (!availablePartners[timeSlot]) {
            availablePartners[timeSlot] = [];
          }
          availablePartners[timeSlot].push({
            id: doc.id,
            ...sessionData
          });
        }
      });
      
      setPartnersAvailable(availablePartners);
    } catch (error) {
      console.error('Error checking partner availability:', error);
    }
  };

  const formatDateLabel = (date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  const getTimeSlotClass = (slot) => {
    let className = 'time-slot';
    
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

  const handleQuickMatch = async () => {
    if (!goal.trim()) {
      toast.error('Please enter your study goal first');
      return;
    }

    setLoading(true);
    try {
      // Find the next available session with a partner
      const now = new Date();
      const endOfToday = endOfDay(now);
      
      const q = query(
        collection(db, 'sessions'),
        where('startTime', '>', now.toISOString()),
        where('startTime', '<=', endOfToday.toISOString()),
        where('status', '==', 'scheduled'),
        where('partnerId', '==', null),
        where('duration', '==', duration),
        orderBy('startTime', 'asc'),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        // Find the first available session by someone else
        const availableSession = snapshot.docs.find(doc => 
          doc.data().userId !== user.uid
        );
        
        if (availableSession) {
          const sessionData = availableSession.data();
          const sessionId = availableSession.id;
          
          // Create our session and pair immediately
          const newSessionData = {
            userId: user.uid,
            userName: user.displayName || user.email,
            userPhoto: user.photoURL,
            startTime: sessionData.startTime,
            endTime: sessionData.endTime,
            duration: duration,
            goal: goal.trim(),
            status: 'scheduled',
            createdAt: serverTimestamp(),
            partnerId: sessionData.userId,
            partnerName: sessionData.userName,
            partnerPhoto: sessionData.userPhoto,
            quickMatch: true
          };

          const docRef = await addDoc(collection(db, 'sessions'), newSessionData);
          
          // Update the partner's session
          await updateDoc(doc(db, 'sessions', sessionId), {
            partnerId: user.uid,
            partnerName: user.displayName || user.email,
            partnerPhoto: user.photoURL
          });
          
          toast.success(`Quick match found! Paired with ${sessionData.userName}`);
          navigate(`/session/${docRef.id}`);
          return;
        }
      }
      
      // No quick match found, create a session for others to join
      const nextSlot = availableSlots.find(slot => {
        const slotTime = new Date(slot.value);
        return slotTime > addHours(now, 0.5); // At least 30 minutes from now
      });
      
      if (nextSlot) {
        const sessionData = {
          userId: user.uid,
          userName: user.displayName || user.email,
          userPhoto: user.photoURL,
          startTime: nextSlot.value,
          endTime: addHours(new Date(nextSlot.value), duration / 60).toISOString(),
          duration: duration,
          goal: goal.trim(),
          status: 'scheduled',
          createdAt: serverTimestamp(),
          partner: null,
          partnerId: null,
          quickMatch: true
        };

        const docRef = await addDoc(collection(db, 'sessions'), sessionData);
        
        toast.success('Session created! Waiting for a study partner to join.');
        navigate('/dashboard');
      } else {
        toast.error('No available slots for quick match today');
      }
      
    } catch (error) {
      console.error('Error in quick match:', error);
      toast.error('Failed to find quick match');
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

    setLoading(true);
    try {
      const sessionData = {
        userId: user.uid,
        userName: user.displayName || user.email,
        userPhoto: user.photoURL,
        startTime: selectedTime,
        endTime: addHours(new Date(selectedTime), duration / 60).toISOString(),
        duration: duration,
        goal: goal.trim(),
        status: 'scheduled',
        createdAt: serverTimestamp(),
        partner: null,
        partnerId: null
      };

      const docRef = await addDoc(collection(db, 'sessions'), sessionData);
      
      // Try to find a partner immediately
      const partnerFound = await findPartner(docRef.id, sessionData);
      
      if (partnerFound) {
        toast.success(`Session booked with ${partnerFound.partnerName}!`);
      } else {
        toast.success('Session booked! Looking for a study partner...');
        
        // Set up real-time listener for partner matching
        const unsubscribe = onSnapshot(doc(db, 'sessions', docRef.id), (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            if (data.partnerId && data.partnerName) {
              toast.success(`Partner found: ${data.partnerName}!`);
              unsubscribe();
            }
          }
        });
        
        // Stop listening after 5 minutes
        setTimeout(() => {
          unsubscribe();
        }, 300000);
      }
      
      navigate('/dashboard');
    } catch (error) {
      console.error('Error booking session:', error);
      toast.error('Failed to book session');
    }
    setLoading(false);
  };

  const findPartner = async (sessionId, sessionData) => {
    try {
      // Look for available partner sessions with exact time and duration match
      const q = query(
        collection(db, 'sessions'),
        where('startTime', '==', sessionData.startTime),
        where('duration', '==', sessionData.duration),
        where('status', '==', 'scheduled'),
        where('partnerId', '==', null),
        limit(5)
      );
      
      const snapshot = await getDocs(q);
      
      // Find a session by someone else
      const partnerSession = snapshot.docs.find(doc => 
        doc.data().userId !== user.uid
      );
      
      if (partnerSession) {
        const partnerData = partnerSession.data();
        
        // Update both sessions
        await Promise.all([
          updateDoc(doc(db, 'sessions', sessionId), {
            partnerId: partnerData.userId,
            partnerName: partnerData.userName,
            partnerPhoto: partnerData.userPhoto
          }),
          updateDoc(doc(db, 'sessions', partnerSession.id), {
            partnerId: user.uid,
            partnerName: user.displayName,
            partnerPhoto: user.photoURL
          })
        ]);
        
        return {
          found: true,
          partnerName: partnerData.userName
        };
      }

      return { found: false };
    } catch (error) {
      console.error('Error finding partner:', error);
      return { found: false };
    }
  };

  const handleGoalSuggestionClick = (suggestion) => {
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
              <h3>Quick Match</h3>
              <p>Find an available study partner right now</p>
            </div>
            <button 
              className="btn-quick-match"
              onClick={handleQuickMatch}
              disabled={loading || !goal.trim()}
            >
              <FiUsers /> Quick Match
            </button>
          </div>
        </div>

        <div className="divider">
          <span>OR SCHEDULE A SESSION</span>
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
              {availableSlots.map(slot => {
                const partnersCount = partnersAvailable[slot.value]?.length || 0;
                return (
                  <button
                    key={slot.value}
                    className={getTimeSlotClass(slot)}
                    onClick={() => setSelectedTime(slot.value)}
                  >
                    <span className="time-text">{slot.time}</span>
                    {partnersCount > 0 && (
                      <span className="partners-indicator">
                        👥 {partnersCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {availableSlots.length === 0 && (
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
                    <span className="summary-label">Partners Available</span>
                    <span className="summary-value">
                      {partnersAvailable[selectedTime]?.length || 0} waiting
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
            disabled={loading || !selectedTime || !goal.trim()}
          >
            {loading ? 'Booking...' : 'Book Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SessionBooking;