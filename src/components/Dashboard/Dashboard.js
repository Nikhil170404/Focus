import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  FiAward,
  FiZap
} from 'react-icons/fi';
import { startOfDay, differenceInDays, isToday, subDays } from 'date-fns';
import toast from 'react-hot-toast';

// Motivational messages
const MOTIVATIONAL_MESSAGES = [
  "🎯 Focus on progress, not perfection",
  "📚 Small steps daily lead to big changes", 
  "💪 Your future depends on what you do today",
  "🚀 Success is the sum of small efforts",
  "✨ Stay focused and never give up",
  "🔥 Excellence is a habit, not an act",
  "💎 Discipline creates diamonds",
  "🌟 Every expert was once a beginner"
];

// Cache duration in milliseconds
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Core state
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalMinutes: 0,
    currentStreak: 0,
    thisWeek: 0,
    thisMonth: 0,
    level: 1
  });
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [isMobile] = useState(window.innerWidth <= 768);
  
  // Cache state
  const [lastFetch, setLastFetch] = useState(0);
  
  // Memoized motivational message
  const motivationalMessage = useMemo(() => {
    const index = Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length);
    return MOTIVATIONAL_MESSAGES[index];
  }, []);

  // Greeting based on time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = user?.displayName?.split(' ')[0] || 'Student';
    
    if (hour < 12) return `Good morning, ${name}! ☀️`;
    if (hour < 17) return `Good afternoon, ${name}! 🌤️`;
    return `Good evening, ${name}! 🌙`;
  }, [user?.displayName]);

  // Quick actions
  const quickActions = useMemo(() => [
    {
      icon: FiZap,
      label: 'Quick Match',
      description: 'Find a partner now',
      action: () => navigate('/book-session?tab=quick'),
      color: 'primary',
      highlight: true
    },
    {
      icon: FiCalendar,
      label: 'Schedule',
      description: 'Plan ahead',
      action: () => navigate('/book-session?tab=schedule'),
      color: 'secondary'
    },
    {
      icon: FiUsers,
      label: 'Join Session',
      description: 'Help someone focus',
      action: () => navigate('/book-session?tab=join'),
      color: 'success'
    },
    {
      icon: FiTarget,
      label: 'Goals',
      description: 'Track progress',
      action: () => navigate('/profile'),
      color: 'warning'
    }
  ], [navigate]);

  // Optimized data fetching with caching
  const fetchUserData = useCallback(async (forceRefresh = false) => {
    if (!user?.uid) return;

    const now = Date.now();
    if (!forceRefresh && (now - lastFetch) < CACHE_DURATION) {
      return; // Use cached data
    }

    try {
      setLoading(!forceRefresh);
      if (forceRefresh) setRefreshing(true);

      // Batch all Firebase queries for efficiency
      const [upcomingData, completedData] = await Promise.all([
        fetchUpcomingSessions(),
        fetchCompletedSessions()
      ]);

      setUpcomingSessions(upcomingData);
      setRecentSessions(completedData.slice(0, 5)); // Only show 5 recent
      
      // Calculate stats from completed sessions
      const calculatedStats = calculateStats(completedData);
      setStats(calculatedStats);
      
      // Update user stats in background (don't await)
      updateUserStats(calculatedStats).catch(console.error);
      
      setLastFetch(now);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid, lastFetch]);

  // Fetch upcoming sessions
  const fetchUpcomingSessions = async () => {
    try {
      const now = new Date();
      const q = query(
        collection(db, 'sessions'),
        where('userId', '==', user.uid),
        where('status', 'in', ['scheduled']),
        where('startTime', '>', now.toISOString()),
        orderBy('startTime', 'asc'),
        limit(5)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching upcoming sessions:', error);
      return [];
    }
  };

  // Fetch completed sessions
  const fetchCompletedSessions = async () => {
    try {
      const q = query(
        collection(db, 'sessions'),
        where('userId', '==', user.uid),
        where('status', '==', 'completed'),
        orderBy('endedAt', 'desc'),
        limit(50) // Limit for performance
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching completed sessions:', error);
      return [];
    }
  };

  // Optimized stats calculation
  const calculateStats = useCallback((sessions) => {
    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((acc, session) => {
      return acc + (session.actualDuration || session.duration || 0);
    }, 0);

    // Calculate streak efficiently
    const streak = calculateStreak(sessions);
    
    // This week (starting Monday)
    const weekStart = startOfDay(new Date());
    const dayOfWeek = weekStart.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekStart.setDate(weekStart.getDate() + mondayOffset);
    
    const thisWeek = sessions.filter(session => {
      try {
        const sessionDate = session.endedAt?.toDate?.() || new Date(session.endedAt);
        return sessionDate >= weekStart;
      } catch {
        return false;
      }
    }).length;

    // This month
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

    // Calculate level (10 sessions per level)
    const level = Math.floor(totalSessions / 10) + 1;

    return {
      totalSessions,
      totalMinutes,
      currentStreak: streak,
      thisWeek,
      thisMonth,
      level
    };
  }, []);

  // Efficient streak calculation
  const calculateStreak = useCallback((sessions) => {
    if (!sessions || sessions.length === 0) return 0;
    
    try {
      // Sort sessions by date (newest first)
      const sortedSessions = [...sessions].sort((a, b) => {
        const dateA = a.endedAt?.toDate?.() || new Date(a.endedAt || 0);
        const dateB = b.endedAt?.toDate?.() || new Date(b.endedAt || 0);
        return dateB - dateA;
      });
      
      // Group by date (YYYY-MM-DD)
      const sessionDates = new Set();
      sortedSessions.forEach(session => {
        try {
          const date = session.endedAt?.toDate?.() || new Date(session.endedAt);
          const dateStr = startOfDay(date).toISOString().split('T')[0];
          sessionDates.add(dateStr);
        } catch {
          // Skip invalid dates
        }
      });
      
      const uniqueDates = Array.from(sessionDates).sort((a, b) => new Date(b) - new Date(a));
      if (uniqueDates.length === 0) return 0;
      
      // Check if streak is active (within last 2 days)
      const today = startOfDay(new Date());
      const latestDate = startOfDay(new Date(uniqueDates[0]));
      const daysSinceLatest = differenceInDays(today, latestDate);
      
      if (daysSinceLatest > 1) return 0; // Streak broken
      
      // Count consecutive days
      let streak = 0;
      let currentDate = latestDate;
      
      for (const dateStr of uniqueDates) {
        const sessionDate = startOfDay(new Date(dateStr));
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

  // Update user stats in Firestore (background operation)
  const updateUserStats = async (calculatedStats) => {
    if (!user?.uid) return;
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      
      await setDoc(userDocRef, {
        totalSessions: calculatedStats.totalSessions,
        totalMinutes: calculatedStats.totalMinutes,
        currentStreak: calculatedStats.currentStreak,
        level: calculatedStats.level,
        lastActivityDate: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      
    } catch (error) {
      console.error('Error updating user stats:', error);
      // Don't throw - stats update shouldn't break the dashboard
    }
  };

  // Ensure user document exists
  const ensureUserDocument = useCallback(async () => {
    if (!user?.uid) return;
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
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
          preferences: {
            sessionReminders: true,
            emailNotifications: true,
            soundEnabled: true
          }
        };
        
        await setDoc(userDocRef, userData);
      }
    } catch (error) {
      console.error('Error ensuring user document:', error);
    }
  }, [user]);

  // Initialize dashboard
  useEffect(() => {
    if (user?.uid) {
      ensureUserDocument().then(() => {
        fetchUserData();
      });
    }
  }, [user?.uid, ensureUserDocument, fetchUserData]);

  // Force loading to stop after 5 seconds
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [loading]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchUserData(true);
    toast.success('Data refreshed!');
  }, [fetchUserData]);

  // Handle quick action
  const handleQuickAction = useCallback((action) => {
    action.action();
  }, []);

  // Get level info
  const getLevelInfo = useMemo(() => {
    const level = stats.level;
    if (level >= 20) return { title: "Master", color: "#8B5CF6", icon: "👑" };
    if (level >= 10) return { title: "Expert", color: "#10B981", icon: "🎓" };
    if (level >= 5) return { title: "Intermediate", color: "#F59E0B", icon: "⭐" };
    return { title: "Beginner", color: "#6B7280", icon: "🌱" };
  }, [stats.level]);

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="greeting-section">
            <h1>{greeting}</h1>
            <p className="motivational-message">{motivationalMessage}</p>
          </div>
          
          <div className="header-actions">
            <button 
              className="refresh-button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh data"
            >
              <FiRefreshCw className={refreshing ? 'spinning' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions - Prominent CTA */}
      <div className="quick-actions-hero">
        <h2>Ready to focus?</h2>
        <div className="actions-grid">
          {quickActions.map((action, index) => (
            <button 
              key={index}
              className={`action-card ${action.color} ${action.highlight ? 'highlight' : ''}`}
              onClick={() => handleQuickAction(action)}
            >
              <div className="action-icon">
                <action.icon size={isMobile ? 18 : 24} />
              </div>
              <div className="action-content">
                <div className="action-label">{action.label}</div>
                <div className="action-desc">{action.description}</div>
              </div>
              {action.highlight && <div className="highlight-badge">Most Popular</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="stats-overview">
        <div className="stats-grid">
          <div className="stat-card primary">
            <div className="stat-icon">
              <FiBook />
            </div>
            <div className="stat-content">
              <div className="stat-value">{loading ? '...' : stats.totalSessions}</div>
              <div className="stat-label">Total Sessions</div>
            </div>
          </div>

          <div className="stat-card success">
            <div className="stat-icon">
              <FiClock />
            </div>
            <div className="stat-content">
              <div className="stat-value">
                {loading ? '...' : `${Math.floor(stats.totalMinutes / 60)}h`}
              </div>
              <div className="stat-label">Focus Time</div>
            </div>
          </div>

          <div className="stat-card warning">
            <div className="stat-icon">
              <FiTrendingUp />
            </div>
            <div className="stat-content">
              <div className="stat-value">
                {loading ? '...' : `${stats.currentStreak}`}
              </div>
              <div className="stat-label">Day Streak</div>
            </div>
          </div>

          <div className="stat-card secondary">
            <div className="stat-icon" style={{ color: getLevelInfo.color }}>
              {getLevelInfo.icon}
            </div>
            <div className="stat-content">
              <div className="stat-value">{loading ? '...' : stats.level}</div>
              <div className="stat-label">{getLevelInfo.title}</div>
            </div>
          </div>
        </div>

        {/* Progress to next level */}
        {!loading && (
          <div className="level-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ 
                  width: `${((stats.totalSessions % 10) / 10) * 100}%`,
                  backgroundColor: getLevelInfo.color
                }}
              />
            </div>
            <span className="progress-text">
              {stats.totalSessions % 10}/10 sessions to level {stats.level + 1}
            </span>
          </div>
        )}
      </div>

      {/* Sessions Section */}
      <div className="sessions-section">
        <div className="section-header">
          <h2>Sessions</h2>
          <div className="tab-switcher">
            <button 
              className={`tab-button ${activeTab === 'upcoming' ? 'active' : ''}`}
              onClick={() => setActiveTab('upcoming')}
            >
              Upcoming ({upcomingSessions.length})
            </button>
            <button 
              className={`tab-button ${activeTab === 'recent' ? 'active' : ''}`}
              onClick={() => setActiveTab('recent')}
            >
              Recent
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
                <p>Ready to book your next focus session?</p>
                <button 
                  className="btn-primary"
                  onClick={() => navigate('/book-session')}
                >
                  <FiPlus /> Book Session
                </button>
              </div>
            )
          ) : (
            recentSessions.length > 0 ? (
              <div className="sessions-list">
                {recentSessions.map(session => (
                  <SessionCard key={session.id} session={session} completed />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🎯</div>
                <h3>No sessions completed yet</h3>
                <p>Complete your first session to see your progress!</p>
                <button 
                  className="btn-primary"
                  onClick={() => navigate('/book-session')}
                >
                  <FiZap /> Start First Session
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Weekly Progress */}
      {!loading && stats.totalSessions > 0 && (
        <div className="weekly-progress">
          <h3>This Week</h3>
          <div className="progress-stats">
            <div className="progress-item">
              <span className="progress-label">Sessions completed</span>
              <span className="progress-value">{stats.thisWeek}</span>
            </div>
            <div className="progress-item">
              <span className="progress-label">This month</span>
              <span className="progress-value">{stats.thisMonth}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;