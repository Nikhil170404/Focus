import React, { useMemo, useCallback, useState, useEffect } from 'react';
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
  FiAlertCircle,
  FiLock,
  FiPause
} from 'react-icons/fi';

// Session status configuration
const SESSION_STATUS = {
  scheduled: {
    icon: FiClock,
    label: 'Scheduled',
    color: '#6366f1',
    canJoin: false // Will be determined by timing logic
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

// Timing constants
const JOIN_WINDOW_MINUTES = 10; // Allow joining 10 minutes before session
const LATE_JOIN_MINUTES = 15; // Allow late joining up to 15 minutes after start

function SessionCard({ session, completed = false, compact = false, showActions = true }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute for accurate timing
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

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

  // IMPROVED: Smart timing logic for join button
  const timingInfo = useMemo(() => {
    if (!sessionTime) return { canJoin: false, status: 'invalid', message: 'Invalid session time' };
    
    // If explicitly completed, always show as completed
    if (completed || session?.status === 'completed') {
      return { canJoin: false, status: 'completed', message: 'Session completed' };
    }

    // If cancelled
    if (session?.status === 'cancelled') {
      return { canJoin: false, status: 'cancelled', message: 'Session cancelled' };
    }
    
    const now = currentTime;
    const timeDiffMinutes = (sessionTime - now) / (1000 * 60);
    const sessionDurationMinutes = session?.duration || 50;
    const sessionEndTime = new Date(sessionTime.getTime() + sessionDurationMinutes * 60 * 1000);
    const timeAfterEndMinutes = (now - sessionEndTime) / (1000 * 60);
    
    // Session has ended (past end time) - should be in recent
    if (timeAfterEndMinutes > 0) {
      return {
        canJoin: false,
        status: 'ended',
        message: 'Session ended',
        timeUntil: `Ended ${formatDistanceToNow(sessionEndTime)} ago`,
        icon: FiCheck,
        color: '#6b7280'
      };
    }
    
    // Session is currently active (started but not ended)
    if (timeDiffMinutes <= 0 && timeAfterEndMinutes <= 0) {
      const minutesRunning = Math.abs(timeDiffMinutes);
      const canStillJoin = minutesRunning <= LATE_JOIN_MINUTES;
      
      return {
        canJoin: canStillJoin,
        status: canStillJoin ? 'live' : 'too_late',
        message: canStillJoin ? 'Session is LIVE!' : 'Too late to join',
        timeUntil: `Started ${formatDistanceToNow(sessionTime)} ago`,
        icon: canStillJoin ? FiPlay : FiLock,
        color: canStillJoin ? '#10b981' : '#6b7280',
        isLive: true,
        isLate: minutesRunning > 5
      };
    }
    
    // Session hasn't started yet
    if (timeDiffMinutes > JOIN_WINDOW_MINUTES) {
      return {
        canJoin: false,
        status: 'too_early',
        message: `Opens in ${Math.ceil(timeDiffMinutes - JOIN_WINDOW_MINUTES)} minutes`,
        timeUntil: formatDistanceToNow(new Date(sessionTime.getTime() - JOIN_WINDOW_MINUTES * 60 * 1000), { addSuffix: true }),
        icon: FiLock,
        color: '#6b7280'
      };
    }
    
    // Within join window (can join now)
    return {
      canJoin: true,
      status: 'ready',
      message: 'Ready to join!',
      timeUntil: `Starts ${formatDistanceToNow(sessionTime, { addSuffix: true })}`,
      icon: FiPlay,
      color: '#6366f1'
    };
    
  }, [sessionTime, completed, session?.status, session?.duration, currentTime]);

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

  // Partner status - Fixed to show correct partner info
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
      return {
        hasPartner: true,
        name: session.partnerName || 'Study Partner',
        photo: session.partnerPhoto,
        status: PARTNER_STATUS.confirmed
      };
    } else if (isCurrentUserPartner) {
      return {
        hasPartner: true,
        name: session.userName || 'Study Partner',
        photo: session.userPhoto,
        status: PARTNER_STATUS.confirmed
      };
    } else {
      return {
        hasPartner: true,
        name: 'Study Partner',
        photo: null,
        status: PARTNER_STATUS.confirmed
      };
    }
  }, [session?.partnerId, session?.partnerName, session?.partnerPhoto, session?.userName, session?.userPhoto, session?.userId, user?.uid]);

  // Session status
  const sessionStatus = useMemo(() => {
    return SESSION_STATUS[session?.status] || SESSION_STATUS.scheduled;
  }, [session?.status]);

  // Handle join session with confirmation
  const handleJoinSession = useCallback(() => {
    if (!timingInfo.canJoin) return;
    
    setShowJoinModal(true);
  }, [timingInfo.canJoin]);

  // Confirm join and navigate
  const confirmJoin = useCallback(() => {
    setShowJoinModal(false);
    navigate(`/session/${session.id}`);
  }, [navigate, session?.id]);

  // Handle session view for completed sessions
  const handleSessionAction = useCallback(() => {
    if (completed) {
      console.log('Show session details');
      return;
    }

    if (timingInfo.canJoin) {
      handleJoinSession();
    } else {
      console.log('Show session preview');
    }
  }, [completed, timingInfo.canJoin, handleJoinSession]);

  // Get card classes
  const cardClasses = useMemo(() => {
    const classes = ['session-card'];
    
    if (completed) classes.push('completed');
    if (compact) classes.push('compact');
    if (!partnerInfo.hasPartner) classes.push('waiting-partner');
    if (partnerInfo.hasPartner) classes.push('has-partner');
    if (timingInfo.canJoin) classes.push('can-join');
    if (timingInfo.status) classes.push(`timing-${timingInfo.status}`);
    
    return classes.join(' ');
  }, [completed, compact, partnerInfo.hasPartner, timingInfo]);

  // Render partner info
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

  // IMPROVED: Render session actions with smart timing
  const renderActions = () => {
    if (!showActions) return null;

    if (completed || session?.status === 'completed') {
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

    // For ended sessions that aren't explicitly completed
    if (timingInfo.status === 'ended') {
      return (
        <div className="session-status ended">
          <FiCheck size={16} />
          <span>Ended</span>
        </div>
      );
    }

    return (
      <div className="session-actions">
        {timingInfo.canJoin ? (
          <button 
            className={`btn-session ${timingInfo.isLive ? 'btn-success' : 'btn-primary'} ${timingInfo.isLate ? 'btn-warning' : ''}`}
            onClick={handleJoinSession}
            title={partnerInfo.hasPartner ? 'Join focus session' : 'Enter session room'}
          >
            <timingInfo.icon size={16} />
            <span>{timingInfo.isLive ? 'Join LIVE' : timingInfo.isLate ? 'Join Late' : 'Join Session'}</span>
          </button>
        ) : (
          <div className={`session-timing-status ${timingInfo.status}`} style={{ color: timingInfo.color }}>
            <timingInfo.icon size={14} />
            <span>{timingInfo.message}</span>
          </div>
        )}
        
        {/* Time info */}
        <div className="session-time-info">
          <span className="time-until">{timingInfo.timeUntil}</span>
        </div>
        
        {/* Waiting indicator for sessions without partners */}
        {!partnerInfo.hasPartner && !completed && timingInfo.status !== 'ended' && (
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
        {timingInfo.canJoin && (
          <div className={`time-status-indicator ${timingInfo.status}`} style={{ backgroundColor: timingInfo.color }}>
            {timingInfo.isLive ? '🔴' : '🟢'}
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
          style={{ backgroundColor: timingInfo.color || sessionStatus.color }}
        />
      </div>

      {/* IMPROVED: Join Confirmation Modal with timing info */}
      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="join-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {timingInfo.isLive ? '🔴 Join Live Session' : 
                 timingInfo.isLate ? '⏰ Join Session (In Progress)' : 
                 '🎯 Join Focus Session'}
              </h3>
              <button 
                className="modal-close"
                onClick={() => setShowJoinModal(false)}
              >
                <FiX />
              </button>
            </div>
            
            <div className="modal-content">
              {timingInfo.isLate && (
                <div className="late-join-warning">
                  <FiAlertCircle />
                  <span>This session is already in progress. You can still join!</span>
                </div>
              )}
              
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
                <div className="preview-item">
                  <timingInfo.icon />
                  <span style={{ color: timingInfo.color }}>{timingInfo.message}</span>
                </div>
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
                className={`btn-primary ${timingInfo.isLive ? 'btn-success' : ''}`}
                onClick={confirmJoin}
              >
                <FiVideo />
                {timingInfo.isLive ? 'Join Live Session' : 'Join Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default React.memo(SessionCard);