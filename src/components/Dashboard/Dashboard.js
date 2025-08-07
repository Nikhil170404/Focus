import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionCard from './SessionCard';
import Stats from './Stats';
import { FiPlus, FiCalendar, FiUsers, FiClock } from 'react-icons/fi';
import { format } from 'date-fns';

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [completedSessions, setCompletedSessions] = useState([]);
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalMinutes: 0,
    streak: 0,
    favorites: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserData();
  }, [user]);

  const fetchUserData = async () => {
    try {
      // Fetch upcoming sessions
      const upcomingQuery = query(
        collection(db, 'sessions'),
        where('userId', '==', user.uid),
        where('status', '==', 'scheduled'),
        orderBy('startTime', 'asc'),
        limit(5)
      );
      const upcomingSnapshot = await getDocs(upcomingQuery);
      setUpcomingSessions(upcomingSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })));

      // Fetch completed sessions
      const completedQuery = query(
        collection(db, 'sessions'),
        where('userId', '==', user.uid),
        where('status', '==', 'completed'),
        orderBy('endTime', 'desc'),
        limit(10)
      );
      const completedSnapshot = await getDocs(completedQuery);
      setCompletedSessions(completedSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })));

      // Calculate stats
      const totalSessions = completedSnapshot.size;
      const totalMinutes = completedSnapshot.docs.reduce((acc, doc) => {
        return acc + (doc.data().duration || 0);
      }, 0);

      setStats({
        totalSessions,
        totalMinutes,
        streak: calculateStreak(completedSnapshot.docs),
        favorites: await getFavoritesCount()
      });
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
    setLoading(false);
  };

  const calculateStreak = (sessions) => {
    // Calculate consecutive days streak
    // Implementation here
    return 5; // Placeholder
  };

  const getFavoritesCount = async () => {
    const favQuery = query(
      collection(db, 'favorites'),
      where('userId', '==', user.uid)
    );
    const favSnapshot = await getDocs(favQuery);
    return favSnapshot.size;
  };

  if (loading) {
    return <div className="loading-container">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Welcome back, {user.displayName || 'Focus Warrior'}!</h1>
        <button 
          className="btn-primary"
          onClick={() => navigate('/book-session')}
        >
          <FiPlus /> Book New Session
        </button>
      </div>

      <Stats stats={stats} />

      <div className="dashboard-grid">
        <div className="dashboard-section">
          <h2><FiCalendar /> Upcoming Sessions</h2>
          {upcomingSessions.length > 0 ? (
            <div className="sessions-list">
              {upcomingSessions.map(session => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No upcoming sessions</p>
              <button 
                className="btn-secondary"
                onClick={() => navigate('/book-session')}
              >
                Book Your First Session
              </button>
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <h2><FiClock /> Recent Sessions</h2>
          {completedSessions.length > 0 ? (
            <div className="sessions-list">
              {completedSessions.map(session => (
                <SessionCard key={session.id} session={session} completed />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No completed sessions yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;