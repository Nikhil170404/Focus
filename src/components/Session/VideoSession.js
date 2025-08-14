import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import { 
  FiPhoneOff,
  FiRefreshCw,
  FiX,
  FiClock,
  FiUsers,
  FiVideo,
  FiVideoOff,
  FiMic,
  FiMicOff
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
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [showWaitingModal, setShowWaitingModal] = useState(false);
  const [participantCount, setParticipantCount] = useState(1); // Initialize to 1 (current user)
  const [mediaEnabled, setMediaEnabled] = useState({ video: true, audio: true });
  const [networkStatus, setNetworkStatus] = useState('online');

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network: Online');
      setNetworkStatus('online');
      if (error && error.includes('network')) {
        setError(null);
      }
    };

    const handleOffline = () => {
      console.log('Network: Offline');
      setNetworkStatus('offline');
      setError('No internet connection. Please check your network and try again.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial network status
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [error]);

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
        console.log('Auto-starting session after timeout - showing waiting modal');
        setLoading(false);
        setJitsiReady(true);
        setConnectionStatus('waiting');
        setShowWaitingModal(true);
        setParticipantCount(1); // Set to 1 when showing waiting modal
      }
    }, 6000);

    return () => clearTimeout(loadingTimeout);
  }, [loading]);

  // End session function with improved cleanup - stable version
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

  // Cancel session function with improved cleanup - stable version
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

  // Setup event listeners for Jitsi API with enhanced partner handling - stable version
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
        console.log('Current user ID:', user?.uid);
        console.log('Participant ID:', participant.id);
        
        // Update participant count
        setParticipantCount(prev => {
          const newCount = prev + 1;
          console.log('Participant count updated from', prev, 'to', newCount);
          return newCount;
        });
        
        if (participant.id !== user?.uid) {
          console.log('Partner connected! Hiding waiting modal and starting session');
          setPartnerConnected(true);
          setConnectionStatus('connected');
          setShowWaitingModal(false);
          
          if (!sessionStarted) {
            setSessionStarted(true);
            toast.success(`${participant.displayName || 'Study partner'} joined! Let's focus together! 🎉`);
          }
        }
      });

      apiRef.current.on('participantLeft', (participant) => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.log('Participant left:', participant);
        console.log('Participant ID that left:', participant.id);
        console.log('Current user ID:', user?.uid);
        
        // Update participant count
        setParticipantCount(prev => {
          const newCount = Math.max(1, prev - 1); // Never go below 1 (current user)
          console.log('Participant count updated from', prev, 'to', newCount);
          return newCount;
        });
        
        if (participant.id !== user?.uid) {
          console.log('Partner left! Showing waiting modal again');
          setPartnerConnected(false);
          setConnectionStatus('waiting');
          toast(`${participant.displayName || 'Study partner'} left the session`);
          
          // Show waiting modal again if no partner
          setShowWaitingModal(true);
          setSessionStarted(false);
        }
      });

      apiRef.current.on('videoConferenceJoined', () => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.log('Successfully joined video conference');
        
        // Set participant count to 1 (self) immediately
        setParticipantCount(1);
        
        // Clear loading and show waiting modal
        setError(null);
        setLoading(false);
        setJitsiReady(true);
        
        // Always start in waiting mode
        setConnectionStatus('waiting');
        setShowWaitingModal(true);
        
        toast.success('Connected to video room! Waiting for study partner...');
      });

      apiRef.current.on('videoConferenceLeft', () => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.log('Left video conference');
        setConnectionStatus('disconnected');
        setParticipantCount(0);
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
        setError('Video connection failed. Please refresh to try again.');
        setLoading(false);
        setConnectionStatus('error');
      });

      // Media control events
      apiRef.current.on('audioMuteStatusChanged', (data) => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.log('Audio mute status changed:', data);
        setMediaEnabled(prev => ({ ...prev, audio: !data.muted }));
      });

      apiRef.current.on('videoMuteStatusChanged', (data) => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.log('Video mute status changed:', data);
        setMediaEnabled(prev => ({ ...prev, video: !data.muted }));
      });

    } catch (error) {
      console.error('Error setting up event listeners:', error);
      setError('Failed to setup video connection properly');
      setLoading(false);
    }
  }, [user?.uid]); // Removed endSession and sessionStarted from dependencies

  // Initialize Jitsi Meet with robust error handling - stable version
  const initializeJitsi = useCallback((sessionData) => {
    // Prevent multiple simultaneous initializations
    if (initializationRef.current || !mountedRef.current || cleanupRef.current || apiRef.current) {
      console.log('Jitsi initialization skipped - already in progress, component unmounted, or API exists');
      return;
    }

    console.log('Starting Jitsi initialization for session:', sessionData.id);
    initializationRef.current = true;
    
    // Clear any existing timeout
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }

    const roomName = `focusmate-${sessionId}`.replace(/[^a-zA-Z0-9-]/g, '');
    const domain = 'meet.jit.si';
    
    console.log('Creating Jitsi room:', roomName);
    console.log('Session ID:', sessionId);
    console.log('User:', user?.displayName || user?.email);
    console.log('Session data for Jitsi:', sessionData);
    
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
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'hangup', 'settings', 'fullscreen'
        ],
        SETTINGS_SECTIONS: ['devices', 'language'],
        RECENT_LIST_ENABLED: false,
        DISPLAY_WELCOME_PAGE_CONTENT: false,
        SHOW_CHROME_EXTENSION_BANNER: false
      }
    };

    const initializeAPI = () => {
      if (!mountedRef.current || cleanupRef.current || apiRef.current) {
        initializationRef.current = false;
        return;
      }

      try {
        console.log('Creating new Jitsi API instance');
        apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
        setupEventListeners();
        setConnectionStatus('connecting');
        
      } catch (error) {
        console.error('Error creating Jitsi API:', error);
        initializationRef.current = false;
        if (mountedRef.current && !cleanupRef.current) {
          setError('Failed to initialize video connection. Please refresh and try again.');
          setLoading(false);
          setConnectionStatus('error');
        }
      }
    };

    const loadJitsiScript = () => {
      if (cleanupRef.current || !mountedRef.current) {
        initializationRef.current = false;
        return;
      }

      if (window.JitsiMeetExternalAPI) {
        console.log('Jitsi API already available');
        initTimeoutRef.current = setTimeout(initializeAPI, 500);
        return;
      }

      if (scriptLoadedRef.current) {
        console.log('Jitsi script already loading, waiting...');
        // Wait for existing script to load
        const checkInterval = setInterval(() => {
          if (window.JitsiMeetExternalAPI) {
            clearInterval(checkInterval);
            if (!mountedRef.current || cleanupRef.current || apiRef.current) {
              initializationRef.current = false;
              return;
            }
            initTimeoutRef.current = setTimeout(initializeAPI, 500);
          }
        }, 100);
        
        // Cleanup interval after 10 seconds
        setTimeout(() => clearInterval(checkInterval), 10000);
        return;
      }

      console.log('Loading Jitsi script');
      scriptLoadedRef.current = true;
      
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      
      script.onload = () => {
        console.log('Jitsi script loaded successfully');
        if (!mountedRef.current || cleanupRef.current || apiRef.current) {
          initializationRef.current = false;
          return;
        }
        
        initTimeoutRef.current = setTimeout(initializeAPI, 500);
      };
      
      script.onerror = (error) => {
        console.error('Failed to load Jitsi script:', error);
        initializationRef.current = false;
        scriptLoadedRef.current = false;
        if (mountedRef.current && !cleanupRef.current) {
          setError('Failed to load video system. Please check your internet connection and refresh.');
          setLoading(false);
          setConnectionStatus('error');
        }
      };
      
      document.body.appendChild(script);
    };

    loadJitsiScript();
  }, [sessionId, user?.uid]); // Removed setupEventListeners from dependencies

  // Start session with partner - only when both are connected
  const startPartnerSession = useCallback(() => {
    console.log('Starting partner session');
    setConnectionStatus('connected');
    setSessionStarted(true);
    setShowWaitingModal(false);
    toast.success('Partner session started! Focus together! 🤝');
  }, []);

  // Retry connection with improved logic
  const retryConnection = useCallback(() => {
    if (retryAttempts >= 3 || !mountedRef.current || cleanupRef.current) {
      setError('Maximum retry attempts reached. Please refresh the page.');
      return;
    }

    console.log(`Retrying connection (attempt ${retryAttempts + 1}/3)`);
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

  // Session listener effect - fixed to prevent infinite loops
  useEffect(() => {
    // Early return if missing required data
    if (!sessionId || !user?.uid) {
      console.log('Missing sessionId or user, redirecting to dashboard');
      navigate('/dashboard');
      return;
    }

    if (!mountedRef.current || cleanupRef.current) {
      console.log('Component unmounted, skipping session setup');
      return;
    }

    // Prevent multiple listeners
    if (sessionListenerRef.current) {
      console.log('Session listener already exists, skipping');
      return;
    }

    console.log('Setting up session listener for:', sessionId);

    // Force loading timeout - fallback to prevent infinite loading
    const forceLoadingTimeout = setTimeout(() => {
      if (mountedRef.current && !cleanupRef.current) {
        console.log('Force stopping loading after 5 seconds');
        setLoading(false);
        setJitsiReady(true);
        setConnectionStatus('waiting');
        setShowWaitingModal(true);
      }
    }, 5000);

    // Set up session listener
    try {
      sessionListenerRef.current = onSnapshot(
        doc(db, 'sessions', sessionId), 
        (docSnap) => {
          if (!mountedRef.current || cleanupRef.current) return;
          
          if (docSnap.exists()) {
            const sessionData = { id: docSnap.id, ...docSnap.data() };
            console.log('Session data received:', sessionData);
            
            // Check access permissions
            if (sessionData.userId !== user.uid && sessionData.partnerId !== user.uid) {
              console.error('Access denied to session');
              setError('You do not have access to this session');
              setLoading(false);
              clearTimeout(forceLoadingTimeout);
              return;
            }
            
            setSession(sessionData);
            
            // Check if we have a partner
            const hasPartner = sessionData.partnerId && sessionData.partnerName;
            console.log('Session has partner:', hasPartner, sessionData.partnerId, sessionData.partnerName);
            console.log('Current user is:', sessionData.userId === user.uid ? 'session owner' : 'partner');
            console.log('Full session data:', sessionData);
            
            // Initialize Jitsi only once when we have session data and container is ready
            if (jitsiContainerRef.current && !initializationRef.current && !apiRef.current) {
              console.log('Initializing Jitsi for session');
              // Use a timeout to prevent rapid re-initialization
              setTimeout(() => {
                if (mountedRef.current && !cleanupRef.current && !initializationRef.current && !apiRef.current) {
                  initializeJitsi(sessionData);
                }
              }, 1000);
            }
          } else {
            console.error('Session document does not exist');
            setError('Session not found');
            setLoading(false);
            clearTimeout(forceLoadingTimeout);
          }
        },
        (error) => {
          if (!mountedRef.current || cleanupRef.current) return;
          console.error('Session listener error:', error);
          setError(`Error loading session: ${error.message}`);
          setLoading(false);
          clearTimeout(forceLoadingTimeout);
        }
      );
    } catch (error) {
      console.error('Error setting up session listener:', error);
      setError('Failed to connect to session');
      setLoading(false);
      clearTimeout(forceLoadingTimeout);
    }

    // Cleanup function
    return () => {
      console.log('Cleaning up session listener');
      clearTimeout(forceLoadingTimeout);
      
      if (sessionListenerRef.current) {
        sessionListenerRef.current();
        sessionListenerRef.current = null;
      }
    };
  }, [sessionId, user?.uid]); // Removed navigate and initializeJitsi from dependencies to prevent loops

  // Separate cleanup effect for component unmount
  useEffect(() => {
    return () => {
      console.log('Component unmounting, cleaning up all resources');
      cleanupRef.current = true;
      
      // Clean up Jitsi API
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          console.log('Error disposing Jitsi on unmount:', e);
        }
        apiRef.current = null;
      }
      
      // Clear all timeouts
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      
      // Reset refs
      initializationRef.current = false;
      scriptLoadedRef.current = false;
    };
  }, []);

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
      case 'disconnected':
        return '🔴 Disconnected';
      case 'error':
        return '❌ Connection error';
      default:
        return '🟡 Connecting...';
    }
  };

  // Media control functions
  const toggleAudio = () => {
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleAudio');
    }
  };

  const toggleVideo = () => {
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleVideo');
    }
  };

  // Error state with network-specific handling
  if (error) {
    const isNetworkError = error.includes('network') || error.includes('internet') || networkStatus === 'offline';
    
    return (
      <div className="video-session-error">
        <div className="error-container">
          <div className="error-icon">
            {isNetworkError ? '🌐' : '❌'}
          </div>
          <h2>{isNetworkError ? 'Network Error' : 'Connection Error'}</h2>
          <p>{error}</p>
          
          {isNetworkError && (
            <div className="network-status">
              <p className={`status ${networkStatus}`}>
                Status: {networkStatus === 'online' ? '🟢 Online' : '🔴 Offline'}
              </p>
            </div>
          )}
          
          <div className="error-actions">
            {networkStatus === 'online' && (
              <button className="btn-primary" onClick={retryConnection}>
                <FiRefreshCw /> Retry Connection
              </button>
            )}
            <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
          
          {retryAttempts > 0 && (
            <p className="retry-info">Retry attempt: {retryAttempts}/3</p>
          )}
          
          {isNetworkError && (
            <div className="network-tips">
              <h4>Network Troubleshooting:</h4>
              <ul>
                <li>Check your WiFi or mobile data connection</li>
                <li>Try refreshing the page</li>
                <li>Contact your internet service provider if issues persist</li>
              </ul>
            </div>
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
            <span className="participant-count">
              <FiUsers /> {Math.max(1, participantCount)} participant{Math.max(1, participantCount) !== 1 ? 's' : ''}
            </span>
            {session?.partnerId && partnerConnected && (
              <span className="partner-info">
                👥 with {session.partnerName || 'Study Partner'}
              </span>
            )}
          </div>
        </div>
        
        <div className="header-controls">
          {/* Media controls */}
          <button 
            onClick={toggleAudio} 
            className={`control-btn ${mediaEnabled.audio ? 'active' : 'muted'}`}
            title={mediaEnabled.audio ? 'Mute microphone' : 'Unmute microphone'}
          >
            {mediaEnabled.audio ? <FiMic /> : <FiMicOff />}
          </button>
          
          <button 
            onClick={toggleVideo} 
            className={`control-btn ${mediaEnabled.video ? 'active' : 'muted'}`}
            title={mediaEnabled.video ? 'Turn off camera' : 'Turn on camera'}
          >
            {mediaEnabled.video ? <FiVideo /> : <FiVideoOff />}
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
              {(connectionStatus === 'connecting' || loading) && (
                <div className="video-placeholder">
                  <div className="connection-status">
                    <div className="spinner"></div>
                    <p>Setting up your study room...</p>
                    <small>Preparing video connection</small>
                  </div>
                </div>
              )}
              
              {/* Waiting for partner placeholder */}
              {connectionStatus === 'waiting' && !loading && (
                <div className="video-placeholder">
                  <div className="connection-status">
                    <div className="waiting-icon">
                      <FiUsers size={48} />
                    </div>
                    <p>Study Room Active</p>
                    <small>Waiting for your study partner to join...</small>
                    <div className="waiting-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Timer Overlay - only show when session is started with partner */}
            {sessionStarted && partnerConnected && (
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
        </div>

        {/* Session Details */}
        <div className="session-details-overlay">
          <div className="detail-item">
            <span>Goal</span>
            <p>{session?.goal || 'Loading...'}</p>
          </div>
          <div className="detail-item">
            <span>Status</span>
            <p className={connectionStatus === 'connected' ? 'status-active' : ''}>
              {getConnectionStatusText()}
            </p>
          </div>
          <div className="detail-item">
            <span>Study Partner</span>
            <p className={partnerConnected ? "status-active" : ""}>
              {session?.partnerId ? (
                <>
                  {session.partnerName || 'Study Partner'}
                  {partnerConnected ? ' (Connected)' : ' (Invited)'}
                </>
              ) : (
                'Waiting for partner to join...'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Waiting for Partner Modal */}
      {showWaitingModal && connectionStatus === 'waiting' && !partnerConnected && (
        <div className="waiting-modal-overlay">
          <div className="waiting-modal">
            <div className="waiting-content">
              <div className="waiting-icon">👥</div>
              <h3>Study Room Ready! 🎯</h3>
              <p>Your focus session room is active and ready</p>
              
              <div className="partner-status">
                <div className="status-row">
                  <span className="status-label">Room Status:</span>
                  <span className="status-value active">✅ Active & Ready</span>
                </div>
                <div className="status-row">
                  <span className="status-label">Study Partner:</span>
                  <span className="status-value waiting">
                    {session?.partnerId && session?.partnerName ? (
                      `⏳ ${session.partnerName} invited`
                    ) : (
                      '⏳ Waiting for partner to join'
                    )}
                  </span>
                </div>
                <div className="status-row">
                  <span className="status-label">Participants:</span>
                  <span className="status-value">{Math.max(1, participantCount)}/2 connected</span>
                </div>
              </div>
              
              <div className="waiting-tips">
                <p>💡 <strong>While you wait:</strong></p>
                <ul>
                  <li>• Your camera and microphone are ready</li>
                  <li>• Partners can join anytime during the session</li>
                  <li>• Session will start automatically when partner joins</li>
                  <li>• You can prepare your materials while waiting</li>
                </ul>
              </div>
              
              <div className="waiting-actions">
                <button 
                  className="btn-secondary"
                  onClick={cancelSession}
                >
                  <FiX /> Cancel Session
                </button>
              </div>
              
              <div className="waiting-footer">
                <small>Session ID: {sessionId}</small>
                <div className="pulse-indicator">
                  <span></span>
                  {session?.partnerId && session?.partnerName ? (
                    `Waiting for ${session.partnerName}...`
                  ) : (
                    'Waiting for partner...'
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoSession;