import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import { 
  FiPhoneOff,
  FiX,
  FiClock,
  FiUsers,
  FiChevronUp,
  FiChevronDown,
  FiArrowLeft,
  FiLoader
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
  const cleanupRef = useRef(false);
  const localParticipantIdRef = useRef(null);
  const participantsRef = useRef(new Set());
  
  // Component state
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const [networkStatus, setNetworkStatus] = useState('online');
  const [jitsiReady, setJitsiReady] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [jitsiConnected, setJitsiConnected] = useState(false);
  
  // Mobile responsive states
  const [isMobile, setIsMobile] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [timerMinimized, setTimerMinimized] = useState(false);

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      setTimerMinimized(mobile); // Auto-minimize timer on mobile
      setDetailsExpanded(!mobile); // Auto-expand details on desktop
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Component mount/unmount tracking
  useEffect(() => {
    mountedRef.current = true;
    cleanupRef.current = false;
    return () => {
      mountedRef.current = false;
      cleanupRef.current = true;
    };
  }, []);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => setNetworkStatus('online');
    const handleOffline = () => setNetworkStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) handleOffline();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Force loading timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading && mountedRef.current && !cleanupRef.current) {
        console.log('⏰ Loading timeout reached, forcing ready state');
        setLoading(false);
        setJitsiReady(true);
      }
    }, 8000);

    return () => clearTimeout(timeout);
  }, [loading]);

  // Update connection status based on participant count and jitsi connection
  const updateConnectionStatus = useCallback(() => {
    if (!jitsiConnected) {
      setConnectionStatus('connecting');
      setPartnerConnected(false);
      setSessionActive(false);
      return;
    }

    const currentParticipants = participantsRef.current.size;
    console.log('🔄 Updating connection status. Participants:', currentParticipants, 'Jitsi connected:', jitsiConnected);
    
    if (currentParticipants >= 2) {
      setConnectionStatus('connected');
      setPartnerConnected(true);
      setSessionActive(true);
    } else {
      setConnectionStatus('waiting');
      setPartnerConnected(false);
      setSessionActive(false);
    }
    
    setParticipantCount(currentParticipants);
  }, [jitsiConnected]);

  // End session function
  const endSession = useCallback(async () => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;
    
    try {
      if (sessionId && session && session.status !== 'completed') {
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
          console.log('Jitsi cleanup error:', e);
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

  // Cancel session function
  const cancelSession = useCallback(async () => {
    if (cleanupRef.current) return;
    
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
          console.log('Jitsi cleanup error:', e);
        }
        apiRef.current = null;
      }

      toast.success('Session cancelled');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error cancelling session:', error);
      navigate('/dashboard');
    }
  }, [sessionId, navigate]);

  // Initialize Jitsi Meet
  const initializeJitsi = useCallback(async (sessionData) => {
    if (initializationRef.current || !mountedRef.current || cleanupRef.current || apiRef.current) {
      return;
    }

    initializationRef.current = true;
    console.log('🚀 Initializing Jitsi for mobile:', isMobile);
    
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
        enableWelcomePage: false,
        requireDisplayName: false,
        // CRITICAL: Force web mode - prevent mobile app redirects
        disableDeepLinking: true,
        enableClosePage: false,
        disableProfile: true,
        // Mobile optimizations
        resolution: isMobile ? 360 : 720,
        constraints: {
          video: {
            aspectRatio: 16 / 9,
            height: { ideal: isMobile ? 360 : 720, max: isMobile ? 480 : 1080 },
            width: { ideal: isMobile ? 640 : 1280, max: isMobile ? 854 : 1920 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        },
        // Additional mobile config
        enableLayerSuspension: true,
        p2p: {
          enabled: true,
          stunServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        },
        // Force browser mode
        enableInsecureRoomNameWarning: false,
        enableLobbyChat: false
      },
      interfaceConfigOverwrite: {
        MOBILE_APP_PROMO: false,
        SHOW_JITSI_WATERMARK: false,
        SHOW_BRAND_WATERMARK: false,
        SHOW_POWERED_BY: false,
        DISABLE_FOCUS_INDICATOR: true,
        DISABLE_PRESENCE_STATUS: true,
        // CRITICAL: Force web interface
        ENABLE_MOBILE_BROWSER: true,
        HIDE_DEEP_LINKING_LOGO: true,
        NATIVE_APP_NAME: undefined,
        APP_NAME: 'FocusMate',
        // Different toolbar for mobile vs desktop
        TOOLBAR_BUTTONS: isMobile ? 
          ['microphone', 'camera', 'hangup'] :
          ['microphone', 'camera', 'chat', 'participants', 'hangup', 'settings'],
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
        // Mobile-specific interface
        TOOLBAR_ALWAYS_VISIBLE: isMobile,
        FILM_STRIP_MAX_HEIGHT: isMobile ? 80 : 120,
        // Force video layout
        VIDEO_LAYOUT_FIT: 'both',
        TILE_VIEW_MAX_COLUMNS: isMobile ? 1 : 2
      }
    };

    const loadJitsiAndInitialize = () => {
      if (!mountedRef.current || cleanupRef.current || apiRef.current) {
        initializationRef.current = false;
        return;
      }

      if (window.JitsiMeetExternalAPI) {
        createJitsiAPI();
        return;
      }

      if (scriptLoadedRef.current) {
        const checkInterval = setInterval(() => {
          if (window.JitsiMeetExternalAPI) {
            clearInterval(checkInterval);
            if (!mountedRef.current || cleanupRef.current || apiRef.current) {
              initializationRef.current = false;
              return;
            }
            createJitsiAPI();
          }
        }, 100);
        
        setTimeout(() => clearInterval(checkInterval), 15000);
        return;
      }

      scriptLoadedRef.current = true;
      
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      
      script.onload = () => {
        console.log('✅ Jitsi script loaded');
        if (!mountedRef.current || cleanupRef.current || apiRef.current) {
          initializationRef.current = false;
          return;
        }
        createJitsiAPI();
      };
      
      script.onerror = (error) => {
        console.error('❌ Failed to load Jitsi script:', error);
        initializationRef.current = false;
        scriptLoadedRef.current = false;
        if (mountedRef.current && !cleanupRef.current) {
          setError('Failed to load video system. Please check your connection.');
          setLoading(false);
        }
      };
      
      document.body.appendChild(script);
    };

    const createJitsiAPI = () => {
      if (!mountedRef.current || cleanupRef.current || apiRef.current) {
        initializationRef.current = false;
        return;
      }

      try {
        console.log('🎯 Creating Jitsi API instance');
        apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
        setupEventListeners();
        
        // Longer timeout for mobile
        setTimeout(() => {
          if (mountedRef.current && !cleanupRef.current) {
            console.log('✅ Jitsi initialization complete');
            setLoading(false);
            setJitsiReady(true);
          }
        }, 2000);
        
      } catch (error) {
        console.error('❌ Failed to create Jitsi API:', error);
        initializationRef.current = false;
        if (mountedRef.current && !cleanupRef.current) {
          setError('Failed to initialize video connection.');
          setLoading(false);
        }
      }
    };

    const setupEventListeners = () => {
      if (!apiRef.current || !mountedRef.current || cleanupRef.current) return;

      try {
        console.log('🔗 Setting up Jitsi event listeners');
        
        apiRef.current.on('participantJoined', (participant) => {
          if (!mountedRef.current || cleanupRef.current) return;
          
          console.log('👤 Participant joined:', participant.displayName, 'ID:', participant.id);
          
          // Add to participants set
          participantsRef.current.add(participant.id);
          console.log('📊 Current participants:', Array.from(participantsRef.current));
          
          updateConnectionStatus();
          
          // Show toast only for remote participants
          if (participant.id !== localParticipantIdRef.current) {
            toast.success(`${participant.displayName || 'Study partner'} joined! 🎉`);
          }
        });

        apiRef.current.on('participantLeft', (participant) => {
          if (!mountedRef.current || cleanupRef.current) return;
          
          console.log('👤 Participant left:', participant.displayName, 'ID:', participant.id);
          
          // Remove from participants set
          participantsRef.current.delete(participant.id);
          console.log('📊 Current participants after leave:', Array.from(participantsRef.current));
          
          updateConnectionStatus();
          
          // Show toast only for remote participants
          if (participant.id !== localParticipantIdRef.current) {
            toast(`${participant.displayName || 'Study partner'} left the session`);
          }
        });

        apiRef.current.on('videoConferenceJoined', (conference) => {
          if (!mountedRef.current || cleanupRef.current) return;
          
          console.log('🎯 Video conference joined:', conference);
          
          // Store local participant ID and add to participants
          localParticipantIdRef.current = conference.id;
          participantsRef.current.add(conference.id);
          
          setJitsiConnected(true);
          setError(null);
          setLoading(false);
          setJitsiReady(true);
          
          updateConnectionStatus();
          
          if (sessionData.userId === user?.uid) {
            setUserRole('creator');
            toast.success('Session created! Waiting for partner...');
          } else {
            setUserRole('joiner');
            toast.success('Joined session successfully!');
          }
        });

        apiRef.current.on('videoConferenceLeft', () => {
          if (!mountedRef.current || cleanupRef.current) return;
          console.log('📤 Video conference left');
          setJitsiConnected(false);
          participantsRef.current.clear();
          updateConnectionStatus();
        });

        apiRef.current.on('readyToClose', () => {
          console.log('🔚 Jitsi ready to close');
          if (!cleanupRef.current) {
            endSession();
          }
        });

        // Additional events for better connection tracking
        apiRef.current.on('connectionQualityChanged', (event) => {
          console.log('📶 Connection quality:', event);
        });

        apiRef.current.on('connectionStatus', (event) => {
          console.log('🔌 Connection status event:', event);
        });

      } catch (error) {
        console.error('❌ Error setting up event listeners:', error);
        setError('Failed to setup video connection');
        setLoading(false);
      }
    };

    loadJitsiAndInitialize();
  }, [sessionId, user, isMobile, endSession, updateConnectionStatus]);

  // Session listener
  useEffect(() => {
    if (!sessionId || !user?.uid) {
      navigate('/dashboard');
      return;
    }

    if (!mountedRef.current || cleanupRef.current || sessionListenerRef.current) {
      return;
    }

    try {
      sessionListenerRef.current = onSnapshot(
        doc(db, 'sessions', sessionId), 
        (docSnap) => {
          if (!mountedRef.current || cleanupRef.current) return;
          
          if (docSnap.exists()) {
            const sessionData = { id: docSnap.id, ...docSnap.data() };
            
            // Check access permissions
            if (sessionData.userId !== user.uid && sessionData.partnerId !== user.uid) {
              setError('You do not have access to this session');
              setLoading(false);
              return;
            }

            // Don't initialize for ended sessions
            if (sessionData.status === 'completed' || sessionData.status === 'cancelled') {
              setError('This session has ended');
              setLoading(false);
              return;
            }
            
            setSession(sessionData);
            
            // Set user role
            if (sessionData.userId === user.uid) {
              setUserRole('creator');
            } else if (sessionData.partnerId === user.uid) {
              setUserRole('joiner');
            }
            
            // Initialize Jitsi
            if (jitsiContainerRef.current && 
                !initializationRef.current && 
                !apiRef.current && 
                sessionData.status === 'scheduled') {
              
              const delay = isMobile ? 1500 : 1000;
              setTimeout(() => {
                if (mountedRef.current && 
                    !cleanupRef.current && 
                    !initializationRef.current && 
                    !apiRef.current) {
                  initializeJitsi(sessionData);
                }
              }, delay);
            }
          } else {
            setError('Session not found');
            setLoading(false);
          }
        },
        (error) => {
          if (!mountedRef.current || cleanupRef.current) return;
          console.error('❌ Session listener error:', error);
          setError(`Error loading session: ${error.message}`);
          setLoading(false);
        }
      );
    } catch (error) {
      console.error('❌ Failed to setup session listener:', error);
      setError('Failed to connect to session');
      setLoading(false);
    }

    return () => {
      if (sessionListenerRef.current) {
        sessionListenerRef.current();
        sessionListenerRef.current = null;
      }
    };
  }, [sessionId, user?.uid, navigate, initializeJitsi, isMobile]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current = true;
      
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          console.log('Cleanup error:', e);
        }
        apiRef.current = null;
      }
      
      initializationRef.current = false;
      scriptLoadedRef.current = false;
      participantsRef.current.clear();
    };
  }, []);

  // Timer complete handler
  const onTimerComplete = useCallback(() => {
    toast.success('Time\'s up! Session completed! 🎯');
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
        return userRole === 'creator' ? '⏳ Waiting for partner' : '⏳ Ready, waiting for partner';
      case 'connected':
        return `🟢 Connected (${participantCount} ${participantCount === 1 ? 'person' : 'people'})`;
      case 'disconnected':
        return '🔴 Disconnected';
      default:
        return '🟡 Connecting...';
    }
  };

  const getPartnerStatusText = () => {
    if (!session) return 'Loading...';
    
    if (!session.partnerId) {
      return 'Waiting for partner...';
    }
    
    const partnerName = session.partnerName || 'Study Partner';
    
    if (partnerConnected && sessionActive) {
      return `${partnerName} (Connected)`;
    } else {
      return `${partnerName} (Connecting...)`;
    }
  };

  const shouldShowTimer = () => {
    // Show timer when both conditions are met:
    // 1. Session is active (both participants connected)
    // 2. Jitsi is ready and connected
    return sessionActive && partnerConnected && jitsiReady && jitsiConnected && session;
  };

  const getTimerConfig = () => {
    if (!shouldShowTimer()) return null;
    
    return {
      duration: session?.duration || 50,
      autoStart: true,
      onComplete: onTimerComplete
    };
  };

  // Error state
  if (error) {
    return (
      <div className="video-session-error">
        <div className="error-container">
          <div className="error-icon">❌</div>
          <h2>Connection Error</h2>
          <p>{error}</p>
          <div className="error-actions">
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Retry
            </button>
            <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading && !jitsiReady) {
    return (
      <div className="video-session-loading">
        <div className="loading-container">
          <FiLoader className="spinner" />
          <p>Setting up your focus session...</p>
          <small>{isMobile ? 'Optimizing for mobile...' : 'Preparing video connection'}</small>
          {isMobile && (
            <div className="mobile-tips">
              <p>💡 Stay on this page - don't switch to the app</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`video-session ${isMobile ? 'mobile' : 'desktop'}`}>
      {/* Header */}
      <div className="video-header">
        <div className="session-info">
          <div className="session-title">
            <h3>{session?.goal || 'Focus Session'}</h3>
            {userRole && (
              <span className={`role-badge ${userRole}`}>
                {userRole === 'creator' ? '👑' : '🤝'}
              </span>
            )}
          </div>
          
          <div className="session-meta">
            <span className="duration">
              <FiClock /> {session?.duration || 50}min
            </span>
            <span className={`status ${connectionStatus}`}>
              {getConnectionStatusText()}
            </span>
            <span className="participants">
              <FiUsers /> {participantCount}
            </span>
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={userRole === 'creator' ? cancelSession : () => navigate('/dashboard')} 
            className="btn-end-session"
          >
            {userRole === 'creator' ? (
              <>
                <FiX />
                {!isMobile && <span>End Session</span>}
              </>
            ) : (
              <>
                <FiArrowLeft />
                {!isMobile && <span>Leave</span>}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Video Container */}
      <div className="video-main">
        <div ref={jitsiContainerRef} className="jitsi-container">
          {/* Loading/Waiting overlays */}
          {(!jitsiReady || connectionStatus === 'connecting') && (
            <div className="video-overlay">
              <FiLoader className="spinner" />
              <p>Connecting to video...</p>
              {isMobile && <small>Keep this page open</small>}
            </div>
          )}
          
          {jitsiReady && connectionStatus === 'waiting' && (
            <div className="video-overlay">
              <FiUsers className="waiting-icon" />
              <p>Waiting for study partner</p>
              <div className="waiting-dots">
                <span></span><span></span><span></span>
              </div>
              {isMobile && (
                <small>Share this session or wait for someone to join</small>
              )}
            </div>
          )}
        </div>

        {/* Session Timer - Show when both participants are connected */}
        {(() => {
          const timerConfig = getTimerConfig();
          if (!timerConfig) return null;
          
          return (
            <div className={`session-timer-overlay ${timerMinimized ? 'minimized' : ''}`}>
              {isMobile && (
                <button 
                  className="timer-toggle"
                  onClick={() => setTimerMinimized(!timerMinimized)}
                >
                  {timerMinimized ? <FiChevronUp /> : <FiChevronDown />}
                </button>
              )}
              
              {!timerMinimized && (
                <SessionTimer 
                  duration={timerConfig.duration}
                  onComplete={timerConfig.onComplete}
                  autoStart={timerConfig.autoStart}
                  showBreakReminder={false}
                  isOverlay={true}
                  isMobile={isMobile}
                />
              )}
              
              {timerMinimized && (
                <div className="timer-minimized">
                  <FiClock />
                  <span>Timer Active</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Session Details Panel */}
      <div className={`session-details ${detailsExpanded ? 'expanded' : 'collapsed'}`}>
        {isMobile && (
          <button 
            className="details-toggle"
            onClick={() => setDetailsExpanded(!detailsExpanded)}
          >
            <span>Session Details</span>
            {detailsExpanded ? <FiChevronDown /> : <FiChevronUp />}
          </button>
        )}
        
        {(detailsExpanded || !isMobile) && (
          <div className="details-content">
            <div className="detail-row">
              <span className="label">Goal:</span>
              <span className="value">{session?.goal || 'Loading...'}</span>
            </div>
            
            <div className="detail-row">
              <span className="label">Role:</span>
              <span className={`value role-${userRole}`}>
                {userRole === 'creator' ? '👑 Session Creator' : '🤝 Study Partner'}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="label">Partner:</span>
              <span className={`value ${partnerConnected ? 'connected' : 'waiting'}`}>
                {getPartnerStatusText()}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="label">Duration:</span>
              <span className="value">{session?.duration || 50} minutes</span>
            </div>
            
            <div className="detail-row">
              <span className="label">Status:</span>
              <span className={`value status-${connectionStatus}`}>
                {getConnectionStatusText()}
              </span>
            </div>

            <div className="detail-row">
              <span className="label">Timer:</span>
              <span className="value">
                {shouldShowTimer() ? '🟢 Active' : '⏸️ Waiting for all participants'}
              </span>
            </div>

            {/* Debug info (remove in production) */}
            {process.env.NODE_ENV === 'development' && (
              <div className="detail-row">
                <span className="label">Debug:</span>
                <span className="value">
                  J:{jitsiConnected ? '✓' : '✗'} P:{participantCount} A:{sessionActive ? '✓' : '✗'}
                </span>
              </div>
            )}

            {/* Mobile tips */}
            {isMobile && (
              <div className="mobile-session-tips">
                <h4>📱 Mobile Tips:</h4>
                <ul>
                  <li>Keep this page open</li>
                  <li>Don't switch to the Jitsi app</li>
                  <li>Use headphones for better audio</li>
                  <li>Keep your device charged</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Network status indicator */}
      {networkStatus === 'offline' && (
        <div className="network-status offline">
          <span>📶 No internet connection</span>
        </div>
      )}
    </div>
  );
}

export default VideoSession;