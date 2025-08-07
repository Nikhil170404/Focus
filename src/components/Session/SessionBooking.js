import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { addDays, addHours, format, startOfDay, endOfDay } from 'date-fns';
import { FiCalendar, FiClock, FiTarget, FiUsers } from 'react-icons/fi';
import toast from 'react-hot-toast';

function SessionBooking() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState(50);
  const [taskMode, setTaskMode] = useState('desk');
  const [goal, setGoal] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bookedSlots, setBookedSlots] = useState([]);

  useEffect(() => {
    generateTimeSlots();
    fetchBookedSlots();
  }, [selectedDate]);

  const generateTimeSlots = () => {
    const slots = [];
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 48; i++) {
      const slotTime = addHours(start, i * 0.5);
      slots.push({
        time: format(slotTime, 'h:mm a'),
        value: slotTime.toISOString()
      });
    }
    
    setAvailableSlots(slots);
  };

  const fetchBookedSlots = async () => {
    try {
      const start = startOfDay(selectedDate);
      const end = endOfDay(selectedDate);
      
      const q = query(
        collection(db, 'sessions'),
        where('userId', '==', user.uid),
        where('startTime', '>=', start.toISOString()),
        where('startTime', '<=', end.toISOString()),
        where('status', '==', 'scheduled')
      );
      
      const snapshot = await getDocs(q);
      const booked = snapshot.docs.map(doc => doc.data().startTime);
      setBookedSlots(booked);
    } catch (error) {
      console.error('Error fetching booked slots:', error);
    }
  };

  const isSlotBooked = (slotValue) => {
    return bookedSlots.includes(slotValue);
  };

  const handleBookSession = async () => {
    if (!selectedTime) {
      toast.error('Please select a time slot');
      return;
    }
    
    if (!goal.trim()) {
      toast.error('Please set a goal for your session');
      return;
    }

    setLoading(true);
    try {
      const sessionData = {
        userId: user.uid,
        userName: user.displayName || user.email,
        userPhoto: user.photoURL || null,
        startTime: selectedTime,
        endTime: addHours(new Date(selectedTime), duration / 60).toISOString(),
        duration: duration,
        taskMode: taskMode,
        goal: goal,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        partner: null,
        partnerId: null
      };

      const docRef = await addDoc(collection(db, 'sessions'), sessionData);
      
      // Try to find a partner
      await findPartner(docRef.id, sessionData);
      
      toast.success('Session booked successfully!');
      navigate('/dashboard');
    } catch (error) {
      toast.error('Error booking session: ' + error.message);
    }
    setLoading(false);
  };

  const findPartner = async (sessionId, sessionData) => {
    try {
      // Query for available partners with similar time slots
      const q = query(
        collection(db, 'sessions'),
        where('startTime', '==', sessionData.startTime),
        where('status', '==', 'scheduled'),
        where('partnerId', '==', null),
        where('userId', '!=', user.uid)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const partnerSession = snapshot.docs[0];
        const partnerData = partnerSession.data();
        
        // Update both sessions with partner info
        // This would be done through a Firebase Function in production
        toast.success('Partner found! You will be paired with ' + partnerData.userName);
      }
    } catch (error) {
      console.error('Error finding partner:', error);
    }
  };

  return (
    <div className="booking-container">
      <div className="booking-card">
        <h2 className="booking-title">Book Your Focus Session</h2>
        
        <div className="booking-form">
          {/* Date Selection */}
          <div className="form-group">
            <label>
              <FiCalendar /> Select Date
            </label>
            <div className="date-picker">
              {[0, 1, 2, 3, 4, 5, 6].map(days => {
                const date = addDays(new Date(), days);
                return (
                  <button
                    key={days}
                    className={`date-btn ${selectedDate.toDateString() === date.toDateString() ? 'active' : ''}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    <div className="date-day">{format(date, 'EEE')}</div>
                    <div className="date-num">{format(date, 'd')}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Selection */}
          <div className="form-group">
            <label>
              <FiClock /> Select Time
            </label>
            <div className="time-grid">
              {availableSlots.map(slot => (
                <button
                  key={slot.value}
                  className={`time-slot ${selectedTime === slot.value ? 'active' : ''} ${isSlotBooked(slot.value) ? 'booked' : ''}`}
                  onClick={() => setSelectedTime(slot.value)}
                  disabled={isSlotBooked(slot.value)}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          </div>

          {/* Duration Selection */}
          <div className="form-group">
            <label>Session Duration</label>
            <div className="duration-options">
              <button
                className={`duration-btn ${duration === 25 ? 'active' : ''}`}
                onClick={() => setDuration(25)}
              >
                25 min
              </button>
              <button
                className={`duration-btn ${duration === 50 ? 'active' : ''}`}
                onClick={() => setDuration(50)}
              >
                50 min
              </button>
              <button
                className={`duration-btn ${duration === 75 ? 'active' : ''}`}
                onClick={() => setDuration(75)}
              >
                75 min
              </button>
            </div>
          </div>

          {/* Task Mode */}
          <div className="form-group">
            <label>
              <FiUsers /> Task Mode
            </label>
            <div className="task-modes">
              <button
                className={`mode-btn ${taskMode === 'desk' ? 'active' : ''}`}
                onClick={() => setTaskMode('desk')}
              >
                <div className="mode-icon">💻</div>
                <div className="mode-name">Desk Mode</div>
                <div className="mode-desc">Computer work</div>
              </button>
              <button
                className={`mode-btn ${taskMode === 'moving' ? 'active' : ''}`}
                onClick={() => setTaskMode('moving')}
              >
                <div className="mode-icon">🏃</div>
                <div className="mode-name">Moving Mode</div>
                <div className="mode-desc">Physical tasks</div>
              </button>
              <button
                className={`mode-btn ${taskMode === 'anything' ? 'active' : ''}`}
                onClick={() => setTaskMode('anything')}
              >
                <div className="mode-icon">✨</div>
                <div className="mode-name">Anything</div>
                <div className="mode-desc">Flexible</div>
              </button>
            </div>
          </div>

          {/* Goal Setting */}
          <div className="form-group">
            <label>
              <FiTarget /> What's your goal for this session?
            </label>
            <textarea
              className="goal-input"
              placeholder="E.g., Complete project report, Study for exam, Clean workspace..."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
            />
          </div>

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