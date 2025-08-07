import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../config/firebase';

export const authService = {
  async signUp(email, password, displayName) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName });
    await this.createUserDocument(userCredential.user);
    return userCredential.user;
  },

  async signIn(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  },

  async signInWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    await this.createUserDocument(result.user);
    return result.user;
  },

  async signOut() {
    return signOut(auth);
  },

  async resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  },

  async createUserDocument(user) {
    const userRef = doc(db, 'users', user.uid);
    const userSnapshot = await getDoc(userRef);
    
    if (!userSnapshot.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: new Date(),
        totalSessions: 0,
        totalMinutes: 0,
        streak: 0,
        preferences: {
          sessionReminders: true,
          emailNotifications: true,
          soundEnabled: true
        }
      });
    }
  },

  getCurrentUser() {
    return auth.currentUser;
  }
};