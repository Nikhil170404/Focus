import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';

export const userService = {
  async getUserProfile(userId) {
    const userDoc = await getDoc(doc(db, 'users', userId));
    return userDoc.exists() ? userDoc.data() : null;
  },

  async updateUserProfile(userId, updates) {
    return await updateDoc(doc(db, 'users', userId), updates);
  },

  async updateUserStats(userId, stats) {
    const userRef = doc(db, 'users', userId);
    return await updateDoc(userRef, {
      totalSessions: stats.totalSessions,
      totalMinutes: stats.totalMinutes,
      streak: stats.streak,
      lastSessionDate: new Date()
    });
  },

  async addFavorite(userId, partnerId, partnerData) {
    return await addDoc(collection(db, 'favorites'), {
      userId,
      partnerId,
      partnerName: partnerData.name,
      partnerPhoto: partnerData.photo,
      addedAt: new Date()
    });
  },

  async removeFavorite(favoriteId) {
    return await deleteDoc(doc(db, 'favorites', favoriteId));
  },

  async getFavorites(userId) {
    const q = query(
      collection(db, 'favorites'),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async isFavorite(userId, partnerId) {
    const q = query(
      collection(db, 'favorites'),
      where('userId', '==', userId),
      where('partnerId', '==', partnerId)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  }
};