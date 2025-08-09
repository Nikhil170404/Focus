import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiPlay, FiPause, FiRotateCcw, FiVolume2, FiVolumeX } from 'react-icons/fi';

function SessionTimer({ duration = 50, onComplete, autoStart = true, showControls = true, sessionId }) {
  // Use refs to persist timer state across re-renders and tab switches
  const timerStateRef = useRef({
    timeLeft: duration * 60,
    isRunning: autoStart,
    isCompleted: false,
    startTime: Date.now(),
    totalElapsed: 0,
    lastUpdate: Date.now()
  });

  const [timeLeft, setTimeLeft] = useState(timerStateRef.current.timeLeft);
  const [isRunning, setIsRunning] = useState(timerStateRef.current.isRunning);
  const [isCompleted, setIsCompleted] = useState(timerStateRef.current.isCompleted);
  const [soundEnabled, setSoundEnabled] = useState(
    localStorage.getItem('focusmate_sound_enabled') !== 'false'
  );
  
  const intervalRef = useRef(null);
  const audioContextRef = useRef(null);
  const totalSeconds = duration * 60;

  // Initialize audio context
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current && window.AudioContext) {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      } catch (error) {
        console.warn('Audio context not available:', error);
      }
    }
  }, []);

  // Persist timer state to localStorage
  const saveTimerState = useCallback(() => {
    if (sessionId) {
      const state = {
        ...timerStateRef.current,
        lastUpdate: Date.now()
      };
      try {
        localStorage.setItem(`focusmate_timer_${sessionId}`, JSON.stringify(state));
      } catch (error) {
        console.warn('Failed to save timer state:', error);
      }
    }
  }, [sessionId]);

  // Load timer state from localStorage
  const loadTimerState = useCallback(() => {
    if (sessionId) {
      try {
        const saved = localStorage.getItem(`focusmate_timer_${sessionId}`);
        if (saved) {
          const state = JSON.parse(saved);
          const timeSinceLastUpdate = Date.now() - (state.lastUpdate || Date.now());
          
          if (state.isRunning && !state.isCompleted && timeSinceLastUpdate < 5 * 60 * 1000) {
            // Only restore if less than 5 minutes have passed
            const secondsElapsed = Math.floor(timeSinceLastUpdate / 1000);
            const newTimeLeft = Math.max(0, state.timeLeft - secondsElapsed);
            
            timerStateRef.current = {
              ...state,
              timeLeft: newTimeLeft,
              isCompleted: newTimeLeft <= 0,
              lastUpdate: Date.now()
            };
            
            setTimeLeft(timerStateRef.current.timeLeft);
            setIsRunning(timerStateRef.current.isRunning && !timerStateRef.current.isCompleted);
            setIsCompleted(timerStateRef.current.isCompleted);
            
            return true; // State was restored
          }
        }
      } catch (error) {
        console.warn('Failed to load timer state:', error);
      }
    }
    return false; // State was not restored
  }, [sessionId]);

  // Initialize timer
  useEffect(() => {
    initAudioContext();
    
    // Try to load saved state, otherwise use defaults
    const wasRestored = loadTimerState();
    
    if (!wasRestored) {
      // Reset to initial state
      timerStateRef.current = {
        timeLeft: duration * 60,
        isRunning: autoStart,
        isCompleted: false,
        startTime: Date.now(),
        totalElapsed: 0,
        lastUpdate: Date.now()
      };
      
      setTimeLeft(timerStateRef.current.timeLeft);
      setIsRunning(timerStateRef.current.isRunning);
      setIsCompleted(false);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      saveTimerState();
    };
  }, [duration, autoStart, sessionId, loadTimerState, saveTimerState, initAudioContext]);

  // Timer logic
  useEffect(() => {
    if (isRunning && timeLeft > 0 && !isCompleted) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          const newTime = prevTime - 1;
          
          // Update ref state
          timerStateRef.current.timeLeft = newTime;
          timerStateRef.current.lastUpdate = Date.now();
          
          // Play notification sounds
          if (soundEnabled) {
            if (newTime === 300) { // 5 minutes
              playNotificationSound(800, 0.3);
            } else if (newTime === 60) { // 1 minute
              playNotificationSound(1000, 0.4);
            } else if (newTime === 30) { // 30 seconds
              playNotificationSound(1200, 0.4);
            } else if (newTime <= 10 && newTime > 0) { // Final countdown
              playNotificationSound(1400, 0.2);
            }
          }
          
          // Timer completed
          if (newTime <= 0) {
            timerStateRef.current.isCompleted = true;
            timerStateRef.current.isRunning = false;
            setIsCompleted(true);
            setIsRunning(false);
            
            if (soundEnabled) {
              playCompletionSound();
            }
            
            // Clear saved state when completed
            if (sessionId) {
              try {
                localStorage.removeItem(`focusmate_timer_${sessionId}`);
              } catch (error) {
                console.warn('Failed to clear timer state:', error);
              }
            }
            
            // Call completion callback
            if (onComplete) {
              setTimeout(() => onComplete(), 1000);
            }
            
            return 0;
          }
          
          // Save state periodically
          if (newTime % 30 === 0) { // Every 30 seconds
            setTimeout(saveTimerState, 0);
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
      }
    };
  }, [isRunning, timeLeft, isCompleted, onComplete, soundEnabled, sessionId, saveTimerState]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isRunning) {
        // Page became visible again, sync timer
        const savedState = sessionId ? localStorage.getItem(`focusmate_timer_${sessionId}`) : null;
        if (savedState) {
          try {
            const state = JSON.parse(savedState);
            const timeSinceLastUpdate = Date.now() - (state.lastUpdate || Date.now());
            if (timeSinceLastUpdate > 2000) { // More than 2 seconds difference
              const secondsElapsed = Math.floor(timeSinceLastUpdate / 1000);
              const newTimeLeft = Math.max(0, state.timeLeft - secondsElapsed);
              
              if (newTimeLeft !== timeLeft) {
                setTimeLeft(newTimeLeft);
                timerStateRef.current.timeLeft = newTimeLeft;
                
                if (newTimeLeft <= 0 && !isCompleted) {
                  setIsCompleted(true);
                  setIsRunning(false);
                  timerStateRef.current.isCompleted = true;
                  timerStateRef.current.isRunning = false;
                }
              }
            }
          } catch (error) {
            console.warn('Failed to sync timer state:', error);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRunning, timeLeft, isCompleted, sessionId]);

  // Save state when component unmounts or page unloads
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveTimerState();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveTimerState();
    };
  }, [saveTimerState]);

  const playNotificationSound = useCallback((frequency = 800, volume = 0.3) => {
    if (!soundEnabled || !audioContextRef.current) return;
    
    try {
      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(volume, audioContextRef.current.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.3);
      
      oscillator.start(audioContextRef.current.currentTime);
      oscillator.stop(audioContextRef.current.currentTime + 0.3);
    } catch (error) {
      console.warn('Audio notification failed:', error);
    }
  }, [soundEnabled]);

  const playCompletionSound = useCallback(() => {
    if (!soundEnabled || !audioContextRef.current) return;
    
    try {
      const notes = [523.25, 659.25, 783.99]; // C, E, G chord
      
      notes.forEach((frequency, index) => {
        const oscillator = audioContextRef.current.createOscillator();
        const gainNode = audioContextRef.current.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        const startTime = audioContextRef.current.currentTime + (index * 0.15);
        gainNode.gain.setValueAtTime(0.2, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.4);
      });
    } catch (error) {
      console.warn('Completion sound failed:', error);
    }
  }, [soundEnabled]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
  };

  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100;
  const circumference = 2 * Math.PI * 85;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const toggleTimer = () => {
    if (isCompleted) return;
    
    const newRunningState = !isRunning;
    timerStateRef.current.isRunning = newRunningState;
    timerStateRef.current.lastUpdate = Date.now();
    
    setIsRunning(newRunningState);
    saveTimerState();
  };

  const resetTimer = () => {
    if (window.confirm('Are you sure you want to reset the timer?')) {
      timerStateRef.current = {
        timeLeft: totalSeconds,
        isRunning: autoStart,
        isCompleted: false,
        startTime: Date.now(),
        totalElapsed: 0,
        lastUpdate: Date.now()
      };
      
      setTimeLeft(totalSeconds);
      setIsRunning(autoStart);
      setIsCompleted(false);
      
      // Clear saved state
      if (sessionId) {
        try {
          localStorage.removeItem(`focusmate_timer_${sessionId}`);
        } catch (error) {
          console.warn('Failed to clear timer state:', error);
        }
      }
    }
  };

  const toggleSound = () => {
    const newSoundState = !soundEnabled;
    setSoundEnabled(newSoundState);
    try {
      localStorage.setItem('focusmate_sound_enabled', newSoundState.toString());
    } catch (error) {
      console.warn('Failed to save sound preference:', error);
    }
    
    if (newSoundState) {
      initAudioContext();
    }
  };

  const getTimerColor = () => {
    if (isCompleted) return '#10b981'; // Green for completed
    if (timeLeft <= 300) return '#ef4444'; // Red for last 5 minutes
    if (timeLeft <= 600) return '#f59e0b'; // Orange for last 10 minutes
    return '#6366f1'; // Blue for normal
  };

  const getStatusMessage = () => {
    if (isCompleted) return 'Session Complete! 🎉';
    if (!isRunning && timeLeft < totalSeconds) return 'Paused';
    if (!isRunning) return 'Ready to start';
    if (timeLeft <= 60) return 'Almost done!';
    if (timeLeft <= 300) return 'Final sprint!';
    return 'Stay focused!';
  };

  const getMotivationalTip = () => {
    const tips = [
      "💡 Remove distractions from your workspace",
      "🧘 Take deep breaths to stay calm and focused", 
      "📝 Write down any distracting thoughts",
      "🎵 Use background music to maintain concentration",
      "💪 Stay hydrated and maintain good posture",
      "🎯 Break large tasks into smaller chunks",
      "⏰ Use the Pomodoro technique for better focus",
      "🚫 Turn off non-essential notifications"
    ];
    
    const tipIndex = Math.floor((totalSeconds - timeLeft) / 300) % tips.length;
    return tips[tipIndex];
  };

  return (
    <div className="timer-widget">
      <div className="timer-circle">
        <svg className="timer-svg" viewBox="0 0 200 200">
          {/* Background circle */}
          <circle
            className="timer-circle-bg"
            cx="100"
            cy="100"
            r="85"
            strokeWidth="10"
            fill="none"
            stroke="#e5e7eb"
          />
          {/* Progress circle */}
          <circle
            className="timer-circle-progress"
            cx="100"
            cy="100"
            r="85"
            strokeWidth="10"
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
            {formatTime(timeLeft)}
          </div>
          <div className="timer-label">
            {getStatusMessage()}
          </div>
        </div>
      </div>
      
      <div className="timer-info">
        <h3>{duration} Minute Session</h3>
        <div className="timer-stats">
          <div className="stat-item">
            <span className="stat-label">Elapsed:</span>
            <span className="stat-value">{formatDuration(totalSeconds - timeLeft)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Remaining:</span>
            <span className="stat-value">{formatDuration(timeLeft)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Progress:</span>
            <span className="stat-value">{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
      
      {showControls && (
        <div className="timer-controls">
          <button 
            onClick={toggleTimer} 
            className={`timer-button primary ${isCompleted ? 'disabled' : ''}`}
            disabled={isCompleted}
            title={isRunning ? 'Pause timer' : 'Start timer'}
          >
            {isRunning ? <FiPause size={16} /> : <FiPlay size={16} />}
            <span>{isRunning ? 'Pause' : 'Start'}</span>
          </button>
          
          <button 
            onClick={resetTimer} 
            className="timer-button secondary"
            title="Reset timer"
          >
            <FiRotateCcw size={16} />
            <span>Reset</span>
          </button>
          
          <button 
            onClick={toggleSound} 
            className={`timer-button ${soundEnabled ? 'active' : 'muted'}`}
            title={soundEnabled ? 'Disable sound' : 'Enable sound'}
          >
            {soundEnabled ? <FiVolume2 size={16} /> : <FiVolumeX size={16} />}
          </button>
        </div>
      )}
      
      {/* Progress bar for mobile */}
      <div className="timer-progress-bar mobile-only">
        <div 
          className="progress-fill"
          style={{ 
            width: `${progress}%`, 
            backgroundColor: getTimerColor(),
            transition: 'width 1s linear, background-color 0.3s ease'
          }}
        />
      </div>
      
      {/* Motivational tip */}
      <div className="timer-tips">
        <h4>🎯 Focus Tip</h4>
        <div className="tip active">
          <span>{getMotivationalTip()}</span>
        </div>
      </div>
    </div>
  );
}

export default SessionTimer;