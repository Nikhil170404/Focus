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
  limit
} from 'firebase/firestore';
import { db } from '../config/firebase';

export const sessionService = {
  async createSession(sessionData) {
    return await addDoc(collection(db, 'sessions'), {
      ...sessionData,
      createdAt: new Date(),
      status: 'scheduled'
    });
  },

  async getSession(sessionId) {
    const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
    return sessionDoc.exists() ? { id: sessionDoc.id, ...sessionDoc.data() } : null;
  },

  async updateSession(sessionId, updates) {
    return await updateDoc(doc(db, 'sessions', sessionId), updates);
  },

  async cancelSession(sessionId) {
    return await updateDoc(doc(db, 'sessions', sessionId), {
      status: 'cancelled',
      cancelledAt: new Date()
    });
  },

  async deleteSession(sessionId) {
    return await deleteDoc(doc(db, 'sessions', sessionId));
  },

  async getUserSessions(userId, status = null, limitCount = 10) {
    let q = query(
      collection(db, 'sessions'),
      where('userId', '==', userId),
      orderBy('startTime', 'desc'),
      limit(limitCount)
    );
    
    if (status) {
      q = query(
        collection(db, 'sessions'),
        where('userId', '==', userId),
        where('status', '==', status),
        orderBy('startTime', 'desc'),
        limit(limitCount)
      );
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async findPartner(sessionData) {
    const q = query(
      collection(db, 'sessions'),
      where('startTime', '==', sessionData.startTime),
      where('duration', '==', sessionData.duration),
      where('status', '==', 'scheduled'),
      where('partnerId', '==', null),
      where('userId', '!=', sessionData.userId)
    );
    
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    }
    return null;
  },

  async completeSession(sessionId, completionData) {
    return await updateDoc(doc(db, 'sessions', sessionId), {
      status: 'completed',
      completedAt: new Date(),
      ...completionData
    });
  }
};