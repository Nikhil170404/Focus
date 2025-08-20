import React, { useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';
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
    canJoin: true // CHANGED: Always allow joining scheduled sessions
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
  const { user } = useAuth(); // Add useAuth hook
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

  // Partner status - FIXED to show correct partner info
  const partnerInfo = useMemo(() => {
    if (!session?.partnerId) {
      return {
        hasPartner: false,
        name: 'Waiting for partner',
        photo: null,
        status: PARTNER_STATUS.waiting
      };
    }
    
    // Determine who the partner is based on current user
    const isCurrentUserCreator = session.userId === user?.uid;
    const isCurrentUserPartner = session.partnerId === user?.uid;
    
    if (isCurrentUserCreator) {
      // Current user is creator, show partner info
      return {
        hasPartner: true,
        name: session.partnerName || 'Study Partner',
        photo: session.partnerPhoto,
        status: PARTNER_STATUS.confirmed
      };
    } else if (isCurrentUserPartner) {
      // Current user is partner, show creator info  
      return {
        hasPartner: true,
        name: session.userName || 'Study Partner',
        photo: session.userPhoto,
        status: PARTNER_STATUS.confirmed
      };
    } else {
      // Current user is neither creator nor partner (shouldn't happen)
      return {
        hasPartner: true,
        name: 'Study Partner',
        photo: null,
        status: PARTNER_STATUS.confirmed
      };
    }
  }, [session?.partnerId, session?.partnerName, session?.partnerPhoto, session?.userName, session?.userPhoto, session?.userId, user?.uid]);

  // Legacy partner status for backward compatibility
  const partnerStatus = partnerInfo.status;

  // Session status
  const sessionStatus = useMemo(() => {
    return SESSION_STATUS[session?.status] || SESSION_STATUS.scheduled;
  }, [session?.status]);

  // SIMPLIFIED: Always allow joining scheduled sessions
  const canJoin = useMemo(() => {
    if (completed) return false;
    return session?.status === 'scheduled' || session?.status === 'active';
  }, [session?.status, completed]);

  // Get time status - SIMPLIFIED
  const getTimeStatus = useMemo(() => {
    if (!sessionTime || completed) return null;
    
    const now = new Date();
    const timeDiff = sessionTime - now;
    
    if (timeDiff > 0) {
      return { type: 'ready', message: 'Ready to join!' };
    } else {
      return { type: 'ready', message: 'Join now!' };
    }
  }, [sessionTime, completed]);

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
    if (!partnerInfo.hasPartner) classes.push('waiting-partner');
    if (partnerInfo.hasPartner) classes.push('has-partner');
    if (canJoin) classes.push('can-join');
    if (getTimeStatus?.type) classes.push(`time-${getTimeStatus.type}`);
    
    return classes.join(' ');
  }, [completed, compact, partnerInfo.hasPartner, canJoin, getTimeStatus]);

  // Render partner info - FIXED to show correct partner
  const renderPartnerInfo = () => (
    <div className={`session-partner ${partnerInfo.status.className}`}>
      <div className="partner-avatar">
        {partnerInfo.hasPartner && partnerInfo.photo ? (
          <img 
            src={partnerInfo.photo} 
            alt={partnerInfo.name}
            loading="lazy"
          />
        ) : (
          <div className="avatar-placeholder">
            {partnerInfo.hasPartner ? (
              partnerInfo.name?.charAt(0).toUpperCase() || 'P'
            ) : (
              <FiUsers size={16} />
            )}
          </div>
        )}
        
        {/* Online indicator for confirmed partners */}
        {partnerInfo.hasPartner && (
          <div className="online-indicator" />
        )}
      </div>
      
      <div className="partner-details">
        <div className="partner-name">
          {partnerInfo.name}
        </div>
        
        {!compact && (
          <div className="partner-subtitle">
            {partnerInfo.hasPartner ? (
              `Ready to focus together`
            ) : (
              <span className="waiting-text">
                <span className="pulse-dot" />
                {partnerInfo.status.description}
              </span>
            )}
          </div>
        )}
      </div>
      
      <div className="partner-status-icon">
        <partnerInfo.status.icon size={16} />
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
          {partnerInfo.hasPartner && !compact && (
            <div className="completion-note">
              with {partnerInfo.name}
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
            className="btn-session btn-primary"
            onClick={handleJoinSession}
            title={partnerInfo.hasPartner ? 'Join focus session' : 'Enter session room'}
          >
            <FiVideo size={16} />
            <span>Join Session</span>
          </button>
        ) : timeStatus ? (
          <div className={`session-countdown ${timeStatus.type}`}>
            <FiPlay size={14} />
            <span>{timeStatus.message}</span>
          </div>
        ) : (
          <div className="session-waiting">
            <sessionStatus.icon size={14} />
            <span>{sessionStatus.label}</span>
          </div>
        )}
        
        {/* Waiting indicator for sessions without partners */}
        {!partnerInfo.hasPartner && !completed && (
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
            🟢
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
                {partnerInfo.hasPartner && (
                  <div className="preview-item">
                    <FiUsers />
                    <span>With {partnerInfo.name}</span>
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