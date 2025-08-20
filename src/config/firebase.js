import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { 
  getFirestore, 
  connectFirestoreEmulator,
  enableNetwork,
  disableNetwork,
  clearIndexedDbPersistence
} from "firebase/firestore";
import { 
  getDatabase, 
  connectDatabaseEmulator, 
  ref, 
  onValue, 
  set,
  goOffline,
  goOnline
} from "firebase/database";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// Firebase configuration
const firebaseConfig = {
   apiKey: "AIzaSyA6AfHXBagGQVRiPpx3rygTyrOktQzlT68",
  authDomain: "focus-53464.firebaseapp.com",
  projectId: "focus-53464",
  storageBucket: "focus-53464.firebasestorage.app",
  messagingSenderId: "668910699641",
  appId: "1:668910699641:web:2ed9b1d23bccc82ec680a8",
  measurementId: "G-SXG1M21SEN",
  databaseURL: "https://focus-53464-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Initialize Firebase with error handling
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  throw new Error('Failed to initialize Firebase');
}

// Initialize services with enhanced configuration
export const auth = getAuth(app);
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
export const storage = getStorage(app);

// Enhanced Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

// Configure Google Auth Provider for better UX
googleProvider.setCustomParameters({
  prompt: 'select_account',
  hd: undefined // Allow any domain
});

// Add scopes for better user data
googleProvider.addScope('profile');
googleProvider.addScope('email');

// Set authentication persistence
try {
  setPersistence(auth, browserLocalPersistence);
  console.log('✅ Auth persistence set to local');
} catch (error) {
  console.warn('⚠️ Failed to set auth persistence:', error);
}

// Environment and connection state
export const isProduction = () => process.env.NODE_ENV === 'production';
export const isDevelopment = () => process.env.NODE_ENV === 'development';

// Connection monitoring state
let connectionState = {
  firestore: 'unknown',
  realtimeDatabase: 'unknown',
  lastCheck: Date.now()
};

// Enhanced error handling with user-friendly messages
export const handleFirebaseError = (error) => {
  console.error('Firebase error:', error);
  
  // Network-specific errors
  if (!navigator.onLine) {
    return 'You appear to be offline. Please check your internet connection.';
  }
  
  const errorMessages = {
    // Auth errors
    'auth/user-not-found': 'No account found with this email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password should be at least 6 characters long.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled.',
    'auth/account-exists-with-different-credential': 'An account already exists with the same email but different sign-in credentials.',
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
    'unknown': 'An unknown error occurred. Please try again.',
    'invalid-argument': 'Invalid data provided.',
    'not-found': 'The requested document was not found.',
    'already-exists': 'The document already exists.',
    'failed-precondition': 'The operation was rejected because the system is not in a state required for the operation.',
    'aborted': 'The operation was aborted due to a conflict.',
    'out-of-range': 'The operation was attempted past the valid range.',
    'unimplemented': 'This operation is not implemented or supported.',
    'internal': 'Internal server error. Please try again later.',
    
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

// Enhanced connection monitoring
export const monitorFirebaseConnection = (callback) => {
  const connectedRef = ref(realtimeDb, '.info/connected');
  
  return onValue(connectedRef, (snapshot) => {
    const connected = snapshot.val();
    connectionState.realtimeDatabase = connected ? 'connected' : 'disconnected';
    connectionState.lastCheck = Date.now();
    
    if (callback) {
      callback({
        realtimeDatabase: connectionState.realtimeDatabase,
        firestore: connectionState.firestore,
        lastCheck: connectionState.lastCheck
      });
    }
    
    console.log(`🔗 Realtime Database: ${connected ? 'connected' : 'disconnected'}`);
  });
};

// Network state management
export const handleNetworkStateChange = () => {
  const updateOnlineStatus = () => {
    if (navigator.onLine) {
      console.log('🌐 Network: online');
      enableNetwork(db).catch(console.error);
      goOnline(realtimeDb);
    } else {
      console.log('🌐 Network: offline');
      disableNetwork(db).catch(console.error);
      goOffline(realtimeDb);
    }
  };

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  
  // Initial check
  updateOnlineStatus();
  
  return () => {
    window.removeEventListener('online', updateOnlineStatus);
    window.removeEventListener('offline', updateOnlineStatus);
  };
};

// Session-specific utilities for video conferencing
export const createSessionSignalingRef = (sessionId) => {
  if (!sessionId) throw new Error('Session ID is required');
  return ref(realtimeDb, `sessions/${sessionId}/signals`);
};

export const createPresenceRef = (sessionId, userId) => {
  if (!sessionId || !userId) throw new Error('Session ID and User ID are required');
  return ref(realtimeDb, `sessions/${sessionId}/presence/${userId}`);
};

export const createUserPresenceRef = (userId) => {
  if (!userId) throw new Error('User ID is required');
  return ref(realtimeDb, `presence/${userId}`);
};

// Cleanup utilities
export const cleanupSessionData = async (sessionId) => {
  if (!sessionId) return;
  
  try {
    const sessionRef = ref(realtimeDb, `sessions/${sessionId}`);
    await set(sessionRef, null);
    console.log('🧹 Session data cleaned up:', sessionId);
  } catch (error) {
    console.error('❌ Error cleaning up session data:', error);
  }
};

// Enhanced retry logic with exponential backoff
export const withRetry = async (operation, options = {}) => {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    retryCondition = (error) => !['permission-denied', 'unauthenticated', 'invalid-argument'].includes(error.code)
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (!retryCondition(error) || attempt === maxAttempts) {
        throw error;
      }
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      console.log(`⏳ Operation failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

// Cache management for better performance
export const clearFirebaseCache = async () => {
  try {
    await clearIndexedDbPersistence(db);
    console.log('🧹 Firebase cache cleared successfully');
  } catch (error) {
    console.warn('⚠️ Failed to clear Firebase cache:', error);
  }
};

// Development tools
if (isDevelopment()) {
  // Enable Firestore debug logging in development
  // enableNetwork(db);
  
  // Global access for debugging
  window.__FIREBASE__ = {
    app,
    auth,
    db,
    realtimeDb,
    storage,
    connectionState: () => connectionState,
    clearCache: clearFirebaseCache
  };
  
  console.log('🔧 Development mode: Firebase debug tools available at window.__FIREBASE__');
}

// Emulator connection for development
if (isDevelopment() && !window.__FIREBASE_EMULATORS_CONNECTED__) {
  const connectToEmulators = async () => {
    try {
      // Check if emulators are running
      const isEmulatorRunning = async (port) => {
        try {
          const response = await fetch(`http://localhost:${port}`, { 
            method: 'GET', 
            mode: 'no-cors' 
          });
          return true;
        } catch {
          return false;
        }
      };

      // Connect to Auth emulator
      if (await isEmulatorRunning(9099)) {
        connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
        console.log('🔧 Connected to Auth emulator');
      }
      
      // Connect to Firestore emulator
      if (await isEmulatorRunning(8080)) {
        connectFirestoreEmulator(db, 'localhost', 8080);
        console.log('🔧 Connected to Firestore emulator');
      }
      
      // Connect to Realtime Database emulator
      if (await isEmulatorRunning(9000)) {
        connectDatabaseEmulator(realtimeDb, 'localhost', 9000);
        console.log('🔧 Connected to Realtime Database emulator');
      }
      
      // Connect to Storage emulator
      if (await isEmulatorRunning(9199)) {
        connectStorageEmulator(storage, 'localhost', 9199);
        console.log('🔧 Connected to Storage emulator');
      }
      
      window.__FIREBASE_EMULATORS_CONNECTED__ = true;
    } catch (error) {
      console.log('📡 Emulators not available, using production Firebase');
    }
  };

  connectToEmulators();
}

// Performance monitoring
if (isProduction()) {
  // Enable Firebase Performance Monitoring
  import('firebase/performance').then(({ getPerformance, trace }) => {
    try {
      const perf = getPerformance(app);
      
      // Create traces for key operations
      window.__FIREBASE_TRACE__ = {
        sessionCreate: () => trace(perf, 'session_create'),
        sessionJoin: () => trace(perf, 'session_join'),
        userAuth: () => trace(perf, 'user_authentication')
      };
      
      console.log('📊 Firebase Performance monitoring enabled');
    } catch (error) {
      console.warn('⚠️ Firebase Performance monitoring failed to initialize:', error);
    }
  });

  // Enable Firebase Analytics
  import('firebase/analytics').then(({ getAnalytics, logEvent, setUserId, setUserProperties }) => {
    try {
      const analytics = getAnalytics(app);
      
      // Log app initialization
      logEvent(analytics, 'app_initialized', {
        platform: 'web',
        version: process.env.REACT_APP_VERSION || '1.0.0',
        environment: 'production'
      });
      
      // Export analytics functions
      window.__FIREBASE_ANALYTICS__ = {
        logEvent: (eventName, parameters) => logEvent(analytics, eventName, parameters),
        setUserId: (userId) => setUserId(analytics, userId),
        setUserProperties: (properties) => setUserProperties(analytics, properties)
      };
      
      console.log('📈 Firebase Analytics initialized');
    } catch (error) {
      console.warn('⚠️ Firebase Analytics failed to initialize:', error);
    }
  });
}

// Initialize network state monitoring
if (typeof window !== 'undefined') {
  handleNetworkStateChange();
}

export default app;