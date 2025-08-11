import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getDatabase, connectDatabaseEmulator, ref, onValue, set } from "firebase/database";
import { getStorage, connectStorageEmulator } from "firebase/storage";

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

// Configure Google Auth Provider for better UX
googleProvider.setCustomParameters({
  prompt: 'select_account',
  login_hint: 'user@example.com'
});

// Add additional scopes if needed
googleProvider.addScope('profile');
googleProvider.addScope('email');

// Only connect to emulators in development
if (process.env.NODE_ENV === 'development' && !process.env.REACT_APP_USE_FIREBASE_EMULATOR_CONNECTED) {
  try {
    // Check if emulators are running before connecting
    const isEmulatorRunning = async (host, port) => {
      try {
        const response = await fetch(`http://${host}:${port}`);
        return response.ok || response.status === 404; // 404 is also fine for emulator
      } catch {
        return false;
      }
    };

    // Connect to emulators if they're available
    const connectEmulators = async () => {
      if (await isEmulatorRunning('localhost', 9099)) {
        connectAuthEmulator(auth, "http://localhost:9099");
        console.log('Connected to Auth emulator');
      }
      
      if (await isEmulatorRunning('localhost', 8080)) {
        connectFirestoreEmulator(db, 'localhost', 8080);
        console.log('Connected to Firestore emulator');
      }
      
      if (await isEmulatorRunning('localhost', 9000)) {
        connectDatabaseEmulator(realtimeDb, 'localhost', 9000);
        console.log('Connected to Database emulator');
      }
      
      if (await isEmulatorRunning('localhost', 9199)) {
        connectStorageEmulator(storage, 'localhost', 9199);
        console.log('Connected to Storage emulator');
      }
    };

    connectEmulators();
    process.env.REACT_APP_USE_FIREBASE_EMULATOR_CONNECTED = 'true';
  } catch (error) {
    console.log('Emulators not available, using production Firebase');
  }
}

// Enhanced error handling helper with production-specific errors
export const handleFirebaseError = (error) => {
  console.error('Firebase error:', error);
  
  const errorMessages = {
    // Auth errors
    'auth/user-not-found': 'No account found with this email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password should be at least 6 characters long.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled.',
    'auth/account-exists-with-different-credential': 'An account already exists with the same email address but different sign-in credentials.',
    'auth/invalid-credential': 'The provided credentials are invalid.',
    'auth/credential-already-in-use': 'This credential is already associated with a different user account.',
    'auth/timeout': 'The operation has timed out.',
    'auth/network-request-failed': 'Network error. Please check your internet connection and try again.',
    'auth/too-many-requests': 'Too many unsuccessful sign-in attempts. Please try again later.',
    'auth/popup-blocked': 'The popup was blocked by your browser. Please allow popups for this site.',
    'auth/popup-closed-by-user': 'The popup was closed before completing the sign-in.',
    'auth/unauthorized-domain': 'This domain is not authorized for OAuth operations.',
    
    // Firestore errors
    'permission-denied': 'You do not have permission to perform this action.',
    'unavailable': 'The service is temporarily unavailable. Please try again later.',
    'unauthenticated': 'You must be signed in to perform this action.',
    'deadline-exceeded': 'The operation took too long to complete. Please try again.',
    'resource-exhausted': 'Resource limit exceeded. Please try again later.',
    'cancelled': 'The operation was cancelled.',
    'data-loss': 'Unrecoverable data loss or corruption.',
    'unknown': 'An unknown error occurred.',
    'invalid-argument': 'Invalid data provided.',
    'not-found': 'The requested document was not found.',
    'already-exists': 'The document already exists.',
    'failed-precondition': 'The operation was rejected because the system is not in a state required for the operation.',
    'aborted': 'The operation was aborted due to a conflict.',
    'out-of-range': 'The operation was attempted past the valid range.',
    'unimplemented': 'This operation is not implemented or supported.',
    'internal': 'Internal server error.',
    
    // Database errors
    'NETWORK_ERROR': 'Network connection error. Please check your internet connection.',
    'SERVER_ERROR': 'Server error. Please try again later.',
    'PERMISSION_DENIED': 'Permission denied. Please check your access rights.',
    'UNAVAILABLE': 'Service temporarily unavailable.',
    
    // Storage errors
    'storage/unknown': 'An unknown error occurred with file storage.',
    'storage/object-not-found': 'The file was not found.',
    'storage/bucket-not-found': 'Storage bucket not found.',
    'storage/project-not-found': 'Storage project not found.',
    'storage/quota-exceeded': 'Storage quota exceeded.',
    'storage/unauthenticated': 'You must be signed in to upload files.',
    'storage/unauthorized': 'You are not authorized to perform this action.',
    'storage/retry-limit-exceeded': 'Maximum retry time exceeded.',
    'storage/invalid-checksum': 'File checksum does not match.',
    'storage/canceled': 'File upload was cancelled.',
    'storage/invalid-event-name': 'Invalid event name.',
    'storage/invalid-url': 'Invalid storage URL.',
    'storage/invalid-argument': 'Invalid argument provided.',
    'storage/no-default-bucket': 'No default storage bucket configured.',
    'storage/cannot-slice-blob': 'Cannot slice file blob.',
    'storage/server-file-wrong-size': 'File size mismatch on server.'
  };

  return errorMessages[error.code] || error.message || 'An unexpected error occurred. Please try again.';
};

// Production-specific utilities
export const isProduction = () => {
  return process.env.NODE_ENV === 'production';
};

export const isDevelopment = () => {
  return process.env.NODE_ENV === 'development';
};

// Enhanced connection monitoring for WebRTC
export const monitorFirebaseConnection = (callback) => {
  const connectedRef = ref(realtimeDb, '.info/connected');
  
  return onValue(connectedRef, (snapshot) => {
    const connected = snapshot.val();
    if (callback) {
      callback(connected);
    }
    
    if (connected) {
      console.log('Firebase Realtime Database connected');
    } else {
      console.log('Firebase Realtime Database disconnected');
    }
  });
};

// WebRTC-specific Firebase utilities
export const createSessionSignalingRef = (sessionId) => {
  return ref(realtimeDb, `sessions/${sessionId}/signals`);
};

export const createPresenceRef = (sessionId, userId) => {
  return ref(realtimeDb, `sessions/${sessionId}/presence/${userId}`);
};

// Cleanup utility for session data
export const cleanupSessionData = async (sessionId) => {
  try {
    const sessionRef = ref(realtimeDb, `sessions/${sessionId}`);
    await set(sessionRef, null);
    console.log('Session data cleaned up:', sessionId);
  } catch (error) {
    console.error('Error cleaning up session data:', error);
  }
};

// Enhanced retry logic for production
export const withRetry = async (operation, maxAttempts = 3, delay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain errors
      if (error.code === 'permission-denied' || 
          error.code === 'unauthenticated' ||
          error.code === 'invalid-argument') {
        throw error;
      }
      
      if (attempt < maxAttempts) {
        console.log(`Operation failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }
  
  throw lastError;
};

// Performance monitoring
if (isProduction()) {
  // Enable Firebase Analytics in production
  import('firebase/analytics').then(({ getAnalytics, logEvent }) => {
    try {
      const analytics = getAnalytics(app);
      
      // Log app initialization
      logEvent(analytics, 'app_initialized', {
        platform: 'web',
        version: process.env.REACT_APP_VERSION || '1.0.0'
      });
      
      console.log('Firebase Analytics initialized');
    } catch (error) {
      console.warn('Firebase Analytics failed to initialize:', error);
    }
  });

  // Enable Performance Monitoring in production
  import('firebase/performance').then(({ getPerformance }) => {
    try {
      const perf = getPerformance(app);
      console.log('Firebase Performance monitoring initialized');
    } catch (error) {
      console.warn('Firebase Performance monitoring failed to initialize:', error);
    }
  });
}

export default app;