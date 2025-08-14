import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { FiClock, FiUser, FiVideo, FiCheck, FiX, FiUsers } from 'react-icons/fi';

function SessionCard({ session, completed = false }) {
  const navigate = useNavigate();

  const handleJoinSession = () => {
    if (!completed && session.status === 'scheduled') {
      navigate(`/session/${session.id}`);
    }
  };

  const formatDuration = (minutes) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins > 0 ? `${mins}m` : ''}`;
  };

  const getPartnerStatus = () => {
    if (!session.partnerId) {
      return {
        text: 'Waiting for partner',
        icon: <FiUsers />,
        className: 'waiting'
      };
    } else {
      return {
        text: session.partnerName || 'Study Partner',
        icon: <FiUser />,
        className: 'confirmed'
      };
    }
  };

  const partnerStatus = getPartnerStatus();

  return (
    <div className={`session-card ${completed ? 'completed' : ''} ${!session.partnerId ? 'waiting-partner' : 'has-partner'}`} onClick={handleJoinSession}>
      <div className="session-info">
        <div className="session-time">
          {format(new Date(session.startTime || session.createdAt), 'MMM dd, h:mm a')}
        </div>
        <div className="session-duration">
          <FiClock />
          {formatDuration(session.duration || 50)}
        </div>
        
        {/* Partner Information */}
        <div className={`session-partner ${partnerStatus.className}`}>
          <div className="partner-avatar">
            {session.partnerId && session.partnerPhoto ? (
              <img src={session.partnerPhoto} alt={session.partnerName} />
            ) : (
              <div className="avatar-placeholder">
                {session.partnerId ? (
                  session.partnerName?.charAt(0).toUpperCase() || 'P'
                ) : (
                  '?'
                )}
              </div>
            )}
          </div>
          <div className="partner-details">
            <span className="partner-name">{partnerStatus.text}</span>
            {!session.partnerId && (
              <span className="partner-subtitle">Looking for partner...</span>
            )}
          </div>
          <div className="partner-status-icon">
            {partnerStatus.icon}
          </div>
        </div>

        {session.goal && (
          <div className="session-goal">
            <strong>Goal:</strong> {session.goal}
          </div>
        )}
      </div>
      
      <div className="session-actions">
        {completed ? (
          <div className="session-status completed">
            <FiCheck /> Completed
            {session.partnerId && (
              <span className="completion-note">with {session.partnerName || 'partner'}</span>
            )}
          </div>
        ) : session.status === 'scheduled' ? (
          <div className="action-buttons">
            <button className="btn-primary btn-small">
              <FiVideo /> 
              {session.partnerId ? 'Join Session' : 'Enter Room'}
            </button>
            {!session.partnerId && (
              <div className="waiting-indicator">
                <span className="pulse-dot"></span>
                Waiting for partner
              </div>
            )}
          </div>
        ) : session.status === 'cancelled' ? (
          <div className="session-status cancelled">
            <FiX /> Cancelled
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default SessionCard;