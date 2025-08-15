import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiPlay, FiPause, FiVolume2, FiVolumeX, FiRotateCcw } from 'react-icons/fi';

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
  const [breakTimeLeft, setBreakTimeLeft] = useState(5 * 60); // 5 minute break
  const [sessionPhase, setSessionPhase] = useState('focus'); // 'focus', 'break', 'completed'
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
    "🎨 Creating your masterpiece!",
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

  useEffect(() => {
    // Set initial motivational message
    setMotivationalMessage(getRandomMessage());
    
    // Update message every 5 minutes
    const messageInterval = setInterval(() => {
      if (isRunning && sessionPhase === 'focus' && mountedRef.current) {
        setMotivationalMessage(getRandomMessage());
      }
    }, 300000); // 5 minutes

    return () => clearInterval(messageInterval);
  }, [isRunning, sessionPhase, getRandomMessage]);

  useEffect(() => {
    if (isRunning && mountedRef.current) {
      intervalRef.current = setInterval(() => {
        if (!mountedRef.current) return;
        
        if (sessionPhase === 'focus') {
          setTimeLeft(prevTime => {
            const newTime = prevTime - 1;
            
            // Update parent component
            if (onTimeUpdate && mountedRef.current) {
              onTimeUpdate(newTime, totalSeconds);
            }
            
            // Play notification sounds at specific intervals
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
    
    // Throttle notifications to prevent spam
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
      // Create AudioContext if not exists
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      
      // Generate different tones for different notifications
      const frequencies = {
        gentle: [440, 554.37], // A4 and C#5
        urgent: [523.25, 659.25], // C5 and E5
        countdown: [698.46, 830.61], // F5 and G#5
        complete: [523.25, 659.25, 783.99] // C5, E5, G5 (chord)
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
          
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
        }, index * 100);
      });
      
      // Show notification if supported
      if ('Notification' in window && Notification.permission === 'granted' && mountedRef.current) {
        new Notification('FocusMate Timer', {
          body: message,
          icon: '/favicon.ico',
          badge: '/favicon.ico'
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
    setMotivationalMessage('🧘‍♂️ Break time! Relax and recharge for 5 minutes');
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

  const extendSession = (minutes) => {
    if (!mountedRef.current) return;
    
    setTimeLeft(prevTime => prevTime + (minutes * 60));
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
    if (sessionPhase === 'break') return '#10b981'; // Green for break
    if (sessionPhase === 'completed') return '#8b5cf6'; // Purple for completed
    if (timeLeft <= 60) return '#ef4444'; // Red for last minute
    if (timeLeft <= 300) return '#f59e0b'; // Orange for last 5 minutes
    return '#6366f1'; // Primary color
  };

  const getStatusText = () => {
    if (sessionPhase === 'completed') return 'Session Complete! 🎉';
    if (sessionPhase === 'break') return isRunning ? 'Break Time 🧘‍♂️' : 'Break Ready';
    if (isRunning) return 'Focus Mode 🎯';
    return 'Ready to Focus';
  };

  const circumference = 2 * Math.PI * (isMobile ? 60 : 85);
  const strokeDashoffset = circumference - (getCurrentProgress() / 100) * circumference;
  const circleRadius = isMobile ? 60 : 85;
  const svgSize = isMobile ? 140 : 200;

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
          <button onClick={startBreak} className="timer-button primary">
            <span>Take 5 Min Break</span>
          </button>
          <button onClick={skipBreak} className="timer-button secondary">
            <span>Skip Break</span>
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

  return (
    <div className={`timer-widget ${isOverlay ? 'overlay' : ''} ${isMobile ? 'mobile' : ''}`}>
      <div className="timer-circle">
        <svg className="timer-svg" viewBox={`0 0 ${svgSize} ${svgSize}`}>
          <circle
            className="timer-circle-bg"
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={circleRadius}
            strokeWidth={isMobile ? 6 : 10}
            fill="none"
            stroke="#e5e7eb"
          />
          <circle
            className="timer-circle-progress"
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={circleRadius}
            strokeWidth={isMobile ? 6 : 10}
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
        
        <div className="timer-text">
          <div className="timer-value" style={{ color: getTimerColor() }}>
            {getCurrentTime()}
          </div>
          <div className="timer-label">
            {getStatusText()}
          </div>
        </div>
      </div>
      
      <div className="timer-info">
        <h3>
          {sessionPhase === 'break' ? 'Break Time' : 
           sessionPhase === 'completed' ? 'Completed!' : 
           `${duration} Min Session`}
        </h3>
        
        {!isMobile && (
          <div className="motivational-message">
            {motivationalMessage}
          </div>
        )}
        
        <div className="timer-stats">
          <div className="stat-item">
            <span className="stat-label">Progress:</span>
            <span className="stat-value">{Math.round(getCurrentProgress())}%</span>
          </div>
          {sessionPhase === 'focus' && !isMobile && (
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
      
      <div className="timer-controls">
        <button 
          onClick={toggleTimer} 
          className={`timer-button primary ${sessionPhase === 'completed' ? 'restart' : ''}`}
        >
          {sessionPhase === 'completed' ? (
            <>
              <FiRotateCcw />
              <span>New Session</span>
            </>
          ) : isRunning ? (
            <>
              <FiPause />
              <span>Pause</span>
            </>
          ) : (
            <>
              <FiPlay />
              <span>Start</span>
            </>
          )}
        </button>
        
        <button 
          onClick={toggleSound} 
          className={`timer-button ${soundEnabled ? 'active' : 'muted'}`}
          title={soundEnabled ? 'Disable notifications' : 'Enable notifications'}
        >
          {soundEnabled ? <FiVolume2 /> : <FiVolumeX />}
        </button>
        
        {sessionPhase === 'focus' && timeLeft > 0 && !isMobile && (
          <div className="extend-controls">
            <button 
              onClick={() => extendSession(5)}
              className="timer-button extend"
              title="Add 5 minutes"
            >
              +5m
            </button>
            <button 
              onClick={() => extendSession(10)}
              className="timer-button extend"
              title="Add 10 minutes"
            >
              +10m
            </button>
          </div>
        )}
      </div>
      
      {sessionPhase === 'focus' && !isMobile && (
        <div className="timer-tips">
          <div className="tip-rotation">
            <div className="tip active">
              💡 <strong>Pro Tip:</strong> Take deep breaths to maintain focus
            </div>
          </div>
        </div>
      )}
      
      <div className="timer-progress-bar">
        <div 
          className="progress-fill" 
          style={{ 
            width: `${getCurrentProgress()}%`,
            backgroundColor: getTimerColor()
          }}
        />
      </div>
    </div>
  );
}

export default SessionTimer;