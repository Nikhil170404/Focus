import { format, formatDistance, isToday, isYesterday, isTomorrow } from 'date-fns';

export const formatSessionTime = (date) => {
  if (isToday(date)) return `Today at ${format(date, 'h:mm a')}`;
  if (isYesterday(date)) return `Yesterday at ${format(date, 'h:mm a')}`;
  if (isTomorrow(date)) return `Tomorrow at ${format(date, 'h:mm a')}`;
  return format(date, 'MMM d, h:mm a');
};

export const formatDuration = (minutes) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

export const calculateStreak = (sessions) => {
  if (!sessions || sessions.length === 0) return 0;
  
  const sortedSessions = sessions.sort((a, b) => 
    new Date(b.completedAt) - new Date(a.completedAt)
  );
  
  let streak = 0;
  let currentDate = new Date();
  
  for (const session of sortedSessions) {
    const sessionDate = new Date(session.completedAt);
    const dayDiff = Math.floor((currentDate - sessionDate) / (1000 * 60 * 60 * 24));
    
    if (dayDiff <= 1) {
      streak++;
      currentDate = sessionDate;
    } else {
      break;
    }
  }
  
  return streak;
};

export const generateRoomId = () => {
  return Math.random().toString(36).substring(2, 15);
};

export const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return parts[0][0] + parts[parts.length - 1][0];
  }
  return name.substring(0, 2).toUpperCase();
};

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const getTimeZone = () => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

export const playSound = (soundType) => {
  const audio = new Audio(`/sounds/${soundType}.mp3`);
  audio.play().catch(e => console.log('Could not play sound:', e));
};