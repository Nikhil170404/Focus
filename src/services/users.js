// services/users.js - User Service
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '../config/firebase';

export const userService = {
  // Create or update user document
  async createOrUpdateUser(user) {
    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        // Create new user document
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
          studyGoal: '',
          targetExam: '',
          dailyTarget: 4,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          preferences: {
            sessionReminders: true,
            emailNotifications: true,
            soundEnabled: true
          }
        };
        
        await setDoc(userRef, userData);
        return userData;
      } else {
        // Update last login
        await updateDoc(userRef, {
          lastLogin: serverTimestamp()
        });
        return userDoc.data();
      }
    } catch (error) {
      console.error('Error creating/updating user:', error);
      throw error;
    }
  },

  // Get user profile
  async getUserProfile(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        return { id: userDoc.id, ...userDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  },

  // Update user profile
  async updateUserProfile(userId, updates) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  },

  // Update user stats
  async updateUserStats(userId, stats) {
    try {
      const userRef = doc(db, 'users', userId);
      
      // Use setDoc with merge to handle non-existent documents
      await setDoc(userRef, {
        totalSessions: stats.totalSessions || 0,
        totalMinutes: stats.totalMinutes || 0,
        currentStreak: stats.streak || 0,
        level: stats.level || 1,
        lastActivityDate: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      return true;
    } catch (error) {
      console.error('Error updating user stats:', error);
      // Don't throw, just log - stats update shouldn't break the app
      return false;
    }
  },

  // Add favorite partner
  async addFavorite(userId, partnerId, partnerData) {
    try {
      const favoriteData = {
        userId,
        partnerId,
        partnerName: partnerData.name,
        partnerPhoto: partnerData.photo,
        addedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, 'favorites'), favoriteData);
      return { id: docRef.id, ...favoriteData };
    } catch (error) {
      console.error('Error adding favorite:', error);
      throw error;
    }
  },

  // Remove favorite
  async removeFavorite(favoriteId) {
    try {
      await deleteDoc(doc(db, 'favorites', favoriteId));
      return true;
    } catch (error) {
      console.error('Error removing favorite:', error);
      throw error;
    }
  },

  // Get user's favorites
  async getFavorites(userId) {
    try {
      const q = query(
        collection(db, 'favorites'),
        where('userId', '==', userId)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching favorites:', error);
      return [];
    }
  },

  // Check if user is favorite
  async isFavorite(userId, partnerId) {
    try {
      const q = query(
        collection(db, 'favorites'),
        where('userId', '==', userId),
        where('partnerId', '==', partnerId)
      );
      
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error checking favorite:', error);
      return false;
    }
  },

  // Get user achievements
  async getUserAchievements(userId) {
    try {
      const userDoc = await this.getUserProfile(userId);
      if (!userDoc) return [];

      const achievements = [];
      const stats = {
        totalSessions: userDoc.totalSessions || 0,
        totalMinutes: userDoc.totalMinutes || 0,
        currentStreak: userDoc.currentStreak || 0,
        level: userDoc.level || 1
      };

      // Define achievements
      const achievementsList = [
        {
          id: 'first_session',
          icon: '🎯',
          title: 'First Focus',
          description: 'Complete your first session',
          requirement: stats.totalSessions >= 1
        },
        {
          id: 'ten_sessions',
          icon: '⭐',
          title: 'Rising Star',
          description: 'Complete 10 sessions',
          requirement: stats.totalSessions >= 10
        },
        {
          id: 'fifty_sessions',
          icon: '🏆',
          title: 'Champion',
          description: 'Complete 50 sessions',
          requirement: stats.totalSessions >= 50
        },
        {
          id: 'hundred_sessions',
          icon: '👑',
          title: 'Master',
          description: 'Complete 100 sessions',
          requirement: stats.totalSessions >= 100
        },
        {
          id: 'week_streak',
          icon: '🔥',
          title: 'Week Warrior',
          description: '7 day streak',
          requirement: stats.currentStreak >= 7
        },
        {
          id: 'month_streak',
          icon: '💎',
          title: 'Monthly Master',
          description: '30 day streak',
          requirement: stats.currentStreak >= 30
        },
        {
          id: 'focus_hours_25',
          icon: '⏰',
          title: 'Time Keeper',
          description: '25 hours of focus',
          requirement: stats.totalMinutes >= 1500
        },
        {
          id: 'focus_hours_100',
          icon: '🌟',
          title: 'Century Club',
          description: '100 hours of focus',
          requirement: stats.totalMinutes >= 6000
        }
      ];

      return achievementsList.filter(achievement => achievement.requirement);
    } catch (error) {
      console.error('Error fetching achievements:', error);
      return [];
    }
  },

  // Update user preferences
  async updatePreferences(userId, preferences) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        preferences: preferences,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error updating preferences:', error);
      throw error;
    }
  },

  // Get leaderboard
  async getLeaderboard(type = 'sessions', limit = 10) {
    try {
      let orderField = 'totalSessions';
      if (type === 'minutes') orderField = 'totalMinutes';
      if (type === 'streak') orderField = 'currentStreak';
      
      const q = query(
        collection(db, 'users'),
        orderBy(orderField, 'desc'),
        limit(limit)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc, index) => ({
        rank: index + 1,
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
  }
};

export default userService;