import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  doc,
  setDoc,
  getDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionCard from './SessionCard';
import { 
  FiPlus, 
  FiCalendar, 
  FiUsers, 
  FiClock, 
  FiTrendingUp, 
  FiRefreshCw, 
  FiTarget,
  FiBook,
  FiAward 
} from 'react-icons/fi';
import { startOfDay, differenceInDays } from 'date-fns';
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
    thisWeek: 0,
    thisMonth: 0,
    level: 1
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');

  const motivationalQuotes = [
    "Focus on progress, not perfection 🎯",
    "Small steps daily lead to big changes 📚",
    "Your future depends on what you do today 💪",
    "Success is the sum of small efforts 🚀",
    "Stay focused and never give up ✨"
  ];

  // Force loading to false after 3 seconds maximum
  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        console.log('Force stopping dashboard loading after 3 seconds');
        setLoading(false);
      }
    }, 3000);

    return () => clearTimeout(loadingTimeout);
  }, [loading]);

  // Calculate streak helper function - MOVED UP
  const calculateStreak = useCallback((sessions) => {
    if (!sessions || sessions.length === 0) return 0;
    
    try {
      // Sort sessions by date
      const sortedSessions = [...sessions].sort((a, b) => {
        const dateA = a.endedAt?.toDate?.() || new Date(a.endedAt || 0);
        const dateB = b.endedAt?.toDate?.() || new Date(b.endedAt || 0);
        return dateB - dateA;
      });
      
      // Group by date
      const sessionDates = new Set();
      sortedSessions.forEach(session => {
        try {
          const date = session.endedAt?.toDate?.() || new Date(session.endedAt);
          const dateStr = startOfDay(date).toISOString();
          sessionDates.add(dateStr);
        } catch {
          // Skip invalid dates
        }
      });
      
      const uniqueDates = Array.from(sessionDates).sort((a, b) => new Date(b) - new Date(a));
      if (uniqueDates.length === 0) return 0;
      
      let streak = 0;
      const today = startOfDay(new Date());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Check if streak is active
      const latestDate = new Date(uniqueDates[0]);
      if (differenceInDays(today, latestDate) > 1) {
        return 0; // Streak broken
      }
      
      // Count consecutive days
      let currentDate = latestDate;
      for (let i = 0; i < uniqueDates.length; i++) {
        const sessionDate = new Date(uniqueDates[i]);
        const dayDiff = differenceInDays(currentDate, sessionDate);
        
        if (dayDiff <= 1) {
          streak++;
          currentDate = sessionDate;
        } else {
          break;
        }
      }
      
      return streak;
    } catch (error) {
      console.error('Error calculating streak:', error);
      return 0;
    }
  }, []);

  // Calculate stats helper function - MOVED UP
  const calculateStats = useCallback((sessions) => {
    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((acc, session) => {
      return acc + (session.actualDuration || session.duration || 0);
    }, 0);

    // Calculate streak
    const streak = calculateStreak(sessions);
    
    // This week's sessions
    const weekStart = startOfDay(new Date());
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const thisWeek = sessions.filter(session => {
      try {
        const sessionDate = session.endedAt?.toDate?.() || new Date(session.endedAt);
        return sessionDate >= weekStart;
      } catch {
        return false;
      }
    }).length;

    // This month's sessions
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const thisMonth = sessions.filter(session => {
      try {
        const sessionDate = session.endedAt?.toDate?.() || new Date(session.endedAt);
        return sessionDate >= monthStart;
      } catch {
        return false;
      }
    }).length;

    // Calculate level
    const level = Math.floor(totalSessions / 10) + 1;

    return {
      totalSessions,
      totalMinutes,
      streak,
      thisWeek,
      thisMonth,
      level
    };
  }, [calculateStreak]);

  // Ensure user document exists
  const ensureUserDocument = useCallback(async () => {
    if (!user) return;
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        // Create user document if it doesn't exist
        const userData = {
          uid: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email,
          photoURL: user.photoURL || null,
          createdAt: serverTimestamp(),
          totalSessions: 0,
          totalMinutes: 0,
          currentStreak: 0,
          level: 1,
          bio: '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          preferences: {
            sessionReminders: true,
            emailNotifications: true,
            soundEnabled: true
          }
        };
        
        await setDoc(userDocRef, userData);
        console.log('User document created successfully');
      }
    } catch (error) {
      console.error('Error ensuring user document:', error);
      // Don't throw, just log the error
    }
  }, [user]);

  const fetchUserData = useCallback(async (showLoader = true) => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      if (showLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      // Ensure user document exists first
      await ensureUserDocument();

      // Fetch sessions with timeout
      const now = new Date();
      
      // Set a timeout for data fetching
      const dataTimeout = setTimeout(() => {
        console.log('Data fetching timeout, using default values');
        setStats({
          totalSessions: 0,
          totalMinutes: 0,
          streak: 0,
          thisWeek: 0,
          thisMonth: 0,
          level: 1
        });
        setUpcomingSessions([]);
        setCompletedSessions([]);
        setLoading(false);
        setRefreshing(false);
      }, 5000);

      try {
        // Upcoming sessions with simpler query
        let upcomingData = [];
        try {
          const upcomingQuery = query(
            collection(db, 'sessions'),
            where('userId', '==', user.uid),
            where('status', 'in', ['scheduled', 'active']),
            limit(5)
          );
          
          const upcomingSnapshot = await getDocs(upcomingQuery);
          upcomingData = upcomingSnapshot.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data()
            }))
            .filter(session => {
              // Filter in JavaScript since Firebase queries can be complex
              const sessionTime = new Date(session.startTime);
              return sessionTime > now;
            })
            .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
            .slice(0, 5);
        } catch (error) {
          console.error('Error fetching upcoming sessions:', error);
        }
        setUpcomingSessions(upcomingData);

        // Completed sessions with simpler query
        let completedData = [];
        try {
          const completedQuery = query(
            collection(db, 'sessions'),
            where('userId', '==', user.uid),
            where('status', '==', 'completed'),
            limit(20)
          );
          
          const completedSnapshot = await getDocs(completedQuery);
          completedData = completedSnapshot.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data()
            }))
            .sort((a, b) => {
              const dateA = a.endedAt?.toDate?.() || new Date(a.endedAt || 0);
              const dateB = b.endedAt?.toDate?.() || new Date(b.endedAt || 0);
              return dateB - dateA;
            })
            .slice(0, 20);
        } catch (error) {
          console.error('Error fetching completed sessions:', error);
        }
        setCompletedSessions(completedData);

        // Calculate stats
        const calculatedStats = calculateStats(completedData);
        setStats(calculatedStats);

        // Update user stats safely
        updateUserStats(calculatedStats);

        clearTimeout(dataTimeout);

      } catch (error) {
        console.error('Error fetching data:', error);
        clearTimeout(dataTimeout);
        // Use default values instead of showing error
        setStats({
          totalSessions: 0,
          totalMinutes: 0,
          streak: 0,
          thisWeek: 0,
          thisMonth: 0,
          level: 1
        });
        setUpcomingSessions([]);
        setCompletedSessions([]);
      }

    } catch (error) {
      console.error('Error in fetchUserData:', error);
      // Set default values instead of showing error
      setStats({
        totalSessions: 0,
        totalMinutes: 0,
        streak: 0,
        thisWeek: 0,
        thisMonth: 0,
        level: 1
      });
      setUpcomingSessions([]);
      setCompletedSessions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, ensureUserDocument, calculateStats]);

  const updateUserStats = async (calculatedStats) => {
    if (!user) return;
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      
      // Use setDoc with merge to update or create
      await setDoc(userDocRef, {
        totalSessions: calculatedStats.totalSessions,
        totalMinutes: calculatedStats.totalMinutes,
        currentStreak: calculatedStats.streak,
        level: calculatedStats.level,
        lastActivityDate: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      
    } catch (error) {
      console.error('Error updating user stats:', error);
      // Don't show error to user, silently fail
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserData();
    } else {
      setLoading(false);
    }
  }, [user, fetchUserData]);

  const handleRefresh = () => {
    fetchUserData(false);
    toast.success('Data refreshed!');
  };

  const formatGreeting = () => {
    const hour = new Date().getHours();
    const name = user?.displayName?.split(' ')[0] || 'Student';
    
    if (hour < 12) return `Good morning, ${name}! ☀️`;
    if (hour < 17) return `Good afternoon, ${name}! 🌤️`;
    return `Good evening, ${name}! 🌙`;
  };

  const getRandomQuote = () => {
    return motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
  };

  const quickActions = [
    {
      icon: FiCalendar,
      label: 'Book Session',
      action: () => navigate('/book-session'),
      color: 'primary'
    },
    {
      icon: FiTarget,
      label: 'Goals',
      action: () => navigate('/profile'),
      color: 'success'
    },
    {
      icon: FiBook,
      label: 'Stats',
      action: () => navigate('/profile'),
      color: 'warning'
    },
    {
      icon: FiAward,
      label: 'Achievements',
      action: () => navigate('/profile'),
      color: 'secondary'
    }
  ];

  // Always show the dashboard, even while loading
  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="greeting-section">
            <h1>{formatGreeting()}</h1>
            <p className="motivational-message">{getRandomQuote()}</p>
          </div>
          
          <div className="header-actions">
            <button 
              className="refresh-button"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <FiRefreshCw className={refreshing ? 'spinning' : ''} />
            </button>
            
            <button 
              className="btn-primary"
              onClick={() => navigate('/book-session')}
            >
              <FiPlus />
              <span className="btn-text">Book Session</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="enhanced-stats-grid">
        <div className="stat-card primary">
          <div className="stat-icon">
            <FiBook />
          </div>
          <div className="stat-content">
            <h3>Total Sessions</h3>
            <p>{loading ? '...' : stats.totalSessions}</p>
          </div>
        </div>

        <div className="stat-card success">
          <div className="stat-icon">
            <FiClock />
          </div>
          <div className="stat-content">
            <h3>Focus Time</h3>
            <p>{loading ? '...' : `${Math.floor(stats.totalMinutes / 60)}h`}</p>
          </div>
        </div>

        <div className="stat-card warning">
          <div className="stat-icon">
            <FiTrendingUp />
          </div>
          <div className="stat-content">
            <h3>Streak</h3>
            <p>{loading ? '...' : `${stats.streak} days`}</p>
          </div>
        </div>

        <div className="stat-card secondary">
          <div className="stat-icon">
            <FiAward />
          </div>
          <div className="stat-content">
            <h3>Level</h3>
            <p>{loading ? '...' : stats.level}</p>
          </div>
        </div>
      </div>

      {/* Sessions */}
      <div className="sessions-section">
        <div className="section-header">
          <h2>Sessions</h2>
          <div className="tab-switcher">
            <button 
              className={`tab-button ${activeTab === 'upcoming' ? 'active' : ''}`}
              onClick={() => setActiveTab('upcoming')}
            >
              Upcoming
            </button>
            <button 
              className={`tab-button ${activeTab === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              Completed
            </button>
          </div>
        </div>

        <div className="sessions-content">
          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading sessions...</p>
            </div>
          ) : activeTab === 'upcoming' ? (
            upcomingSessions.length > 0 ? (
              <div className="sessions-list">
                {upcomingSessions.map(session => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📅</div>
                <h3>No upcoming sessions</h3>
                <p>Book a session to get started!</p>
                <button 
                  className="btn-primary"
                  onClick={() => navigate('/book-session')}
                >
                  <FiPlus /> Book Now
                </button>
              </div>
            )
          ) : (
            completedSessions.length > 0 ? (
              <div className="sessions-list">
                {completedSessions.slice(0, 5).map(session => (
                  <SessionCard key={session.id} session={session} completed />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🎯</div>
                <h3>No completed sessions yet</h3>
                <p>Complete your first session to see progress!</p>
                <button 
                  className="btn-primary"
                  onClick={() => navigate('/book-session')}
                >
                  <FiPlus /> Start First Session
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
          {quickActions.map((action, index) => (
            <button 
              key={index}
              className={`action-card ${action.color}`}
              onClick={action.action}
            >
              <action.icon size={20} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;