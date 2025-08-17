import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import { 
  FiX,
  FiClock,
  FiUsers,
  FiArrowLeft,
  FiLoader,
  FiWifi,
  FiCheck,
  FiRefreshCw,
  FiMic,
  FiMicOff,
  FiVideo,
  FiVideoOff
} from 'react-icons/fi';
import toast from 'react-hot-toast';

// Optimized Jitsi configuration for mobile and production
const JITSI_CONFIG = {
  configOverwrite: {
    startWithAudioMuted: false,
    startWithVideoMuted: false,
    prejoinPageEnabled: false,
    enableClosePage: false,
    disableInviteFunctions: true,
    enableWelcomePage: false,
    requireDisplayName: false,
    enableNoisyMicDetection: false,
    enableTalkWhileMuted: false,
    resolution: window.innerWidth <= 768 ? 360 : 720,
    p2p: {
      enabled: true,
      preferH264: true,
      useStunTurn: true
    },
    constraints: {
      video: {
        aspectRatio: 16 / 9,
        height: { 
          ideal: window.innerWidth <= 768 ? 360 : 720, 
          max: window.innerWidth <= 768 ? 480 : 1080 
        },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    }
  },
  interfaceConfigOverwrite: {
    MOBILE_APP_PROMO: false,
    SHOW_JITSI_WATERMARK: false,
    SHOW_BRAND_WATERMARK: false,
    SHOW_POWERED_BY: false,
    ENABLE_MOBILE_BROWSER: true,
    HIDE_DEEP_LINKING_LOGO: true,
    TOOLBAR_BUTTONS: window.innerWidth <= 768 ? 
      ['microphone', 'camera', 'hangup'] :
      ['microphone', 'camera', 'hangup', 'settings'],
    TOOLBAR_ALWAYS_VISIBLE: window.innerWidth <= 768,
    FILM_STRIP_MAX_HEIGHT: window.innerWidth <= 768 ? 80 : 120,
    DISABLE_INVITE_FUNCTIONS: true,
    DISABLE_DEEP_LINKING: true
  }
};

// Connection states enum for better type safety
const CONNECTION_STATES = {
  LOADING: 'loading',
  CONNECTING: 'connecting', 
  WAITING_PARTNER: 'waiting-partner',
  CONNECTED: 'connected',
  FAILED: 'failed',
  RECONNECTING: 'reconnecting'
};

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Core refs
  const jitsiContainerRef = useRef(null);
  const apiRef = useRef(null);
  const mountedRef = useRef(true);
  const sessionListenerRef = useRef(null);
  const participantCheckRef = useRef(null);
  
  // Simplified state management
  const [session, setSession] = useState(null);
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.LOADING);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState(null);
  const [isMobile] = useState(window.innerWidth <= 768);
  const [userRole, setUserRole] = useState(null);
  const [timerActive, setTimerActive] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Initializing session...');
  
  // Audio/Video controls
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, []);

  // Force loading timeout - critical for UX
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (connectionState === CONNECTION_STATES.LOADING && mountedRef.current) {
        console.warn('⚠️ Force stopping loading after 8 seconds');
        setConnectionState(CONNECTION_STATES.FAILED);
        setError('Session took too long to load. Please refresh and try again.');
      }
    }, 8000);

    return () => clearTimeout(timeout);
  }, [connectionState]);

  // Optimized session listener with error boundaries
  useEffect(() => {
    if (!sessionId || !user?.uid || sessionListenerRef.current) return;

    setLoadingMessage('Loading session data...');

    const unsubscribe = onSnapshot(
      doc(db, 'sessions', sessionId),
      (docSnap) => {
        if (!mountedRef.current) return;
        
        if (docSnap.exists()) {
          const sessionData = { id: docSnap.id, ...docSnap.data() };
          
          // Validate access
          if (sessionData.userId !== user.uid && sessionData.partnerId !== user.uid) {
            setError('You do not have access to this session');
            return;
          }

          // Check session status
          if (sessionData.status === 'completed' || sessionData.status === 'cancelled') {
            setError('This session has ended');
            return;
          }
          
          setSession(sessionData);
          setUserRole(sessionData.userId === user.uid ? 'creator' : 'joiner');
          setLoadingMessage('Preparing video connection...');
          
          // Initialize Jitsi when ready
          if (jitsiContainerRef.current && connectionState === CONNECTION_STATES.LOADING) {
            initializeJitsi(sessionData);
          }
        } else {
          setError('Session not found');
        }
      },
      (error) => {
        console.error('❌ Session listener error:', error);
        setError('Failed to connect to session');
      }
    );

    sessionListenerRef.current = unsubscribe;
    return () => {
      if (sessionListenerRef.current) {
        sessionListenerRef.current();
        sessionListenerRef.current = null;
      }
    };
  }, [sessionId, user?.uid, connectionState]);

  // Optimized Jitsi initialization
  const initializeJitsi = useCallback(async (sessionData) => {
    if (!mountedRef.current || apiRef.current) return;

    try {
      setConnectionState(CONNECTION_STATES.CONNECTING);
      setLoadingMessage('Loading video system...');
      
      // Load Jitsi script
      if (!window.JitsiMeetExternalAPI) {
        await loadJitsiScript();
      }

      setLoadingMessage('Connecting to video...');
      
      const roomName = `focusmate-${sessionId}`.replace(/[^a-zA-Z0-9-]/g, '');
      
      const options = {
        roomName,
        width: '100%',
        height: '100%',
        parentNode: jitsiContainerRef.current,
        userInfo: {
          displayName: user?.displayName || user?.email?.split('@')[0] || 'Student',
          email: user?.email
        },
        ...JITSI_CONFIG
      };

      apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      setupJitsiListeners();
      
    } catch (error) {
      console.error('❌ Jitsi initialization failed:', error);
      setConnectionState(CONNECTION_STATES.FAILED);
      setError('Failed to initialize video. Please refresh and try again.');
    }
  }, [sessionId, user]);

  // Load Jitsi script with better error handling
  const loadJitsiScript = () => {
    return new Promise((resolve, reject) => {
      if (window.JitsiMeetExternalAPI) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load video system'));
      document.body.appendChild(script);
    });
  };

  // Simplified Jitsi event listeners
  const setupJitsiListeners = useCallback(() => {
    if (!apiRef.current || !mountedRef.current) return;

    // Conference joined successfully
    apiRef.current.on('videoConferenceJoined', () => {
      if (!mountedRef.current) return;
      setConnectionState(CONNECTION_STATES.WAITING_PARTNER);
      setLoadingMessage('');
      startParticipantTracking();
      
      toast.success(userRole === 'creator' ? 
        'Session ready! Waiting for partner...' : 
        'Joined session successfully!'
      );
    });

    // Participant events
    apiRef.current.on('participantJoined', (participant) => {
      if (!mountedRef.current) return;
      updateParticipantCount();
      toast.success(`${participant.displayName || 'Study partner'} joined! 🎉`);
    });

    apiRef.current.on('participantLeft', (participant) => {
      if (!mountedRef.current) return;
      updateParticipantCount();
      toast(`${participant.displayName || 'Study partner'} left the session`);
    });

    // Audio/Video events
    apiRef.current.on('audioMuteStatusChanged', ({ muted }) => {
      setIsAudioMuted(muted);
    });

    apiRef.current.on('videoMuteStatusChanged', ({ muted }) => {
      setIsVideoMuted(muted);
    });

    // Connection events
    apiRef.current.on('connectionFailed', () => {
      setConnectionState(CONNECTION_STATES.FAILED);
      setError('Connection failed. Please check your internet and try again.');
    });

    apiRef.current.on('readyToClose', () => {
      if (mountedRef.current) endSession();
    });

  }, [userRole]);

  // Efficient participant count tracking
  const startParticipantTracking = useCallback(() => {
    if (participantCheckRef.current) {
      clearInterval(participantCheckRef.current);
    }

    participantCheckRef.current = setInterval(() => {
      if (apiRef.current && mountedRef.current) {
        updateParticipantCount();
      }
    }, 2000);
  }, []);

  const updateParticipantCount = useCallback(() => {
    if (!apiRef.current || !mountedRef.current) return;

    try {
      const count = apiRef.current.getNumberOfParticipants();
      setParticipantCount(count);

      // Update connection state based on participant count
      if (count >= 2 && connectionState !== CONNECTION_STATES.CONNECTED) {
        setConnectionState(CONNECTION_STATES.CONNECTED);
        setTimerActive(true);
        toast.success('🎉 Both participants connected! Session started!');
      } else if (count === 1 && connectionState === CONNECTION_STATES.CONNECTED) {
        setConnectionState(CONNECTION_STATES.WAITING_PARTNER);
        setTimerActive(false);
      }
    } catch (error) {
      console.error('Error checking participants:', error);
    }
  }, [connectionState]);

  // Audio/Video controls
  const toggleAudio = useCallback(() => {
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleAudio');
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleVideo');
    }
  }, []);

  // Session management
  const endSession = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      if (sessionId && session?.status !== 'completed') {
        await updateDoc(doc(db, 'sessions', sessionId), {
          status: 'completed',
          endedAt: serverTimestamp(),
          actualDuration: session?.duration || 50
        });
      }

      cleanup();
      toast.success('Session completed! Great work! 🎉');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error ending session:', error);
      navigate('/dashboard');
    }
  }, [sessionId, session, navigate]);

  const leaveSession = useCallback(() => {
    cleanup();
    navigate('/dashboard');
  }, [navigate]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (participantCheckRef.current) {
      clearInterval(participantCheckRef.current);
      participantCheckRef.current = null;
    }

    if (apiRef.current) {
      try {
        apiRef.current.dispose();
      } catch (e) {
        console.log('Cleanup error:', e);
      }
      apiRef.current = null;
    }
  }, []);

  // Timer completion handler
  const onTimerComplete = useCallback(() => {
    toast.success('Time\'s up! Session completed! 🎯');
    setTimeout(endSession, 2000);
  }, [endSession]);

  // Render helpers
  const getStatusText = () => {
    switch (connectionState) {
      case CONNECTION_STATES.LOADING:
        return loadingMessage || 'Loading...';
      case CONNECTION_STATES.CONNECTING:
        return 'Connecting to video...';
      case CONNECTION_STATES.WAITING_PARTNER:
        return userRole === 'creator' ? 'Waiting for partner to join' : 'Waiting for partner';
      case CONNECTION_STATES.CONNECTED:
        return `Connected (${participantCount} participants)`;
      case CONNECTION_STATES.FAILED:
        return 'Connection failed';
      case CONNECTION_STATES.RECONNECTING:
        return 'Reconnecting...';
      default:
        return 'Loading...';
    }
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case CONNECTION_STATES.CONNECTED:
        return '#10b981';
      case CONNECTION_STATES.FAILED:
        return '#ef4444';
      case CONNECTION_STATES.RECONNECTING:
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  // Loading state
  if (connectionState === CONNECTION_STATES.LOADING) {
    return (
      <div className="video-session-loading">
        <div className="loading-container">
          <FiLoader className="spinner" />
          <h3>Setting up your focus session</h3>
          <p>{loadingMessage}</p>
          
          {isMobile && (
            <div className="mobile-loading-tips">
              <p>💡 For best experience:</p>
              <ul>
                <li>Use Chrome or Safari</li>
                <li>Allow camera & microphone access</li>
                <li>Keep this tab active</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="video-session-error">
        <div className="error-container">
          <div className="error-icon">❌</div>
          <h2>Session Error</h2>
          <p>{error}</p>
          <div className="error-actions">
            <button className="btn-primary" onClick={() => window.location.reload()}>
              <FiRefreshCw /> Refresh & Retry
            </button>
            <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
              <FiArrowLeft /> Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`video-session ${isMobile ? 'mobile' : 'desktop'}`}>
      {/* Compact Header */}
      <div className="video-header">
        <div className="session-info">
          <h3 className="session-title">{session?.goal || 'Focus Session'}</h3>
          <div className="session-meta">
            <span className="duration">
              <FiClock /> {session?.duration || 50}min
            </span>
            <span className="participants">
              <FiUsers /> {participantCount}/2
            </span>
            <span 
              className="connection-status" 
              style={{ color: getStatusColor() }}
            >
              <FiWifi /> {getStatusText()}
            </span>
          </div>
        </div>
        
        <button 
          onClick={userRole === 'creator' ? endSession : leaveSession} 
          className="btn-leave"
          title={userRole === 'creator' ? 'End session' : 'Leave session'}
        >
          {userRole === 'creator' ? <FiX /> : <FiArrowLeft />}
        </button>
      </div>

      {/* Video Container */}
      <div className="video-main">
        <div ref={jitsiContainerRef} className="jitsi-container">
          {/* Status Overlays */}
          {connectionState === CONNECTION_STATES.CONNECTING && (
            <div className="video-overlay">
              <FiLoader className="spinner" />
              <h3>Connecting to video...</h3>
            </div>
          )}
          
          {connectionState === CONNECTION_STATES.WAITING_PARTNER && (
            <div className="video-overlay">
              <FiUsers className="waiting-icon" />
              <h3>Waiting for study partner</h3>
              <div className="waiting-dots">
                <span></span><span></span><span></span>
              </div>
              <p>Ready to focus when your partner joins</p>
            </div>
          )}

          {connectionState === CONNECTION_STATES.FAILED && (
            <div className="video-overlay error">
              <div className="error-icon">⚠️</div>
              <h3>Connection Failed</h3>
              <p>Unable to connect to video</p>
              <button 
                className="btn-primary"
                onClick={() => window.location.reload()}
              >
                <FiRefreshCw /> Retry
              </button>
            </div>
          )}
        </div>

        {/* Session Timer - Only when both connected */}
        {timerActive && connectionState === CONNECTION_STATES.CONNECTED && (
          <div className="session-timer-overlay">
            <SessionTimer 
              duration={session?.duration || 50}
              onComplete={onTimerComplete}
              autoStart={true}
              isOverlay={true}
              isMobile={isMobile}
            />
          </div>
        )}

        {/* Mobile Controls */}
        {isMobile && connectionState === CONNECTION_STATES.CONNECTED && (
          <div className="mobile-controls">
            <button 
              onClick={toggleAudio}
              className={`control-btn ${isAudioMuted ? 'muted' : ''}`}
            >
              {isAudioMuted ? <FiMicOff /> : <FiMic />}
            </button>
            <button 
              onClick={toggleVideo}
              className={`control-btn ${isVideoMuted ? 'muted' : ''}`}
            >
              {isVideoMuted ? <FiVideoOff /> : <FiVideo />}
            </button>
          </div>
        )}
      </div>

      {/* Session Details - Collapsible on mobile */}
      <div className="session-details">
        <div className="details-content">
          <div className="detail-item">
            <span>Goal:</span>
            <span>{session?.goal || 'Loading...'}</span>
          </div>
          <div className="detail-item">
            <span>Partner:</span>
            <span>
              {session?.partnerId ? 
                `${session.partnerName || 'Study Partner'} ${
                  connectionState === CONNECTION_STATES.CONNECTED ? '(Connected ✅)' : '(Not connected)'
                }` : 
                'Waiting for partner...'
              }
            </span>
          </div>
          <div className="detail-item">
            <span>Status:</span>
            <span style={{ color: getStatusColor() }}>
              {getStatusText()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoSession;