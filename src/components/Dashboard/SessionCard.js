import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday } from 'date-fns';
import { 
  FiClock, 
  FiUser, 
  FiVideo, 
  FiCheck, 
  FiX, 
  FiUsers, 
  FiStar,
  FiPlay,
  FiActivity,
  FiTarget
} from 'react-icons/fi';

// Session status configuration
const SESSION_STATUS = {
  scheduled: {
    icon: FiClock,
    label: 'Scheduled',
    color: '#6366f1',
    canJoin: true
  },
  active: {
    icon: FiPlay,
    label: 'Active',
    color: '#10b981',
    canJoin: true
  },
  completed: {
    icon: FiCheck,
    label: 'Completed',
    color: '#10b981',
    canJoin: false
  },
  cancelled: {
    icon: FiX,
    label: 'Cancelled',
    color: '#ef4444',
    canJoin: false
  }
};

// Partner status configuration
const PARTNER_STATUS = {
  waiting: {
    icon: FiActivity,
    label: 'Waiting for partner',
    className: 'waiting',
    description: 'Looking for a study partner...'
  },
  confirmed: {
    icon: FiUser,
    label: 'Partner confirmed',
    className: 'confirmed',
    description: 'Ready to focus together!'
  },
  online: {
    icon: FiUsers,
    label: 'Partner online',
    className: 'online',
    description: 'Partner is ready'
  }
};

function SessionCard({ session, completed = false, compact = false, showActions = true }) {
  const navigate = useNavigate();

  // Memoized calculations for performance
  const sessionTime = useMemo(() => {
    if (!session?.startTime) return null;
    return new Date(session.startTime);
  }, [session?.startTime]);

  const endTime = useMemo(() => {
    if (!session?.endTime) return null;
    return new Date(session.endTime);
  }, [session?.endTime]);

  const completedTime = useMemo(() => {
    if (!session?.endedAt) return null;
    try {
      return session.endedAt?.toDate?.() || new Date(session.endedAt);
    } catch {
      return null;
    }
  }, [session?.endedAt]);

  // Format session date/time
  const formattedTime = useMemo(() => {
    if (!sessionTime) return 'Time not set';

    if (completed && completedTime) {
      if (isToday(completedTime)) return `Today at ${format(completedTime, 'h:mm a')}`;
      if (isYesterday(completedTime)) return `Yesterday at ${format(completedTime, 'h:mm a')}`;
      return format(completedTime, 'MMM d, h:mm a');
    }

    if (isToday(sessionTime)) return `Today at ${format(sessionTime, 'h:mm a')}`;
    if (isTomorrow(sessionTime)) return `Tomorrow at ${format(sessionTime, 'h:mm a')}`;
    return format(sessionTime, 'EEE, MMM d, h:mm a');
  }, [sessionTime, completedTime, completed]);

  // Format duration
  const formattedDuration = useMemo(() => {
    const duration = session?.actualDuration || session?.duration || 0;
    if (duration < 60) return `${duration} min`;
    
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }, [session?.actualDuration, session?.duration]);

  // Time until session starts
  const timeUntilStart = useMemo(() => {
    if (!sessionTime || completed || sessionTime <= new Date()) return null;
    
    try {
      return formatDistanceToNow(sessionTime, { addSuffix: true });
    } catch {
      return null;
    }
  }, [sessionTime, completed]);

  // Partner status
  const partnerStatus = useMemo(() => {
    if (!session?.partnerId) {
      return PARTNER_STATUS.waiting;
    }
    
    // Could add online status check here if available
    return PARTNER_STATUS.confirmed;
  }, [session?.partnerId]);

  // Session status
  const sessionStatus = useMemo(() => {
    return SESSION_STATUS[session?.status] || SESSION_STATUS.scheduled;
  }, [session?.status]);

  // Check if session can be joined
  const canJoin = useMemo(() => {
    if (completed || !sessionTime) return false;
    
    const now = new Date();
    const sessionStart = new Date(sessionTime);
    const timeDiff = sessionStart - now;
    
    // Can join 5 minutes early to 15 minutes late
    return timeDiff >= -15 * 60 * 1000 && timeDiff <= 5 * 60 * 1000 && sessionStatus.canJoin;
  }, [sessionTime, completed, sessionStatus.canJoin]);

  // Handle session join/view
  const handleSessionAction = useCallback(() => {
    if (!session?.id) return;

    if (completed) {
      // Could show session details/review
      console.log('Show session details');
      return;
    }

    if (canJoin || session.status === 'active') {
      navigate(`/session/${session.id}`);
    } else {
      // Show session details or countdown
      console.log('Show session preview');
    }
  }, [session?.id, session?.status, completed, canJoin, navigate]);

  // Get card classes
  const cardClasses = useMemo(() => {
    const classes = ['session-card'];
    
    if (completed) classes.push('completed');
    if (compact) classes.push('compact');
    if (!session?.partnerId) classes.push('waiting-partner');
    if (session?.partnerId) classes.push('has-partner');
    if (canJoin) classes.push('can-join');
    
    return classes.join(' ');
  }, [completed, compact, session?.partnerId, canJoin]);

  // Render partner info
  const renderPartnerInfo = () => (
    <div className={`session-partner ${partnerStatus.className}`}>
      <div className="partner-avatar">
        {session?.partnerId && session?.partnerPhoto ? (
          <img 
            src={session.partnerPhoto} 
            alt={session.partnerName || 'Study Partner'}
            loading="lazy"
          />
        ) : (
          <div className="avatar-placeholder">
            {session?.partnerId ? (
              session?.partnerName?.charAt(0).toUpperCase() || 'P'
            ) : (
              <FiUsers size={16} />
            )}
          </div>
        )}
        
        {/* Online indicator for confirmed partners */}
        {session?.partnerId && (
          <div className="online-indicator" />
        )}
      </div>
      
      <div className="partner-details">
        <div className="partner-name">
          {session?.partnerId ? (
            session.partnerName || 'Study Partner'
          ) : (
            partnerStatus.label
          )}
        </div>
        
        {!compact && (
          <div className="partner-subtitle">
            {session?.partnerId ? (
              `Ready to focus together`
            ) : (
              <span className="waiting-text">
                <span className="pulse-dot" />
                {partnerStatus.description}
              </span>
            )}
          </div>
        )}
      </div>
      
      <div className="partner-status-icon">
        <partnerStatus.icon size={16} />
      </div>
    </div>
  );

  // Render session actions
  const renderActions = () => {
    if (!showActions) return null;

    if (completed) {
      return (
        <div className="session-status completed">
          <FiCheck size={16} />
          <span>Completed</span>
          {session?.partnerId && !compact && (
            <div className="completion-note">
              with {session.partnerName || 'partner'}
            </div>
          )}
        </div>
      );
    }

    if (session?.status === 'cancelled') {
      return (
        <div className="session-status cancelled">
          <FiX size={16} />
          <span>Cancelled</span>
        </div>
      );
    }

    return (
      <div className="session-actions">
        {canJoin ? (
          <button 
            className="btn-primary btn-session"
            onClick={handleSessionAction}
            title={session?.partnerId ? 'Join focus session' : 'Enter session room'}
          >
            <FiVideo size={16} />
            <span>{session?.partnerId ? 'Join Session' : 'Enter Room'}</span>
          </button>
        ) : timeUntilStart ? (
          <div className="session-countdown">
            <FiClock size={14} />
            <span>Starts {timeUntilStart}</span>
          </div>
        ) : sessionTime && sessionTime < new Date() ? (
          <div className="session-missed">
            <FiX size={14} />
            <span>Missed</span>
          </div>
        ) : (
          <div className="session-waiting">
            <sessionStatus.icon size={14} />
            <span>{sessionStatus.label}</span>
          </div>
        )}
        
        {/* Waiting indicator for sessions without partners */}
        {!session?.partnerId && !completed && (
          <div className="waiting-indicator">
            <span className="pulse-dot" />
            <span className="waiting-text">Waiting for partner</span>
          </div>
        )}
      </div>
    );
  };

  if (!session) {
    return null;
  }

  return (
    <div className={cardClasses} onClick={handleSessionAction}>
      {/* Session timing */}
      <div className="session-timing">
        <div className="session-time">
          {formattedTime}
        </div>
        <div className="session-duration">
          <FiClock size={14} />
          <span>{formattedDuration}</span>
        </div>
        {timeUntilStart && !completed && (
          <div className="time-until">
            {timeUntilStart}
          </div>
        )}
      </div>
      
      {/* Session content */}
      <div className="session-content">
        {/* Partner info */}
        {renderPartnerInfo()}
        
        {/* Session goal */}
        {session.goal && (
          <div className="session-goal">
            <FiTarget size={14} />
            <span className="goal-text">{session.goal}</span>
          </div>
        )}
        
        {/* Session category/tags */}
        {session.category && !compact && (
          <div className="session-category">
            <span className="category-tag">{session.category}</span>
          </div>
        )}
      </div>
      
      {/* Actions */}
      {renderActions()}
      
      {/* Status indicator */}
      <div 
        className="session-status-indicator"
        style={{ backgroundColor: sessionStatus.color }}
      />
    </div>
  );
}

// Memoize the component to prevent unnecessary re-renders
export default React.memo(SessionCard);