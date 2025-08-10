import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDJcxjc6EBUcHp1_i-4y9y1fzwau87WYKA",
  authDomain: "focusmate-a3549.firebaseapp.com",
  projectId: "focusmate-a3549",
  storageBucket: "focusmate-a3549.firebasestorage.app",
  messagingSenderId: "124148931192",
  appId: "1:124148931192:web:4097010fc5bae09b4f2b8d",
  measurementId: "G-D3S31NJG4Y",
  databaseURL: "https://focusmate-a3549-default-rtdb.firebaseio.com"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
export const storage = getStorage(app);

// Configure Google Auth Provider
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Error handling helper
export const handleFirebaseError = (error) => {
  console.error('Firebase error:', error);
  
  const errorMessages = {
    'auth/user-not-found': 'No user found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'permission-denied': 'You do not have permission.',
    'unavailable': 'Service temporarily unavailable.'
  };

  return errorMessages[error.code] || error.message || 'An error occurred.';
};

export default app;