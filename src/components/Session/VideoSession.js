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

  // Validate session access and load session data - COMPREHENSIVE DEBUGGING
  useEffect(() => {
    if (!sessionId || !user?.uid) {
      console.error('❌ Missing required data:', { sessionId, userId: user?.uid });
      setError('Invalid session or user not authenticated');
      return;
    }

    console.log('🔍 Starting session validation...', { sessionId, userId: user.uid });
    validateAndLoadSession();
  }, [sessionId, user?.uid]);

  // Set up session listener after validation
  useEffect(() => {
    if (sessionValid && !sessionListenerRef.current) {
      setupSessionListener();
    }
  }, [sessionValid]);

  // Auto-recovery mechanism - FASTER RECOVERY
  useEffect(() => {
    if (connectionState === CONNECTION_STATES.LOADING_VIDEO) {
      console.log('⏰ Starting auto-recovery timer for video loading...');
      
      const autoRecoveryTimeout = setTimeout(() => {
        if (mountedRef.current && connectionState === CONNECTION_STATES.LOADING_VIDEO) {
          console.log('🚑 Auto-recovery: Force skipping to session');
          setConnectionState(CONNECTION_STATES.WAITING_PARTNER);
          setLoadingMessage('');
          setTimerActive(true);
          toast('Video took too long - session started! You can focus now! 🎯', {
            icon: '⚡',
            duration: 5000
          });
        }
      }, 10000); // Reduced from 15s to 10s

      return () => {
        clearTimeout(autoRecoveryTimeout);
      };
    }
  }, [connectionState]);

  // Initialize Jitsi when session is loaded - IMPROVED DEBUGGING
  useEffect(() => {
    console.log('🎬 Jitsi initialization check:', {
      hasSession: !!session,
      hasContainer: !!jitsiContainerRef.current,
      connectionState,
      hasAPI: !!apiRef.current,
      sessionValid
    });

    if (
      session && 
      jitsiContainerRef.current && 
      connectionState === CONNECTION_STATES.LOADING_SESSION &&
      !apiRef.current &&
      sessionValid
    ) {
      console.log('✅ All conditions met, starting Jitsi initialization...');
      setConnectionState(CONNECTION_STATES.LOADING_VIDEO);
      setLoadingMessage('Connecting to video...');
      
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        initializeJitsi();
      }, 500);
    }
  }, [session, connectionState, sessionValid]);

  // Validate session access - COMPREHENSIVE DEBUGGING
  const validateAndLoadSession = async () => {
    try {
      console.log('📋 Step 1: Setting loading state...');
      setConnectionState(CONNECTION_STATES.LOADING_SESSION);
      setLoadingMessage('Loading session...');

      console.log('📋 Step 2: Fetching session document...', sessionId);
      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
      
      if (!sessionDoc.exists()) {
        console.error('❌ Session document not found');
        throw new Error('Session not found');
      }

      const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
      console.log('📋 Step 3: Session data loaded:', {
        id: sessionData.id,
        userId: sessionData.userId,
        partnerId: sessionData.partnerId,
        participants: sessionData.participants,
        status: sessionData.status,
        goal: sessionData.goal
      });
      
      // Check user access - DETAILED LOGGING
      const isCreator = sessionData.userId === user.uid;
      const isPartner = sessionData.partnerId === user.uid;
      const isInParticipants = sessionData.participants && sessionData.participants.includes(user.uid);
      
      console.log('📋 Step 4: Access check:', { 
        currentUserId: user.uid,
        sessionUserId: sessionData.userId,
        sessionPartnerId: sessionData.partnerId,
        participants: sessionData.participants,
        isCreator, 
        isPartner, 
        isInParticipants 
      });
      
      if (!isCreator && !isPartner && !isInParticipants) {
        console.error('❌ Access denied - user not associated with session');
        throw new Error('You do not have access to this session');
      }

      console.log('✅ Session validation passed');
      setSession(sessionData);
      setUserRole(sessionData.userId === user.uid ? 'creator' : 'joiner');
      setSessionValid(true);
      
      console.log('📋 Step 5: Moving to video initialization...');

    } catch (error) {
      console.error('❌ Session validation failed:', error);
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

  // Initialize Jitsi Meet - SIMPLIFIED AND MORE RELIABLE
  const initializeJitsi = async () => {
    if (!mountedRef.current || apiRef.current) {
      console.log('❌ Jitsi init aborted - component unmounted or API exists');
      return;
    }

    try {
      console.log('🎥 Starting Jitsi Meet initialization...');
      
      // Set shorter timeout for faster feedback
      jitsiLoadTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && connectionState === CONNECTION_STATES.LOADING_VIDEO) {
          console.error('❌ Jitsi loading timeout after 8 seconds');
          // Force skip to session
          setConnectionState(CONNECTION_STATES.WAITING_PARTNER);
          setLoadingMessage('');
          setTimerActive(true);
          toast('Video loading took too long - starting session without video!', {
            icon: '⚡',
            duration: 4000
          });
        }
      }, 8000); // Reduced timeout

      // Check if container exists
      if (!jitsiContainerRef.current) {
        throw new Error('Video container not found');
      }

      // Load Jitsi script if not already loaded
      if (!window.JitsiMeetExternalAPI) {
        console.log('📥 Loading Jitsi script...');
        setLoadingMessage('Loading video system...');
        await loadJitsiScript();
        console.log('✅ Jitsi script loaded');
      }

      if (!mountedRef.current) {
        console.log('❌ Component unmounted during script load');
        return;
      }

      setLoadingMessage('Connecting to video room...');
      
      const roomName = `focusmate-${sessionId}`.replace(/[^a-zA-Z0-9-]/g, '');
      console.log('🏠 Creating Jitsi room:', roomName);
      
      // Simplified Jitsi configuration
      const options = {
        roomName,
        width: '100%',
        height: '100%',
        parentNode: jitsiContainerRef.current,
        userInfo: {
          displayName: user?.displayName || user?.email?.split('@')[0] || 'Student',
          email: user?.email
        },
        configOverwrite: {
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          prejoinPageEnabled: false,
          enableClosePage: false,
          disableInviteFunctions: true,
          enableWelcomePage: false,
          requireDisplayName: true
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false,
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          ENABLE_MOBILE_BROWSER: true,
          HIDE_DEEP_LINKING_LOGO: true,
          TOOLBAR_BUTTONS: ['microphone', 'camera', 'hangup'],
          TOOLBAR_ALWAYS_VISIBLE: true,
          DISABLE_INVITE_FUNCTIONS: true,
          DISABLE_DEEP_LINKING: true
        }
      };

      console.log('🔧 Creating Jitsi API...');

      // Create Jitsi API
      apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      console.log('✅ Jitsi API created successfully');
      
      // Set up event listeners
      setupJitsiEventListeners();
      
      // Force progress after 5 seconds if no events
      setTimeout(() => {
        if (mountedRef.current && connectionState === CONNECTION_STATES.LOADING_VIDEO) {
          console.log('🔄 No Jitsi events received, forcing progress...');
          setConnectionState(CONNECTION_STATES.WAITING_PARTNER);
          setLoadingMessage('');
          setTimerActive(true);
          toast.success('Video room ready! You can start focusing.');
        }
      }, 5000);
      
    } catch (error) {
      console.error('❌ Jitsi initialization error:', error);
      if (mountedRef.current) {
        // Don't show error, just skip to session
        console.log('🚀 Skipping video due to error, starting session...');
        setConnectionState(CONNECTION_STATES.WAITING_PARTNER);
        setLoadingMessage('');
        setTimerActive(true);
        toast('Starting session without video - you can still focus!', {
          icon: '📚',
          duration: 4000
        });
      }
    }
  };

  // Load Jitsi script
  const loadJitsiScript = () => {
    return new Promise((resolve, reject) => {
      if (window.JitsiMeetExternalAPI) {
        console.log('✅ Jitsi script already loaded');
        resolve();
        return;
      }

      console.log('📥 Loading Jitsi script from CDN...');
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      
      script.onload = () => {
        console.log('✅ Jitsi script loaded successfully');
        resolve();
      };
      
      script.onerror = (error) => {
        console.error('❌ Failed to load Jitsi script:', error);
        reject(new Error('Failed to load video system'));
      };
      
      document.body.appendChild(script);
      
      // Backup timeout
      setTimeout(() => {
        if (!window.JitsiMeetExternalAPI) {
          console.error('❌ Jitsi script load timeout');
          reject(new Error('Video system load timeout'));
        }
      }, 10000);
    });
  };

  // Set up Jitsi event listeners - SIMPLIFIED AND MORE RELIABLE
  const setupJitsiEventListeners = () => {
    if (!apiRef.current || !mountedRef.current) return;

    console.log('🎧 Setting up Jitsi event listeners...');

    // Clear loading timeout
    if (jitsiLoadTimeoutRef.current) {
      clearTimeout(jitsiLoadTimeoutRef.current);
      jitsiLoadTimeoutRef.current = null;
    }

    // Conference joined successfully
    apiRef.current.on('videoConferenceJoined', () => {
      if (!mountedRef.current) return;
      
      console.log('✅ Joined video conference successfully');
      setConnectionState(CONNECTION_STATES.CONNECTED);
      setLoadingMessage('');
      setTimerActive(true);
      
      // Start checking participant count
      setTimeout(checkParticipants, 1000);
      
      toast.success('🎉 Video session started! You can begin focusing now.');
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
      
      toast(`${participant.displayName || 'Study partner'} left the session`);
    });

    // Audio/Video events
    apiRef.current.on('audioMuteStatusChanged', ({ muted }) => {
      console.log('🎤 Audio mute status:', muted);
      setIsAudioMuted(muted);
    });

    apiRef.current.on('videoMuteStatusChanged', ({ muted }) => {
      console.log('📹 Video mute status:', muted);
      setIsVideoMuted(muted);
    });

    // Error handling - DON'T FAIL, JUST LOG
    apiRef.current.on('connectionFailed', () => {
      console.error('❌ Jitsi connection failed');
      if (mountedRef.current) {
        // Don't set error state, just start session without video
        setConnectionState(CONNECTION_STATES.WAITING_PARTNER);
        setTimerActive(true);
        toast('Video connection failed - continuing without video', {
          icon: '📚',
          duration: 4000
        });
      }
    });

    apiRef.current.on('readyToClose', () => {
      console.log('🚪 Jitsi ready to close');
      if (mountedRef.current) {
        endSession();
      }
    });

    // Conference errors - DON'T FAIL, JUST LOG
    apiRef.current.on('conferenceError', (error) => {
      console.error('❌ Conference error:', error);
      if (mountedRef.current) {
        // Don't set error state, just start session without video
        setConnectionState(CONNECTION_STATES.WAITING_PARTNER);
        setTimerActive(true);
        toast('Video had issues - continuing without video', {
          icon: '📚',
          duration: 4000
        });
      }
    });

    console.log('✅ Event listeners set up successfully');
  };

  // Check participant count - SIMPLIFIED 
  const checkParticipants = useCallback(() => {
    if (!apiRef.current || !mountedRef.current) return;

    try {
      const count = apiRef.current.getNumberOfParticipants();
      setParticipantCount(count);

      console.log('👥 Participants:', count);

      // Always ensure timer is active when participants are present
      if (count >= 1 && !timerActive) {
        setTimerActive(true);
        console.log('⏰ Timer activated with', count, 'participants');
      }

    } catch (error) {
      console.error('Error checking participants:', error);
      // Ensure timer is still active even if participant count fails
      if (!timerActive) {
        setTimerActive(true);
        console.log('⏰ Timer activated as fallback');
      }
    }
  }, [timerActive]);

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
        return 'Connecting video...';
      case CONNECTION_STATES.WAITING_PARTNER:
        if (timerActive) {
          return `Focus session active ${participantCount > 0 ? `(${participantCount} participants)` : ''}`;
        }
        return 'Setting up session...';
      case CONNECTION_STATES.CONNECTED:
        return `Video session active (${participantCount} participants)`;
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
      case CONNECTION_STATES.WAITING_PARTNER:
        return timerActive ? '#10b981' : '#f59e0b';
      case CONNECTION_STATES.FAILED:
        return '#ef4444';
      case CONNECTION_STATES.ENDED:
        return '#8b5cf6';
      default:
        return '#6b7280';
    }
  };

  // Loading state - FASTER SKIP OPTION
  if (connectionState === CONNECTION_STATES.INITIALIZING || 
      connectionState === CONNECTION_STATES.LOADING_SESSION ||
      connectionState === CONNECTION_STATES.LOADING_VIDEO) {
    
    const handleForceSkip = () => {
      console.log('🚀 Force skip triggered by user');
      setConnectionState(CONNECTION_STATES.WAITING_PARTNER);
      setLoadingMessage('');
      setTimerActive(true);
      toast.success('Skipped to session! Timer started - let\'s focus! 🎯');
    };

    return (
      <div className="video-session-loading">
        <div className="loading-container">
          <FiLoader className="spinner" />
          <h3>Setting up your focus session</h3>
          <p>{loadingMessage}</p>
          
          <div className="loading-progress">
            <div className="progress-steps">
              <div className={`step ${connectionState !== CONNECTION_STATES.INITIALIZING ? 'completed' : 'active'}`}>
                {connectionState !== CONNECTION_STATES.INITIALIZING ? <FiCheck /> : <FiLoader className="spinning" />} 
                Session loaded
              </div>
              <div className={`step ${connectionState === CONNECTION_STATES.LOADING_VIDEO ? 'active' : ''}`}>
                {connectionState === CONNECTION_STATES.LOADING_VIDEO ? <FiLoader className="spinning" /> : <FiClock />}
                Connecting video
              </div>
            </div>
            
            {/* Show skip button faster - after 3 seconds */}
            {(connectionState === CONNECTION_STATES.LOADING_VIDEO) && (
              <div className="force-skip-section" style={{ marginTop: '20px' }}>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                  Video taking too long? Start session immediately:
                </p>
                <button 
                  onClick={handleForceSkip}
                  className="btn-primary"
                  style={{ 
                    padding: '12px 24px',
                    fontSize: '16px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  🎯 Start Session Now
                </button>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                  (Auto-starts in {connectionState === CONNECTION_STATES.LOADING_VIDEO ? '10' : '15'} seconds)
                </p>
              </div>
            )}
          </div>
          
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
          
          {/* Compact Debug Info */}
          <div style={{ 
            marginTop: '16px', 
            fontSize: '11px', 
            color: '#999',
            textAlign: 'center'
          }}>
            <details>
              <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Debug Info</summary>
              <div style={{ 
                fontFamily: 'monospace', 
                textAlign: 'left',
                background: '#f8f9fa',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #eee'
              }}>
                <div>State: {connectionState}</div>
                <div>Session ID: {sessionId?.substring(0, 8)}...</div>
                <div>Has Session: {session ? 'Yes' : 'No'}</div>
                <div>Session Valid: {sessionValid ? 'Yes' : 'No'}</div>
                <div>Jitsi Loaded: {window.JitsiMeetExternalAPI ? 'Yes' : 'No'}</div>
                <div>Timer Active: {timerActive ? 'Yes' : 'No'}</div>
              </div>
            </details>
          </div>
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
          {/* Status Overlays - SIMPLIFIED */}
          {connectionState === CONNECTION_STATES.WAITING_PARTNER && !timerActive && (
            <div className="video-overlay">
              <FiUsers className="waiting-icon" />
              <h3>Session Loading</h3>
              <div className="waiting-dots">
                <span></span><span></span><span></span>
              </div>
              <p>Setting up your focus environment...</p>
            </div>
          )}

          {connectionState === CONNECTION_STATES.WAITING_PARTNER && timerActive && (
            <div className="video-overlay">
              <div className="session-active-icon">🎯</div>
              <h3>Focus Session Active!</h3>
              <p>You can start focusing now. Your partner can join anytime.</p>
              
              {/* Share session info */}
              {session?.partnerId === null && userRole === 'creator' && (
                <div className="waiting-help">
                  <p>💡 Others can join this session from the "Join" tab!</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Session Timer - ALWAYS SHOW WHEN ACTIVE */}
        {timerActive && (
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

        {/* Mobile Controls - SHOW WHEN SESSION IS ACTIVE */}
        {isMobile && timerActive && apiRef.current && (
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
                  connectionState === CONNECTION_STATES.CONNECTED && participantCount >= 2 ? '(Connected ✅)' : '(Joining...)'
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