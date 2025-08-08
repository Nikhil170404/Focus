import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionCard from './SessionCard';
import Stats from './Stats';
import { CSSLoadingSpinner, SkeletonLoader } from '../Common/LoadingSpinner';
import { FiPlus, FiCalendar, FiUsers, FiClock, FiTrendingUp, FiRefreshCw } from 'react-icons/fi';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import toast from 'react-hot-toast';

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
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUserData();
  }, [user]);

  const fetchUserData = async (showRefreshIndicator = false) => {
    try {
      if (showRefreshIndicator) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch upcoming sessions
      const upcomingQuery = query(
        collection(db, 'sessions'),
        where('userId', '==', user.uid),
        where('status', 'in', ['scheduled', 'active']),
        orderBy('startTime', 'asc'),
        limit(10)
      );
      
      const upcomingSnapshot = await getDocs(upcomingQuery);
      const upcomingData = upcomingSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter future sessions only
      const now = new Date();
      const futureUpcoming = upcomingData.filter(session => 
        new Date(session.startTime) > now
      );
      
      setUpcomingSessions(futureUpcoming);

      // Fetch completed sessions
      const completedQuery = query(
        collection(db, 'sessions'),
        where('userId', '==', user.uid),
        where('status', '==', 'completed'),
        orderBy('endTime', 'desc'),
        limit(10)
      );
      
      const completedSnapshot = await getDocs(completedQuery);
      const completedData = completedSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setCompletedSessions(completedData);

      // Calculate stats
      const totalSessions = completedData.length;
      const totalMinutes = completedData.reduce((acc, session) => {
        return acc + (session.duration || 0);
      }, 0);

      const calculatedStreak = calculateStreak(completedData);
      const favoritesCount = await getFavoritesCount();

      setStats({
        totalSessions,
        totalMinutes,
        streak: calculatedStreak,
        favorites: favoritesCount
      });

    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to load dashboard data');
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const calculateStreak = (sessions) => {
    if (!sessions || sessions.length === 0) return 0;
    
    // Sort sessions by completion date
    const sortedSessions = sessions.sort((a, b) => 
      new Date(b.endTime || b.completedAt) - new Date(a.endTime || a.completedAt)
    );
    
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    // Check if there's a session today or yesterday to start the streak
    const hasSessionToday = sortedSessions.some(session => {
      const sessionDate = new Date(session.endTime || session.completedAt);
      return isToday(sessionDate);
    });
    
    const hasSessionYesterday = sortedSessions.some(session => {
      const sessionDate = new Date(session.endTime || session.completedAt);
      return isYesterday(sessionDate);
    });
    
    if (!hasSessionToday && !hasSessionYesterday) {
      return 0;
    }
    
    // Calculate consecutive days
    const uniqueDays = new Set();
    sortedSessions.forEach(session => {
      const sessionDate = new Date(session.endTime || session.completedAt);
      const dayKey = sessionDate.toDateString();
      uniqueDays.add(dayKey);
    });
    
    const sortedDays = Array.from(uniqueDays).sort((a, b) => new Date(b) - new Date(a));
    
    let consecutiveDays = 0;
    for (let i = 0; i < sortedDays.length; i++) {
      const day = new Date(sortedDays[i]);
      const expectedDate = new Date(currentDate);
      expectedDate.setDate(currentDate.getDate() - i);
      
      if (day.toDateString() === expectedDate.toDateString()) {
        consecutiveDays++;
      } else {
        break;
      }
    }
    
    return consecutiveDays;
  };

  const getFavoritesCount = async () => {
    try {
      const favQuery = query(
        collection(db, 'favorites'),
        where('userId', '==', user.uid)
      );
      const favSnapshot = await getDocs(favQuery);
      return favSnapshot.size;
    } catch (error) {
      console.error('Error fetching favorites:', error);
      return 0;
    }
  };

  const formatGreeting = () => {
    const hour = new Date().getHours();
    const name = user.displayName?.split(' ')[0] || 'Focus Warrior';
    
    if (hour < 12) return `Good morning, ${name}!`;
    if (hour < 17) return `Good afternoon, ${name}!`;
    return `Good evening, ${name}!`;
  };

  const getMotivationalMessage = () => {
    const messages = [
      "Ready to tackle your goals today? 🎯",
      "Every focused session brings you closer to success! 💪",
      "Your consistency is building something amazing! ✨",
      "Time to turn your dreams into achievements! 🚀",
      "Focus today, celebrate tomorrow! 🌟"
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  const handleRefresh = () => {
    fetchUserData(true);
  };

  const getNextSessionInfo = () => {
    if (upcomingSessions.length === 0) return null;
    
    const nextSession = upcomingSessions[0];
    const sessionDate = new Date(nextSession.startTime);
    const now = new Date();
    const timeDiff = sessionDate - now;
    
    if (timeDiff < 0) return null;
    
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    
    let timeString = '';
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      timeString = `in ${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      timeString = `in ${hours}h ${minutes}m`;
    } else {
      timeString = `in ${minutes} minutes`;
    }
    
    return {
      session: nextSession,
      timeString,
      isUpcoming: timeDiff > 0
    };
  };

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <SkeletonLoader lines={2} />
        </div>
        <div className="dashboard-loading">
          <SkeletonLoader lines={4} />
          <SkeletonLoader lines={4} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3>Something went wrong</h3>
          <p>{error}</p>
          <button className="btn-primary" onClick={() => fetchUserData()}>
            <FiRefreshCw size={16} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const nextSessionInfo = getNextSessionInfo();

  return (
    <div className="dashboard">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="greeting-section">
            <h1>{formatGreeting()}</h1>
            <p className="motivational-message">{getMotivationalMessage()}</p>
          </div>
          
          <div className="header-actions">
            <button 
              className="refresh-button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh data"
            >
              <FiRefreshCw size={16} className={refreshing ? 'spinning' : ''} />
            </button>
            <button 
              className="btn-primary"
              onClick={() => navigate('/book-session')}
            >
              <FiPlus size={16} />
              <span className="btn-text">Book Session</span>
            </button>
          </div>
        </div>
        
        {/* Next Session Alert */}
        {nextSessionInfo && (
          <div className="next-session-alert">
            <div className="alert-content">
              <div className="alert-icon">⏰</div>
              <div className="alert-text">
                <strong>Next session starts {nextSessionInfo.timeString}</strong>
                <span>"{nextSessionInfo.session.goal}"</span>
              </div>
              <button 
                className="join-button"
                onClick={() => navigate(`/session/${nextSessionInfo.session.id}`)}
              >
                Join Early
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats Section */}
      <Stats stats={stats} />

      {/* Sessions Section */}
      <div className="sessions-section">
        <div className="section-header">
          <h2>Your Sessions</h2>
          <div className="tab-switcher">
            <button 
              className={`tab-button ${activeTab === 'upcoming' ? 'active' : ''}`}
              onClick={() => setActiveTab('upcoming')}
            >
              <FiCalendar size={16} />
              <span>Upcoming ({upcomingSessions.length})</span>
            </button>
            <button 
              className={`tab-button ${activeTab === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              <FiClock size={16} />
              <span>Completed ({completedSessions.length})</span>
            </button>
          </div>
        </div>

        <div className="sessions-content">
          {activeTab === 'upcoming' ? (
            upcomingSessions.length > 0 ? (
              <div className="sessions-list">
                {upcomingSessions.map(session => (
                  <SessionCard 
                    key={session.id} 
                    session={session} 
                    onJoin={() => navigate(`/session/${session.id}`)}
                    showJoinButton={true}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📅</div>
                <h3>No upcoming sessions</h3>
                <p>Ready to boost your productivity? Book your next focus session!</p>
                <button 
                  className="btn-primary"
                  onClick={() => navigate('/book-session')}
                >
                  <FiPlus size={16} />
                  Book Your First Session
                </button>
              </div>
            )
          ) : (
            completedSessions.length > 0 ? (
              <div className="sessions-list">
                {completedSessions.map(session => (
                  <SessionCard 
                    key={session.id} 
                    session={session} 
                    completed={true}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🎯</div>
                <h3>No completed sessions yet</h3>
                <p>Start your first focus session to see your progress here!</p>
                <button 
                  className="btn-secondary"
                  onClick={() => navigate('/book-session')}
                >
                  <FiCalendar size={16} />
                  Schedule a Session
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="actions-grid">
          <button 
            className="action-card"
            onClick={() => navigate('/book-session')}
          >
            <FiCalendar size={24} />
            <span>Book Session</span>
          </button>
          <button 
            className="action-card"
            onClick={() => navigate('/favorites')}
          >
            <FiUsers size={24} />
            <span>My Favorites</span>
          </button>
          <button 
            className="action-card"
            onClick={() => navigate('/profile')}
          >
            <FiTrendingUp size={24} />
            <span>View Stats</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;