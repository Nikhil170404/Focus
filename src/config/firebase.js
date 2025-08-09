import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

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

// Initialize Analytics only in production
export let analytics = null;
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    console.warn('Analytics initialization failed:', error);
  }
}

// Configure Google Auth Provider
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Add additional scopes if needed
googleProvider.addScope('profile');
googleProvider.addScope('email');

// Development emulator setup (only in development)
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  const useEmulators = process.env.REACT_APP_USE_EMULATORS === 'true';
  
  if (useEmulators) {
    console.log('Using Firebase emulators for development');
    
    try {
      // Connect to emulators if not already connected
      if (!auth._delegate._config.emulator) {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      }
      
      if (!db._delegate._databaseId.host.includes('localhost')) {
        connectFirestoreEmulator(db, 'localhost', 8080);
      }
      
      if (!realtimeDb._delegate._repoInternal.repoInfo_.host.includes('localhost')) {
        connectDatabaseEmulator(realtimeDb, 'localhost', 9000);
      }
      
      if (!storage._delegate._host.includes('localhost')) {
        connectStorageEmulator(storage, 'localhost', 9199);
      }
    } catch (error) {
      console.warn('Emulator connection failed:', error);
    }
  }
}

// Enhanced error handling for Firebase operations
export const handleFirebaseError = (error) => {
  console.error('Firebase error:', error);
  
  switch (error.code) {
    case 'auth/user-not-found':
      return 'No user found with this email address.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'permission-denied':
      return 'You do not have permission to perform this action.';
    case 'unavailable':
      return 'Service temporarily unavailable. Please try again.';
    case 'deadline-exceeded':
      return 'Request timed out. Please try again.';
    default:
      return error.message || 'An unexpected error occurred. Please try again.';
  }
};

// Connection monitoring
let isOnline = true;
let connectionListeners = [];

export const addConnectionListener = (listener) => {
  connectionListeners.push(listener);
};

export const removeConnectionListener = (listener) => {
  connectionListeners = connectionListeners.filter(l => l !== listener);
};

const notifyConnectionListeners = (online) => {
  connectionListeners.forEach(listener => listener(online));
};

// Monitor network status
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    notifyConnectionListeners(true);
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    notifyConnectionListeners(false);
  });
}

export const isConnected = () => isOnline;

// Retry mechanism for Firebase operations
export const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.warn(`Operation failed (attempt ${attempt}/${maxRetries}):`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
    }
  }
};

// Batch operations utility
export const batchOperation = async (operations) => {
  const results = [];
  const errors = [];
  
  for (let i = 0; i < operations.length; i++) {
    try {
      const result = await operations[i]();
      results.push({ index: i, success: true, data: result });
    } catch (error) {
      errors.push({ index: i, error });
      results.push({ index: i, success: false, error });
    }
  }
  
  return { results, errors };
};

// Performance monitoring
export const measurePerformance = async (operationName, operation) => {
  const startTime = performance.now();
  
  try {
    const result = await operation();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`${operationName} completed in ${duration.toFixed(2)}ms`);
    
    // Log slow operations
    if (duration > 5000) {
      console.warn(`Slow operation detected: ${operationName} took ${duration.toFixed(2)}ms`);
    }
    
    return result;
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.error(`${operationName} failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

// Cache management for offline support
class FirebaseCache {
  constructor() {
    this.cache = new Map();
    this.maxAge = 5 * 60 * 1000; // 5 minutes
  }
  
  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  clear() {
    this.cache.clear();
  }
  
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.maxAge) {
        this.cache.delete(key);
      }
    }
  }
}

export const firebaseCache = new FirebaseCache();

// Cleanup cache periodically
if (typeof window !== 'undefined') {
  setInterval(() => {
    firebaseCache.cleanup();
  }, 60000); // Cleanup every minute
}

// Enhanced logging for debugging
export const logFirebaseOperation = (operation, data = {}) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`Firebase Operation: ${operation}`, {
      timestamp: new Date().toISOString(),
      ...data
    });
  }
};

// Security utilities
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  // Remove potential XSS patterns
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, 1000); // Limit length
};

export const validateSessionData = (data) => {
  const errors = [];
  
  if (!data.goal || data.goal.length < 10) {
    errors.push('Goal must be at least 10 characters');
  }
  
  if (!data.duration || data.duration < 15 || data.duration > 180) {
    errors.push('Duration must be between 15 and 180 minutes');
  }
  
  if (!data.startTime || new Date(data.startTime) <= new Date()) {
    errors.push('Start time must be in the future');
  }
  
  return errors;
};

// Export default app
export default app;