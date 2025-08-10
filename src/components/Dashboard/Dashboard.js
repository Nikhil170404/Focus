import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  doc,
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionCard from './SessionCard';
import Stats from './Stats';
import { CSSLoadingSpinner, SkeletonLoader } from '../Common/LoadingSpinner';
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
import { format, isToday, isTomorrow, isYesterday, startOfDay, endOfDay, differenceInDays } from 'date-fns';
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
  const [error, setError] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [motivationalQuote, setMotivationalQuote] = useState('');

  const indiaFocusedQuotes = [
    "करम कर, फल की चिंता मत कर - Focus on your action, not the result 🎯",
    "सफलता का रहस्य है निरंतर अभ्यास - Success secret is continuous practice 📚",
    "छोटे कदम, बड़े सपने - Small steps, big dreams 🚀",
    "आज का कठिन परिश्रम, कल की सफलता - Today's hard work, tomorrow's success 💪",
    "Focus is the bridge between goals and achievement 🌉",
    "Every JEE/NEET aspirant needs focused study sessions 📖",
    "Transform your dreams into reality through focused action ✨"
  ];

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchUserData();
    setRandomQuote();
  }, [user]);

  const setRandomQuote = () => {
    const randomQuote = indiaFocusedQuotes[Math.floor(Math.random() * indiaFocusedQuotes.length)];
    setMotivationalQuote(randomQuote);
  };

  const fetchUserData = async (showRefreshIndicator = false) => {
    try {
      if (showRefreshIndicator) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch upcoming sessions (scheduled and active)
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
        orderBy('endedAt', 'desc'),
        limit(50) // Get more for accurate streak calculation
      );
      
      const completedSnapshot = await getDocs(completedQuery);
      const completedData = completedSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setCompletedSessions(completedData);

      // Calculate comprehensive stats
      const calculatedStats = calculateStats(completedData);
      setStats(calculatedStats);

      // Update user stats in Firebase
      await updateUserStats(calculatedStats);

    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to load dashboard data');
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const calculateStats = (sessions) => {
    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((acc, session) => {
      return acc + (session.actualDuration || session.duration || 0);
    }, 0);

    // Calculate streak properly
    const streak = calculateProperStreak(sessions);
    
    // Calculate this week's sessions
    const thisWeekStart = startOfDay(new Date());
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay()); // Start of week
    const thisWeek = sessions.filter(session => {
      const sessionDate = new Date(session.endedAt || session.completedAt);
      return sessionDate >= thisWeekStart;
    }).length;

    // Calculate this month's sessions
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    const thisMonth = sessions.filter(session => {
      const sessionDate = new Date(session.endedAt || session.completedAt);
      return sessionDate >= thisMonthStart;
    }).length;

    // Calculate level based on total sessions (gamification for India students)
    const level = Math.floor(totalSessions / 10) + 1; // Level up every 10 sessions

    return {
      totalSessions,
      totalMinutes,
      streak,
      thisWeek,
      thisMonth,
      level
    };
  };

  const calculateProperStreak = (sessions) => {
    if (!sessions || sessions.length === 0) return 0;
    
    // Sort sessions by completion date (most recent first)
    const sortedSessions = sessions.sort((a, b) => 
      new Date(b.endedAt || b.completedAt) - new Date(a.endedAt || a.completedAt)
    );
    
    // Group sessions by date
    const sessionsByDate = {};
    sortedSessions.forEach(session => {
      const sessionDate = new Date(session.endedAt || session.completedAt);
      const dateKey = startOfDay(sessionDate).toISOString();
      
      if (!sessionsByDate[dateKey]) {
        sessionsByDate[dateKey] = [];
      }
      sessionsByDate[dateKey].push(session);
    });
    
    const uniqueDates = Object.keys(sessionsByDate).sort((a, b) => new Date(b) - new Date(a));
    
    if (uniqueDates.length === 0) return 0;
    
    let streak = 0;
    const today = startOfDay(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Check if streak can start (must have session today or yesterday)
    const latestDate = new Date(uniqueDates[0]);
    const latestIsToday = latestDate.toDateString() === today.toDateString();
    const latestIsYesterday = latestDate.toDateString() === yesterday.toDateString();
    
    if (!latestIsToday && !latestIsYesterday) {
      return 0; // No recent activity, streak is broken
    }
    
    // Calculate consecutive days
    let currentDate = latestIsToday ? today : yesterday;
    
    for (const dateString of uniqueDates) {
      const sessionDate = new Date(dateString);
      
      if (sessionDate.toDateString() === currentDate.toDateString()) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        // Check if there's a gap
        const daysDiff = differenceInDays(currentDate, sessionDate);
        if (daysDiff === -1) {
          // Consecutive day found
          streak++;
          currentDate = sessionDate;
          currentDate.setDate(currentDate.getDate() - 1);
        } else {
          // Gap found, streak broken
          break;
        }
      }
    }
    
    return streak;
  };

  const updateUserStats = async (calculatedStats) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        totalSessions: calculatedStats.totalSessions,
        totalMinutes: calculatedStats.totalMinutes,
        currentStreak: calculatedStats.streak,
        level: calculatedStats.level,
        lastActivityDate: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating user stats:', error);
    }
  };

  const formatGreeting = () => {
    const hour = new Date().getHours();
    const name = user.displayName?.split(' ')[0] || 'Student';
    
    if (hour < 12) return `शुभ प्रभात, ${name}! Good morning!`;
    if (hour < 17) return `नमस्ते, ${name}! Good afternoon!`;
    return `शुभ संध्या, ${name}! Good evening!`;
  };

  const getStudentLevel = (level) => {
    if (level >= 20) return { title: "Focus Master", color: "#8B5CF6", icon: "👑" };
    if (level >= 15) return { title: "Study Expert", color: "#06B6D4", icon: "🎓" };
    if (level >= 10) return { title: "Dedicated Learner", color: "#10B981", icon: "📚" };
    if (level >= 5) return { title: "Rising Scholar", color: "#F59E0B", icon: "⭐" };
    return { title: "Beginner", color: "#6B7280", icon: "🌱" };
  };

  const handleRefresh = () => {
    fetchUserData(true);
    setRandomQuote();
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
      isUpcoming: timeDiff > 0,
      canJoinEarly: timeDiff < 15 * 60 * 1000
    };
  };

  const handleJoinSession = (sessionId) => {
    navigate(`/session/${sessionId}`);
  };

  const quickActions = [
    {
      icon: FiCalendar,
      label: 'Book Session',
      action: () => navigate('/book-session'),
      color: 'primary',
      description: 'Schedule focused study time'
    },
    {
      icon: FiTarget,
      label: 'Study Goals',
      action: () => navigate('/profile'),
      color: 'success',
      description: 'Set your targets'
    },
    {
      icon: FiBook,
      label: 'Study Stats',
      action: () => navigate('/profile'),
      color: 'warning',
      description: 'Track progress'
    },
    {
      icon: FiAward,
      label: 'Achievements',
      action: () => navigate('/profile'),
      color: 'secondary',
      description: 'View rewards'
    }
  ];

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">
          <div className="header-skeleton">
            <SkeletonLoader lines={2} />
          </div>
          <div className="stats-skeleton">
            {[1, 2, 3, 4].map(i => (
              <SkeletonLoader key={i} lines={2} />
            ))}
          </div>
          <div className="content-skeleton">
            <SkeletonLoader lines={4} />
            <SkeletonLoader lines={4} />
          </div>
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
  const studentLevel = getStudentLevel(stats.level);

  return (
    <div className="dashboard">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="greeting-section">
            <h1>{formatGreeting()}</h1>
            <p className="motivational-message">{motivationalQuote}</p>
            <div className="student-level">
              <span className="level-badge" style={{ backgroundColor: studentLevel.color }}>
                {studentLevel.icon} Level {stats.level} - {studentLevel.title}
              </span>
            </div>
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
              className="btn-primary book-session-btn"
              onClick={() => navigate('/book-session')}
            >
              <FiPlus size={16} />
              <span className="btn-text">{isMobile ? 'Book' : 'Book Study Session'}</span>
            </button>
          </div>
        </div>
        
        {/* Next Session Alert */}
        {nextSessionInfo && (
          <div className="next-session-alert">
            <div className="alert-content">
              <div className="alert-icon">⏰</div>
              <div className="alert-text">
                <strong>Next study session starts {nextSessionInfo.timeString}</strong>
                <span>"{nextSessionInfo.session.goal}"</span>
              </div>
              {nextSessionInfo.canJoinEarly && (
                <button 
                  className="join-button"
                  onClick={() => handleJoinSession(nextSessionInfo.session.id)}
                >
                  <FiUsers size={14} />
                  Join Early
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Stats Section */}
      <div className="enhanced-stats-grid">
        <div className="stat-card primary">
          <div className="stat-icon">
            <FiBook size={24} />
          </div>
          <div className="stat-content">
            <h3>Total Sessions</h3>
            <p>{stats.totalSessions}</p>
            <span className="stat-subtitle">Study sessions completed</span>
          </div>
        </div>

        <div className="stat-card success">
          <div className="stat-icon">
            <FiClock size={24} />
          </div>
          <div className="stat-content">
            <h3>Focus Time</h3>
            <p>{Math.floor(stats.totalMinutes / 60)}h {stats.totalMinutes % 60}m</p>
            <span className="stat-subtitle">Total study hours</span>
          </div>
        </div>

        <div className="stat-card warning">
          <div className="stat-icon">
            <FiTrendingUp size={24} />
          </div>
          <div className="stat-content">
            <h3>Current Streak</h3>
            <p>{stats.streak} days</p>
            <span className="stat-subtitle">
              {stats.streak > 0 ? 'Keep it up! 🔥' : 'Start your streak today!'}
            </span>
          </div>
        </div>

        <div className="stat-card secondary">
          <div className="stat-icon">
            <FiAward size={24} />
          </div>
          <div className="stat-content">
            <h3>This Week</h3>
            <p>{stats.thisWeek} sessions</p>
            <span className="stat-subtitle">Weekly progress</span>
          </div>
        </div>
      </div>

      {/* Sessions Section */}
      <div className="sessions-section">
        <div className="section-header">
          <h2>Your Study Sessions</h2>
          <div className="tab-switcher">
            <button 
              className={`tab-button ${activeTab === 'upcoming' ? 'active' : ''}`}
              onClick={() => setActiveTab('upcoming')}
            >
              <FiCalendar size={16} />
              <span>Upcoming</span>
              {upcomingSessions.length > 0 && (
                <span className="tab-badge">{upcomingSessions.length}</span>
              )}
            </button>
            <button 
              className={`tab-button ${activeTab === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              <FiClock size={16} />
              <span>Completed</span>
              {completedSessions.length > 0 && (
                <span className="tab-badge">{Math.min(completedSessions.length, 10)}</span>
              )}
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
                    onJoin={() => handleJoinSession(session.id)}
                    showJoinButton={true}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📚</div>
                <h3>No upcoming study sessions</h3>
                <p>Ready to boost your preparation? Book your next focused study session!</p>
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
                {completedSessions.slice(0, 10).map(session => (
                  <SessionCard 
                    key={session.id} 
                    session={session} 
                    completed={true}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🎯</div>
                <h3>No completed sessions yet</h3>
                <p>Start your first study session to see your progress here!</p>
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

      {/* Quick Actions for Students */}
      <div className="quick-actions">
        <h3>Quick Actions for Students</h3>
        <div className="actions-grid">
          {quickActions.map((action, index) => (
            <button 
              key={index}
              className={`action-card ${action.color}`}
              onClick={action.action}
            >
              <action.icon size={isMobile ? 20 : 24} />
              <div className="action-content">
                <span className="action-label">{action.label}</span>
                <span className="action-description">{action.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Study Tips for India Students */}
      <div className="study-tips">
        <h3>Study Tips for Success</h3>
        <div className="tips-grid">
          <div className="tip-card">
            <div className="tip-icon">🧠</div>
            <h4>Pomodoro Technique</h4>
            <p>25-min focused study + 5-min break = Better retention</p>
          </div>
          <div className="tip-card">
            <div className="tip-icon">🎯</div>
            <h4>Set Clear Goals</h4>
            <p>Define what you want to achieve in each session</p>
          </div>
          <div className="tip-card">
            <div className="tip-icon">👥</div>
            <h4>Study Partners</h4>
            <p>Accountability partners help maintain consistency</p>
          </div>
          <div className="tip-card">
            <div className="tip-icon">📊</div>
            <h4>Track Progress</h4>
            <p>Monitor your study hours and streak daily</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;