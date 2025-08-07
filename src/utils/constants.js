export const SESSION_DURATIONS = [
  { value: 25, label: '25 minutes', description: 'Quick focus sprint' },
  { value: 50, label: '50 minutes', description: 'Standard session' },
  { value: 75, label: '75 minutes', description: 'Deep work session' }
];

export const TASK_MODES = {
  DESK: {
    value: 'desk',
    label: 'Desk Mode',
    icon: '💻',
    description: 'Computer work, writing, coding'
  },
  MOVING: {
    value: 'moving',
    label: 'Moving Mode',
    icon: '🏃',
    description: 'Exercise, cleaning, cooking'
  },
  ANYTHING: {
    value: 'anything',
    label: 'Anything Mode',
    icon: '✨',
    description: 'Mixed tasks or unsure'
  }
};

export const SESSION_STATUS = {
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const ACHIEVEMENTS = {
  FIRST_SESSION: {
    id: 'first_session',
    title: 'First Focus',
    description: 'Complete your first session',
    icon: '🎯',
    requirement: 1
  },
  TEN_SESSIONS: {
    id: 'ten_sessions',
    title: 'Rising Star',
    description: 'Complete 10 sessions',
    icon: '⭐',
    requirement: 10
  },
  FIFTY_SESSIONS: {
    id: 'fifty_sessions',
    title: 'Focus Champion',
    description: 'Complete 50 sessions',
    icon: '🏆',
    requirement: 50
  },
  HUNDRED_SESSIONS: {
    id: 'hundred_sessions',
    title: 'Focus Master',
    description: 'Complete 100 sessions',
    icon: '👑',
    requirement: 100
  },
  WEEK_STREAK: {
    id: 'week_streak',
    title: 'Week Warrior',
    description: '7 day streak',
    icon: '🔥',
    requirement: 7
  },
  MONTH_STREAK: {
    id: 'month_streak',
    title: 'Monthly Master',
    description: '30 day streak',
    icon: '💎',
    requirement: 30
  }
};

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];