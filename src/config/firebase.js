import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDJcxjc6EBUcHp1_i-4y9y1fzwau87WYKA",
  authDomain: "focusmate-a3549.firebaseapp.com",
  projectId: "focusmate-a3549",
  storageBucket: "focusmate-a3549.firebasestorage.app",
  messagingSenderId: "124148931192",
  appId: "1:124148931192:web:4097010fc5bae09b4f2b8d",
  measurementId: "G-D3S31NJG4Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
export const storage = getStorage(app);
export const analytics = getAnalytics(app);

export default app;