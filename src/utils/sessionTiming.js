// utils/sessionTiming.js - Session timing utilities

import { formatDistanceToNow } from 'date-fns';

// Timing constants
export const TIMING_CONSTANTS = {
  JOIN_WINDOW_MINUTES: 10,    // Allow joining 10 minutes before session
  LATE_JOIN_MINUTES: 15,      // Allow late joining up to 15 minutes after start
  WARNING_MINUTES: 5,         // Show warning in last 5 minutes
  FINAL_MINUTES: 1,           // Final minute warning
  NOTIFICATION_INTERVALS: [300, 180, 60, 30, 10] // Notification times in seconds
};

// Session timing status types
export const TIMING_STATUS = {
  TOO_EARLY: 'too_early',
  READY: 'ready',
  LIVE: 'live',
  LATE_JOIN: 'late_join',
  ENDED: 'ended'
};

/**
 * Calculate session timing information for join buttons and status display
 * @param {Date} sessionStartTime - The scheduled start time of the session
 * @param {number} durationMinutes - Session duration in minutes
 * @param {Date} currentTime - Current time (defaults to now)
 * @returns {Object} Timing information object
 */
export function calculateSessionTiming(sessionStartTime, durationMinutes = 50, currentTime = new Date()) {
  if (!sessionStartTime) {
    return {
      canJoin: false,
      status: TIMING_STATUS.ENDED,
      message: 'Invalid session time',
      timeUntil: null,
      isLive: false,
      isLate: false,
      color: '#6b7280',
      icon: 'FiClock'
    };
  }

  const startTime = new Date(sessionStartTime);
  const timeDiffMinutes = (startTime - currentTime) / (1000 * 60);
  const sessionEndTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  const timeAfterEndMinutes = (currentTime - sessionEndTime) / (1000 * 60);

  // Session hasn't started yet and outside join window
  if (timeDiffMinutes > TIMING_CONSTANTS.JOIN_WINDOW_MINUTES) {
    const joinTime = new Date(startTime.getTime() - TIMING_CONSTANTS.JOIN_WINDOW_MINUTES * 60 * 1000);
    return {
      canJoin: false,
      status: TIMING_STATUS.TOO_EARLY,
      message: `Opens ${formatDistanceToNow(joinTime, { addSuffix: true })}`,
      timeUntil: formatDistanceToNow(startTime, { addSuffix: true }),
      isLive: false,
      isLate: false,
      color: '#6b7280',
      icon: 'FiLock',
      joinAvailableAt: joinTime
    };
  }

  // Within join window (10 min before to 15 min after start)
  if (timeDiffMinutes > -TIMING_CONSTANTS.LATE_JOIN_MINUTES) {
    const isLive = timeDiffMinutes <= 0;
    const isLate = isLive && Math.abs(timeDiffMinutes) > 0;

    return {
      canJoin: true,
      status: isLive ? TIMING_STATUS.LIVE : TIMING_STATUS.READY,
      message: isLive ? 'Session is LIVE!' : 'Ready to join!',
      timeUntil: isLive 
        ? `Started ${formatDistanceToNow(startTime)} ago`
        : `Starts ${formatDistanceToNow(startTime, { addSuffix: true })}`,
      isLive,
      isLate: isLate && Math.abs(timeDiffMinutes) > 5, // Consider "late" after 5 minutes
      color: isLive ? '#10b981' : '#6366f1',
      icon: 'FiPlay',
      minutesUntilStart: Math.max(0, timeDiffMinutes),
      minutesSinceStart: Math.max(0, -timeDiffMinutes)
    };
  }

  // Session ended
  if (timeAfterEndMinutes > 0) {
    return {
      canJoin: false,
      status: TIMING_STATUS.ENDED,
      message: 'Session ended',
      timeUntil: `Ended ${formatDistanceToNow(sessionEndTime)} ago`,
      isLive: false,
      isLate: false,
      color: '#6b7280',
      icon: 'FiCheck',
      endedAt: sessionEndTime
    };
  }

  // Fallback case (shouldn't reach here with current logic)
  return {
    canJoin: false,
    status: TIMING_STATUS.ENDED,
    message: 'Session unavailable',
    timeUntil: null,
    isLive: false,
    isLate: false,
    color: '#6b7280',
    icon: 'FiX'
  };
}

/**
 * Check if a session timer should show notifications
 * @param {number} timeLeftSeconds - Time remaining in seconds
 * @param {number} lastNotificationTime - Last notification time in seconds
 * @returns {Object|null} Notification info or null if no notification needed
 */
export function checkTimerNotification(timeLeftSeconds, lastNotificationTime = 0) {
  for (const notificationTime of TIMING_CONSTANTS.NOTIFICATION_INTERVALS) {
    if (timeLeftSeconds <= notificationTime && lastNotificationTime > notificationTime) {
      const minutes = Math.floor(notificationTime / 60);
      const seconds = notificationTime % 60;
      
      let message, type, icon;
      
      if (notificationTime >= 300) { // 5+ minutes
        message = `${minutes} minutes remaining`;
        type = 'info';
        icon = '⏰';
      } else if (notificationTime >= 60) { // 1-4 minutes
        message = `${minutes} minute${minutes > 1 ? 's' : ''} remaining`;
        type = 'warning';
        icon = '⚠️';
      } else if (notificationTime > 10) { // 11-59 seconds
        message = `${notificationTime} seconds remaining`;
        type = 'urgent';
        icon = '🚨';
      } else { // 1-10 seconds
        message = `${notificationTime}`;
        type = 'countdown';
        icon = '🔟';
      }
      
      return {
        time: notificationTime,
        message,
        type,
        icon,
        shouldPlaySound: true
      };
    }
  }
  
  return null;
}

/**
 * Get timer phase based on remaining time
 * @param {number} timeLeftSeconds - Time remaining in seconds
 * @param {number} totalSeconds - Total session duration in seconds
 * @param {boolean} isRunning - Whether timer is currently running
 * @returns {Object} Timer phase information
 */
export function getTimerPhase(timeLeftSeconds, totalSeconds, isRunning = true) {
  if (!isRunning) {
    return {
      phase: 'paused',
      color: '#6b7280',
      message: 'Timer paused',
      urgency: 'low'
    };
  }
  
  if (timeLeftSeconds <= 0) {
    return {
      phase: 'ended',
      color: '#6b7280',
      message: 'Session complete',
      urgency: 'none'
    };
  }
  
  const remainingPercentage = (timeLeftSeconds / totalSeconds) * 100;
  
  if (timeLeftSeconds <= 60) { // Last minute
    return {
      phase: 'ending',
      color: '#ef4444',
      message: 'Final minute!',
      urgency: 'critical'
    };
  }
  
  if (timeLeftSeconds <= 300) { // Last 5 minutes
    return {
      phase: 'warning',
      color: '#f59e0b',
      message: 'Final stretch!',
      urgency: 'high'
    };
  }
  
  if (remainingPercentage <= 25) { // Last quarter
    return {
      phase: 'late',
      color: '#f59e0b',
      message: 'Keep pushing!',
      urgency: 'medium'
    };
  }
  
  if (remainingPercentage <= 50) { // Past halfway
    return {
      phase: 'middle',
      color: '#10b981',
      message: 'You\'re doing great!',
      urgency: 'low'
    };
  }
  
  return {
    phase: 'early',
    color: '#6366f1',
    message: 'Focus time!',
    urgency: 'low'
  };
}

/**
 * Format time in a user-friendly way
 * @param {number} seconds - Time in seconds
 * @param {boolean} showHours - Whether to show hours for long durations
 * @returns {string} Formatted time string
 */
export function formatTimerDisplay(seconds, showHours = false) {
  if (seconds < 0) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (showHours && hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate session statistics for completed sessions
 * @param {Array} sessions - Array of session objects
 * @returns {Object} Statistics object
 */
export function calculateSessionStats(sessions) {
  if (!sessions || sessions.length === 0) {
    return {
      totalSessions: 0,
      totalMinutes: 0,
      averageDuration: 0,
      longestSession: 0,
      thisWeek: 0,
      thisMonth: 0,
      currentStreak: 0
    };
  }
  
  const totalSessions = sessions.length;
  const totalMinutes = sessions.reduce((sum, session) => {
    return sum + (session.actualDuration || session.duration || 0);
  }, 0);
  
  const averageDuration = totalMinutes / totalSessions;
  const longestSession = Math.max(...sessions.map(s => s.actualDuration || s.duration || 0));
  
  // Calculate this week and month
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const thisWeek = sessions.filter(session => {
    const sessionDate = session.completedAt ? new Date(session.completedAt) : new Date();
    return sessionDate >= weekStart;
  }).length;
  
  const thisMonth = sessions.filter(session => {
    const sessionDate = session.completedAt ? new Date(session.completedAt) : new Date();
    return sessionDate >= monthStart;
  }).length;
  
  // Calculate streak (simplified)
  const currentStreak = calculateStreak(sessions);
  
  return {
    totalSessions,
    totalMinutes,
    averageDuration: Math.round(averageDuration),
    longestSession,
    thisWeek,
    thisMonth,
    currentStreak
  };
}

/**
 * Calculate current streak from sessions
 * @param {Array} sessions - Array of session objects
 * @returns {number} Current streak count
 */
function calculateStreak(sessions) {
  if (!sessions || sessions.length === 0) return 0;
  
  // Sort sessions by completion date (newest first)
  const sortedSessions = [...sessions].sort((a, b) => {
    const dateA = a.completedAt ? new Date(a.completedAt) : new Date(0);
    const dateB = b.completedAt ? new Date(b.completedAt) : new Date(0);
    return dateB - dateA;
  });
  
  // Group by date and calculate consecutive days
  const sessionDates = new Set();
  sortedSessions.forEach(session => {
    if (session.completedAt) {
      const date = new Date(session.completedAt);
      const dateString = date.toISOString().split('T')[0];
      sessionDates.add(dateString);
    }
  });
  
  const uniqueDates = Array.from(sessionDates).sort((a, b) => new Date(b) - new Date(a));
  
  if (uniqueDates.length === 0) return 0;
  
  // Check if streak is still active (within last 2 days)
  const today = new Date();
  const latestDate = new Date(uniqueDates[0]);
  const daysDifference = Math.floor((today - latestDate) / (1000 * 60 * 60 * 24));
  
  if (daysDifference > 1) return 0; // Streak broken
  
  // Count consecutive days
  let streak = 0;
  let currentDate = new Date(uniqueDates[0]);
  
  for (const dateStr of uniqueDates) {
    const sessionDate = new Date(dateStr);
    const diff = Math.floor((currentDate - sessionDate) / (1000 * 60 * 60 * 24));
    
    if (diff <= 1) {
      streak++;
      currentDate = sessionDate;
    } else {
      break;
    }
  }
  
  return streak;
}

/**
 * Play audio notification (if enabled and supported)
 * @param {string} type - Type of notification ('info', 'warning', 'urgent', 'countdown')
 * @param {boolean} soundEnabled - Whether sound is enabled
 */
export function playTimerNotification(type = 'info', soundEnabled = true) {
  if (!soundEnabled || typeof Audio === 'undefined') return;
  
  try {
    // Create simple audio context for beep sounds
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Different frequencies for different notification types
    const frequencies = {
      info: 440,     // A4 note
      warning: 523,  // C5 note
      urgent: 659,   // E5 note
      countdown: 880 // A5 note
    };
    
    oscillator.frequency.setValueAtTime(frequencies[type] || 440, audioContext.currentTime);
    oscillator.type = 'sine';
    
    // Different durations for different types
    const durations = {
      info: 0.2,
      warning: 0.3,
      urgent: 0.5,
      countdown: 0.1
    };
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + durations[type]);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + durations[type]);
    
  } catch (error) {
    console.log('Audio notification failed:', error);
  }
}

export default {
  calculateSessionTiming,
  checkTimerNotification,
  getTimerPhase,
  formatTimerDisplay,
  calculateSessionStats,
  playTimerNotification,
  TIMING_CONSTANTS,
  TIMING_STATUS
};