import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, onSnapshot, serverTimestamp, getDoc } from 'firebase/firestore';
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
  FiVideoOff,
  FiAlertCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';

// Optimized Jitsi configuration
const JITSI_CONFIG = {
  configOverwrite: {
    startWithAudioMuted: false,
    startWithVideoMuted: false,
    prejoinPageEnabled: false,
    enableClosePage: false,
    disableInviteFunctions: true,
    enableWelcomePage: false,
    requireDisplayName: true,
    enableNoisyMicDetection: false,
    enableTalkWhileMuted: false,
    resolution: window.innerWidth <= 768 ? 360 : 720,
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
    },
    p2p: {
      enabled: true,
      preferH264: true
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

// Connection states
const CONNECTION_STATES = {
  INITIALIZING: 'initializing',
  LOADING_SESSION: 'loading-session',
  LOADING_VIDEO: 'loading-video',
  WAITING_PARTNER: 'waiting-partner',
  CONNECTED: 'connected',
  FAILED: 'failed',
  ENDED: 'ended'
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
  const jitsiLoadTimeoutRef = useRef(null);
  
  // State management
  const [session, setSession] = useState(null);
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.INITIALIZING);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState(null);
  const [isMobile] = useState(window.innerWidth <= 768);
  const [userRole, setUserRole] = useState(null);
  const [timerActive, setTimerActive] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Initializing session...');
  const [sessionValid, setSessionValid] = useState(false);
  
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

  // Validate session access and load session data
  useEffect(() => {
    if (!sessionId || !user?.uid) {
      setError('Invalid session or user not authenticated');
      return;
    }

    validateAndLoadSession();
  }, [sessionId, user?.uid]);

  // Set up session listener after validation
  useEffect(() => {
    if (sessionValid && !sessionListenerRef.current) {
      setupSessionListener();
    }
  }, [sessionValid]);

  // Initialize Jitsi when session is loaded and container is ready
  useEffect(() => {
    if (
      session && 
      jitsiContainerRef.current && 
      connectionState === CONNECTION_STATES.LOADING_SESSION &&
      !apiRef.current
    ) {
      setConnectionState(CONNECTION_STATES.LOADING_VIDEO);
      setLoadingMessage('Connecting to video...');
      initializeJitsi();
    }
  }, [session, connectionState]);

  // Validate session access
  const validateAndLoadSession = async () => {
    try {
      setConnectionState(CONNECTION_STATES.LOADING_SESSION);
      setLoadingMessage('Loading session...');

      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
      
      if (!sessionDoc.exists()) {
        throw new Error('Session not found');
      }

      const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
      
      // Check user access
      if (sessionData.userId !== user.uid && sessionData.partnerId !== user.uid) {
        throw new Error('You do not have access to this session');
      }

      // Check session status
      if (sessionData.status === 'completed') {
        throw new Error('This session has already ended');
      }

      if (sessionData.status === 'cancelled') {
        throw new Error('This session was cancelled');
      }

      // Check if session time is valid (can join 5 minutes early to 15 minutes late)
      const sessionStart = new Date(sessionData.startTime);
      const now = new Date();
      const timeDiff = sessionStart - now;
      
      if (timeDiff > 5 * 60 * 1000) {
        throw new Error(`Session starts in ${Math.floor(timeDiff / 60000)} minutes. Please wait until closer to the start time.`);
      }

      if (timeDiff < -15 * 60 * 1000) {
        throw new Error('This session has already ended');
      }

      setSession(sessionData);
      setUserRole(sessionData.userId === user.uid ? 'creator' : 'joiner');
      setSessionValid(true);

    } catch (error) {
      console.error('Session validation error:', error);
      setError(error.message);
      setConnectionState(CONNECTION_STATES.FAILED);
    }
  };

  // Set up real-time session listener
  const setupSessionListener = () => {
    const unsubscribe = onSnapshot(
      doc(db, 'sessions', sessionId),
      (docSnap) => {
        if (!mountedRef.current) return;
        
        if (docSnap.exists()) {
          const sessionData = { id: docSnap.id, ...docSnap.data() };
          setSession(sessionData);
          
          // Check for session status changes
          if (sessionData.status === 'completed' || sessionData.status === 'cancelled') {
            handleSessionEnd();
          }
        }
      },
      (error) => {
        console.error('Session listener error:', error);
        if (mountedRef.current) {
          setError('Connection to session lost');
        }
      }
    );

    sessionListenerRef.current = unsubscribe;
  };

  // Initialize Jitsi Meet
  const initializeJitsi = async () => {
    if (!mountedRef.current || apiRef.current) return;

    try {
      // Set timeout for Jitsi loading
      jitsiLoadTimeoutRef.current = setTimeout(() => {
        if (connectionState === CONNECTION_STATES.LOADING_VIDEO && mountedRef.current) {
          setError('Video system took too long to load. Please refresh and try again.');
          setConnectionState(CONNECTION_STATES.FAILED);
        }
      }, 15000);

      // Load Jitsi script if not already loaded
      if (!window.JitsiMeetExternalAPI) {
        setLoadingMessage('Loading video system...');
        await loadJitsiScript();
      }

      if (!mountedRef.current) return;

      setLoadingMessage('Connecting to video room...');
      
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
      setupJitsiEventListeners();
      
    } catch (error) {
      console.error('Jitsi initialization error:', error);
      if (mountedRef.current) {
        setError('Failed to initialize video. Please refresh and try again.');
        setConnectionState(CONNECTION_STATES.FAILED);
      }
    }
  };

  // Load Jitsi script
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

  // Set up Jitsi event listeners
  const setupJitsiEventListeners = () => {
    if (!apiRef.current || !mountedRef.current) return;

    // Clear loading timeout
    if (jitsiLoadTimeoutRef.current) {
      clearTimeout(jitsiLoadTimeoutRef.current);
      jitsiLoadTimeoutRef.current = null;
    }

    // Conference joined successfully
    apiRef.current.on('videoConferenceJoined', () => {
      if (!mountedRef.current) return;
      
      console.log('✅ Joined video conference');
      setConnectionState(CONNECTION_STATES.WAITING_PARTNER);
      setLoadingMessage('');
      
      // Start checking participant count
      checkParticipants();
      
      toast.success(userRole === 'creator' ? 
        'Session ready! Waiting for partner...' : 
        'Joined session successfully!'
      );
    });

    // Participant events
    apiRef.current.on('participantJoined', (participant) => {
      if (!mountedRef.current) return;
      console.log('👤 Participant joined:', participant.displayName);
      setTimeout(checkParticipants, 1000);
      
      toast.success(`${participant.displayName || 'Study partner'} joined! 🎉`);
    });

    apiRef.current.on('participantLeft', (participant) => {
      if (!mountedRef.current) return;
      console.log('👋 Participant left:', participant.displayName);
      setTimeout(checkParticipants, 1000);
      
      if (connectionState === CONNECTION_STATES.CONNECTED) {
        setConnectionState(CONNECTION_STATES.WAITING_PARTNER);
        setTimerActive(false);
        toast(`${participant.displayName || 'Study partner'} left the session`);
      }
    });

    // Audio/Video events
    apiRef.current.on('audioMuteStatusChanged', ({ muted }) => {
      setIsAudioMuted(muted);
    });

    apiRef.current.on('videoMuteStatusChanged', ({ muted }) => {
      setIsVideoMuted(muted);
    });

    // Error handling
    apiRef.current.on('connectionFailed', () => {
      console.error('❌ Jitsi connection failed');
      if (mountedRef.current) {
        setError('Connection failed. Please check your internet and try again.');
        setConnectionState(CONNECTION_STATES.FAILED);
      }
    });

    apiRef.current.on('readyToClose', () => {
      if (mountedRef.current) {
        endSession();
      }
    });

    // Conference errors
    apiRef.current.on('conferenceError', (error) => {
      console.error('❌ Conference error:', error);
      if (mountedRef.current) {
        setError('Video conference error. Please refresh and try again.');
        setConnectionState(CONNECTION_STATES.FAILED);
      }
    });
  };

  // Check participant count
  const checkParticipants = useCallback(() => {
    if (!apiRef.current || !mountedRef.current) return;

    try {
      const count = apiRef.current.getNumberOfParticipants();
      setParticipantCount(count);

      console.log('👥 Participants:', count);

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
      cleanup();
      navigate('/dashboard');
    }
  }, [sessionId, session, navigate]);

  const leaveSession = useCallback(() => {
    cleanup();
    navigate('/dashboard');
  }, [navigate]);

  const handleSessionEnd = useCallback(() => {
    setConnectionState(CONNECTION_STATES.ENDED);
    setTimeout(() => {
      cleanup();
      navigate('/dashboard');
    }, 2000);
  }, [navigate]);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up video session...');

    // Clear timeouts
    if (jitsiLoadTimeoutRef.current) {
      clearTimeout(jitsiLoadTimeoutRef.current);
      jitsiLoadTimeoutRef.current = null;
    }

    // Clean up session listener
    if (sessionListenerRef.current) {
      sessionListenerRef.current();
      sessionListenerRef.current = null;
    }

    // Clean up Jitsi
    if (apiRef.current) {
      try {
        apiRef.current.dispose();
      } catch (e) {
        console.log('Jitsi cleanup error:', e);
      }
      apiRef.current = null;
    }
  }, []);

  // Timer completion handler
  const onTimerComplete = useCallback(() => {
    toast.success('Time\'s up! Session completed! 🎯');
    setTimeout(endSession, 2000);
  }, [endSession]);

  // Retry connection
  const retryConnection = useCallback(() => {
    setError(null);
    setConnectionState(CONNECTION_STATES.INITIALIZING);
    setLoadingMessage('Retrying connection...');
    
    // Clean up and restart
    cleanup();
    setTimeout(() => {
      validateAndLoadSession();
    }, 1000);
  }, []);

  // Helper functions
  const getStatusText = () => {
    switch (connectionState) {
      case CONNECTION_STATES.INITIALIZING:
        return 'Initializing...';
      case CONNECTION_STATES.LOADING_SESSION:
        return 'Loading session...';
      case CONNECTION_STATES.LOADING_VIDEO:
        return 'Connecting to video...';
      case CONNECTION_STATES.WAITING_PARTNER:
        return userRole === 'creator' ? 'Waiting for partner to join' : 'Waiting for partner';
      case CONNECTION_STATES.CONNECTED:
        return `Connected (${participantCount} participants)`;
      case CONNECTION_STATES.FAILED:
        return 'Connection failed';
      case CONNECTION_STATES.ENDED:
        return 'Session ended';
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
      case CONNECTION_STATES.ENDED:
        return '#8b5cf6';
      default:
        return '#6b7280';
    }
  };

  // Loading state
  if (connectionState === CONNECTION_STATES.INITIALIZING || 
      connectionState === CONNECTION_STATES.LOADING_SESSION ||
      connectionState === CONNECTION_STATES.LOADING_VIDEO) {
    return (
      <div className="video-session-loading">
        <div className="loading-container">
          <FiLoader className="spinner" />
          <h3>Setting up your focus session</h3>
          <p>{loadingMessage}</p>
          
          {connectionState === CONNECTION_STATES.LOADING_VIDEO && (
            <div className="loading-progress">
              <div className="progress-steps">
                <div className="step completed">
                  <FiCheck /> Session loaded
                </div>
                <div className="step active">
                  <FiLoader className="spinning" /> Connecting video
                </div>
              </div>
            </div>
          )}
          
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
  if (error || connectionState === CONNECTION_STATES.FAILED) {
    return (
      <div className="video-session-error">
        <div className="error-container">
          <div className="error-icon">
            <FiAlertCircle size={48} />
          </div>
          <h2>Session Error</h2>
          <p>{error}</p>
          <div className="error-actions">
            <button className="btn-primary" onClick={retryConnection}>
              <FiRefreshCw /> Retry Connection
            </button>
            <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
              <FiArrowLeft /> Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Session ended state
  if (connectionState === CONNECTION_STATES.ENDED) {
    return (
      <div className="video-session-ended">
        <div className="ended-container">
          <div className="ended-icon">🎉</div>
          <h2>Session Completed!</h2>
          <p>Great work on your focus session!</p>
          <div className="ended-stats">
            <div className="stat">
              <span>Duration</span>
              <span>{session?.duration || 50} minutes</span>
            </div>
            <div className="stat">
              <span>Goal</span>
              <span>{session?.goal || 'Focus session'}</span>
            </div>
          </div>
          <p>Redirecting to dashboard...</p>
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
          {connectionState === CONNECTION_STATES.WAITING_PARTNER && (
            <div className="video-overlay">
              <FiUsers className="waiting-icon" />
              <h3>Waiting for study partner</h3>
              <div className="waiting-dots">
                <span></span><span></span><span></span>
              </div>
              <p>Ready to focus when your partner joins</p>
              
              {/* Share session info */}
              {session?.partnerId === null && userRole === 'creator' && (
                <div className="waiting-help">
                  <p>💡 Share your session in the dashboard for others to join!</p>
                </div>
              )}
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
              title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isAudioMuted ? <FiMicOff /> : <FiMic />}
            </button>
            <button 
              onClick={toggleVideo}
              className={`control-btn ${isVideoMuted ? 'muted' : ''}`}
              title={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
            >
              {isVideoMuted ? <FiVideoOff /> : <FiVideo />}
            </button>
          </div>
        )}
      </div>

      {/* Session Details */}
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
                  connectionState === CONNECTION_STATES.CONNECTED ? '(Connected ✅)' : '(Joining...)'
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