import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiPlay, FiPause, FiVolume2, FiVolumeX, FiRotateCcw, FiClock, FiZap } from 'react-icons/fi';

function SessionTimer({ 
  duration = 50, 
  onComplete, 
  autoStart = false,
  onTimeUpdate,
  showBreakReminder = true,
  isOverlay = false,
  isMobile = false 
}) {
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isBreakTime, setIsBreakTime] = useState(false);
  const [breakTimeLeft, setBreakTimeLeft] = useState(5 * 60);
  const [sessionPhase, setSessionPhase] = useState('focus');
  const [motivationalMessage, setMotivationalMessage] = useState('');
  
  const intervalRef = useRef(null);
  const audioContextRef = useRef(null);
  const lastNotificationRef = useRef(0);
  const mountedRef = useRef(true);
  
  const totalSeconds = duration * 60;
  const breakSeconds = 5 * 60;

  const motivationalMessages = [
    "🎯 Stay focused! You're doing great!",
    "💪 Keep pushing forward!",
    "🌟 Excellence is a habit!",
    "🔥 You're in the zone!",
    "⭐ Focus brings results!",
    "🚀 Making progress every second!",
    "💎 Discipline creates diamonds!",
    "📚 Knowledge is power!",
    "🏆 Champions focus like this!"
  ];

  const getRandomMessage = useCallback(() => {
    return motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
  }, []);

  // Component mount/unmount tracking
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initialize motivational message
  useEffect(() => {
    setMotivationalMessage(getRandomMessage());
    
    const messageInterval = setInterval(() => {
      if (isRunning && sessionPhase === 'focus' && mountedRef.current) {
        setMotivationalMessage(getRandomMessage());
      }
    }, 180000); // 3 minutes

    return () => clearInterval(messageInterval);
  }, [isRunning, sessionPhase, getRandomMessage]);

  // Main timer logic
  useEffect(() => {
    if (isRunning && mountedRef.current) {
      intervalRef.current = setInterval(() => {
        if (!mountedRef.current) return;
        
        if (sessionPhase === 'focus') {
          setTimeLeft(prevTime => {
            const newTime = prevTime - 1;
            
            if (onTimeUpdate && mountedRef.current) {
              onTimeUpdate(newTime, totalSeconds);
            }
            
            if (soundEnabled && mountedRef.current) {
              playNotificationSounds(newTime);
            }
            
            if (newTime <= 0) {
              handleFocusComplete();
              return 0;
            }
            
            return newTime;
          });
        } else if (sessionPhase === 'break') {
          setBreakTimeLeft(prevTime => {
            const newTime = prevTime - 1;
            
            if (newTime <= 0) {
              handleBreakComplete();
              return 0;
            }
            
            return newTime;
          });
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, sessionPhase, soundEnabled, onTimeUpdate, totalSeconds]);

  const playNotificationSounds = (newTime) => {
    if (!mountedRef.current) return;
    
    const now = Date.now();
    
    if (now - lastNotificationRef.current < 1000) return;
    
    if (newTime === 600) { // 10 minutes left
      playSound('gentle', 'Only 10 minutes left! 🔟');
      lastNotificationRef.current = now;
    } else if (newTime === 300) { // 5 minutes left
      playSound('gentle', 'Final 5 minutes! Sprint time! 🏃‍♂️');
      lastNotificationRef.current = now;
    } else if (newTime === 60) { // 1 minute left
      playSound('urgent', 'Last minute! Finish strong! 💪');
      lastNotificationRef.current = now;
    } else if (newTime === 10) { // 10 seconds left
      playSound('countdown', 'Almost done! 🎯');
      lastNotificationRef.current = now;
    }
  };

  const playSound = async (type, message) => {
    if (!mountedRef.current) return;
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      
      const frequencies = {
        gentle: [440, 554.37],
        urgent: [523.25, 659.25],
        countdown: [698.46, 830.61],
        complete: [523.25, 659.25, 783.99]
      };
      
      const freqs = frequencies[type] || frequencies.gentle;
      
      freqs.forEach((freq, index) => {
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
      
      if ('Notification' in window && Notification.permission === 'granted' && mountedRef.current) {
        new Notification('FocusMate Timer', {
          body: message,
          icon: '/favicon.ico'
        });
      }
      
    } catch (error) {
      console.log('Audio notification not available:', error);
    }
  };

  const handleFocusComplete = () => {
    if (!mountedRef.current) return;
    
    setIsRunning(false);
    setSessionPhase('break');
    
    if (soundEnabled) {
      playSound('complete', 'Focus session completed! Time for a break! 🎉');
    }
    
    if (showBreakReminder) {
      setIsBreakTime(true);
      setMotivationalMessage('🎉 Great focus session! Take a 5-minute break to recharge!');
    } else {
      if (onComplete && mountedRef.current) onComplete();
    }
  };

  const handleBreakComplete = () => {
    if (!mountedRef.current) return;
    
    setIsBreakTime(false);
    setSessionPhase('completed');
    setMotivationalMessage('🏆 Session completed! Excellent work!');
    
    if (soundEnabled) {
      playSound('complete', 'Break time over! Great job today! 🌟');
    }
    
    if (onComplete && mountedRef.current) onComplete();
  };

  const startBreak = () => {
    if (!mountedRef.current) return;
    
    setIsRunning(true);
    setIsBreakTime(true);
    setSessionPhase('break');
    setBreakTimeLeft(breakSeconds);
    setMotivationalMessage('🧘‍♂️ Break time! Relax and recharge');
  };

  const skipBreak = () => {
    if (!mountedRef.current) return;
    
    setIsBreakTime(false);
    setSessionPhase('completed');
    if (onComplete) onComplete();
  };

  const restartSession = () => {
    if (!mountedRef.current) return;
    
    setTimeLeft(totalSeconds);
    setBreakTimeLeft(breakSeconds);
    setIsRunning(false);
    setIsBreakTime(false);
    setSessionPhase('focus');
    setMotivationalMessage(getRandomMessage());
  };

  const toggleTimer = () => {
    if (!mountedRef.current) return;
    
    if (sessionPhase === 'completed') {
      restartSession();
      return;
    }
    setIsRunning(!isRunning);
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCurrentTime = () => {
    if (sessionPhase === 'break') return formatTime(breakTimeLeft);
    return formatTime(timeLeft);
  };

  const getCurrentProgress = () => {
    if (sessionPhase === 'break') {
      return ((breakSeconds - breakTimeLeft) / breakSeconds) * 100;
    }
    return ((totalSeconds - timeLeft) / totalSeconds) * 100;
  };

  const getTimerColor = () => {
    if (sessionPhase === 'break') return '#10b981';
    if (sessionPhase === 'completed') return '#8b5cf6';
    if (timeLeft <= 60) return '#ef4444';
    if (timeLeft <= 300) return '#f59e0b';
    return '#6366f1';
  };

  const getStatusText = () => {
    if (sessionPhase === 'completed') return 'Complete! 🎉';
    if (sessionPhase === 'break') return isRunning ? 'Break Time' : 'Break Ready';
    if (isRunning) return 'Focus Mode';
    return 'Ready';
  };

  const getPhaseIcon = () => {
    if (sessionPhase === 'completed') return '🎉';
    if (sessionPhase === 'break') return '🧘‍♂️';
    if (isRunning) return '🎯';
    return '⏸️';
  };

  // Break time modal
  if (isBreakTime && sessionPhase === 'break' && !isRunning) {
    return (
      <div className={`timer-widget break-modal ${isOverlay ? 'overlay' : ''} ${isMobile ? 'mobile' : ''}`}>
        <div className="break-celebration">
          <div className="celebration-icon">🎉</div>
          <h3>Focus Session Complete!</h3>
          <p>You've successfully completed {duration} minutes of focused work!</p>
        </div>
        
        <div className="break-options">
          <button onClick={startBreak} className="btn-primary">
            Take 5 Min Break
          </button>
          <button onClick={skipBreak} className="btn-secondary">
            Skip Break
          </button>
        </div>
        
        <div className="break-tips">
          <h4>Break Suggestions:</h4>
          <ul>
            <li>🚶‍♂️ Take a short walk</li>
            <li>💧 Drink some water</li>
            <li>👁️ Rest your eyes</li>
            {!isMobile && <li>🧘‍♂️ Do some stretches</li>}
          </ul>
        </div>
      </div>
    );
  }

  const circleRadius = isMobile && isOverlay ? 30 : isOverlay ? 40 : 60;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - (getCurrentProgress() / 100) * circumference;
  const svgSize = isMobile && isOverlay ? 80 : isOverlay ? 100 : 140;

  return (
    <div className={`timer-widget ${isOverlay ? 'overlay-timer' : 'standalone-timer'} ${isMobile ? 'mobile' : 'desktop'}`}>
      {/* Timer Circle */}
      <div className="timer-circle">
        <svg className="timer-svg" viewBox={`0 0 ${svgSize} ${svgSize}`}>
          <circle
            className="timer-circle-bg"
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={circleRadius}
            strokeWidth={isMobile && isOverlay ? 3 : isOverlay ? 4 : 6}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
          />
          <circle
            className="timer-circle-progress"
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={circleRadius}
            strokeWidth={isMobile && isOverlay ? 3 : isOverlay ? 4 : 6}
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
        
        <div className="timer-content">
          <div className="timer-time" style={{ color: getTimerColor() }}>
            {getCurrentTime()}
          </div>
          <div className="timer-status">
            {getPhaseIcon()} {getStatusText()}
          </div>
        </div>
      </div>
      
      {/* Timer Info - Only show in non-overlay mode */}
      {!isOverlay && (
        <div className="timer-info">
          <h3>
            {sessionPhase === 'break' ? 'Break Time' : 
             sessionPhase === 'completed' ? 'Completed!' : 
             `${duration} Min Session`}
          </h3>
          
          <div className="motivational-message">
            {motivationalMessage}
          </div>
          
          <div className="timer-stats">
            <div className="stat-item">
              <span className="stat-label">Progress:</span>
              <span className="stat-value">{Math.round(getCurrentProgress())}%</span>
            </div>
            {sessionPhase === 'focus' && (
              <div className="stat-item">
                <span className="stat-label">Phase:</span>
                <span className="stat-value">
                  {timeLeft > 1800 ? 'Deep Focus' : 
                   timeLeft > 600 ? 'Maintaining' : 
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
          className={`timer-button primary ${sessionPhase === 'completed' ? 'restart' : ''}`}
          title={sessionPhase === 'completed' ? 'New Session' : isRunning ? 'Pause' : 'Start'}
        >
          {sessionPhase === 'completed' ? (
            <FiRotateCcw />
          ) : isRunning ? (
            <FiPause />
          ) : (
            <FiPlay />
          )}
          {!isOverlay && (
            <span>
              {sessionPhase === 'completed' ? 'New Session' : isRunning ? 'Pause' : 'Start'}
            </span>
          )}
        </button>
        
        <button 
          onClick={toggleSound} 
          className={`timer-button sound ${soundEnabled ? 'active' : 'muted'}`}
          title={soundEnabled ? 'Disable notifications' : 'Enable notifications'}
        >
          {soundEnabled ? <FiVolume2 /> : <FiVolumeX />}
        </button>
      </div>
      
      {/* Progress Bar for Mobile Overlay */}
      {isMobile && isOverlay && (
        <div className="timer-progress-bar">
          <div 
            className="progress-fill" 
            style={{ 
              width: `${getCurrentProgress()}%`,
              backgroundColor: getTimerColor()
            }}
          />
        </div>
      )}
    </div>
  );
}

export default SessionTimer;