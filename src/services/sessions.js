// services/sessions.js - Optimized Session Service
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
  setDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { startOfDay, endOfDay } from 'date-fns';

export const sessionService = {
  // Create a new session
  async createSession(sessionData, userId) {
    try {
      const data = {
        ...sessionData,
        userId,
        createdAt: serverTimestamp(),
        status: 'scheduled',
        partner: null,
        partnerId: null
      };

      const docRef = await addDoc(collection(db, 'sessions'), data);
      return { id: docRef.id, ...data };
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  },

  // Get user's sessions
  async getUserSessions(userId, status = null) {
    try {
      let q;
      if (status) {
        q = query(
          collection(db, 'sessions'),
          where('userId', '==', userId),
          where('status', '==', status),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
      } else {
        q = query(
          collection(db, 'sessions'),
          where('userId', '==', userId),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching sessions:', error);
      throw error;
    }
  },

  // Get upcoming sessions
  async getUpcomingSessions(userId) {
    try {
      const now = new Date();
      const q = query(
        collection(db, 'sessions'),
        where('userId', '==', userId),
        where('status', 'in', ['scheduled', 'active']),
        where('startTime', '>', now.toISOString()),
        orderBy('startTime', 'asc'),
        limit(10)
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
  },

  // Get completed sessions
  async getCompletedSessions(userId, limitCount = 20) {
    try {
      const q = query(
        collection(db, 'sessions'),
        where('userId', '==', userId),
        where('status', '==', 'completed'),
        orderBy('endedAt', 'desc'),
        limit(limitCount)
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
  },

  // Get today's sessions
  async getTodaySessions(userId) {
    try {
      const start = startOfDay(new Date());
      const end = endOfDay(new Date());
      
      const q = query(
        collection(db, 'sessions'),
        where('userId', '==', userId),
        where('startTime', '>=', start.toISOString()),
        where('startTime', '<=', end.toISOString()),
        orderBy('startTime', 'asc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching today sessions:', error);
      return [];
    }
  },

  // Update session
  async updateSession(sessionId, updates) {
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  },

  // Complete session
  async completeSession(sessionId, duration = null) {
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        throw new Error('Session not found');
      }

      const sessionData = sessionDoc.data();
      
      await updateDoc(sessionRef, {
        status: 'completed',
        endedAt: serverTimestamp(),
        actualDuration: duration || sessionData.duration
      });

      return true;
    } catch (error) {
      console.error('Error completing session:', error);
      throw error;
    }
  },

  // Cancel session
  async cancelSession(sessionId) {
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error cancelling session:', error);
      throw error;
    }
  },

  // Find partner for session
  async findPartner(sessionId, sessionData) {
    try {
      // Look for matching sessions
      const q = query(
        collection(db, 'sessions'),
        where('startTime', '==', sessionData.startTime),
        where('duration', '==', sessionData.duration),
        where('status', '==', 'scheduled'),
        where('partnerId', '==', null),
        where('userId', '!=', sessionData.userId),
        limit(1)
      );

      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const partnerSession = snapshot.docs[0];
        const partnerData = partnerSession.data();
        
        // Update both sessions
        await Promise.all([
          updateDoc(doc(db, 'sessions', sessionId), {
            partnerId: partnerData.userId,
            partnerName: partnerData.userName,
            partnerPhoto: partnerData.userPhoto
          }),
          updateDoc(doc(db, 'sessions', partnerSession.id), {
            partnerId: sessionData.userId,
            partnerName: sessionData.userName,
            partnerPhoto: sessionData.userPhoto
          })
        ]);

        return {
          found: true,
          partner: partnerData
        };
      }

      return { found: false };
    } catch (error) {
      console.error('Error finding partner:', error);
      return { found: false };
    }
  },

  // Get session stats
  async getSessionStats(userId) {
    try {
      const sessions = await this.getCompletedSessions(userId, 100);
      
      const totalSessions = sessions.length;
      const totalMinutes = sessions.reduce((sum, session) => {
        return sum + (session.actualDuration || session.duration || 0);
      }, 0);

      // Calculate streak
      const streak = this.calculateStreak(sessions);

      // This week
      const weekStart = startOfDay(new Date());
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const thisWeek = sessions.filter(session => {
        const sessionDate = session.endedAt?.toDate?.() || new Date(session.endedAt);
        return sessionDate >= weekStart;
      }).length;

      // This month
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const thisMonth = sessions.filter(session => {
        const sessionDate = session.endedAt?.toDate?.() || new Date(session.endedAt);
        return sessionDate >= monthStart;
      }).length;

      return {
        totalSessions,
        totalMinutes,
        streak,
        thisWeek,
        thisMonth,
        level: Math.floor(totalSessions / 10) + 1
      };
    } catch (error) {
      console.error('Error calculating stats:', error);
      return {
        totalSessions: 0,
        totalMinutes: 0,
        streak: 0,
        thisWeek: 0,
        thisMonth: 0,
        level: 1
      };
    }
  },

  // Calculate streak
  calculateStreak(sessions) {
    if (!sessions || sessions.length === 0) return 0;
    
    // Sort by date
    const sorted = [...sessions].sort((a, b) => {
      const dateA = a.endedAt?.toDate?.() || new Date(a.endedAt);
      const dateB = b.endedAt?.toDate?.() || new Date(b.endedAt);
      return dateB - dateA;
    });

    // Group by date
    const dates = new Set();
    sorted.forEach(session => {
      const date = session.endedAt?.toDate?.() || new Date(session.endedAt);
      dates.add(startOfDay(date).toISOString());
    });

    const uniqueDates = Array.from(dates).sort((a, b) => new Date(b) - new Date(a));
    if (uniqueDates.length === 0) return 0;

    let streak = 0;
    const today = startOfDay(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check if streak is active
    const latest = new Date(uniqueDates[0]);
    const daysSinceLatest = Math.floor((today - latest) / (1000 * 60 * 60 * 24));
    
    if (daysSinceLatest > 1) return 0; // Streak broken

    // Count consecutive days
    let currentDate = latest;
    for (const dateStr of uniqueDates) {
      const date = new Date(dateStr);
      const dayDiff = Math.floor((currentDate - date) / (1000 * 60 * 60 * 24));
      
      if (dayDiff <= 1) {
        streak++;
        currentDate = date;
      } else {
        break;
      }
    }

    return streak;
  }
};

export default sessionService;