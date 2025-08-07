import React, { useState, useEffect } from 'react';
import { FiPlay, FiPause, FiRotateCcw } from 'react-icons/fi';

function SessionTimer({ duration = 50, onComplete }) {
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const [isRunning, setIsRunning] = useState(true);
  const totalSeconds = duration * 60;

  useEffect(() => {
    let interval = null;
    
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => {
          if (time <= 1) {
            onComplete && onComplete();
            return 0;
          }
          return time - 1;
        });
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, onComplete]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100;

  return (
    <div className="timer-widget">
      <div className="timer-circle">
        <svg className="timer-svg" viewBox="0 0 200 200">
          <circle
            className="timer-circle-bg"
            cx="100"
            cy="100"
            r="90"
            strokeWidth="8"
          />
          <circle
            className="timer-circle-progress"
            cx="100"
            cy="100"
            r="90"
            strokeWidth="8"
            strokeDasharray={`${2 * Math.PI * 90}`}
            strokeDashoffset={`${2 * Math.PI * 90 * (1 - progress / 100)}`}
          />
        </svg>
        <div className="timer-text">
          <div className="timer-value">{formatTime(timeLeft)}</div>
          <div className="timer-label">remaining</div>
        </div>
      </div>
      
      <div className="timer-info">
        <h3>{duration} Minute Session</h3>
        <p>Stay focused!</p>
      </div>
      
      <div className="timer-controls">
        <button onClick={() => setIsRunning(!isRunning)} className="timer-button">
          {isRunning ? <FiPause /> : <FiPlay />}
          <span>{isRunning ? 'Pause' : 'Resume'}</span>
        </button>
        <button onClick={() => setTimeLeft(totalSeconds)} className="timer-button">
          <FiRotateCcw />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
}

export default SessionTimer;