import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import SessionChat from './SessionChat';
import { 
  FiPhoneOff,
  FiMessageCircle,
  FiRefreshCw,
  FiX,
  FiClock
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Refs for managing component state and cleanup
  const jitsiContainerRef = useRef(null);
  const apiRef = useRef(null);
  const scriptLoadedRef = useRef(false);
  const initializationRef = useRef(false);
  const sessionListenerRef = useRef(null);
  const mountedRef = useRef(true);
  const initTimeoutRef = useRef(null);
  const cleanupRef = useRef(false);
  
  // Component state
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jitsiReady, setJitsiReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [showChat, setShowChat] = useState(false);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [showWaitingModal, setShowWaitingModal] = useState(false);

  // Component mount/unmount tracking
  useEffect(() => {
    mountedRef.current = true;
    cleanupRef.current = false;
    return () => {
      mountedRef.current = false;
      cleanupRef.current = true;
    };
  }, []);

  // Auto-start session after timeout if still loading
  useEffect(() => {
    if (!loading) return;

    const loadingTimeout = setTimeout(() => {
      if (loading && mountedRef.current && !cleanupRef.current) {
        console.log('Auto-starting session after timeout');
        setLoading(false);
        setJitsiReady(true);
        setConnectionStatus('waiting');
        setShowWaitingModal(true);
      }
    }, 6000);

    return () => clearTimeout(loadingTimeout);
  }, [loading]);

  // End session function with improved cleanup
  const endSession = useCallback(async () => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;
    
    try {
      if (sessionId && session) {
        await updateDoc(doc(db, 'sessions', sessionId), {
          status: 'completed',
          endedAt: serverTimestamp(),
          actualDuration: session?.duration || 50
        });
      }

      // Clean up Jitsi
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          console.log('Error disposing Jitsi API:', e);
        }
        apiRef.current = null;
      }

      // Clear timeouts
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }

      // Reset refs
      initializationRef.current = false;
      scriptLoadedRef.current = false;

      toast.success('Session completed! Great work! 🎉');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error ending session:', error);
      toast.error('Error ending session');
      navigate('/dashboard');
    }
  }, [sessionId, session, navigate]);

  // Cancel session function with improved cleanup
  const cancelSession = useCallback(async () => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;
    
    try {
      if (sessionId) {
        await updateDoc(doc(db, 'sessions', sessionId), {
          status: 'cancelled',
          cancelledAt: serverTimestamp()
        });
      }

      // Clean up Jitsi
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          console.log('Error disposing Jitsi API:', e);
        }
        apiRef.current = null;
      }

      // Clear timeouts
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }

      // Reset refs
      initializationRef.current = false;
      scriptLoadedRef.current = false;

      toast.success('Session cancelled');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error cancelling session:', error);
      toast.error('Error cancelling session');
      navigate('/dashboard');
    }
  }, [sessionId, navigate]);

  // Setup event listeners for Jitsi API with improved error handling
  const setupEventListeners = useCallback(() => {
    if (!apiRef.current || !mountedRef.current || cleanupRef.current) return;

    console.log('Setting up Jitsi event listeners');

    try {
      // Remove any existing listeners first
      if (apiRef.current.removeAllListeners) {
        apiRef.current.removeAllListeners();
      }

      apiRef.current.on('participantJoined', (participant) => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.log('Participant joined:', participant);
        
        if (participant.id !== user?.uid) {
          setPartnerConnected(true);
          setConnectionStatus('connected');
          setShowWaitingModal(false);
          
          if (!sessionStarted) {
            setSessionStarted(true);
            toast.success(`${participant.displayName || 'Study partner'} joined! Let's focus! 🎉`);
          }
        }
      });

      apiRef.current.on('participantLeft', (participant) => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.log('Participant left:', participant);
        
        if (participant.id !== user?.uid) {
          setPartnerConnected(false);
          setConnectionStatus('waiting');
          toast(`${participant.displayName || 'Study partner'} left the session`);
        }
      });

      apiRef.current.on('videoConferenceJoined', () => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.log('Successfully joined video conference');
        setConnectionStatus('waiting');
        setError(null);
        setLoading(false);
        setJitsiReady(true);
        setShowWaitingModal(true);
        
        toast.success('Connected! Waiting for study partner...');
      });

      apiRef.current.on('videoConferenceLeft', () => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.log('Left video conference');
        setConnectionStatus('disconnected');
      });

      apiRef.current.on('readyToClose', () => {
        console.log('Jitsi ready to close');
        if (!cleanupRef.current) {
          endSession();
        }
      });

      apiRef.current.on('conferenceError', (error) => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.error('Conference error:', error);
        setError('Connection failed. Please try again.');
        setLoading(false);
      });
    } catch (error) {
      console.error('Error setting up event listeners:', error);
    }
  }, [endSession, user?.uid, sessionStarted]);

  // Initialize Jitsi Meet with improved debouncing and error handling
  const initializeJitsi = useCallback((sessionData) => {
    // Prevent multiple simultaneous initializations
    if (initializationRef.current || !mountedRef.current || cleanupRef.current) {
      console.log('Jitsi initialization already in progress or component unmounted');
      return;
    }

    console.log('Starting Jitsi initialization');
    initializationRef.current = true;
    
    // Clear any existing timeout
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }

    const roomName = `focusmate-${sessionId}`.replace(/[^a-zA-Z0-9-]/g, '');
    const domain = 'meet.jit.si';
    
    const options = {
      roomName: roomName,
      width: '100%',
      height: '100%',
      parentNode: jitsiContainerRef.current,
      userInfo: {
        displayName: user?.displayName || user?.email?.split('@')[0] || 'Student',
        email: user?.email
      },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false,
        disableInviteFunctions: true,
        disableDeepLinking: true,
        enableWelcomePage: false,
        enableUserRolesBasedOnToken: false,
        startScreenSharing: false,
        disableThirdPartyRequests: true,
        resolution: 720,
        constraints: {
          video: {
            aspectRatio: 16 / 9,
            height: {
              ideal: 720,
              max: 1080,
              min: 240
            }
          }
        }
      },
      interfaceConfigOverwrite: {
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
        MOBILE_APP_PROMO: false,
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DEFAULT_BACKGROUND: '#1a1a2e',
        TOOLBAR_BUTTONS: [],
        SETTINGS_SECTIONS: [],
        RECENT_LIST_ENABLED: false,
        DISPLAY_WELCOME_PAGE_CONTENT: false,
        SHOW_CHROME_EXTENSION_BANNER: false
      }
    };

    const loadJitsi = () => {
      if (cleanupRef.current || !mountedRef.current) return;

      if (!window.JitsiMeetExternalAPI && !scriptLoadedRef.current) {
        scriptLoadedRef.current = true;
        
        const script = document.createElement('script');
        script.src = 'https://meet.jit.si/external_api.js';
        script.async = true;
        
        script.onload = () => {
          if (!mountedRef.current || cleanupRef.current) {
            initializationRef.current = false;
            return;
          }
          
          initTimeoutRef.current = setTimeout(() => {
            if (!mountedRef.current || cleanupRef.current) {
              initializationRef.current = false;
              return;
            }
            
            try {
              // Dispose existing API if any
              if (apiRef.current) {
                try {
                  apiRef.current.dispose();
                } catch (e) {
                  console.log('Error disposing existing API:', e);
                }
              }
              
              apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
              setupEventListeners();
              setConnectionStatus('connecting');
              
            } catch (error) {
              console.error('Error initializing Jitsi:', error);
              initializationRef.current = false;
              if (mountedRef.current && !cleanupRef.current) {
                setLoading(false);
                setJitsiReady(true);
                setShowWaitingModal(true);
              }
            }
          }, 200);
        };
        
        script.onerror = (error) => {
          console.error('Failed to load Jitsi script:', error);
          initializationRef.current = false;
          if (mountedRef.current && !cleanupRef.current) {
            setLoading(false);
            setJitsiReady(true);
            setShowWaitingModal(true);
          }
        };
        
        document.body.appendChild(script);
        
      } else if (window.JitsiMeetExternalAPI) {
        initTimeoutRef.current = setTimeout(() => {
          if (!mountedRef.current || cleanupRef.current) {
            initializationRef.current = false;
            return;
          }
          
          try {
            // Dispose existing API if any
            if (apiRef.current) {
              try {
                apiRef.current.dispose();
              } catch (e) {
                console.log('Error disposing existing API:', e);
              }
            }
            
            apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
            setupEventListeners();
            setConnectionStatus('connecting');
            
          } catch (error) {
            console.error('Error initializing Jitsi:', error);
            initializationRef.current = false;
            if (mountedRef.current && !cleanupRef.current) {
              setLoading(false);
              setJitsiReady(true);
              setShowWaitingModal(true);
            }
          }
        }, 200);
      }
    };

    loadJitsi();
  }, [sessionId, user, setupEventListeners]);

  // Start solo session
  const startSoloSession = useCallback(() => {
    setConnectionStatus('solo');
    setPartnerConnected(false);
    setSessionStarted(true);
    setShowWaitingModal(false);
    toast.success('Solo session started! Stay focused! 🎯');
  }, []);

  // Retry connection with improved logic
  const retryConnection = useCallback(() => {
    if (retryAttempts >= 3 || !mountedRef.current || cleanupRef.current) {
      setError('Maximum retry attempts reached. Please refresh the page.');
      return;
    }

    setRetryAttempts(prev => prev + 1);
    setError(null);
    setLoading(true);
    setJitsiReady(false);
    setConnectionStatus('connecting');
    setShowWaitingModal(false);
    
    // Reset initialization state
    initializationRef.current = false;
    scriptLoadedRef.current = false;
    
    // Clean up existing API
    if (apiRef.current) {
      try {
        apiRef.current.dispose();
      } catch (e) {
        console.log('Error disposing during retry:', e);
      }
      apiRef.current = null;
    }
    
    // Clear any existing timeouts
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }
    
    // Retry initialization after a delay
    setTimeout(() => {
      if (session && mountedRef.current && !cleanupRef.current) {
        initializeJitsi(session);
      }
    }, 2000);
  }, [retryAttempts, session, initializeJitsi]);

  // Session listener effect - simplified and more stable
  useEffect(() => {
    if (!sessionId || !user || !mountedRef.current || cleanupRef.current) {
      console.log('Missing sessionId or user, or component unmounted');
      if (!sessionId || !user) {
        navigate('/dashboard');
      }
      return;
    }

    // Prevent multiple listeners
    if (sessionListenerRef.current) {
      console.log('Session listener already exists');
      return;
    }

    console.log('Setting up session listener for:', sessionId);

    // Force loading timeout
    const forceLoadingTimeout = setTimeout(() => {
      if (mountedRef.current && !cleanupRef.current && loading) {
        console.log('Force stopping loading after 8 seconds');
        setLoading(false);
        setJitsiReady(true);
        setShowWaitingModal(true);
      }
    }, 8000);

    // Set up session listener
    sessionListenerRef.current = onSnapshot(
      doc(db, 'sessions', sessionId), 
      (doc) => {
        if (!mountedRef.current || cleanupRef.current) return;
        
        if (doc.exists()) {
          const sessionData = { id: doc.id, ...doc.data() };
          
          // Check access permissions
          if (sessionData.userId !== user.uid && sessionData.partnerId !== user.uid) {
            setError('You do not have access to this session');
            setLoading(false);
            clearTimeout(forceLoadingTimeout);
            return;
          }
          
          setSession(sessionData);
          
          // Initialize Jitsi only once when session data is available
          if (jitsiContainerRef.current && !initializationRef.current && mountedRef.current && !cleanupRef.current) {
            // Add a small delay to ensure DOM is ready
            setTimeout(() => {
              if (mountedRef.current && !cleanupRef.current && !initializationRef.current) {
                initializeJitsi(sessionData);
              }
            }, 1000);
          }
        } else {
          setError('Session not found');
          setLoading(false);
          clearTimeout(forceLoadingTimeout);
        }
      },
      (error) => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.error('Error listening to session:', error);
        setError(`Error loading session: ${error.message}`);
        setLoading(false);
        clearTimeout(forceLoadingTimeout);
      }
    );

    // Cleanup function
    return () => {
      clearTimeout(forceLoadingTimeout);
      
      // Mark as cleanup started
      cleanupRef.current = true;
      
      // Clean up session listener
      if (sessionListenerRef.current) {
        sessionListenerRef.current();
        sessionListenerRef.current = null;
      }
      
      // Clean up Jitsi API
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          console.log('Error disposing on cleanup:', e);
        }
        apiRef.current = null;
      }
      
      // Clear timeouts
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      
      // Reset refs
      initializationRef.current = false;
      scriptLoadedRef.current = false;
    };
  }, [sessionId, user?.uid, navigate, initializeJitsi]);

  const onTimerComplete = useCallback(() => {
    toast.success('Time\'s up! Great focus session! 🎯');
    setTimeout(() => {
      if (!cleanupRef.current) {
        endSession();
      }
    }, 2000);
  }, [endSession]);

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connecting':
        return '🟡 Connecting...';
      case 'waiting':
        return '⏳ Waiting for partner';
      case 'connected':
        return '🟢 Connected with partner';
      case 'solo':
        return '🎯 Solo session active';
      case 'disconnected':
        return '🔴 Disconnected';
      default:
        return '🟡 Connecting...';
    }
  };

  // Error state
  if (error) {
    return (
      <div className="video-session-error">
        <div className="error-container">
          <h2>Connection Error</h2>
          <p>{error}</p>
          <div className="error-actions">
            <button className="btn-primary" onClick={retryConnection}>
              <FiRefreshCw /> Retry Connection
            </button>
            <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
          {retryAttempts > 0 && (
            <p className="retry-info">Retry attempt: {retryAttempts}/3</p>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="video-session-loading">
        <div className="loading-container">
          <div className="spinner"></div>
          <p className="status-text">Setting up your focus session...</p>
          <small>Please wait while we prepare everything</small>
        </div>
      </div>
    );
  }

  return (
    <div className="video-session-container">
      {/* Header */}
      <div className="video-header">
        <div className="session-info">
          <h3>{session?.goal || 'Focus Session'}</h3>
          <div className="session-status">
            <span className="duration-badge">
              <FiClock /> {session?.duration || 50} min
            </span>
            <span className={`status-indicator ${connectionStatus}`}>
              {getConnectionStatusText()}
            </span>
            {session?.partnerId && partnerConnected && (
              <span className="partner-info">
                👥 with {session.partnerName || 'Study Partner'}
              </span>
            )}
          </div>
        </div>
        
        <div className="header-controls">
          <button 
            onClick={() => setShowChat(!showChat)} 
            className={`control-btn ${showChat ? 'active' : ''}`}
            title="Toggle chat"
          >
            <FiMessageCircle />
          </button>
          
          <button 
            onClick={endSession} 
            className="control-btn end-call"
            title="End session"
          >
            <FiPhoneOff />
            <span className="btn-text">End Session</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="video-content">
        <div className="session-layout">
          {/* Video Container */}
          <div className="video-main">
            <div ref={jitsiContainerRef} className="jitsi-container">
              {/* Loading indicator while Jitsi loads */}
              {connectionStatus === 'connecting' && (
                <div className="video-placeholder">
                  <div className="connection-status">
                    <div className="spinner"></div>
                    <p>Connecting to video conference...</p>
                    <small>Setting up your session</small>
                  </div>
                </div>
              )}
            </div>
            
            {/* Timer Overlay */}
            {(sessionStarted || connectionStatus === 'solo') && (
              <div className="timer-overlay">
                <SessionTimer 
                  duration={session?.duration || 50} 
                  onComplete={onTimerComplete}
                  autoStart={true}
                  showBreakReminder={false}
                  isOverlay={true}
                />
              </div>
            )}
          </div>
          
          {/* Chat Sidebar */}
          {showChat && (
            <div className="chat-sidebar">
              <SessionChat
                sessionId={sessionId}
                userId={user.uid}
                userName={user.displayName || user.email?.split('@')[0] || 'User'}
                partnerId={session?.partnerId}
                partnerName={session?.partnerName}
              />
            </div>
          )}
        </div>

        {/* Session Details */}
        <div className="session-details-overlay">
          <div className="detail-item">
            <span>Goal</span>
            <p>{session?.goal || 'Loading...'}</p>
          </div>
          <div className="detail-item">
            <span>Status</span>
            <p className={connectionStatus === 'connected' || connectionStatus === 'solo' ? 'status-active' : ''}>
              {getConnectionStatusText()}
            </p>
          </div>
          {session?.partnerId ? (
            <div className="detail-item">
              <span>Study Partner</span>
              <p className={partnerConnected ? "status-active" : ""}>
                {session.partnerName || 'Study Partner'}
                {partnerConnected ? ' (Connected)' : ' (Not connected)'}
              </p>
            </div>
          ) : (
            <div className="detail-item">
              <span>Mode</span>
              <p>Looking for study partner...</p>
            </div>
          )}
        </div>
      </div>

      {/* Waiting for Partner Modal */}
      {showWaitingModal && connectionStatus === 'waiting' && !partnerConnected && (
        <div className="waiting-modal-overlay">
          <div className="waiting-modal">
            <div className="waiting-content">
              <div className="waiting-icon">👥</div>
              <h3>Ready to Focus! 🎯</h3>
              <p>Your session is ready and others can join</p>
              <p>You can start solo or wait for a partner</p>
              
              <div className="waiting-tips">
                <p>💡 <strong>While you wait:</strong></p>
                <ul>
                  <li>• Your room is active and searchable</li>
                  <li>• Partners can join anytime during your session</li>
                  <li>• You can start focusing immediately</li>
                </ul>
              </div>
              
              <div className="waiting-actions">
                <button 
                  className="btn-primary"
                  onClick={startSoloSession}
                >
                  Start Solo Session
                </button>
                <button 
                  className="btn-secondary"
                  onClick={cancelSession}
                >
                  <FiX /> Cancel Session
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoSession;