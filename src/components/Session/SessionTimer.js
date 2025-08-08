import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiPlay, FiPause, FiRotateCcw, FiVolume2, FiVolumeX } from 'react-icons/fi';

function SessionTimer({ duration = 50, onComplete, autoStart = true, showControls = true, sessionId }) {
  // Use refs to persist timer state across re-renders and tab switches
  const timerStateRef = useRef({
    timeLeft: duration * 60,
    isRunning: autoStart,
    isCompleted: false,
    startTime: Date.now(),
    totalElapsed: 0
  });

  const [timeLeft, setTimeLeft] = useState(timerStateRef.current.timeLeft);
  const [isRunning, setIsRunning] = useState(timerStateRef.current.isRunning);
  const [isCompleted, setIsCompleted] = useState(timerStateRef.current.isCompleted);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const intervalRef = useRef(null);
  const audioRef = useRef(null);
  const totalSeconds = duration * 60;

  // Persist timer state in localStorage
  const saveTimerState = useCallback(() => {
    if (sessionId) {
      const state = {
        ...timerStateRef.current,
        lastUpdate: Date.now()
      };
      localStorage.setItem(`timer_${sessionId}`, JSON.stringify(state));
    }
  }, [sessionId]);

  const loadTimerState = useCallback(() => {
    if (sessionId) {
      const saved = localStorage.getItem(`timer_${sessionId}`);
      if (saved) {
        try {
          const state = JSON.parse(saved);
          const timeSinceLastUpdate = Date.now() - state.lastUpdate;
          
          if (state.isRunning && !state.isCompleted) {
            // Calculate how much time has passed since last update
            const secondsElapsed = Math.floor(timeSinceLastUpdate / 1000);
            const newTimeLeft = Math.max(0, state.timeLeft - secondsElapsed);
            
            timerStateRef.current = {
              ...state,
              timeLeft: newTimeLeft,
              isCompleted: newTimeLeft <= 0
            };
          } else {
            timerStateRef.current = state;
          }
          
          setTimeLeft(timerStateRef.current.timeLeft);
          setIsRunning(timerStateRef.current.isRunning);
          setIsCompleted(timerStateRef.current.isCompleted);
        } catch (error) {
          console.error('Error loading timer state:', error);
        }
      }
    }
  }, [sessionId]);

  useEffect(() => {
    loadTimerState();
    
    // Initialize audio for notifications
    audioRef.current = new Audio();
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      saveTimerState();
    };
  }, [loadTimerState, saveTimerState]);

  useEffect(() => {
    if (isRunning && timeLeft > 0 && !isCompleted) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          const newTime = prevTime - 1;
          
          // Update ref state
          timerStateRef.current.timeLeft = newTime;
          
          // Play sound notifications at key intervals
          if (soundEnabled && (newTime === 300 || newTime === 60 || newTime === 30)) {
            playNotificationSound();
          }
          
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
              localStorage.removeItem(`timer_${sessionId}`);
            }
            
            if (onComplete) {
              setTimeout(() => onComplete(), 1000);
            }
            return 0;
          }
          
          // Save state periodically
          if (newTime % 10 === 0) {
            timerStateRef.current.lastUpdate = Date.now();
            if (sessionId) {
              const state = { ...timerStateRef.current };
              localStorage.setItem(`timer_${sessionId}`, JSON.stringify(state));
            }
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
  }, [isRunning, timeLeft, isCompleted, onComplete, soundEnabled, sessionId]);

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

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.log('Audio notification not available');
    }
  };

  const playCompletionSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99]; // C, E, G
      
      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        const startTime = audioContext.currentTime + (index * 0.2);
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.3);
      });
    } catch (error) {
      console.log('Audio notification not available');
    }
  };

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
    timerStateRef.current = {
      timeLeft: totalSeconds,
      isRunning: autoStart,
      isCompleted: false,
      startTime: Date.now(),
      totalElapsed: 0
    };
    
    setTimeLeft(totalSeconds);
    setIsRunning(autoStart);
    setIsCompleted(false);
    
    // Clear saved state
    if (sessionId) {
      localStorage.removeItem(`timer_${sessionId}`);
    }
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
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
      
      {/* Motivational tips */}
      <div className="timer-tips">
        <h4>🎯 Focus Tips</h4>
        <div className="tips-carousel">
          <div className="tip active">
            <span className="tip-icon">💡</span>
            <span>Remove distractions from your workspace</span>
          </div>
          <div className="tip">
            <span className="tip-icon">🧘</span>
            <span>Take deep breaths to stay calm and focused</span>
          </div>
          <div className="tip">
            <span className="tip-icon">📝</span>
            <span>Write down any distracting thoughts</span>
          </div>
          <div className="tip">
            <span className="tip-icon">🎵</span>
            <span>Use background music to maintain concentration</span>
          </div>
          <div className="tip">
            <span className="tip-icon">💪</span>
            <span>Stay hydrated and maintain good posture</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionTimer;