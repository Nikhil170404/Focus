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
        setLoading(false);
        setJitsiReady(true);
        setConnectionStatus('waiting');
      }
    }, 8000);

    return () => clearTimeout(timeout);
  }, [loading]);

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
        resolution: isMobile ? 480 : 720,
        constraints: {
          video: {
            aspectRatio: 16 / 9,
            height: { ideal: isMobile ? 480 : 720, max: isMobile ? 720 : 1080 }
          }
        }
      },
      interfaceConfigOverwrite: {
        MOBILE_APP_PROMO: false,
        SHOW_JITSI_WATERMARK: false,
        TOOLBAR_BUTTONS: isMobile ? 
          ['microphone', 'camera', 'chat', 'hangup'] :
          ['microphone', 'camera', 'chat', 'participants', 'hangup', 'settings'],
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: false
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
        if (!mountedRef.current || cleanupRef.current || apiRef.current) {
          initializationRef.current = false;
          return;
        }
        createJitsiAPI();
      };
      
      script.onerror = (error) => {
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
        apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
        setupEventListeners();
        setConnectionStatus('connecting');
        
        setTimeout(() => {
          if (mountedRef.current && !cleanupRef.current) {
            setLoading(false);
            setJitsiReady(true);
          }
        }, 2000);
        
      } catch (error) {
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
        apiRef.current.on('participantJoined', (participant) => {
          if (!mountedRef.current || cleanupRef.current) return;
          
          setParticipantCount(prev => prev + 1);
          
          const isCurrentUser = participant.id === user?.uid || 
                               participant.displayName === user?.displayName;
          
          if (!isCurrentUser) {
            setPartnerConnected(true);
            setConnectionStatus('connected');
            setSessionActive(true);
            
            toast.success(`${participant.displayName || 'Study partner'} joined! 🎉`);
          }
        });

        apiRef.current.on('participantLeft', (participant) => {
          if (!mountedRef.current || cleanupRef.current) return;
          
          setParticipantCount(prev => Math.max(1, prev - 1));
          
          const isCurrentUser = participant.id === user?.uid || 
                               participant.displayName === user?.displayName;
          
          if (!isCurrentUser) {
            setPartnerConnected(false);
            setConnectionStatus('waiting');
            setSessionActive(false);
            toast(`${participant.displayName || 'Study partner'} left the session`);
          }
        });

        apiRef.current.on('videoConferenceJoined', () => {
          if (!mountedRef.current || cleanupRef.current) return;
          
          setParticipantCount(1);
          setError(null);
          setLoading(false);
          setJitsiReady(true);
          setConnectionStatus('waiting');
          
          if (sessionData.userId === user?.uid) {
            setUserRole('creator');
            toast.success('Session created! Waiting for partner...');
          } else {
            setUserRole('joiner');
            toast.success('Joined session! Waiting for others...');
          }
        });

        apiRef.current.on('videoConferenceLeft', () => {
          if (!mountedRef.current || cleanupRef.current) return;
          setConnectionStatus('disconnected');
        });

        apiRef.current.on('readyToClose', () => {
          if (!cleanupRef.current) {
            endSession();
          }
        });

      } catch (error) {
        console.error('Error setting up event listeners:', error);
        setError('Failed to setup video connection');
        setLoading(false);
      }
    };

    loadJitsiAndInitialize();
  }, [sessionId, user, isMobile, endSession]);

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
          setError(`Error loading session: ${error.message}`);
          setLoading(false);
        }
      );
    } catch (error) {
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
        return userRole === 'creator' ? '⏳ Waiting for partner' : '⏳ Waiting to connect';
      case 'connected':
        return '🟢 Connected';
      case 'disconnected':
        return '🔴 Disconnected';
      default:
        return '🟡 Connecting...';
    }
  };

  const getTimerConfig = () => {
    if (!session || !sessionActive || !partnerConnected) return null;
    
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
          <small>Preparing video connection</small>
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
            </div>
          )}
          
          {jitsiReady && connectionStatus === 'waiting' && (
            <div className="video-overlay">
              <FiUsers className="waiting-icon" />
              <p>Waiting for study partner</p>
              <div className="waiting-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
        </div>

        {/* Session Timer - Show when active */}
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
                {session?.partnerId ? (
                  `${session.partnerName || 'Study Partner'} ${partnerConnected ? '(Connected)' : '(Joining...)'}`
                ) : (
                  'Waiting for partner...'
                )}
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
          </div>
        )}
      </div>
    </div>
  );
}

export default VideoSession;