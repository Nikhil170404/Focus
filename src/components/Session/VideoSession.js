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
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  
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
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  // Mobile responsive states
  const [isMobile, setIsMobile] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [timerMinimized, setTimerMinimized] = useState(false);

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      setTimerMinimized(mobile);
      setDetailsExpanded(!mobile);
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
    const handleOnline = () => {
      setNetworkStatus('online');
      if (apiRef.current && !jitsiConnected) {
        attemptReconnect();
      }
    };
    const handleOffline = () => setNetworkStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) handleOffline();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [jitsiConnected]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, []);

  // Update connection status with debouncing
  const updateConnectionStatus = useCallback(() => {
    if (!mountedRef.current || cleanupRef.current) return;

    const currentParticipants = participantsRef.current.size;
    
    if (!jitsiConnected) {
      setConnectionStatus('connecting');
      setPartnerConnected(false);
      setSessionActive(false);
      setParticipantCount(1);
      return;
    }

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

  // Reconnection logic
  const attemptReconnect = useCallback(() => {
    if (cleanupRef.current || reconnectAttempts >= 3) return;

    console.log(`🔄 Attempting reconnection ${reconnectAttempts + 1}/3`);
    setReconnectAttempts(prev => prev + 1);

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      if (!cleanupRef.current && apiRef.current) {
        try {
          // Try to restart ICE
          if (apiRef.current.executeCommand) {
            apiRef.current.executeCommand('hangup');
            setTimeout(() => {
              if (!cleanupRef.current) {
                window.location.reload();
              }
            }, 2000);
          }
        } catch (error) {
          console.error('❌ Reconnection failed:', error);
          if (reconnectAttempts >= 2) {
            window.location.reload();
          }
        }
      }
    }, 3000 * (reconnectAttempts + 1)); // Progressive delay
  }, [reconnectAttempts]);

  // End session function
  const endSession = useCallback(async () => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;
    
    try {
      // Clear all intervals and timeouts
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

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

  // Initialize Jitsi Meet with better configuration
  const initializeJitsi = useCallback(async (sessionData) => {
    if (initializationRef.current || !mountedRef.current || cleanupRef.current || apiRef.current) {
      return;
    }

    initializationRef.current = true;
    console.log('🚀 Initializing Jitsi...');
    
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
        // Core settings
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false,
        
        // Disable demo limitations
        enableClosePage: false,
        disableInviteFunctions: true,
        enableWelcomePage: false,
        requireDisplayName: false,
        
        // Force web mode - CRITICAL for mobile
        disableDeepLinking: true,
        disableProfile: true,
        
        // Performance optimizations
        resolution: isMobile ? 360 : 720,
        constraints: {
          video: {
            aspectRatio: 16 / 9,
            height: { ideal: isMobile ? 360 : 720, max: isMobile ? 480 : 1080 },
            width: { ideal: isMobile ? 640 : 1280, max: isMobile ? 854 : 1920 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        },
        
        // Connection settings
        enableLayerSuspension: true,
        channelLastN: 2, // Limit to 2 participants for performance
        
        // P2P settings for better performance
        p2p: {
          enabled: true,
          stunServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ],
          preferH264: true
        },
        
        // Analytics and stats - disable for performance
        analytics: {
          disabled: true
        },
        disableAudioLevels: false,
        enableTalkWhileMuted: false,
        
        // Remove demo restrictions
        enableInsecureRoomNameWarning: false,
        enableLobbyChat: false,
        enableNoAudioDetection: false,
        enableNoisyMicDetection: false,
        
        // Video settings
        startVideoMuted: false,
        startAudioMuted: false,
        videoQuality: {
          maxBitratesVideo: {
            low: 200000,
            standard: 500000,
            high: 1500000
          }
        }
      },
      interfaceConfigOverwrite: {
        // Branding
        MOBILE_APP_PROMO: false,
        SHOW_JITSI_WATERMARK: false,
        SHOW_BRAND_WATERMARK: false,
        SHOW_POWERED_BY: false,
        
        // Demo restrictions - REMOVE THESE
        PROVIDER_NAME: 'FocusMate',
        APP_NAME: 'FocusMate',
        NATIVE_APP_NAME: undefined,
        
        // Force web interface
        ENABLE_MOBILE_BROWSER: true,
        HIDE_DEEP_LINKING_LOGO: true,
        
        // Interface
        DISABLE_FOCUS_INDICATOR: true,
        DISABLE_PRESENCE_STATUS: true,
        
        // Toolbar
        TOOLBAR_BUTTONS: isMobile ? 
          ['microphone', 'camera', 'hangup'] :
          ['microphone', 'camera', 'chat', 'hangup', 'settings'],
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
        
        // Mobile-specific
        TOOLBAR_ALWAYS_VISIBLE: isMobile,
        FILM_STRIP_MAX_HEIGHT: isMobile ? 80 : 120,
        
        // Layout
        VIDEO_LAYOUT_FIT: 'both',
        TILE_VIEW_MAX_COLUMNS: 2,
        
        // Notifications
        DISABLE_INVITE_FUNCTIONS: true,
        GENERATE_ROOMNAMES_ON_WELCOME_PAGE: false
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
        
        setTimeout(() => clearInterval(checkInterval), 10000);
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
          setError('Failed to load video system. Please refresh and try again.');
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
        
        // Set ready state faster
        setTimeout(() => {
          if (mountedRef.current && !cleanupRef.current) {
            setLoading(false);
            setJitsiReady(true);
          }
        }, 1500);
        
      } catch (error) {
        console.error('❌ Failed to create Jitsi API:', error);
        initializationRef.current = false;
        if (mountedRef.current && !cleanupRef.current) {
          setError('Failed to initialize video connection. Please refresh and try again.');
          setLoading(false);
        }
      }
    };

    const setupEventListeners = () => {
      if (!apiRef.current || !mountedRef.current || cleanupRef.current) return;

      try {
        console.log('🔗 Setting up Jitsi event listeners');
        
        // Participant events with throttling
        let participantEventThrottle = false;
        
        apiRef.current.on('participantJoined', (participant) => {
          if (!mountedRef.current || cleanupRef.current || participantEventThrottle) return;
          
          participantEventThrottle = true;
          setTimeout(() => { participantEventThrottle = false; }, 1000);
          
          console.log('👤 Participant joined:', participant.displayName);
          
          participantsRef.current.add(participant.id);
          updateConnectionStatus();
          
          if (participant.id !== localParticipantIdRef.current) {
            toast.success(`${participant.displayName || 'Study partner'} joined! 🎉`);
          }
        });

        apiRef.current.on('participantLeft', (participant) => {
          if (!mountedRef.current || cleanupRef.current || participantEventThrottle) return;
          
          participantEventThrottle = true;
          setTimeout(() => { participantEventThrottle = false; }, 1000);
          
          console.log('👤 Participant left:', participant.displayName);
          
          participantsRef.current.delete(participant.id);
          updateConnectionStatus();
          
          if (participant.id !== localParticipantIdRef.current) {
            toast(`${participant.displayName || 'Study partner'} left the session`);
          }
        });

        apiRef.current.on('videoConferenceJoined', (conference) => {
          if (!mountedRef.current || cleanupRef.current) return;
          
          console.log('🎯 Video conference joined successfully');
          
          localParticipantIdRef.current = conference.id;
          participantsRef.current.add(conference.id);
          
          setJitsiConnected(true);
          setError(null);
          setLoading(false);
          setJitsiReady(true);
          setReconnectAttempts(0); // Reset reconnect attempts
          
          updateConnectionStatus();
          
          // Start heartbeat
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }
          heartbeatIntervalRef.current = setInterval(() => {
            if (apiRef.current && mountedRef.current) {
              try {
                // Simple ping to keep connection alive
                apiRef.current.executeCommand('toggleAudio');
                apiRef.current.executeCommand('toggleAudio');
              } catch (e) {
                console.warn('Heartbeat failed:', e);
              }
            }
          }, 30000); // Every 30 seconds
          
          if (sessionData.userId === user?.uid) {
            setUserRole('creator');
            toast.success('Session ready! Waiting for partner...');
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
          
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }
          
          updateConnectionStatus();
        });

        // Connection failure handling
        apiRef.current.on('connectionFailed', () => {
          console.log('❌ Connection failed');
          setJitsiConnected(false);
          if (!cleanupRef.current) {
            attemptReconnect();
          }
        });

        apiRef.current.on('readyToClose', () => {
          console.log('🔚 Jitsi ready to close');
          if (!cleanupRef.current) {
            endSession();
          }
        });

      } catch (error) {
        console.error('❌ Error setting up event listeners:', error);
        setError('Failed to setup video connection');
        setLoading(false);
      }
    };

    loadJitsiAndInitialize();
  }, [sessionId, user, isMobile, endSession, updateConnectionStatus, attemptReconnect]);

  // Optimized session listener with debouncing
  useEffect(() => {
    if (!sessionId || !user?.uid) {
      navigate('/dashboard');
      return;
    }

    if (!mountedRef.current || cleanupRef.current || sessionListenerRef.current) {
      return;
    }

    let updateTimeout;

    try {
      sessionListenerRef.current = onSnapshot(
        doc(db, 'sessions', sessionId), 
        (docSnap) => {
          if (!mountedRef.current || cleanupRef.current) return;
          
          // Debounce updates to prevent excessive re-renders
          if (updateTimeout) clearTimeout(updateTimeout);
          updateTimeout = setTimeout(() => {
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
              
              // Initialize Jitsi only once
              if (jitsiContainerRef.current && 
                  !initializationRef.current && 
                  !apiRef.current && 
                  sessionData.status === 'scheduled') {
                
                setTimeout(() => {
                  if (mountedRef.current && 
                      !cleanupRef.current && 
                      !initializationRef.current && 
                      !apiRef.current) {
                    initializeJitsi(sessionData);
                  }
                }, 500);
              }
            } else {
              setError('Session not found');
              setLoading(false);
            }
          }, 500); // 500ms debounce
        },
        (error) => {
          if (!mountedRef.current || cleanupRef.current) return;
          console.error('❌ Session listener error:', error);
          setError('Connection error. Please refresh and try again.');
          setLoading(false);
        }
      );
    } catch (error) {
      console.error('❌ Failed to setup session listener:', error);
      setError('Failed to connect to session');
      setLoading(false);
    }

    return () => {
      if (updateTimeout) clearTimeout(updateTimeout);
      if (sessionListenerRef.current) {
        sessionListenerRef.current();
        sessionListenerRef.current = null;
      }
    };
  }, [sessionId, user?.uid, navigate, initializeJitsi]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current = true;
      
      // Clear all timeouts and intervals
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
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
    if (networkStatus === 'offline') return '📶 No internet';
    
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
              Refresh & Retry
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
              <p>💡 Stay on this page - video will load soon</p>
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
              {reconnectAttempts > 0 && (
                <small>Reconnection attempt {reconnectAttempts}/3</small>
              )}
            </div>
          )}
          
          {jitsiReady && connectionStatus === 'waiting' && (
            <div className="video-overlay">
              <FiUsers className="waiting-icon" />
              <p>Waiting for study partner</p>
              <div className="waiting-dots">
                <span></span><span></span><span></span>
              </div>
              <small>Share this session link with someone</small>
            </div>
          )}
        </div>

        {/* Session Timer */}
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

            {/* Connection quality indicator */}
            <div className="detail-row">
              <span className="label">Connection:</span>
              <span className="value">
                {networkStatus === 'offline' ? '📶 Offline' : 
                 jitsiConnected ? '🟢 Strong' : '🟡 Connecting'}
              </span>
            </div>

            {/* Mobile tips */}
            {isMobile && (
              <div className="mobile-session-tips">
                <h4>📱 Tips:</h4>
                <ul>
                  <li>Keep this page open</li>
                  <li>Use headphones for better audio</li>
                  <li>Ensure stable internet connection</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Network status indicator */}
      {networkStatus === 'offline' && (
        <div className="network-status offline">
          <span>📶 No internet - please check your connection</span>
        </div>
      )}

      {/* Reconnection indicator */}
      {reconnectAttempts > 0 && networkStatus === 'online' && (
        <div className="network-status reconnecting">
          <span>🔄 Reconnecting... ({reconnectAttempts}/3)</span>
        </div>
      )}
    </div>
  );
}

export default VideoSession;