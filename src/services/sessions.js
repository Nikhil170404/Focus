// Enhanced Firebase Services for FocusMate India
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  increment
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  startOfDay, 
  endOfDay, 
  differenceInDays, 
  isToday, 
  isYesterday,
  subDays,
  format 
} from 'date-fns';

// Enhanced Session Service for India
export const sessionService = {
  // Create session with India-specific fields
  async createSession(sessionData, userId, userProfile = {}) {
    try {
      const enhancedSessionData = {
        ...sessionData,
        userId,
        userName: userProfile.name || sessionData.userName,
        userPhoto: userProfile.photoURL || sessionData.userPhoto,
        createdAt: serverTimestamp(),
        status: 'scheduled',
        isIndiaSession: true,
        region: 'India',
        timezone: userProfile.timezone || 'Asia/Kolkata',
        studyLevel: userProfile.currentClass || 'Unknown',
        targetExam: userProfile.targetExam || null,
        
        // Study session specific fields
        studyMode: sessionData.studyMode || 'focused',
        subject: sessionData.subject || 'General',
        studyType: this.getStudyType(sessionData.studyMode),
        difficultyLevel: this.getDifficultyLevel(sessionData.subject, sessionData.studyMode),
        
        // Matching preferences
        preferredPartnerLevel: userProfile.currentClass || null,
        preferredSubjects: userProfile.subjects || [],
        allowCrossSubject: true,
        
        // Analytics fields
        sessionSource: 'web_app',
        deviceType: this.getDeviceType(),
        browserInfo: navigator.userAgent.split(' ').slice(-2).join(' ')
      };

      const docRef = await addDoc(collection(db, 'sessions'), enhancedSessionData);
      
      // Log session creation for analytics
      await this.logSessionEvent('session_created', docRef.id, enhancedSessionData);
      
      return { id: docRef.id, ...enhancedSessionData };
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  },

  // Enhanced partner finding with India-specific matching
  async findStudyPartner(sessionId, sessionData, userProfile = {}) {
    try {
      const matchingCriteria = this.getMatchingCriteria(sessionData, userProfile);
      
      // Try exact match first (same subject, class, exam)
      let partnerSession = await this.findExactMatch(sessionData, matchingCriteria);
      
      // If no exact match, try compatible match
      if (!partnerSession) {
        partnerSession = await this.findCompatibleMatch(sessionData, matchingCriteria);
      }
      
      if (partnerSession) {
        await this.pairSessions(sessionId, partnerSession.id, sessionData, partnerSession.data());
        return partnerSession;
      }
      
      return null;
    } catch (error) {
      console.error('Error finding study partner:', error);
      throw error;
    }
  },

  // Get matching criteria for partner finding
  getMatchingCriteria(sessionData, userProfile) {
    return {
      sameSubject: sessionData.subject !== 'Mixed Subjects',
      sameExam: userProfile.targetExam && ['JEE', 'NEET', 'Board'].some(exam => 
        userProfile.targetExam.includes(exam)
      ),
      sameClass: userProfile.currentClass,
      timeWindow: 15 * 60 * 1000, // 15 minutes window
      maxLevelDifference: 2 // Allow partners within 2 levels
    };
  },

  // Find exact match partner
  async findExactMatch(sessionData, criteria) {
    const queries = [];
    
    // Same subject and time
    if (criteria.sameSubject) {
      queries.push(
        query(
          collection(db, 'sessions'),
          where('startTime', '==', sessionData.startTime),
          where('duration', '==', sessionData.duration),
          where('subject', '==', sessionData.subject),
          where('status', '==', 'scheduled'),
          where('partnerId', '==', null),
          where('userId', '!=', sessionData.userId),
          orderBy('createdAt', 'asc'),
          limit(1)
        )
      );
    }

    for (const q of queries) {
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return {
          id: snapshot.docs[0].id,
          data: () => snapshot.docs[0].data()
        };
      }
    }

    return null;
  },

  // Find compatible match partner
  async findCompatibleMatch(sessionData, criteria) {
    const timeRange = this.getTimeRange(sessionData.startTime, criteria.timeWindow);
    
    const compatibleQuery = query(
      collection(db, 'sessions'),
      where('startTime', '>=', timeRange.start),
      where('startTime', '<=', timeRange.end),
      where('duration', '==', sessionData.duration),
      where('status', '==', 'scheduled'),
      where('partnerId', '==', null),
      where('userId', '!=', sessionData.userId),
      where('allowCrossSubject', '==', true),
      orderBy('startTime', 'asc'),
      limit(5)
    );

    const snapshot = await getDocs(compatibleQuery);
    
    // Score and rank potential partners
    const candidates = snapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data(),
      score: this.calculateCompatibilityScore(sessionData, doc.data(), criteria)
    }));

    // Sort by compatibility score
    candidates.sort((a, b) => b.score - a.score);
    
    return candidates.length > 0 ? {
      id: candidates[0].id,
      data: () => candidates[0].data
    } : null;
  },

  // Calculate compatibility score between two sessions
  calculateCompatibilityScore(session1, session2, criteria) {
    let score = 0;

    // Same subject bonus
    if (session1.subject === session2.subject) score += 50;
    
    // Same target exam bonus
    if (session1.targetExam && session2.targetExam && 
        session1.targetExam === session2.targetExam) score += 30;
    
    // Same study level bonus
    if (session1.studyLevel === session2.studyLevel) score += 20;
    
    // Time proximity bonus (closer time = higher score)
    const timeDiff = Math.abs(new Date(session1.startTime) - new Date(session2.startTime));
    score += Math.max(0, 20 - (timeDiff / (5 * 60 * 1000))); // Max 20 points for same time
    
    // Same study mode bonus
    if (session1.studyMode === session2.studyMode) score += 15;
    
    // Regional preference (both India)
    if (session1.region === 'India' && session2.region === 'India') score += 10;

    return score;
  },

  // Pair two sessions together
  async pairSessions(sessionId1, sessionId2, session1Data, session2Data) {
    const batch = writeBatch(db);

    // Update both sessions with partner info
    batch.update(doc(db, 'sessions', sessionId1), {
      partnerId: session2Data.userId,
      partnerName: session2Data.userName,
      partnerPhoto: session2Data.userPhoto,
      partnerSession: sessionId2,
      matchedAt: serverTimestamp(),
      matchType: 'automated'
    });

    batch.update(doc(db, 'sessions', sessionId2), {
      partnerId: session1Data.userId,
      partnerName: session1Data.userName,
      partnerPhoto: session1Data.userPhoto,
      partnerSession: sessionId1,
      matchedAt: serverTimestamp(),
      matchType: 'automated'
    });

    await batch.commit();

    // Log successful pairing
    await this.logSessionEvent('partner_matched', sessionId1, {
      partnerId: session2Data.userId,
      matchType: 'automated'
    });
  },

  // Complete session with enhanced data
  async completeSession(sessionId, completionData) {
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        throw new Error('Session not found');
      }

      const sessionData = sessionDoc.data();
      const actualDuration = completionData.actualDuration || sessionData.duration;
      
      const updateData = {
        status: 'completed',
        endedAt: serverTimestamp(),
        actualDuration,
        completionRating: completionData.rating || null,
        productivityScore: completionData.productivityScore || null,
        goalsAchieved: completionData.goalsAchieved || false,
        studyQuality: completionData.studyQuality || 'good',
        ...completionData
      };

      await updateDoc(sessionRef, updateData);

      // Update user stats
      if (sessionData.userId) {
        await this.updateUserSessionStats(sessionData.userId, actualDuration, true);
      }
      if (sessionData.partnerId) {
        await this.updateUserSessionStats(sessionData.partnerId, actualDuration, true);
      }

      // Log session completion
      await this.logSessionEvent('session_completed', sessionId, updateData);

      return { id: sessionId, ...sessionData, ...updateData };
    } catch (error) {
      console.error('Error completing session:', error);
      throw error;
    }
  },

  // Update user session statistics
  async updateUserSessionStats(userId, sessionDuration, isCompleted = true) {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) return;

      const userData = userDoc.data();
      
      // Calculate new streak
      const newStreak = await this.calculateUserStreak(userId);
      
      // Calculate level based on total sessions
      const newTotalSessions = (userData.totalSessions || 0) + 1;
      const newLevel = Math.floor(newTotalSessions / 10) + 1;
      
      const updateData = {
        totalSessions: increment(1),
        totalMinutes: increment(sessionDuration),
        currentStreak: newStreak,
        level: newLevel,
        lastSessionDate: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Update weekly and monthly stats
      const today = new Date();
      const thisWeekStart = startOfDay(new Date(today.setDate(today.getDate() - today.getDay())));
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      
      updateData.lastWeeklyReset = thisWeekStart;
      updateData.lastMonthlyReset = thisMonthStart;

      await updateDoc(userRef, updateData);

      // Check for achievements
      await this.checkAndAwardAchievements(userId, {
        totalSessions: newTotalSessions,
        totalMinutes: (userData.totalMinutes || 0) + sessionDuration,
        currentStreak: newStreak,
        level: newLevel
      });

    } catch (error) {
      console.error('Error updating user stats:', error);
    }
  },

  // Enhanced streak calculation
  async calculateUserStreak(userId) {
    try {
      const sessionsQuery = query(
        collection(db, 'sessions'),
        where('userId', '==', userId),
        where('status', '==', 'completed'),
        orderBy('endedAt', 'desc'),
        limit(100) // Get enough sessions for accurate streak calculation
      );

      const snapshot = await getDocs(sessionsQuery);
      const sessions = snapshot.docs.map(doc => doc.data());

      if (sessions.length === 0) return 0;

      // Group sessions by date
      const sessionsByDate = {};
      sessions.forEach(session => {
        const sessionDate = startOfDay(new Date(session.endedAt.toDate()));
        const dateKey = sessionDate.toISOString();
        
        if (!sessionsByDate[dateKey]) {
          sessionsByDate[dateKey] = [];
        }
        sessionsByDate[dateKey].push(session);
      });

      const uniqueDates = Object.keys(sessionsByDate).sort((a, b) => new Date(b) - new Date(a));
      
      if (uniqueDates.length === 0) return 0;

      let streak = 0;
      const today = startOfDay(new Date());
      const yesterday = subDays(today, 1);
      
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
          currentDate = subDays(currentDate, 1);
        } else {
          // Check if there's exactly one day gap
          const expectedDate = subDays(currentDate, 0);
          if (sessionDate.toDateString() === expectedDate.toDateString()) {
            streak++;
            currentDate = subDays(sessionDate, 1);
          } else {
            // Gap found, streak broken
            break;
          }
        }
      }

      return streak;
    } catch (error) {
      console.error('Error calculating streak:', error);
      return 0;
    }
  },

  // Check and award achievements
  async checkAndAwardAchievements(userId, stats) {
    try {
      const achievements = [];

      // Session-based achievements
      if (stats.totalSessions === 1) achievements.push('first_session');
      if (stats.totalSessions === 10) achievements.push('ten_sessions');
      if (stats.totalSessions === 50) achievements.push('fifty_sessions');
      if (stats.totalSessions === 100) achievements.push('hundred_sessions');

      // Time-based achievements
      if (stats.totalMinutes >= 1500) achievements.push('time_master'); // 25 hours
      if (stats.totalMinutes >= 6000) achievements.push('time_champion'); // 100 hours

      // Streak-based achievements
      if (stats.currentStreak === 7) achievements.push('week_warrior');
      if (stats.currentStreak === 30) achievements.push('month_master');
      if (stats.currentStreak === 100) achievements.push('streak_legend');

      // Level-based achievements
      if (stats.level === 5) achievements.push('rising_scholar');
      if (stats.level === 10) achievements.push('dedicated_learner');
      if (stats.level === 20) achievements.push('study_master');

      // Award new achievements
      for (const achievement of achievements) {
        await this.awardAchievement(userId, achievement);
      }

    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  },

  // Award achievement to user
  async awardAchievement(userId, achievementId) {
    try {
      const achievementRef = doc(db, 'user_achievements', `${userId}_${achievementId}`);
      const existingAchievement = await getDoc(achievementRef);
      
      if (!existingAchievement.exists()) {
        await updateDoc(achievementRef, {
          userId,
          achievementId,
          awardedAt: serverTimestamp(),
          isNew: true
        });

        // Log achievement
        await this.logSessionEvent('achievement_awarded', null, {
          userId,
          achievementId
        });
      }
    } catch (error) {
      console.error('Error awarding achievement:', error);
    }
  },

  // Helper methods
  getStudyType(studyMode) {
    const types = {
      focused: 'Deep Study',
      revision: 'Revision',
      memorization: 'Memory Work',
      practice: 'Problem Solving',
      mock_test: 'Test Practice'
    };
    return types[studyMode] || 'General Study';
  },

  getDifficultyLevel(subject, studyMode) {
    const difficultSubjects = ['Physics', 'Chemistry', 'Mathematics'];
    const intensiveModes = ['focused', 'mock_test'];
    
    if (difficultSubjects.includes(subject) && intensiveModes.includes(studyMode)) {
      return 'Advanced';
    } else if (difficultSubjects.includes(subject) || intensiveModes.includes(studyMode)) {
      return 'Intermediate';
    }
    return 'Beginner';
  },

  getDeviceType() {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  },

  getTimeRange(startTime, windowMs) {
    const start = new Date(startTime);
    return {
      start: new Date(start.getTime() - windowMs),
      end: new Date(start.getTime() + windowMs)
    };
  },

  // Analytics and logging
  async logSessionEvent(eventType, sessionId, eventData) {
    try {
      await addDoc(collection(db, 'session_analytics'), {
        eventType,
        sessionId,
        eventData,
        timestamp: serverTimestamp(),
        region: 'India'
      });
    } catch (error) {
      console.error('Error logging session event:', error);
    }
  },

  // Get user session history with analytics
  async getUserSessionHistory(userId, options = {}) {
    try {
      const {
        limit: queryLimit = 20,
        status = null,
        subject = null,
        dateRange = null
      } = options;

      let q = query(
        collection(db, 'sessions'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(queryLimit)
      );

      if (status) {
        q = query(
          collection(db, 'sessions'),
          where('userId', '==', userId),
          where('status', '==', status),
          orderBy('createdAt', 'desc'),
          limit(queryLimit)
        );
      }

      const snapshot = await getDocs(q);
      let sessions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Apply additional filters
      if (subject && subject !== 'All') {
        sessions = sessions.filter(session => session.subject === subject);
      }

      if (dateRange) {
        sessions = sessions.filter(session => {
          const sessionDate = new Date(session.createdAt.toDate());
          return sessionDate >= dateRange.start && sessionDate <= dateRange.end;
        });
      }

      return sessions;
    } catch (error) {
      console.error('Error fetching session history:', error);
      throw error;
    }
  },

  // Get dashboard analytics
  async getDashboardAnalytics(userId) {
    try {
      const [
        completedSessions,
        upcomingSessions,
        userDoc,
        recentAchievements
      ] = await Promise.all([
        this.getUserSessionHistory(userId, { status: 'completed', limit: 50 }),
        this.getUserSessionHistory(userId, { status: 'scheduled', limit: 10 }),
        getDoc(doc(db, 'users', userId)),
        this.getUserAchievements(userId, 5)
      ]);

      const userData = userDoc.exists() ? userDoc.data() : {};
      
      // Calculate analytics
      const analytics = {
        totalSessions: completedSessions.length,
        totalMinutes: completedSessions.reduce((sum, s) => sum + (s.actualDuration || s.duration || 0), 0),
        currentStreak: userData.currentStreak || 0,
        level: userData.level || 1,
        upcomingCount: upcomingSessions.length,
        recentAchievements,
        
        // This week stats
        thisWeekSessions: completedSessions.filter(s => {
          const sessionDate = new Date(s.endedAt.toDate());
          const weekStart = startOfDay(new Date());
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          return sessionDate >= weekStart;
        }).length,

        // Subject breakdown
        subjectBreakdown: this.calculateSubjectBreakdown(completedSessions),
        
        // Study mode preferences
        studyModeStats: this.calculateStudyModeStats(completedSessions),
        
        // Performance trends
        performanceTrend: this.calculatePerformanceTrend(completedSessions)
      };

      return analytics;
    } catch (error) {
      console.error('Error fetching dashboard analytics:', error);
      throw error;
    }
  },

  calculateSubjectBreakdown(sessions) {
    const breakdown = {};
    sessions.forEach(session => {
      const subject = session.subject || 'Unknown';
      breakdown[subject] = (breakdown[subject] || 0) + 1;
    });
    return breakdown;
  },

  calculateStudyModeStats(sessions) {
    const stats = {};
    sessions.forEach(session => {
      const mode = session.studyMode || 'unknown';
      stats[mode] = (stats[mode] || 0) + 1;
    });
    return stats;
  },

  calculatePerformanceTrend(sessions) {
    // Calculate weekly performance for the last 4 weeks
    const weeks = [];
    for (let i = 0; i < 4; i++) {
      const weekStart = subDays(startOfDay(new Date()), (i + 1) * 7);
      const weekEnd = subDays(weekStart, -7);
      
      const weekSessions = sessions.filter(s => {
        const sessionDate = new Date(s.endedAt.toDate());
        return sessionDate >= weekStart && sessionDate < weekEnd;
      });

      weeks.unshift({
        week: format(weekStart, 'MMM d'),
        sessions: weekSessions.length,
        minutes: weekSessions.reduce((sum, s) => sum + (s.actualDuration || s.duration || 0), 0)
      });
    }
    return weeks;
  },

  async getUserAchievements(userId, limit = 10) {
    try {
      const q = query(
        collection(db, 'user_achievements'),
        where('userId', '==', userId),
        orderBy('awardedAt', 'desc'),
        limit(limit)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error fetching user achievements:', error);
      return [];
    }
  }
};

export default sessionService;