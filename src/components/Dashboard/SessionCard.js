import React, { useMemo, useCallback, useState } from 'react';
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
  FiTarget,
  FiCalendar,
  FiAlertCircle
} from 'react-icons/fi';

// Session status configuration
const SESSION_STATUS = {
  scheduled: {
    icon: FiClock,
    label: 'Scheduled',
    color: '#6366f1',
    canJoin: false
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
  const [showJoinModal, setShowJoinModal] = useState(false);

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
    return timeDiff >= -15 * 60 * 1000 && timeDiff <= 5 * 60 * 1000;
  }, [sessionTime, completed]);

  // Get time status
  const getTimeStatus = useMemo(() => {
    if (!sessionTime || completed) return null;
    
    const now = new Date();
    const timeDiff = sessionTime - now;
    
    if (timeDiff > 5 * 60 * 1000) {
      return { type: 'upcoming', message: `Starts ${timeUntilStart}` };
    } else if (timeDiff >= -5 * 60 * 1000) {
      return { type: 'ready', message: 'Ready to join!' };
    } else if (timeDiff >= -15 * 60 * 1000) {
      return { type: 'late', message: 'Session in progress' };
    } else {
      return { type: 'ended', message: 'Session ended' };
    }
  }, [sessionTime, completed, timeUntilStart]);

  // Handle join session with confirmation
  const handleJoinSession = useCallback(() => {
    if (!canJoin) return;
    
    setShowJoinModal(true);
  }, [canJoin]);

  // Confirm join and navigate
  const confirmJoin = useCallback(() => {
    setShowJoinModal(false);
    navigate(`/session/${session.id}`);
  }, [navigate, session?.id]);

  // Handle session view for completed sessions
  const handleSessionAction = useCallback(() => {
    if (completed) {
      // Could show session details/review
      console.log('Show session details');
      return;
    }

    if (canJoin) {
      handleJoinSession();
    } else {
      // Show session details or countdown
      console.log('Show session preview');
    }
  }, [completed, canJoin, handleJoinSession]);

  // Get card classes
  const cardClasses = useMemo(() => {
    const classes = ['session-card'];
    
    if (completed) classes.push('completed');
    if (compact) classes.push('compact');
    if (!session?.partnerId) classes.push('waiting-partner');
    if (session?.partnerId) classes.push('has-partner');
    if (canJoin) classes.push('can-join');
    if (getTimeStatus?.type) classes.push(`time-${getTimeStatus.type}`);
    
    return classes.join(' ');
  }, [completed, compact, session?.partnerId, canJoin, getTimeStatus]);

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

    const timeStatus = getTimeStatus;

    return (
      <div className="session-actions">
        {canJoin ? (
          <button 
            className={`btn-session ${timeStatus?.type === 'ready' ? 'btn-primary' : 'btn-warning'}`}
            onClick={handleJoinSession}
            title={session?.partnerId ? 'Join focus session' : 'Enter session room'}
          >
            <FiVideo size={16} />
            <span>
              {timeStatus?.type === 'late' ? 'Join Late' : 'Join Session'}
            </span>
          </button>
        ) : timeStatus ? (
          <div className={`session-countdown ${timeStatus.type}`}>
            {timeStatus.type === 'upcoming' && <FiClock size={14} />}
            {timeStatus.type === 'ended' && <FiX size={14} />}
            {timeStatus.type === 'ready' && <FiPlay size={14} />}
            <span>{timeStatus.message}</span>
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
    <>
      <div className={cardClasses} onClick={handleSessionAction}>
        {/* Time status indicator */}
        {getTimeStatus && (
          <div className={`time-status-indicator ${getTimeStatus.type}`}>
            {getTimeStatus.type === 'ready' && '🟢'}
            {getTimeStatus.type === 'late' && '🟠'}
            {getTimeStatus.type === 'upcoming' && '🔵'}
            {getTimeStatus.type === 'ended' && '🔴'}
          </div>
        )}

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

      {/* Join Confirmation Modal */}
      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="join-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Join Focus Session</h3>
              <button 
                className="modal-close"
                onClick={() => setShowJoinModal(false)}
              >
                <FiX />
              </button>
            </div>
            
            <div className="modal-content">
              <div className="session-preview">
                <div className="preview-item">
                  <FiCalendar />
                  <span>{formattedTime}</span>
                </div>
                <div className="preview-item">
                  <FiClock />
                  <span>{formattedDuration}</span>
                </div>
                <div className="preview-item">
                  <FiTarget />
                  <span>{session.goal}</span>
                </div>
                {session?.partnerId && (
                  <div className="preview-item">
                    <FiUsers />
                    <span>With {session.partnerName}</span>
                  </div>
                )}
              </div>

              <div className="join-checklist">
                <h4>Before you join:</h4>
                <ul>
                  <li>✅ Find a quiet space</li>
                  <li>✅ Have your materials ready</li>
                  <li>✅ Test your camera/microphone</li>
                  <li>✅ Close distracting apps</li>
                </ul>
              </div>

              {getTimeStatus?.type === 'late' && (
                <div className="late-warning">
                  <FiAlertCircle />
                  <span>This session has already started. You can still join!</span>
                </div>
              )}
            </div>
            
            <div className="modal-actions">
              <button 
                className="btn-secondary"
                onClick={() => setShowJoinModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={confirmJoin}
              >
                <FiVideo />
                Join Session
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Memoize the component to prevent unnecessary re-renders
export default React.memo(SessionCard);