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
  serverTimestamp,
  onSnapshot
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
const CACHE_DURATION = 30 * 1000; // 30 seconds for faster updates

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
  
  // Real-time listeners
  const [unsubscribeUpcoming, setUnsubscribeUpcoming] = useState(null);
  const [unsubscribeCompleted, setUnsubscribeCompleted] = useState(null);
  
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

  // FIXED: Better session categorization logic
  const categorizeSession = useCallback((session) => {
    if (!session.startTime) return 'recent';
    
    const now = new Date();
    const startTime = new Date(session.startTime);
    const endTime = session.endTime ? new Date(session.endTime) : new Date(startTime.getTime() + (session.duration || 50) * 60 * 1000);
    
    // If session is explicitly completed or cancelled
    if (session.status === 'completed' || session.status === 'cancelled') {
      return 'recent';
    }
    
    // If session has ended (past end time), it should be recent
    if (now > endTime) {
      return 'recent';
    }
    
    // If session is in the future or currently active
    if (session.status === 'scheduled' || session.status === 'active') {
      return 'upcoming';
    }
    
    // Default to recent for any other case
    return 'recent';
  }, []);

  // Set up real-time listeners for sessions
  const setupRealTimeListeners = useCallback(() => {
    if (!user?.uid) return;

    console.log('🚀 Setting up real-time listeners...');

    // Clean up existing listeners
    if (unsubscribeUpcoming) {
      unsubscribeUpcoming();
      setUnsubscribeUpcoming(null);
    }
    if (unsubscribeCompleted) {
      unsubscribeCompleted();
      setUnsubscribeCompleted(null);
    }

    // Listen for all user sessions
    const userSessionsQuery = query(
      collection(db, 'sessions'),
      orderBy('startTime', 'desc'),
      limit(50)
    );

    const unsubUserSessions = onSnapshot(userSessionsQuery, 
      (snapshot) => {
        const allSessions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Filter for sessions user is involved in
        const userSessions = allSessions.filter(session => 
          session.userId === user.uid || 
          session.partnerId === user.uid ||
          (session.participants && session.participants.includes(user.uid))
        );
        
        console.log('📊 Total user sessions found:', userSessions.length);
        
        // Categorize sessions
        const upcoming = [];
        const recent = [];
        
        userSessions.forEach(session => {
          const category = categorizeSession(session);
          if (category === 'upcoming') {
            upcoming.push(session);
          } else {
            recent.push(session);
          }
        });
        
        // Sort upcoming by start time (soonest first)
        upcoming.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        
        // Sort recent by end time or completion time (most recent first)
        recent.sort((a, b) => {
          const timeA = a.endedAt ? (a.endedAt.toDate ? a.endedAt.toDate() : new Date(a.endedAt)) : new Date(a.startTime);
          const timeB = b.endedAt ? (b.endedAt.toDate ? b.endedAt.toDate() : new Date(b.endedAt)) : new Date(b.startTime);
          return timeB - timeA;
        });
        
        console.log('📈 Upcoming sessions:', upcoming.length);
        console.log('📋 Recent sessions:', recent.length);
        
        setUpcomingSessions(upcoming);
        setRecentSessions(recent.slice(0, 10)); // Limit recent to 10
        
        // Calculate stats from completed sessions
        const completedSessions = userSessions.filter(s => s.status === 'completed');
        const calculatedStats = calculateStats(completedSessions);
        setStats(calculatedStats);
        
        // Update user stats in background
        updateUserStats(calculatedStats).catch(console.error);
      },
      (error) => {
        console.error('❌ Error listening to sessions:', error);
        toast.error('Failed to load sessions. Please refresh.');
      }
    );

    setUnsubscribeUpcoming(() => unsubUserSessions);
    setUnsubscribeCompleted(() => unsubUserSessions); // Using same listener

    return () => {
      unsubUserSessions();
    };
  }, [user?.uid, categorizeSession]);

  // FIXED: Proper refresh functionality
  const handleRefresh = useCallback(async () => {
    if (refreshing) return; // Prevent multiple simultaneous refreshes
    
    setRefreshing(true);
    console.log('🔄 Refreshing dashboard data...');
    
    try {
      // Force refresh by clearing cache and re-setting up listeners
      setLastFetch(0);
      
      // Re-setup listeners to get fresh data
      if (unsubscribeUpcoming) {
        unsubscribeUpcoming();
        setUnsubscribeUpcoming(null);
      }
      if (unsubscribeCompleted) {
        unsubscribeCompleted();
        setUnsubscribeCompleted(null);
      }
      
      // Set up fresh listeners
      setupRealTimeListeners();
      
      // Show success message
      toast.success('Dashboard refreshed!');
      
    } catch (error) {
      console.error('❌ Error refreshing dashboard:', error);
      toast.error('Failed to refresh. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, setupRealTimeListeners, unsubscribeUpcoming, unsubscribeCompleted]);

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

  // Initialize dashboard with real-time listeners
  useEffect(() => {
    if (user?.uid) {
      ensureUserDocument().then(() => {
        setupRealTimeListeners();
        setLoading(false);
      });
    }

    // Cleanup function
    return () => {
      if (unsubscribeUpcoming) {
        unsubscribeUpcoming();
        setUnsubscribeUpcoming(null);
      }
      if (unsubscribeCompleted) {
        unsubscribeCompleted();
        setUnsubscribeCompleted(null);
      }
    };
  }, [user?.uid, ensureUserDocument, setupRealTimeListeners]);

  // Force loading to stop after 5 seconds
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [loading]);

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
              className={`refresh-button ${refreshing ? 'refreshing' : ''}`}
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
              Recent ({recentSessions.length})
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