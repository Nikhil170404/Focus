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
  FiVideo,
  FiVideoOff,
  FiMic,
  FiMicOff,
  FiChevronUp,
  FiChevronDown,
  FiArrowLeft
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
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [showWaitingModal, setShowWaitingModal] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const [mediaEnabled, setMediaEnabled] = useState({ video: true, audio: true });
  const [networkStatus, setNetworkStatus] = useState('online');
  const [jitsiReady, setJitsiReady] = useState(false);
  
  // Session role tracking
  const [userRole, setUserRole] = useState(null); // 'creator' or 'joiner'
  const [waitingForCreator, setWaitingForCreator] = useState(false);
  
  // Mobile responsive states
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [mobileTimerMinimized, setMobileTimerMinimized] = useState(true);

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus('online');
      if (error && error.includes('network')) {
        setError(null);
      }
    };

    const handleOffline = () => {
      setNetworkStatus('offline');
      setError('No internet connection. Please check your network and try again.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

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

  // Force loading to false after maximum timeout
  useEffect(() => {
    const maxLoadingTimeout = setTimeout(() => {
      if (loading && mountedRef.current && !cleanupRef.current) {
        console.log('Force stopping loading after 8 seconds');
        setLoading(false);
        setJitsiReady(true);
        setConnectionStatus('waiting');
        setShowWaitingModal(true);
      }
    }, 8000);

    return () => clearTimeout(maxLoadingTimeout);
  }, [loading]);

  // Stable end session function
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
          console.log('Error disposing Jitsi API:', e);
        }
        apiRef.current = null;
      }

      // Clear timeouts
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }

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

  // Stable cancel session function
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
          console.log('Error disposing during cancel:', e);
        }
        apiRef.current = null;
      }

      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }

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

  // Initialize Jitsi Meet
  const initializeJitsi = useCallback(async (sessionData) => {
    if (initializationRef.current || !mountedRef.current || cleanupRef.current || apiRef.current) {
      return;
    }

    console.log('🚀 Starting Jitsi initialization for session:', sessionData.id);
    initializationRef.current = true;
    
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
        enableChat: true,
        enableChatOverlay: true,
        enableClosePage: false,
        resolution: isMobile ? 480 : 720,
        constraints: {
          video: {
            aspectRatio: 16 / 9,
            height: {
              ideal: isMobile ? 480 : 720,
              max: isMobile ? 720 : 1080,
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
        TOOLBAR_BUTTONS: isMobile ? 
          ['microphone', 'camera', 'chat', 'hangup'] :
          ['microphone', 'camera', 'chat', 'participants', 'hangup', 'settings', 'fullscreen'],
        SETTINGS_SECTIONS: ['devices', 'language'],
        RECENT_LIST_ENABLED: false,
        DISPLAY_WELCOME_PAGE_CONTENT: false,
        SHOW_CHROME_EXTENSION_BANNER: false,
        CHAT_ENABLED: true,
        CHAT_SIZE: isMobile ? 320 : 400
      }
    };

    const loadJitsiAndInitialize = () => {
      if (!mountedRef.current || cleanupRef.current || apiRef.current) {
        initializationRef.current = false;
        return;
      }

      if (window.JitsiMeetExternalAPI) {
        console.log('📚 Jitsi API already available');
        createJitsiAPI();
        return;
      }

      if (scriptLoadedRef.current) {
        console.log('📚 Jitsi script already loading, waiting...');
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

      console.log('📥 Loading Jitsi script');
      scriptLoadedRef.current = true;
      
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      
      script.onload = () => {
        console.log('✅ Jitsi script loaded successfully');
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
          setError('Failed to load video system. Please check your internet connection and refresh.');
          setLoading(false);
          setConnectionStatus('error');
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
        console.log('🎥 Creating Jitsi API instance');
        apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
        
        // Set up event listeners
        setupEventListeners();
        
        setConnectionStatus('connecting');
        
        // Set loading to false after a short delay to show Jitsi interface
        setTimeout(() => {
          if (mountedRef.current && !cleanupRef.current) {
            setLoading(false);
            setJitsiReady(true);
          }
        }, 2000);
        
      } catch (error) {
        console.error('❌ Error creating Jitsi API:', error);
        initializationRef.current = false;
        if (mountedRef.current && !cleanupRef.current) {
          setError('Failed to initialize video connection. Please refresh and try again.');
          setLoading(false);
          setConnectionStatus('error');
        }
      }
    };

    const setupEventListeners = () => {
      if (!apiRef.current || !mountedRef.current || cleanupRef.current) return;

      try {
        if (apiRef.current.removeAllListeners) {
          apiRef.current.removeAllListeners();
        }

        apiRef.current.on('participantJoined', (participant) => {
          if (!mountedRef.current || cleanupRef.current) return;
          console.log('👥 Participant joined:', participant.displayName, participant.id);
          
          setParticipantCount(prev => prev + 1);
          
          const isCurrentUser = participant.id === user?.uid || 
                               participant.id === user?.email ||
                               participant.displayName === user?.displayName;
          
          if (!isCurrentUser) {
            console.log('✅ Partner connected!');
            setPartnerConnected(true);
            setConnectionStatus('connected');
            setShowWaitingModal(false);
            setSessionStarted(true);
            setWaitingForCreator(false);
            
            toast.success(`${participant.displayName || 'Study partner'} joined! Let's focus together! 🎉`);
          }
        });

        apiRef.current.on('participantLeft', (participant) => {
          if (!mountedRef.current || cleanupRef.current) return;
          console.log('👋 Participant left:', participant.displayName, participant.id);
          
          setParticipantCount(prev => Math.max(1, prev - 1));
          
          const isCurrentUser = participant.id === user?.uid || 
                               participant.id === user?.email ||
                               participant.displayName === user?.displayName;
          
          if (!isCurrentUser) {
            console.log('❌ Partner disconnected!');
            setPartnerConnected(false);
            setConnectionStatus('waiting');
            setSessionStarted(false);
            setShowWaitingModal(true);
            toast(`${participant.displayName || 'Study partner'} left the session`);
          }
        });

        apiRef.current.on('videoConferenceJoined', () => {
          if (!mountedRef.current || cleanupRef.current) return;
          console.log('🎉 Successfully joined video conference');
          
          setParticipantCount(1);
          setError(null);
          setLoading(false);
          setJitsiReady(true);
          setConnectionStatus('waiting');
          setShowWaitingModal(true);
          
          // Determine user role
          if (sessionData.userId === user?.uid) {
            setUserRole('creator');
            toast.success('Session created! Waiting for study partner to join...');
          } else {
            setUserRole('joiner');
            setWaitingForCreator(true);
            toast.success('Joined session! Waiting for session creator...');
          }
        });

        apiRef.current.on('videoConferenceLeft', () => {
          if (!mountedRef.current || cleanupRef.current) return;
          console.log('👋 Left video conference');
          setConnectionStatus('disconnected');
          setParticipantCount(0);
        });

        apiRef.current.on('readyToClose', () => {
          console.log('🔚 Jitsi ready to close');
          if (!cleanupRef.current) {
            endSession();
          }
        });

        apiRef.current.on('conferenceError', (error) => {
          if (!mountedRef.current || cleanupRef.current) return;
          console.error('❌ Conference error:', error);
          setError('Video connection failed. Please refresh to try again.');
          setLoading(false);
          setConnectionStatus('error');
        });

        apiRef.current.on('audioMuteStatusChanged', (data) => {
          if (!mountedRef.current || cleanupRef.current) return;
          setMediaEnabled(prev => ({ ...prev, audio: !data.muted }));
        });

        apiRef.current.on('videoMuteStatusChanged', (data) => {
          if (!mountedRef.current || cleanupRef.current) return;
          setMediaEnabled(prev => ({ ...prev, video: !data.muted }));
        });

      } catch (error) {
        console.error('❌ Error setting up event listeners:', error);
        setError('Failed to setup video connection properly');
        setLoading(false);
      }
    };

    loadJitsiAndInitialize();
  }, [sessionId, user, isMobile, endSession]);

  // Session listener effect
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

            // Don't initialize Jitsi for completed or cancelled sessions
            if (sessionData.status === 'completed' || sessionData.status === 'cancelled') {
              setError('This session has ended');
              setLoading(false);
              return;
            }
            
            setSession(sessionData);
            
            // Determine user role
            if (sessionData.userId === user.uid) {
              setUserRole('creator');
            } else if (sessionData.partnerId === user.uid) {
              setUserRole('joiner');
            }
            
            // Initialize Jitsi only once when container is ready
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
              }, 1000);
            }
          } else {
            setError('Session not found');
            setLoading(false);
          }
        },
        (error) => {
          if (!mountedRef.current || cleanupRef.current) return;
          console.error('Session listener error:', error);
          setError(`Error loading session: ${error.message}`);
          setLoading(false);
        }
      );
    } catch (error) {
      console.error('Error setting up session listener:', error);
      setError('Failed to connect to session');
      setLoading(false);
    }

    return () => {
      if (sessionListenerRef.current) {
        sessionListenerRef.current();
        sessionListenerRef.current = null;
      }
    };
  }, [sessionId, user?.uid, navigate, initializeJitsi]);

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      cleanupRef.current = true;
      
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          console.log('Error disposing Jitsi on unmount:', e);
        }
        apiRef.current = null;
      }
      
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      
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
        if (userRole === 'creator') {
          return '⏳ Waiting for partner to join';
        } else if (userRole === 'joiner') {
          return waitingForCreator ? '⏳ Waiting for session creator' : '⏳ Waiting for partner';
        }
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

  const toggleChat = () => {
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleChat');
    }
  };

  const toggleParticipants = () => {
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleParticipantsPane');
    }
  };

  // Error state
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
              <button className="btn-primary" onClick={() => window.location.reload()}>
                Refresh Page
              </button>
            )}
            <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state - Only show if Jitsi is not ready
  if (loading && !jitsiReady) {
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
    <div className={`video-session-container ${isMobile ? 'mobile' : 'desktop'}`}>
      {/* Header */}
      <div className="video-header">
        <div className="session-info">
          <div className="session-title-row">
            <h3>{session?.goal || 'Focus Session'}</h3>
            {userRole && (
              <span className={`role-badge ${userRole}`}>
                {userRole === 'creator' ? '👑 Creator' : '🤝 Partner'}
              </span>
            )}
          </div>
          {!isMobile && (
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
                  👥 with {session.partnerName || 
                           (userRole === 'creator' ? 'Study Partner' : 'Session Creator')}
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className="header-controls">
          {/* Media controls */}
          <button 
            onClick={toggleAudio} 
            className={`control-btn ${mediaEnabled.audio ? 'active' : 'muted'}`}
            title={mediaEnabled.audio ? 'Mute microphone' : 'Unmute microphone'}
          >
            {mediaEnabled.audio ? <FiMic /> : <FiMicOff />}
            {!isMobile && <span className="btn-text">Mic</span>}
          </button>
          
          <button 
            onClick={toggleVideo} 
            className={`control-btn ${mediaEnabled.video ? 'active' : 'muted'}`}
            title={mediaEnabled.video ? 'Turn off camera' : 'Turn on camera'}
          >
            {mediaEnabled.video ? <FiVideo /> : <FiVideoOff />}
            {!isMobile && <span className="btn-text">Camera</span>}
          </button>

          {/* Chat control */}
          {jitsiReady && (
            <button 
              onClick={toggleChat} 
              className="control-btn chat-btn"
              title="Toggle chat"
            >
              💬
              {!isMobile && <span className="btn-text">Chat</span>}
            </button>
          )}

          {/* Participants control - desktop only */}
          {!isMobile && jitsiReady && (
            <button 
              onClick={toggleParticipants} 
              className="control-btn participants-btn"
              title="Toggle participants"
            >
              <FiUsers />
              <span className="btn-text">Participants</span>
            </button>
          )}
          
          <button 
            onClick={endSession} 
            className="control-btn end-call"
            title="End session"
          >
            <FiPhoneOff />
            {!isMobile && <span className="btn-text">End Session</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="video-content">
        <div className="session-layout">
          {/* Video Container */}
          <div className="video-main">
            <div ref={jitsiContainerRef} className="jitsi-container">
              {/* Loading indicator */}
              {(!jitsiReady || connectionStatus === 'connecting') && (
                <div className="video-placeholder">
                  <div className="connection-status">
                    <div className="spinner"></div>
                    <p>Setting up your study room...</p>
                    <small>Preparing video connection</small>
                  </div>
                </div>
              )}
              
              {/* Waiting for partner */}
              {jitsiReady && connectionStatus === 'waiting' && !partnerConnected && (
                <div className="video-placeholder">
                  <div className="connection-status">
                    <div className="waiting-icon">
                      <FiUsers size={isMobile ? 32 : 48} />
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
          </div>
        </div>

        {/* Desktop Session Details */}
        {!isMobile && (
          <div className="session-details-overlay">
            <div className="detail-item">
              <span>Goal</span>
              <p>{session?.goal || 'Loading...'}</p>
            </div>
            <div className="detail-item">
              <span>Your Role</span>
              <p className={userRole === 'creator' ? 'role-creator' : 'role-joiner'}>
                {userRole === 'creator' ? '👑 Session Creator' : 
                 userRole === 'joiner' ? '🤝 Study Partner' : 
                 'Participant'}
              </p>
            </div>
            <div className="detail-item">
              <span>Status</span>
              <p className={connectionStatus === 'connected' ? 'status-active' : ''}>
                {getConnectionStatusText()}
              </p>
            </div>
            <div className="detail-item">
              <span>
                {userRole === 'creator' ? 'Study Partner' : 
                 userRole === 'joiner' ? 'Session Creator' : 
                 'Partner'}
              </span>
              <p className={partnerConnected ? "status-active" : ""}>
                {session?.partnerId ? (
                  <>
                    {session.partnerName || 'Study Partner'}
                    {partnerConnected ? ' (Connected)' : 
                     userRole === 'creator' ? ' (Invited)' : 
                     ' (Waiting to join)'}
                  </>
                ) : userRole === 'creator' ? (
                  'Waiting for partner to join...'
                ) : (
                  'Waiting for creator...'
                )}
              </p>
            </div>
          </div>
        )}

        {/* Mobile Bottom Panel */}
        {isMobile && (
          <div className="mobile-bottom-panel">
            {/* Mobile Session Status */}
            <div className="mobile-session-status">
              <div className="status-row">
                <span className={`status-indicator ${connectionStatus}`}>
                  {getConnectionStatusText()}
                </span>
                <span className="duration-badge">
                  <FiClock /> {session?.duration || 50} min
                </span>
              </div>
              <div className="participant-info">
                <span className="participant-count">
                  <FiUsers /> {Math.max(1, participantCount)} participant{Math.max(1, participantCount) !== 1 ? 's' : ''}
                </span>
                {session?.partnerId && partnerConnected && (
                  <span className="partner-name">
                    👥 {session.partnerName || 
                        (userRole === 'creator' ? 'Study Partner' : 'Session Creator')}
                  </span>
                )}
              </div>
            </div>

            {/* Mobile Details Toggle */}
            <button 
              className="mobile-details-toggle"
              onClick={() => setMobileDetailsOpen(!mobileDetailsOpen)}
            >
              <span>Session Details</span>
              {mobileDetailsOpen ? <FiChevronDown /> : <FiChevronUp />}
            </button>

            {/* Mobile Details Panel */}
            {mobileDetailsOpen && (
              <div className="mobile-details-panel">
                <div className="mobile-detail-item">
                  <span className="label">Goal:</span>
                  <p className="value">{session?.goal || 'Loading...'}</p>
                </div>
                <div className="mobile-detail-item">
                  <span className="label">Your Role:</span>
                  <p className={`value ${userRole === 'creator' ? 'creator' : 'joiner'}`}>
                    {userRole === 'creator' ? '👑 Session Creator' : 
                     userRole === 'joiner' ? '🤝 Study Partner' : 
                     'Participant'}
                  </p>
                </div>
                <div className="mobile-detail-item">
                  <span className="label">
                    {userRole === 'creator' ? 'Study Partner:' : 
                     userRole === 'joiner' ? 'Session Creator:' : 
                     'Partner:'}
                  </span>
                  <p className={`value ${partnerConnected ? 'connected' : ''}`}>
                    {session?.partnerId ? (
                      <>
                        {session.partnerName || 'Study Partner'}
                        {partnerConnected ? ' (Connected)' : 
                         userRole === 'creator' ? ' (Invited)' : 
                         ' (Waiting to join)'}
                      </>
                    ) : userRole === 'creator' ? (
                      'Waiting for partner to join...'
                    ) : (
                      'Waiting for creator...'
                    )}
                  </p>
                </div>
                <div className="mobile-detail-item">
                  <span className="label">Session ID:</span>
                  <p className="value session-id">{sessionId}</p>
                </div>
              </div>
            )}

            {/* Mobile Action Buttons */}
            <div className="mobile-action-buttons">
              {jitsiReady && (
                <button 
                  onClick={toggleChat} 
                  className="mobile-action-btn chat-btn"
                  title="Open chat"
                >
                  💬 Chat
                </button>
              )}
              
              <button 
                onClick={userRole === 'creator' ? cancelSession : () => navigate('/dashboard')} 
                className={`mobile-action-btn ${userRole === 'creator' ? 'end-session-btn' : 'leave-session-btn'}`}
                title={userRole === 'creator' ? 'Cancel session' : 'Leave session'}
              >
                {userRole === 'creator' ? (
                  <><FiX /> Cancel Session</>
                ) : (
                  <><FiArrowLeft /> Leave Session</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Timer - Only show when session is active */}
        {sessionStarted && partnerConnected && (
          <>
            {!isMobile ? (
              <div className="timer-overlay">
                <SessionTimer 
                  duration={session?.duration || 50} 
                  onComplete={onTimerComplete}
                  autoStart={true}
                  showBreakReminder={false}
                  isOverlay={true}
                />
              </div>
            ) : (
              <div className={`mobile-timer ${mobileTimerMinimized ? 'minimized' : 'expanded'}`}>
                <div className="mobile-timer-header">
                  <span className="timer-title">Focus Timer</span>
                  <button 
                    className="timer-toggle"
                    onClick={() => setMobileTimerMinimized(!mobileTimerMinimized)}
                  >
                    {mobileTimerMinimized ? <FiChevronUp /> : <FiChevronDown />}
                  </button>
                </div>
                
                {!mobileTimerMinimized && (
                  <div className="mobile-timer-content">
                    <SessionTimer 
                      duration={session?.duration || 50} 
                      onComplete={onTimerComplete}
                      autoStart={true}
                      showBreakReminder={false}
                      isOverlay={false}
                      isMobile={true}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Waiting Modal */}
      {showWaitingModal && connectionStatus === 'waiting' && !partnerConnected && jitsiReady && (
        <div className="waiting-modal-overlay">
          <div className={`waiting-modal ${isMobile ? 'mobile' : ''}`}>
            <div className="waiting-content">
              <div className="waiting-icon">👥</div>
              
              {userRole === 'creator' ? (
                <>
                  <h3>Session Created! 🎯</h3>
                  <p>Your focus session is ready and waiting for a study partner</p>
                  
                  <div className="partner-status">
                    <div className="status-row">
                      <span className="status-label">Session Status:</span>
                      <span className="status-value active">✅ Active & Ready</span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">Your Role:</span>
                      <span className="status-value creator">👑 Session Creator</span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">Waiting For:</span>
                      <span className="status-value waiting">
                        {session?.partnerId && session?.partnerName ? (
                          `⏳ ${session.partnerName} to join`
                        ) : (
                          '⏳ Study partner to join'
                        )}
                      </span>
                    </div>
                  </div>
                  
                  <div className="waiting-actions">
                    <button 
                      className="btn-secondary"
                      onClick={cancelSession}
                    >
                      <FiX /> Cancel Session
                    </button>
                  </div>
                </>
              ) : userRole === 'joiner' ? (
                <>
                  <h3>Joined Session! 🤝</h3>
                  <p>You've successfully joined the study session</p>
                  
                  <div className="partner-status">
                    <div className="status-row">
                      <span className="status-label">Session Status:</span>
                      <span className="status-value active">✅ Connected</span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">Your Role:</span>
                      <span className="status-value joiner">🤝 Study Partner</span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">Waiting For:</span>
                      <span className="status-value waiting">
                        {waitingForCreator ? (
                          '⏳ Session creator to arrive'
                        ) : (
                          '⏳ Session to start'
                        )}
                      </span>
                    </div>
                  </div>
                  
                  <div className="waiting-actions">
                    <button 
                      className="btn-secondary"
                      onClick={() => navigate('/dashboard')}
                    >
                      <FiArrowLeft /> Leave Session
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3>Study Room Ready! 🎯</h3>
                  <p>Your focus session room is active and ready</p>
                  
                  <div className="partner-status">
                    <div className="status-row">
                      <span className="status-label">Room Status:</span>
                      <span className="status-value active">✅ Active & Ready</span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">Study Partner:</span>
                      <span className="status-value waiting">⏳ Waiting for partner to join</span>
                    </div>
                  </div>
                  
                  <div className="waiting-actions">
                    <button 
                      className="btn-secondary"
                      onClick={cancelSession}
                    >
                      <FiX /> Cancel Session
                    </button>
                  </div>
                </>
              )}
              
              <div className="waiting-footer">
                <small>Session ID: {sessionId}</small>
                <div className="pulse-indicator">
                  <span></span>
                  {userRole === 'creator' ? (
                    'Waiting for partner to join...'
                  ) : userRole === 'joiner' ? (
                    waitingForCreator ? 'Waiting for creator...' : 'Waiting for session to start...'
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