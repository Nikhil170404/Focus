import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FiPlay, FiPause, FiVolume2, FiVolumeX, FiRotateCcw, FiClock, FiCheck } from 'react-icons/fi';

// Timer phases for better UX
const TIMER_PHASES = {
  READY: 'ready',
  RUNNING: 'running', 
  PAUSED: 'paused',
  BREAK: 'break',
  COMPLETED: 'completed'
};

// Sound frequencies for notifications
const SOUND_FREQUENCIES = {
  gentle: [440, 554.37],
  urgent: [523.25, 659.25], 
  countdown: [698.46, 830.61],
  complete: [523.25, 659.25, 783.99]
};

// Motivational messages by phase
const PHASE_MESSAGES = {
  start: [
    "🎯 Let's focus together!",
    "💪 You've got this!",
    "📚 Time to dive deep!",
    "✨ Excellence starts now!"
  ],
  midway: [
    "🔥 You're in the zone!",
    "⭐ Halfway there!",
    "💎 Keep that momentum!",
    "🚀 Crushing it!"
  ],
  final: [
    "🏁 Final push!",
    "⚡ Almost there!",
    "💪 Finish strong!",
    "🎯 You're so close!"
  ],
  break: [
    "🧘‍♂️ Time to recharge",
    "☕ Take a breather",
    "🌱 Rest and reset",
    "💧 Hydrate and stretch"
  ]
};

function SessionTimer({ 
  duration = 50, 
  onComplete, 
  autoStart = false,
  onTimeUpdate,
  showBreakReminder = true,
  isOverlay = false,
  isMobile = false,
  showMotivation = true
}) {
  // Core timer state
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const [phase, setPhase] = useState(autoStart ? TIMER_PHASES.RUNNING : TIMER_PHASES.READY);
  const [breakTimeLeft, setBreakTimeLeft] = useState(5 * 60);
  
  // Settings state
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('timer-sound') !== 'false';
    } catch {
      return true;
    }
  });
  
  // UI state
  const [motivationalMessage, setMotivationalMessage] = useState('');
  const [isMinimized, setIsMinimized] = useState(isMobile && isOverlay);
  
  // Refs for cleanup and performance
  const intervalRef = useRef(null);
  const audioContextRef = useRef(null);
  const lastNotificationRef = useRef(0);
  const mountedRef = useRef(true);
  
  // Memoized values for performance
  const totalSeconds = useMemo(() => duration * 60, [duration]);
  const breakSeconds = useMemo(() => 5 * 60, []);
  
  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Get current phase message
  const getCurrentPhaseMessage = useCallback(() => {
    if (phase === TIMER_PHASES.BREAK) return getRandomMessage(PHASE_MESSAGES.break);
    if (phase === TIMER_PHASES.COMPLETED) return "🎉 Session completed! Amazing work!";
    
    const progress = (totalSeconds - timeLeft) / totalSeconds;
    if (progress < 0.3) return getRandomMessage(PHASE_MESSAGES.start);
    if (progress < 0.8) return getRandomMessage(PHASE_MESSAGES.midway);
    return getRandomMessage(PHASE_MESSAGES.final);
  }, [phase, timeLeft, totalSeconds]);

  // Helper to get random message
  const getRandomMessage = (messages) => {
    return messages[Math.floor(Math.random() * messages.length)];
  };

  // Update motivational message periodically
  useEffect(() => {
    if (!showMotivation) return;

    const updateMessage = () => {
      if (mountedRef.current) {
        setMotivationalMessage(getCurrentPhaseMessage());
      }
    };

    updateMessage(); // Initial message
    
    if (phase === TIMER_PHASES.RUNNING) {
      const messageInterval = setInterval(updateMessage, 3 * 60 * 1000); // Every 3 minutes
      return () => clearInterval(messageInterval);
    }
  }, [phase, getCurrentPhaseMessage, showMotivation]);

  // Main timer logic
  useEffect(() => {
    if (phase === TIMER_PHASES.RUNNING && mountedRef.current) {
      intervalRef.current = setInterval(() => {
        if (!mountedRef.current) return;
        
        setTimeLeft(prevTime => {
          const newTime = prevTime - 1;
          
          // Notify parent of time update
          if (onTimeUpdate && mountedRef.current) {
            onTimeUpdate(newTime, totalSeconds);
          }
          
          // Play notification sounds
          if (soundEnabled && mountedRef.current) {
            playTimerNotifications(newTime);
          }
          
          // Handle completion
          if (newTime <= 0) {
            handleTimerComplete();
            return 0;
          }
          
          return newTime;
        });
      }, 1000);
    } else if (phase === TIMER_PHASES.BREAK && mountedRef.current) {
      intervalRef.current = setInterval(() => {
        if (!mountedRef.current) return;
        
        setBreakTimeLeft(prevTime => {
          const newTime = prevTime - 1;
          
          if (newTime <= 0) {
            handleBreakComplete();
            return 0;
          }
          
          return newTime;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase, soundEnabled, onTimeUpdate, totalSeconds]);

  // Timer notifications
  const playTimerNotifications = useCallback((newTime) => {
    if (!mountedRef.current || !soundEnabled) return;
    
    const now = Date.now();
    if (now - lastNotificationRef.current < 1000) return; // Throttle
    
    let soundType = null;
    let message = '';
    
    if (newTime === 600) { // 10 minutes left
      soundType = 'gentle';
      message = 'Only 10 minutes left! 🔟';
    } else if (newTime === 300) { // 5 minutes left
      soundType = 'gentle';
      message = 'Final 5 minutes! Sprint time! 🏃‍♂️';
    } else if (newTime === 60) { // 1 minute left
      soundType = 'urgent';
      message = 'Last minute! Finish strong! 💪';
    } else if (newTime === 10) { // 10 seconds left
      soundType = 'countdown';
      message = 'Almost done! 🎯';
    }
    
    if (soundType) {
      playSound(soundType, message);
      lastNotificationRef.current = now;
    }
  }, [soundEnabled]);

  // Audio notification system
  const playSound = useCallback(async (type, message) => {
    if (!mountedRef.current || !soundEnabled) return;
    
    try {
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      const frequencies = SOUND_FREQUENCIES[type] || SOUND_FREQUENCIES.gentle;
      
      // Play tones
      frequencies.forEach((freq, index) => {
        setTimeout(() => {
          if (!mountedRef.current) return;
          
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
          oscillator.type = 'sine';
          
          gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
        }, index * 100);
      });
      
      // Show browser notification if available
      if ('Notification' in window && Notification.permission === 'granted' && mountedRef.current) {
        new Notification('FocusMate Timer', {
          body: message,
          icon: '/favicon.ico',
          silent: true
        });
      }
      
    } catch (error) {
      console.log('Audio notification failed:', error);
    }
  }, [soundEnabled]);

  // Timer completion handler
  const handleTimerComplete = useCallback(() => {
    if (!mountedRef.current) return;
    
    setPhase(TIMER_PHASES.COMPLETED);
    
    if (soundEnabled) {
      playSound('complete', 'Focus session completed! Time for a break! 🎉');
    }
    
    if (showBreakReminder) {
      setMotivationalMessage('🎉 Excellent work! Ready for a 5-minute break?');
    } else if (onComplete) {
      onComplete();
    }
  }, [soundEnabled, showBreakReminder, onComplete, playSound]);

  // Break completion handler
  const handleBreakComplete = useCallback(() => {
    if (!mountedRef.current) return;
    
    setPhase(TIMER_PHASES.COMPLETED);
    setMotivationalMessage('🏆 Session and break completed! Great job!');
    
    if (soundEnabled) {
      playSound('complete', 'Break completed! Excellent session! 🌟');
    }
    
    if (onComplete) onComplete();
  }, [soundEnabled, onComplete, playSound]);

  // Control functions
  const toggleTimer = useCallback(() => {
    if (!mountedRef.current) return;
    
    if (phase === TIMER_PHASES.COMPLETED) {
      // Reset timer
      setTimeLeft(totalSeconds);
      setBreakTimeLeft(breakSeconds);
      setPhase(TIMER_PHASES.READY);
      setMotivationalMessage('');
    } else if (phase === TIMER_PHASES.READY || phase === TIMER_PHASES.PAUSED) {
      setPhase(TIMER_PHASES.RUNNING);
    } else if (phase === TIMER_PHASES.RUNNING) {
      setPhase(TIMER_PHASES.PAUSED);
    }
  }, [phase, totalSeconds, breakSeconds]);

  const startBreak = useCallback(() => {
    if (!mountedRef.current) return;
    
    setPhase(TIMER_PHASES.BREAK);
    setBreakTimeLeft(breakSeconds);
    setMotivationalMessage(getRandomMessage(PHASE_MESSAGES.break));
  }, [breakSeconds]);

  const skipBreak = useCallback(() => {
    if (!mountedRef.current) return;
    
    setPhase(TIMER_PHASES.COMPLETED);
    if (onComplete) onComplete();
  }, [onComplete]);

  const toggleSound = useCallback(() => {
    const newSoundEnabled = !soundEnabled;
    setSoundEnabled(newSoundEnabled);
    
    try {
      localStorage.setItem('timer-sound', newSoundEnabled.toString());
    } catch {
      // Ignore localStorage errors
    }
  }, [soundEnabled]);

  // Format time display
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Get current time and progress
  const currentTime = phase === TIMER_PHASES.BREAK ? formatTime(breakTimeLeft) : formatTime(timeLeft);
  const currentProgress = phase === TIMER_PHASES.BREAK 
    ? ((breakSeconds - breakTimeLeft) / breakSeconds) * 100
    : ((totalSeconds - timeLeft) / totalSeconds) * 100;

  // Timer colors
  const getTimerColor = () => {
    if (phase === TIMER_PHASES.BREAK) return '#10b981';
    if (phase === TIMER_PHASES.COMPLETED) return '#8b5cf6';
    if (timeLeft <= 60) return '#ef4444';
    if (timeLeft <= 300) return '#f59e0b';
    return '#6366f1';
  };

  const getStatusText = () => {
    switch (phase) {
      case TIMER_PHASES.COMPLETED: return 'Complete! 🎉';
      case TIMER_PHASES.BREAK: return 'Break Time';
      case TIMER_PHASES.RUNNING: return 'Focus Mode';
      case TIMER_PHASES.PAUSED: return 'Paused';
      default: return 'Ready';
    }
  };

  const getStatusIcon = () => {
    switch (phase) {
      case TIMER_PHASES.COMPLETED: return '🎉';
      case TIMER_PHASES.BREAK: return '🧘‍♂️';
      case TIMER_PHASES.RUNNING: return '🎯';
      case TIMER_PHASES.PAUSED: return '⏸️';
      default: return '⏸️';
    }
  };

  // Break confirmation modal
  if (phase === TIMER_PHASES.COMPLETED && showBreakReminder && timeLeft === 0 && !isOverlay) {
    return (
      <div className="timer-break-modal">
        <div className="break-celebration">
          <div className="celebration-icon">🎉</div>
          <h3>Focus Session Complete!</h3>
          <p>You've successfully focused for {duration} minutes!</p>
        </div>
        
        <div className="break-options">
          <button onClick={startBreak} className="btn-primary">
            <FiClock /> Take 5 Min Break
          </button>
          <button onClick={skipBreak} className="btn-secondary">
            <FiCheck /> Skip Break
          </button>
        </div>
        
        <div className="break-benefits">
          <h4>Break Benefits:</h4>
          <ul>
            <li>🚶‍♂️ Quick walk or stretch</li>
            <li>💧 Hydrate yourself</li>
            <li>👁️ Rest your eyes</li>
            <li>🧘‍♂️ Take deep breaths</li>
          </ul>
        </div>
      </div>
    );
  }

  // Calculate SVG dimensions
  const svgSize = isMinimized ? 60 : (isMobile && isOverlay ? 80 : isOverlay ? 100 : 140);
  const circleRadius = isMinimized ? 20 : (isMobile && isOverlay ? 30 : isOverlay ? 40 : 60);
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - (currentProgress / 100) * circumference;
  const strokeWidth = isMinimized ? 2 : (isMobile && isOverlay ? 3 : isOverlay ? 4 : 6);

  return (
    <div className={`session-timer ${isOverlay ? 'overlay' : 'standalone'} ${isMobile ? 'mobile' : 'desktop'} ${isMinimized ? 'minimized' : ''}`}>
      {/* Minimize/Expand toggle for overlay */}
      {isOverlay && isMobile && (
        <button 
          className="timer-toggle"
          onClick={() => setIsMinimized(!isMinimized)}
          aria-label={isMinimized ? 'Expand timer' : 'Minimize timer'}
        >
          {isMinimized ? '🔍' : '📋'}
        </button>
      )}

      {/* Timer Circle */}
      <div className="timer-circle-container">
        <svg className="timer-svg" viewBox={`0 0 ${svgSize} ${svgSize}`}>
          {/* Background circle */}
          <circle
            className="timer-circle-bg"
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={circleRadius}
            strokeWidth={strokeWidth}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
          />
          {/* Progress circle */}
          <circle
            className="timer-circle-progress"
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={circleRadius}
            strokeWidth={strokeWidth}
            fill="none"
            stroke={getTimerColor()}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease',
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%'
            }}
          />
        </svg>
        
        {/* Timer content */}
        <div className="timer-content">
          <div className="timer-time" style={{ color: getTimerColor() }}>
            {currentTime}
          </div>
          {!isMinimized && (
            <div className="timer-status">
              {getStatusIcon()} {getStatusText()}
            </div>
          )}
        </div>
      </div>
      
      {/* Timer Info - Only in standalone mode */}
      {!isOverlay && !isMinimized && (
        <div className="timer-info">
          <h3>
            {phase === TIMER_PHASES.BREAK ? 'Break Time' : 
             phase === TIMER_PHASES.COMPLETED ? 'Session Complete!' : 
             `${duration} Min Focus Session`}
          </h3>
          
          {motivationalMessage && showMotivation && (
            <div className="motivational-message">
              {motivationalMessage}
            </div>
          )}
          
          <div className="timer-stats">
            <div className="stat">
              <span>Progress</span>
              <span>{Math.round(currentProgress)}%</span>
            </div>
            {phase === TIMER_PHASES.RUNNING && (
              <div className="stat">
                <span>Phase</span>
                <span>
                  {timeLeft > 1800 ? 'Deep Focus' : 
                   timeLeft > 600 ? 'Steady' : 
                   timeLeft > 60 ? 'Final Push' : 'Sprint!'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Timer Controls */}
      <div className="timer-controls">
        <button 
          onClick={toggleTimer} 
          className={`timer-btn primary ${phase === TIMER_PHASES.COMPLETED ? 'restart' : ''}`}
          title={
            phase === TIMER_PHASES.COMPLETED ? 'New Session' : 
            phase === TIMER_PHASES.RUNNING ? 'Pause' : 'Start'
          }
        >
          {phase === TIMER_PHASES.COMPLETED ? (
            <FiRotateCcw />
          ) : phase === TIMER_PHASES.RUNNING ? (
            <FiPause />
          ) : (
            <FiPlay />
          )}
          {!isOverlay && !isMinimized && (
            <span>
              {phase === TIMER_PHASES.COMPLETED ? 'New Session' : 
               phase === TIMER_PHASES.RUNNING ? 'Pause' : 'Start'}
            </span>
          )}
        </button>
        
        <button 
          onClick={toggleSound} 
          className={`timer-btn sound ${soundEnabled ? 'active' : 'muted'}`}
          title={soundEnabled ? 'Disable notifications' : 'Enable notifications'}
        >
          {soundEnabled ? <FiVolume2 /> : <FiVolumeX />}
        </button>
      </div>
      
      {/* Mobile progress bar for minimized overlay */}
      {isMobile && isOverlay && isMinimized && (
        <div className="timer-progress-bar">
          <div 
            className="progress-fill" 
            style={{ 
              width: `${currentProgress}%`,
              backgroundColor: getTimerColor()
            }}
          />
        </div>
      )}

      {/* Floating motivational message for overlay */}
      {isOverlay && motivationalMessage && showMotivation && phase === TIMER_PHASES.RUNNING && !isMinimized && (
        <div className="floating-motivation">
          {motivationalMessage}
        </div>
      )}
    </div>
  );
}

export default SessionTimer;