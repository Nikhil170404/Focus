import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { addDays, addHours, format, startOfDay, endOfDay, isToday, isTomorrow } from 'date-fns';
import { FiCalendar, FiClock, FiTarget, FiUsers, FiCheck, FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { CSSLoadingSpinner } from '../Common/LoadingSpinner';
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
  const [currentStep, setCurrentStep] = useState(1);
  const [dateRange, setDateRange] = useState({ start: 0, end: 6 });
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    generateTimeSlots();
    fetchBookedSlots();
  }, [selectedDate]);

  const generateTimeSlots = () => {
    const slots = [];
    const start = new Date(selectedDate);
    start.setHours(6, 0, 0, 0); // Start from 6 AM
    
    // Generate slots from 6 AM to 11 PM (17 hours = 34 slots of 30 minutes)
    for (let i = 0; i < 34; i++) {
      const slotTime = addHours(start, i * 0.5);
      const now = new Date();
      
      // Don't show past time slots for today
      if (!isToday(selectedDate) || slotTime > now) {
        slots.push({
          time: format(slotTime, 'h:mm a'),
          value: slotTime.toISOString(),
          disabled: false
        });
      }
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
        where('status', 'in', ['scheduled', 'active'])
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

  const validateStep = (step) => {
    const errors = {};
    
    switch (step) {
      case 1:
        if (!selectedDate) errors.date = 'Please select a date';
        break;
      case 2:
        if (!selectedTime) errors.time = 'Please select a time slot';
        break;
      case 3:
        if (!duration) errors.duration = 'Please select session duration';
        if (!taskMode) errors.taskMode = 'Please select a task mode';
        break;
      case 4:
        if (!goal.trim()) errors.goal = 'Please describe your session goal';
        if (goal.trim().length < 10) errors.goal = 'Goal should be at least 10 characters';
        break;
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    setValidationErrors({});
  };

  const handleBookSession = async () => {
    if (!validateStep(4)) return;

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
        goal: goal.trim(),
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        partner: null,
        partnerId: null
      };

      const docRef = await addDoc(collection(db, 'sessions'), sessionData);
      
      // Try to find a partner
      await findPartner(docRef.id, sessionData);
      
      toast.success('Session booked successfully! 🎉');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error booking session:', error);
      toast.error('Error booking session. Please try again.');
    }
    setLoading(false);
  };

  const findPartner = async (sessionId, sessionData) => {
    try {
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
        toast.success(`Great! You'll be paired with ${partnerData.userName} 🤝`);
      }
    } catch (error) {
      console.error('Error finding partner:', error);
    }
  };

  const formatDateLabel = (date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE');
  };

  const navigateDates = (direction) => {
    if (direction === 'next') {
      setDateRange(prev => ({ start: prev.start + 7, end: prev.end + 7 }));
    } else {
      setDateRange(prev => ({ start: Math.max(0, prev.start - 7), end: Math.max(6, prev.end - 7) }));
    }
  };

  const getStepTitle = (step) => {
    switch (step) {
      case 1: return 'Select Date';
      case 2: return 'Choose Time';
      case 3: return 'Session Settings';
      case 4: return 'Set Your Goal';
      default: return 'Book Session';
    }
  };

  const getProgress = () => (currentStep / 4) * 100;

  return (
    <div className="booking-container">
      <div className="booking-card">
        {/* Header */}
        <div className="booking-header">
          <button 
            className="back-button"
            onClick={() => navigate('/dashboard')}
          >
            <FiArrowLeft size={20} />
          </button>
          <div className="header-content">
            <h2 className="booking-title">Book Your Focus Session</h2>
            <p className="booking-subtitle">{getStepTitle(currentStep)}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="progress-container">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${getProgress()}%` }}
            />
          </div>
          <div className="step-indicators">
            {[1, 2, 3, 4].map(step => (
              <div 
                key={step}
                className={`step-indicator ${step <= currentStep ? 'active' : ''} ${step < currentStep ? 'completed' : ''}`}
              >
                {step < currentStep ? <FiCheck size={12} /> : step}
              </div>
            ))}
          </div>
        </div>
        
        <div className="booking-form">
          {/* Step 1: Date Selection */}
          {currentStep === 1 && (
            <div className="form-step">
              <div className="form-group">
                <label>
                  <FiCalendar /> Select Date
                </label>
                <div className="date-navigation">
                  <button 
                    className="nav-button"
                    onClick={() => navigateDates('prev')}
                    disabled={dateRange.start === 0}
                  >
                    <FiArrowLeft size={16} />
                  </button>
                  <div className="date-picker">
                    {Array.from({ length: 7 }, (_, i) => {
                      const date = addDays(new Date(), dateRange.start + i);
                      return (
                        <button
                          key={i}
                          className={`date-btn ${selectedDate.toDateString() === date.toDateString() ? 'active' : ''}`}
                          onClick={() => setSelectedDate(date)}
                        >
                          <div className="date-day">{formatDateLabel(date)}</div>
                          <div className="date-num">{format(date, 'd')}</div>
                          <div className="date-month">{format(date, 'MMM')}</div>
                        </button>
                      );
                    })}
                  </div>
                  <button 
                    className="nav-button"
                    onClick={() => navigateDates('next')}
                  >
                    <FiArrowRight size={16} />
                  </button>
                </div>
                {validationErrors.date && (
                  <span className="error-text">{validationErrors.date}</span>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Time Selection */}
          {currentStep === 2 && (
            <div className="form-step">
              <div className="form-group">
                <label>
                  <FiClock /> Available Times for {format(selectedDate, 'EEEE, MMMM d')}
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
                {validationErrors.time && (
                  <span className="error-text">{validationErrors.time}</span>
                )}
                {availableSlots.length === 0 && (
                  <p className="no-slots">No available time slots for this date</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Duration and Task Mode */}
          {currentStep === 3 && (
            <div className="form-step">
              <div className="form-group">
                <label>Session Duration</label>
                <div className="duration-options">
                  {[
                    { value: 25, label: '25 min', desc: 'Quick sprint' },
                    { value: 50, label: '50 min', desc: 'Standard session' },
                    { value: 75, label: '75 min', desc: 'Deep work' }
                  ].map(option => (
                    <button
                      key={option.value}
                      className={`duration-btn ${duration === option.value ? 'active' : ''}`}
                      onClick={() => setDuration(option.value)}
                    >
                      <div className="duration-label">{option.label}</div>
                      <div className="duration-desc">{option.desc}</div>
                    </button>
                  ))}
                </div>
                {validationErrors.duration && (
                  <span className="error-text">{validationErrors.duration}</span>
                )}
              </div>

              <div className="form-group">
                <label>
                  <FiUsers /> Task Mode
                </label>
                <div className="task-modes">
                  {[
                    { value: 'desk', icon: '💻', name: 'Desk Work', desc: 'Computer tasks, writing, coding' },
                    { value: 'moving', icon: '🏃', name: 'Active Tasks', desc: 'Cleaning, organizing, exercise' },
                    { value: 'anything', icon: '✨', name: 'Flexible', desc: 'Mixed tasks or unsure' }
                  ].map(mode => (
                    <button
                      key={mode.value}
                      className={`mode-btn ${taskMode === mode.value ? 'active' : ''}`}
                      onClick={() => setTaskMode(mode.value)}
                    >
                      <div className="mode-icon">{mode.icon}</div>
                      <div className="mode-name">{mode.name}</div>
                      <div className="mode-desc">{mode.desc}</div>
                    </button>
                  ))}
                </div>
                {validationErrors.taskMode && (
                  <span className="error-text">{validationErrors.taskMode}</span>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Goal Setting */}
          {currentStep === 4 && (
            <div className="form-step">
              <div className="form-group">
                <label>
                  <FiTarget /> What's your goal for this session?
                </label>
                <textarea
                  className="goal-input"
                  placeholder="E.g., Complete project report, Study for exam, Organize workspace, Write 500 words..."
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  rows={4}
                  maxLength={200}
                />
                <div className="char-counter">
                  <span>{goal.length}/200 characters</span>
                </div>
                {validationErrors.goal && (
                  <span className="error-text">{validationErrors.goal}</span>
                )}
              </div>

              {/* Session Summary */}
              <div className="session-summary">
                <h4>Session Summary</h4>
                <div className="summary-item">
                  <span>📅 Date:</span>
                  <span>{format(selectedDate, 'EEEE, MMMM d')}</span>
                </div>
                <div className="summary-item">
                  <span>⏰ Time:</span>
                  <span>{format(new Date(selectedTime), 'h:mm a')}</span>
                </div>
                <div className="summary-item">
                  <span>⏱️ Duration:</span>
                  <span>{duration} minutes</span>
                </div>
                <div className="summary-item">
                  <span>🎯 Mode:</span>
                  <span>{taskMode === 'desk' ? 'Desk Work' : taskMode === 'moving' ? 'Active Tasks' : 'Flexible'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="form-navigation">
            {currentStep > 1 && (
              <button 
                type="button"
                className="btn-secondary"
                onClick={prevStep}
              >
                <FiArrowLeft size={16} />
                Back
              </button>
            )}
            
            {currentStep < 4 ? (
              <button 
                type="button"
                className="btn-primary"
                onClick={nextStep}
              >
                Continue
                <FiArrowRight size={16} />
              </button>
            ) : (
              <button
                className="btn-primary btn-large"
                onClick={handleBookSession}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <CSSLoadingSpinner size="small" showMessage={false} />
                    Booking...
                  </>
                ) : (
                  <>
                    <FiCheck size={16} />
                    Book Session
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionBooking;