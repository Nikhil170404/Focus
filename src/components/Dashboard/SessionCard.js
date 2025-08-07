import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { FiClock, FiUser, FiVideo, FiCheck, FiX } from 'react-icons/fi';

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

  return (
    <div className={`session-card ${completed ? 'completed' : ''}`} onClick={handleJoinSession}>
      <div className="session-info">
        <div className="session-time">
          {format(new Date(session.startTime || session.createdAt), 'MMM dd, h:mm a')}
        </div>
        <div className="session-duration">
          <FiClock />
          {formatDuration(session.duration || 50)}
        </div>
        {session.partner && (
          <div className="session-partner">
            <div className="partner-avatar">
              {session.partner.photoURL ? (
                <img src={session.partner.photoURL} alt={session.partner.name} />
              ) : (
                session.partner.name?.charAt(0).toUpperCase()
              )}
            </div>
            <span>{session.partner.name || 'Partner'}</span>
          </div>
        )}
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
          </div>
        ) : session.status === 'scheduled' ? (
          <button className="btn-primary btn-small">
            <FiVideo /> Join
          </button>
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