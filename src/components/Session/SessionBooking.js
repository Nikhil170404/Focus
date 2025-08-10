import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { addDays, addHours, format, startOfDay, endOfDay, isToday, isTomorrow } from 'date-fns';
import { FiCalendar, FiClock, FiTarget, FiUsers, FiCheck, FiArrowLeft, FiArrowRight, FiBook } from 'react-icons/fi';
import { CSSLoadingSpinner } from '../Common/LoadingSpinner';
import toast from 'react-hot-toast';

function SessionBooking() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState(50);
  const [studyMode, setStudyMode] = useState('focused');
  const [subject, setSubject] = useState('');
  const [goal, setGoal] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [dateRange, setDateRange] = useState({ start: 0, end: 6 });
  const [validationErrors, setValidationErrors] = useState({});

  // India-specific study subjects
  const subjectOptions = [
    'Physics', 'Chemistry', 'Mathematics', 'Biology',
    'English', 'Hindi', 'Computer Science', 'Economics',
    'History', 'Geography', 'Political Science', 'Sanskrit',
    'Accountancy', 'Business Studies', 'Psychology',
    'Mixed Subjects', 'Revision', 'Mock Test', 'Other'
  ];

  // India-focused study modes
  const studyModes = [
    {
      value: 'focused',
      icon: '🎯',
      name: 'Deep Focus',
      description: 'Intense concentration on difficult topics'
    },
    {
      value: 'revision',
      icon: '📝',
      name: 'Revision Mode',
      description: 'Review and practice problems'
    },
    {
      value: 'memorization',
      icon: '🧠',
      name: 'Memory Work',
      description: 'Formulas, facts, and definitions'
    },
    {
      value: 'practice',
      icon: '✍️',
      name: 'Problem Solving',
      description: 'Numerical problems and exercises'
    },
    {
      value: 'mock_test',
      icon: '📊',
      name: 'Mock Test',
      description: 'Timed test simulation'
    }
  ];

  // Common study goals for Indian students
  const commonGoals = [
    'Complete Physics Chapter - Mechanics',
    'Solve 50 Chemistry MCQs',
    'Memorize Math Formulas',
    'Biology Diagrams Practice',
    'English Essay Writing',
    'Previous Year Questions',
    'Mock Test Practice',
    'Revision of Important Topics',
    'Weak Area Improvement',
    'Speed and Accuracy Practice'
  ];

  useEffect(() => {
    generateTimeSlots();
    fetchBookedSlots();
  }, [selectedDate]);

  const generateTimeSlots = () => {
    const slots = [];
    const start = new Date(selectedDate);
    
    // Indian students often study early morning and late night
    // Generate slots from 5 AM to 11:30 PM
    start.setHours(5, 0, 0, 0);
    
    for (let i = 0; i < 37; i++) { // 18.5 hours with 30-min slots
      const slotTime = addHours(start, i * 0.5);
      const now = new Date();
      
      // Don't show past time slots for today
      if (!isToday(selectedDate) || slotTime > now) {
        slots.push({
          time: format(slotTime, 'h:mm a'),
          value: slotTime.toISOString(),
          disabled: false,
          isPopular: isPopularTime(slotTime) // Mark popular study times
        });
      }
    }
    
    setAvailableSlots(slots);
  };

  const isPopularTime = (time) => {
    const hour = time.getHours();
    // Popular study times for Indian students
    return (hour >= 5 && hour <= 8) || // Early morning
           (hour >= 9 && hour <= 12) || // Morning
           (hour >= 14 && hour <= 17) || // Afternoon
           (hour >= 20 && hour <= 23); // Night
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
        if (!studyMode) errors.studyMode = 'Please select a study mode';
        if (!subject) errors.subject = 'Please select a subject';
        break;
      case 4:
        if (!goal.trim()) errors.goal = 'Please describe your study goal';
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
        studyMode: studyMode,
        subject: subject,
        goal: goal.trim(),
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        partner: null,
        partnerId: null,
        isIndiaSession: true, // Mark as India-focused session
        studyType: getStudyType(studyMode)
      };

      const docRef = await addDoc(collection(db, 'sessions'), sessionData);
      
      // Try to find a study partner with similar preferences
      await findStudyPartner(docRef.id, sessionData);
      
      toast.success('Study session booked successfully! 📚');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error booking session:', error);
      toast.error('Error booking session. Please try again.');
    }
    setLoading(false);
  };

  const getStudyType = (mode) => {
    const types = {
      focused: 'Deep Study',
      revision: 'Revision',
      memorization: 'Memory Work',
      practice: 'Problem Solving',
      mock_test: 'Test Practice'
    };
    return types[mode] || 'Study';
  };

  const findStudyPartner = async (sessionId, sessionData) => {
    try {
      // Look for partner with same subject and similar time
      const q = query(
        collection(db, 'sessions'),
        where('startTime', '==', sessionData.startTime),
        where('duration', '==', sessionData.duration),
        where('subject', '==', sessionData.subject),
        where('status', '==', 'scheduled'),
        where('partnerId', '==', null),
        where('userId', '!=', user.uid)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const partnerSession = snapshot.docs[0];
        const partnerData = partnerSession.data();
        
        // Update both sessions with partner info
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
        
        toast.success(`Great! Study partner found: ${partnerData.userName} 👥`);
      } else {
        toast.info('No study partner found yet. Don\'t worry, you can study solo or someone might join! 😊');
      }
    } catch (error) {
      console.error('Error finding study partner:', error);
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
      case 3: return 'Study Details';
      case 4: return 'Set Your Goal';
      default: return 'Book Session';
    }
  };

  const getProgress = () => (currentStep / 4) * 100;

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
            <FiArrowLeft size={20} />
          </button>
          <div className="header-content">
            <h2 className="booking-title">Book Study Session</h2>
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
                  <FiCalendar /> Select Study Date
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
                  <FiClock /> Available Times - {format(selectedDate, 'EEEE, MMMM d')}
                </label>
                <div className="time-grid">
                  {availableSlots.map(slot => (
                    <button
                      key={slot.value}
                      className={`time-slot ${selectedTime === slot.value ? 'active' : ''} ${isSlotBooked(slot.value) ? 'booked' : ''} ${slot.isPopular ? 'popular' : ''}`}
                      onClick={() => setSelectedTime(slot.value)}
                      disabled={isSlotBooked(slot.value)}
                    >
                      {slot.time}
                      {slot.isPopular && <span className="popular-badge">🔥</span>}
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

          {/* Step 3: Study Details */}
          {currentStep === 3 && (
            <div className="form-step">
              <div className="form-group">
                <label>Session Duration</label>
                <div className="duration-options">
                  {[
                    { value: 25, label: '25 min', desc: 'Quick review', icon: '⚡' },
                    { value: 50, label: '50 min', desc: 'Standard session', icon: '📚' },
                    { value: 90, label: '90 min', desc: 'Deep study', icon: '🎯' },
                    { value: 120, label: '2 hours', desc: 'Intensive prep', icon: '💪' }
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
                {validationErrors.duration && (
                  <span className="error-text">{validationErrors.duration}</span>
                )}
              </div>

              <div className="form-group">
                <label>
                  <FiBook /> Subject
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="subject-select"
                >
                  <option value="">Select Subject</option>
                  {subjectOptions.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
                {validationErrors.subject && (
                  <span className="error-text">{validationErrors.subject}</span>
                )}
              </div>

              <div className="form-group">
                <label>
                  <FiUsers /> Study Mode
                </label>
                <div className="study-modes">
                  {studyModes.map(mode => (
                    <button
                      key={mode.value}
                      className={`mode-btn ${studyMode === mode.value ? 'active' : ''}`}
                      onClick={() => setStudyMode(mode.value)}
                    >
                      <div className="mode-icon">{mode.icon}</div>
                      <div className="mode-content">
                        <div className="mode-name">{mode.name}</div>
                        <div className="mode-desc">{mode.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {validationErrors.studyMode && (
                  <span className="error-text">{validationErrors.studyMode}</span>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Goal Setting */}
          {currentStep === 4 && (
            <div className="form-step">
              <div className="form-group">
                <label>
                  <FiTarget /> What's your study goal for this session?
                </label>
                <textarea
                  className="goal-input"
                  placeholder="E.g., Complete Physics Chapter 5, Solve 50 Chemistry MCQs, Memorize History dates..."
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

              {/* Quick Goal Suggestions */}
              <div className="goal-suggestions">
                <h4>Quick Suggestions:</h4>
                <div className="suggestions-grid">
                  {commonGoals.slice(0, 6).map((suggestion, index) => (
                    <button
                      key={index}
                      className="suggestion-btn"
                      onClick={() => handleGoalSuggestion(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              {/* Session Summary */}
              <div className="session-summary">
                <h4>📋 Session Summary</h4>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-icon">📅</span>
                    <div className="summary-content">
                      <span className="summary-label">Date</span>
                      <span className="summary-value">{format(selectedDate, 'EEE, MMM d')}</span>
                    </div>
                  </div>
                  <div className="summary-item">
                    <span className="summary-icon">⏰</span>
                    <div className="summary-content">
                      <span className="summary-label">Time</span>
                      <span className="summary-value">{format(new Date(selectedTime), 'h:mm a')}</span>
                    </div>
                  </div>
                  <div className="summary-item">
                    <span className="summary-icon">⏱️</span>
                    <div className="summary-content">
                      <span className="summary-label">Duration</span>
                      <span className="summary-value">{duration} minutes</span>
                    </div>
                  </div>
                  <div className="summary-item">
                    <span className="summary-icon">📚</span>
                    <div className="summary-content">
                      <span className="summary-label">Subject</span>
                      <span className="summary-value">{subject}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="form-navigation">
            {currentStep > 1 && (
              <button 
                type="button"
                className="nav-btn btn-secondary"
                onClick={prevStep}
              >
                <FiArrowLeft size={16} />
                Back
              </button>
            )}
            
            <div className="nav-spacer"></div>
            
            {currentStep < 4 ? (
              <button 
                type="button"
                className="nav-btn btn-primary"
                onClick={nextStep}
              >
                Continue
                <FiArrowRight size={16} />
              </button>
            ) : (
              <button
                className="nav-btn btn-primary book-btn"
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
                    Book Study Session
                  </>
                )}
              </button>
            )}
          </div>

          {/* Mobile step counter */}
          <div className="mobile-step-counter">
            <span>Step {currentStep} of 4</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionBooking;