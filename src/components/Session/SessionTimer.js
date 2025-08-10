import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiPlay, FiPause, FiVolume2, FiVolumeX } from 'react-icons/fi';

function SessionTimer({ 
  duration = 50, 
  onComplete, 
  autoStart = false, 
  sessionId,
  startTime = null
}) {
  const timerStateRef = useRef({
    timeLeft: duration * 60,
    isRunning: false,
    isCompleted: false,
    startTime: null,
    lastUpdate: Date.now()
  });

  const [timeLeft, setTimeLeft] = useState(timerStateRef.current.timeLeft);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
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

  // Auto-start timer when both partners connect
  useEffect(() => {
    if (autoStart && startTime && !isRunning && !isCompleted) {
      console.log('Auto-starting timer - both partners connected');
      timerStateRef.current.isRunning = true;
      timerStateRef.current.startTime = startTime;
      setIsRunning(true);
    }
  }, [autoStart, startTime, isRunning, isCompleted]);

  // Timer logic
  useEffect(() => {
    if (isRunning && timeLeft > 0 && !isCompleted) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          const newTime = prevTime - 1;
          
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
            
            if (onComplete) {
              setTimeout(() => onComplete(), 1000);
            }
            
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
      }
    };
  }, [isRunning, timeLeft, isCompleted, onComplete, soundEnabled]);

  // Handle page visibility changes to keep timer in sync
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isRunning && timerStateRef.current.startTime) {
        // Recalculate time based on actual elapsed time
        const now = Date.now();
        const elapsed = Math.floor((now - new Date(timerStateRef.current.startTime).getTime()) / 1000);
        const newTimeLeft = Math.max(0, totalSeconds - elapsed);
        
        if (newTimeLeft !== timeLeft) {
          setTimeLeft(newTimeLeft);
          timerStateRef.current.timeLeft = newTimeLeft;
          
          if (newTimeLeft <= 0 && !isCompleted) {
            setIsCompleted(true);
            setIsRunning(false);
            timerStateRef.current.isCompleted = true;
            timerStateRef.current.isRunning = false;
            
            if (onComplete) {
              onComplete();
            }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRunning, timeLeft, isCompleted, totalSeconds, onComplete]);

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
    
    // Set start time if not set
    if (newRunningState && !timerStateRef.current.startTime) {
      timerStateRef.current.startTime = new Date();
    }
    
    setIsRunning(newRunningState);
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
    if (!isRunning) return autoStart ? 'Waiting for partner...' : 'Ready to start';
    if (timeLeft <= 60) return 'Almost done!';
    if (timeLeft <= 300) return 'Final sprint!';
    return 'Stay focused!';
  };

  // Initialize audio context on component mount
  useEffect(() => {
    initAudioContext();
  }, [initAudioContext]);

  return (
    <div className="timer-widget">
      <div className="timer-circle">
        <svg className="timer-svg" viewBox="0 0 200 200">
          <circle
            className="timer-circle-bg"
            cx="100"
            cy="100"
            r="85"
            strokeWidth="10"
            fill="none"
            stroke="#e5e7eb"
          />
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
      
      <div className="timer-controls">
        {!autoStart && (
          <button 
            onClick={toggleTimer} 
            className={`timer-button primary ${isCompleted ? 'disabled' : ''}`}
            disabled={isCompleted}
            title={isRunning ? 'Pause timer' : 'Start timer'}
          >
            {isRunning ? <FiPause size={16} /> : <FiPlay size={16} />}
            <span>{isRunning ? 'Pause' : 'Start'}</span>
          </button>
        )}
        
        <button 
          onClick={toggleSound} 
          className={`timer-button ${soundEnabled ? 'active' : 'muted'}`}
          title={soundEnabled ? 'Disable sound' : 'Enable sound'}
        >
          {soundEnabled ? <FiVolume2 size={16} /> : <FiVolumeX size={16} />}
        </button>
      </div>
      
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
        <div className="tip active">
          <span>💡 Stay focused and maintain deep concentration</span>
        </div>
      </div>
    </div>
  );
}

export default SessionTimer;