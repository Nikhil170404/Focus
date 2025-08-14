import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import SessionChat from './SessionChat';
import { 
  FiVideo, 
  FiVideoOff, 
  FiMic, 
  FiMicOff, 
  FiPhoneOff,
  FiMaximize2,
  FiMinimize2,
  FiClock,
  FiMessageCircle,
  FiRefreshCw
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const jitsiContainerRef = useRef(null);
  const apiRef = useRef(null);
  const scriptLoadedRef = useRef(false);
  const initializationRef = useRef(false);
  const sessionListenerRef = useRef(null);
  const mountedRef = useRef(true);
  
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [jitsiReady, setJitsiReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [showChat, setShowChat] = useState(false);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);

  // Component mount/unmount tracking
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Force loading to false after 5 seconds maximum
  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      if (loading && mountedRef.current) {
        console.log('Force stopping loading after 5 seconds');
        setLoading(false);
        setJitsiReady(true);
        if (!sessionStarted) {
          setSessionStarted(true);
          setTimerStarted(true);
        }
      }
    }, 5000);

    return () => clearTimeout(loadingTimeout);
  }, [loading, sessionStarted]);

  // End session function
  const endSession = useCallback(async () => {
    try {
      if (sessionId && session) {
        await updateDoc(doc(db, 'sessions', sessionId), {
          status: 'completed',
          endedAt: serverTimestamp(),
          actualDuration: session?.duration || 50
        });
      }

      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          console.log('Error disposing Jitsi API:', e);
        }
        apiRef.current = null;
      }

      toast.success('Session completed! Great work! 🎉');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error ending session:', error);
      toast.error('Error ending session');
      navigate('/dashboard');
    }
  }, [sessionId, session, navigate]);

  // Setup event listeners for Jitsi API - simplified
  const setupEventListeners = useCallback(() => {
    if (!apiRef.current || !mountedRef.current) return;

    console.log('Setting up Jitsi event listeners');

    try {
      apiRef.current.on('audioMuteStatusChanged', (status) => {
        if (!mountedRef.current) return;
        console.log('Audio mute status:', status.muted);
        setIsAudioMuted(status.muted);
      });

      apiRef.current.on('videoMuteStatusChanged', (status) => {
        if (!mountedRef.current) return;
        console.log('Video mute status:', status.muted);
        setIsVideoMuted(status.muted);
      });

      apiRef.current.on('readyToClose', () => {
        console.log('Jitsi ready to close');
        endSession();
      });

      apiRef.current.on('participantJoined', (participant) => {
        if (!mountedRef.current) return;
        console.log('Participant joined:', participant);
        setConnectionStatus('connected');
        setPartnerConnected(true);
        
        // Start the session when someone joins
        if (!sessionStarted) {
          setSessionStarted(true);
          setTimerStarted(true);
        }
        
        if (participant.id !== user?.uid) {
          toast.success(`${participant.displayName || 'Study partner'} joined! 🎉`);
        }
      });

      apiRef.current.on('participantLeft', (participant) => {
        if (!mountedRef.current) return;
        console.log('Participant left:', participant);
        if (participant.id !== user?.uid) {
          setPartnerConnected(false);
          toast(`${participant.displayName || 'Study partner'} left the session`);
          setConnectionStatus('waiting');
        }
      });

      apiRef.current.on('videoConferenceJoined', () => {
        if (!mountedRef.current) return;
        console.log('Successfully joined video conference');
        setConnectionStatus('connected');
        setError(null);
        setLoading(false);
        setJitsiReady(true);
        
        // Start the session immediately when user joins
        if (!sessionStarted) {
          setSessionStarted(true);
          setTimerStarted(true);
          toast.success('Session started! Stay focused! 🎯');
        }
      });

      apiRef.current.on('videoConferenceLeft', () => {
        if (!mountedRef.current) return;
        console.log('Left video conference');
        setConnectionStatus('disconnected');
      });

      // Conference error handling
      apiRef.current.on('conferenceError', (error) => {
        if (!mountedRef.current) return;
        console.error('Conference error:', error);
        setError('Failed to join conference. Please try again.');
        setLoading(false);
      });
    } catch (error) {
      console.error('Error setting up event listeners:', error);
    }
  }, [endSession, user?.uid, sessionStarted]);

  // Initialize Jitsi Meet - simplified and only call once
  const initializeJitsi = useCallback((sessionData) => {
    // Prevent multiple initializations
    if (initializationRef.current || !mountedRef.current) {
      console.log('Jitsi already initializing or component unmounted');
      return;
    }

    console.log('Starting Jitsi initialization with session:', sessionData);
    initializationRef.current = true;
    
    // Clean room name for Jitsi
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
        resolution: 480,
        constraints: {
          video: {
            aspectRatio: 16 / 9,
            height: {
              ideal: 480,
              max: 720,
              min: 240
            }
          }
        },
        toolbarButtons: [
          'microphone',
          'camera',
          'closedcaptions',
          'desktop',
          'fullscreen',
          'fodeviceselection',
          'hangup',
          'chat',
          'videoquality'
        ]
      },
      interfaceConfigOverwrite: {
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
        MOBILE_APP_PROMO: false,
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DEFAULT_BACKGROUND: '#1a1a2e',
        TOOLBAR_BUTTONS: [
          'microphone',
          'camera',
          'closedcaptions',
          'desktop',
          'fullscreen',
          'fodeviceselection',
          'hangup',
          'chat',
          'videoquality'
        ],
        SETTINGS_SECTIONS: ['devices', 'language', 'moderator', 'profile', 'calendar'],
        RECENT_LIST_ENABLED: false,
        DISPLAY_WELCOME_PAGE_CONTENT: false,
        SHOW_CHROME_EXTENSION_BANNER: false
      }
    };

    // Load Jitsi API if not already loaded
    if (!window.JitsiMeetExternalAPI && !scriptLoadedRef.current) {
      console.log('Loading Jitsi script...');
      scriptLoadedRef.current = true;
      
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      
      script.onload = () => {
        if (!mountedRef.current) return;
        console.log('Jitsi script loaded successfully');
        
        try {
          // Clear any existing instance
          if (apiRef.current) {
            try {
              apiRef.current.dispose();
            } catch (e) {
              console.log('Error disposing previous instance:', e);
            }
          }
          
          // Initialize Jitsi
          setTimeout(() => {
            if (!mountedRef.current) return;
            try {
              apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
              setupEventListeners();
              setConnectionStatus('connecting');
              
              // Set a timeout to handle cases where Jitsi doesn't load
              setTimeout(() => {
                if (!mountedRef.current) return;
                setLoading(false);
                setJitsiReady(true);
                setConnectionStatus('waiting');
                if (!sessionStarted) {
                  setSessionStarted(true);
                  setTimerStarted(true);
                  toast.success('Session started! You can begin studying! 📚');
                }
              }, 3000);
            } catch (error) {
              console.error('Error initializing Jitsi:', error);
              if (mountedRef.current) {
                setLoading(false);
                setJitsiReady(true);
                if (!sessionStarted) {
                  setSessionStarted(true);
                  setTimerStarted(true);
                }
              }
            }
          }, 100);
          
        } catch (error) {
          console.error('Error initializing Jitsi:', error);
          if (mountedRef.current) {
            setLoading(false);
            setJitsiReady(true);
            if (!sessionStarted) {
              setSessionStarted(true);
              setTimerStarted(true);
            }
            initializationRef.current = false;
          }
        }
      };
      
      script.onerror = (error) => {
        console.error('Failed to load Jitsi script:', error);
        if (mountedRef.current) {
          setLoading(false);
          setJitsiReady(true);
          if (!sessionStarted) {
            setSessionStarted(true);
            setTimerStarted(true);
          }
          initializationRef.current = false;
        }
      };
      
      document.body.appendChild(script);
      
    } else if (window.JitsiMeetExternalAPI) {
      console.log('Using existing Jitsi API');
      
      try {
        // Clear any existing instance
        if (apiRef.current) {
          try {
            apiRef.current.dispose();
          } catch (e) {
            console.log('Error disposing previous instance:', e);
          }
        }
        
        // Initialize Jitsi
        setTimeout(() => {
          if (!mountedRef.current) return;
          try {
            apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
            setupEventListeners();
            setConnectionStatus('connecting');
            
            // Set a timeout to handle cases where Jitsi doesn't load
            setTimeout(() => {
              if (!mountedRef.current) return;
              setLoading(false);
              setJitsiReady(true);
              setConnectionStatus('waiting');
              if (!sessionStarted) {
                setSessionStarted(true);
                setTimerStarted(true);
                toast.success('Session started! You can begin studying! 📚');
              }
            }, 3000);
          } catch (error) {
            console.error('Error initializing Jitsi:', error);
            if (mountedRef.current) {
              setLoading(false);
              setJitsiReady(true);
              if (!sessionStarted) {
                setSessionStarted(true);
                setTimerStarted(true);
              }
            }
          }
        }, 100);
        
      } catch (error) {
        console.error('Error initializing Jitsi:', error);
        if (mountedRef.current) {
          setLoading(false);
          setJitsiReady(true);
          if (!sessionStarted) {
            setSessionStarted(true);
            setTimerStarted(true);
          }
          initializationRef.current = false;
        }
      }
    }
  }, [sessionId, user, setupEventListeners, sessionStarted]);

  // Retry connection function - simplified
  const retryConnection = useCallback(() => {
    if (retryAttempts >= 3 || !mountedRef.current) {
      setError('Maximum retry attempts reached. Please refresh the page.');
      return;
    }

    setRetryAttempts(prev => prev + 1);
    setError(null);
    setLoading(true);
    setJitsiReady(false);
    setConnectionStatus('connecting');
    
    // Reset initialization flag
    initializationRef.current = false;
    
    // Dispose existing instance
    if (apiRef.current) {
      try {
        apiRef.current.dispose();
      } catch (e) {
        console.log('Error disposing during retry:', e);
      }
      apiRef.current = null;
    }
    
    // Clear the script loaded flag to force reload
    scriptLoadedRef.current = false;
    
    // Retry initialization
    setTimeout(() => {
      if (session && mountedRef.current) {
        initializeJitsi(session);
      } else if (mountedRef.current) {
        setLoading(false);
        setJitsiReady(true);
        if (!sessionStarted) {
          setSessionStarted(true);
          setTimerStarted(true);
        }
      }
    }, 1000);
  }, [retryAttempts, session, sessionStarted, initializeJitsi]);

  // Main effect for session management - SIMPLIFIED to prevent infinite loop
  useEffect(() => {
    if (!sessionId || !user || !mountedRef.current) {
      console.log('Missing sessionId or user, redirecting to dashboard');
      navigate('/dashboard');
      return;
    }

    // Prevent multiple listeners
    if (sessionListenerRef.current) {
      console.log('Session listener already exists, skipping setup');
      return;
    }

    console.log('Setting up session listener for sessionId:', sessionId);

    // Set a timeout to force loading to stop
    const forceLoadingTimeout = setTimeout(() => {
      if (mountedRef.current) {
        console.log('Forcing loading to stop due to timeout');
        setLoading(false);
        setJitsiReady(true);
        if (!sessionStarted) {
          setSessionStarted(true);
          setTimerStarted(true);
        }
      }
    }, 8000);

    // Listen to session changes - ONLY ONCE
    sessionListenerRef.current = onSnapshot(
      doc(db, 'sessions', sessionId), 
      (doc) => {
        if (!mountedRef.current) return;
        
        console.log('Session snapshot received:', doc.exists());
        
        if (doc.exists()) {
          const sessionData = { id: doc.id, ...doc.data() };
          console.log('Session data:', sessionData);
          
          // Verify user access
          if (sessionData.userId !== user.uid && sessionData.partnerId !== user.uid) {
            console.error('User does not have access to this session');
            setError('You do not have access to this session');
            setLoading(false);
            clearTimeout(forceLoadingTimeout);
            return;
          }
          
          setSession(sessionData);
          
          // Initialize Jitsi ONLY ONCE when container is ready and we have session data
          if (jitsiContainerRef.current && !initializationRef.current && mountedRef.current) {
            console.log('Initializing Jitsi with session data');
            // Small delay to ensure everything is ready
            setTimeout(() => {
              if (mountedRef.current) {
                initializeJitsi(sessionData);
              }
            }, 500);
          } else if (!initializationRef.current) {
            // If Jitsi container is not ready, still stop loading after some time
            setTimeout(() => {
              if (mountedRef.current) {
                setLoading(false);
                setJitsiReady(true);
                if (!sessionStarted) {
                  setSessionStarted(true);
                  setTimerStarted(true);
                }
              }
            }, 2000);
          }
        } else {
          console.log('Session document does not exist');
          setError('Session not found');
          setLoading(false);
          clearTimeout(forceLoadingTimeout);
        }
      },
      (error) => {
        if (!mountedRef.current) return;
        console.error('Error listening to session:', error);
        setError(`Error loading session: ${error.message}`);
        setLoading(false);
        clearTimeout(forceLoadingTimeout);
      }
    );

    return () => {
      clearTimeout(forceLoadingTimeout);
      if (sessionListenerRef.current) {
        sessionListenerRef.current();
        sessionListenerRef.current = null;
      }
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          console.log('Error disposing on cleanup:', e);
        }
        apiRef.current = null;
      }
      initializationRef.current = false;
    };
  }, [sessionId, user?.uid]); // MINIMAL dependencies to prevent infinite loop

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleAudio = useCallback(() => {
    if (apiRef.current) {
      try {
        apiRef.current.executeCommand('toggleAudio');
      } catch (e) {
        console.log('Error toggling audio:', e);
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (apiRef.current) {
      try {
        apiRef.current.executeCommand('toggleVideo');
      } catch (e) {
        console.log('Error toggling video:', e);
      }
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
        toast.error('Fullscreen not supported');
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error('Error attempting to exit fullscreen:', err);
      });
    }
  }, []);

  const onTimerComplete = useCallback(() => {
    toast.success('Time\'s up! Great focus session! 🎯');
    setTimeout(() => {
      endSession();
    }, 2000);
  }, [endSession]);

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connecting':
        return '🟡 Connecting to video...';
      case 'waiting':
        return partnerConnected ? '🟢 Connected' : '⏳ Ready - Waiting for partner';
      case 'connected':
        return partnerConnected ? '🟢 Connected with partner' : '🟢 Solo session active';
      case 'disconnected':
        return '🔴 Disconnected';
      default:
        return '🟡 Connecting...';
    }
  };

  // Start solo session function
  const startSoloSession = () => {
    setConnectionStatus('connected');
    setPartnerConnected(false);
    if (!sessionStarted) {
      setSessionStarted(true);
      setTimerStarted(true);
      toast.success('Solo session started! Stay focused! 🎯');
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

  // Show session interface even while loading
  return (
    <div className={`video-session-container ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Header */}
      <div className="video-header">
        <div className="session-info">
          <h3>{session?.goal || 'Focus Session'}</h3>
          <div className="session-status">
            <span className="duration-badge">
              <FiClock /> {session?.duration || 50} min session
            </span>
            <span className={`status-indicator ${connectionStatus}`}>
              {getConnectionStatusText()}
            </span>
            {session?.partnerId && (
              <span className="partner-info">
                👥 with {session.partnerName || 'Study Partner'}
              </span>
            )}
          </div>
        </div>
        
        <div className="header-controls">
          <button 
            onClick={toggleAudio} 
            className={`control-btn ${isAudioMuted ? 'muted' : ''}`}
            disabled={!apiRef.current && jitsiReady}
            title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isAudioMuted ? <FiMicOff /> : <FiMic />}
          </button>
          
          <button 
            onClick={toggleVideo} 
            className={`control-btn ${isVideoMuted ? 'muted' : ''}`}
            disabled={!apiRef.current && jitsiReady}
            title={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
          >
            {isVideoMuted ? <FiVideoOff /> : <FiVideo />}
          </button>
          
          <button 
            onClick={() => setShowChat(!showChat)} 
            className={`control-btn ${showChat ? 'active' : ''}`}
            title="Toggle chat"
          >
            <FiMessageCircle />
          </button>
          
          <button 
            onClick={toggleFullscreen} 
            className="control-btn"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
          </button>
          
          <button 
            onClick={endSession} 
            className="control-btn end-call"
            title="End session"
          >
            <FiPhoneOff />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="video-content">
        <div className="session-layout">
          {/* Video Container */}
          <div className="video-main">
            <div ref={jitsiContainerRef} className="jitsi-container">
              {/* Show loading or connection status */}
              {(loading || (!jitsiReady && connectionStatus === 'connecting')) && (
                <div className="video-placeholder">
                  <div className="connection-status">
                    <div className="spinner"></div>
                    <p>Initializing video conference...</p>
                    <small>Please wait while we set up your session</small>
                  </div>
                </div>
              )}
              
              {/* Show waiting for partner */}
              {jitsiReady && connectionStatus === 'waiting' && !partnerConnected && (
                <div className="video-placeholder">
                  <div className="connection-status">
                    <div className="waiting-icon">👥</div>
                    <p>Ready to focus! 🎯</p>
                    <small>Waiting for your study partner to join...</small>
                    <div className="partner-waiting">
                      <p>💡 Your session is ready and others can join</p>
                      <p>🔗 They can find this session in the dashboard</p>
                      <p>⏳ You can start solo or wait for a partner</p>
                      <button 
                        className="btn-primary start-solo-btn"
                        onClick={startSoloSession}
                      >
                        Start Solo Session
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Timer Overlay - Always show if session started */}
            {(timerStarted || sessionStarted) && (
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

        {/* Session Details Panel */}
        <div className="session-details-overlay">
          <div className="detail-item">
            <span>Goal</span>
            <p>{session?.goal || 'Loading...'}</p>
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
              <span>Status</span>
              <p>🔍 Looking for study partner...</p>
              <small>Others can join your session once they find it</small>
            </div>
          )}
          <div className="detail-item">
            <span>Connection</span>
            <p className={connectionStatus === 'connected' ? 'status-active' : ''}>
              {getConnectionStatusText()}
            </p>
          </div>
          {sessionStarted && (
            <div className="detail-item">
              <span>Session Status</span>
              <p className="status-active">
                🎯 Active - Timer running
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VideoSession;