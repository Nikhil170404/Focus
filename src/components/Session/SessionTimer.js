import React, { useState, useEffect, useRef } from 'react';
import { FiPlay, FiPause, FiVolume2, FiVolumeX } from 'react-icons/fi';

function SessionTimer({ duration = 50, onComplete, autoStart = false }) {
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const intervalRef = useRef(null);
  
  const totalSeconds = duration * 60;

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          const newTime = prevTime - 1;
          
          // Play notification sounds
          if (soundEnabled) {
            if (newTime === 300) playSound('tick'); // 5 minutes left
            if (newTime === 60) playSound('tick'); // 1 minute left
            if (newTime === 0) playSound('complete');
          }
          
          if (newTime <= 0) {
            setIsRunning(false);
            if (onComplete) onComplete();
            return 0;
          }
          
          return newTime;
        });
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
  }, [isRunning, timeLeft, onComplete, soundEnabled]);

  const playSound = (type) => {
    try {
      const audio = new Audio(`data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSp9zPLaizsIGGS48+2hVRAMTqXh8NxrIAU0kdn0yHkwBSl6yure0EkNHm+78OygWBEURJ3h8LZgGwUyiMztyHkuCCNzuOvvnlASDVCT3OW9djQVCYLLz7moUREJSYrh4NS6aB4BI0+2x8+bYR0HZGuyq2UtBjeQ0+m7hU4NJJHYy3UnBUaV39XNhEUIR43WxKFSEg1NnsvGfS0NIIjDrZdGBQxJkM+6fB0BSYDb2L+HUgwQXJze175xEkqR4+5uLAVNn//jqW4uCEuX1PC4fz8MRJvi6KJQBgVSlvnXpW8qD1mS3sKJOAkfbt3lrnIgB0mUyb6DOhAMVZ3dtXkVEWClx52PQwweZMHDm1clEU6Qx72COhYecqfMaSQFOIsAAAAAAAAAAAAAAAAAAA==`);
      audio.play();
    } catch (error) {
      console.log('Could not play sound');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100;
  const circumference = 2 * Math.PI * 85;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
  };

  const getTimerColor = () => {
    if (timeLeft <= 60) return '#ef4444'; // Red for last minute
    if (timeLeft <= 300) return '#f59e0b'; // Orange for last 5 minutes
    return '#6366f1'; // Primary color
  };

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
              transition: 'stroke-dashoffset 1s linear',
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
            {isRunning ? 'Stay focused!' : 'Ready?'}
          </div>
        </div>
      </div>
      
      <div className="timer-info">
        <h3>{duration} Minute Session</h3>
        <div className="timer-stats">
          <div className="stat-item">
            <span className="stat-label">Progress:</span>
            <span className="stat-value">{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
      
      <div className="timer-controls">
        <button 
          onClick={toggleTimer} 
          className="timer-button primary"
        >
          {isRunning ? <FiPause /> : <FiPlay />}
          <span>{isRunning ? 'Pause' : 'Start'}</span>
        </button>
        
        <button 
          onClick={toggleSound} 
          className={`timer-button ${soundEnabled ? 'active' : 'muted'}`}
        >
          {soundEnabled ? <FiVolume2 /> : <FiVolumeX />}
        </button>
      </div>
    </div>
  );
}

export default SessionTimer;