import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { addDays, addHours, format, isToday, isTomorrow } from 'date-fns';
import { FiCalendar, FiClock, FiTarget, FiArrowLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';

function SessionBooking() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState(50);
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);

  // Common study goals
  const goalSuggestions = [
    'Complete assignment',
    'Study for exam',
    'Practice problems',
    'Read and take notes',
    'Project work',
    'Revision session'
  ];

  useEffect(() => {
    generateTimeSlots();
  }, [selectedDate]);

  const generateTimeSlots = () => {
    const slots = [];
    const start = new Date(selectedDate);
    start.setHours(6, 0, 0, 0); // Start from 6 AM
    
    for (let i = 0; i < 32; i++) { // Generate slots till 10 PM
      const slotTime = addHours(start, i * 0.5);
      const now = new Date();
      
      // Only show future slots
      if (slotTime > now) {
        slots.push({
          time: format(slotTime, 'h:mm a'),
          value: slotTime.toISOString()
        });
      }
    }
    
    setAvailableSlots(slots);
  };

  const formatDateLabel = (date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
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
      
      // Try to find a partner
      await findPartner(docRef.id, sessionData);
      
      toast.success('Session booked successfully!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error booking session:', error);
      toast.error('Failed to book session');
    }
    setLoading(false);
  };

  const findPartner = async (sessionId, sessionData) => {
    try {
      // Look for available partner sessions
      const q = query(
        collection(db, 'sessions'),
        where('startTime', '==', sessionData.startTime),
        where('duration', '==', sessionData.duration),
        where('status', '==', 'scheduled'),
        where('partnerId', '==', null),
        where('userId', '!=', user.uid)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const partnerSession = snapshot.docs[0];
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
        
        toast.success(`Partner found: ${partnerData.userName}!`);
      }
    } catch (error) {
      console.error('Error finding partner:', error);
    }
  };

  return (
    <div className="booking-container">
      <div className="booking-card">
        <div className="booking-header">
          <button 
            className="back-button"
            onClick={() => navigate('/dashboard')}
          >
            <FiArrowLeft />
          </button>
          <h2>Book Study Session</h2>
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
                  className={`time-slot ${selectedTime === slot.value ? 'active' : ''}`}
                  onClick={() => setSelectedTime(slot.value)}
                >
                  {slot.time}
                </button>
              ))}
            </div>
            {availableSlots.length === 0 && (
              <p className="no-slots">No available slots for this date</p>
            )}
          </div>

          {/* Duration */}
          <div className="form-group">
            <label>Duration</label>
            <div className="duration-options">
              {[25, 50, 90].map(min => (
                <button
                  key={min}
                  className={`duration-btn ${duration === min ? 'active' : ''}`}
                  onClick={() => setDuration(min)}
                >
                  {min} min
                </button>
              ))}
            </div>
          </div>

          {/* Goal */}
          <div className="form-group">
            <label><FiTarget /> Study Goal</label>
            <input
              type="text"
              className="goal-input"
              placeholder="What will you work on?"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={100}
            />
            <div className="goal-suggestions">
              {goalSuggestions.map((suggestion, i) => (
                <button
                  key={i}
                  className="suggestion-btn"
                  onClick={() => setGoal(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Book Button */}
          <button
            className="btn-primary btn-large"
            onClick={handleBookSession}
            disabled={loading || !selectedTime || !goal}
          >
            {loading ? 'Booking...' : 'Book Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SessionBooking;