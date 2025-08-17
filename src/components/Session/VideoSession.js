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
  FiLoader,
  FiWifi,
  FiCheck,
  FiRefreshCw
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Core refs
  const jitsiContainerRef = useRef(null);
  const apiRef = useRef(null);
  const mountedRef = useRef(true);
  const cleanupRef = useRef(false);
  const sessionListenerRef = useRef(null);
  const initializationAttemptedRef = useRef(false);
  const participantCheckIntervalRef = useRef(null);
  const loadingTimeoutRef = useRef(null);
  
  // Simplified state management
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingStep, setLoadingStep] = useState('Initializing...');
  
  // Single connection state: 'loading', 'connecting', 'waiting-partner', 'connected', 'failed'
  const [connectionState, setConnectionState] = useState('loading');
  const [participantCount, setParticipantCount] = useState(0);
  const [userRole, setUserRole] = useState(null);
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  const [jitsiReady, setJitsiReady] = useState(false);
  
  // UI states
  const [isMobile, setIsMobile] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [timerMinimized, setTimerMinimized] = useState(false);

  // Check mobile and setup window listeners
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      setTimerMinimized(mobile);
      setDetailsExpanded(!mobile);
    };
    
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Component mount tracking
  useEffect(() => {
    mountedRef.current = true;
    cleanupRef.current = false;
    return () => {
      mountedRef.current = false;
      cleanupRef.current = true;
    };
  }, []);

  // CRITICAL: Maximum loading timeout to prevent infinite loading
  useEffect(() => {
    // Force stop loading after 10 seconds maximum
    loadingTimeoutRef.current = setTimeout(() => {
      if (loading && mountedRef.current) {
        console.log('⚠️ FORCE STOPPING LOADING - Taking too long');
        setLoading(false);
        setLoadingStep('Ready');
        
        // If no Jitsi container, try to initialize anyway
        if (!jitsiReady && jitsiContainerRef.current) {
          console.log('🔄 Attempting emergency Jitsi initialization');
          emergencyJitsiInit();
        }
      }
    }, 10000); // 10 seconds max

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [loading, jitsiReady]);

  // Emergency Jitsi initialization for stuck loading
  const emergencyJitsiInit = useCallback(async () => {
    if (initializationAttemptedRef.current || cleanupRef.current) return;
    
    console.log('🚨 Emergency Jitsi initialization');
    initializationAttemptedRef.current = true;
    setConnectionState('connecting');
    setLoadingStep('Emergency video setup...');
    
    try {
      // Load Jitsi script if needed
      if (!window.JitsiMeetExternalAPI) {
        await loadJitsiScript();
      }
      
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
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: ['microphone', 'camera', 'hangup']
        }
      };

      apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      setupBasicJitsiListeners();
      
      setLoading(false);
      setJitsiReady(true);
      setConnectionState('waiting-partner');
      
    } catch (error) {
      console.error('❌ Emergency init failed:', error);
      setError('Failed to initialize video. Please refresh the page.');
      setLoading(false);
    }
  }, [sessionId, user]);

  // CRITICAL: Reliable participant count checking with multiple methods
  const checkParticipantCount = useCallback(() => {
    if (!apiRef.current || cleanupRef.current || !mountedRef.current || !jitsiReady) {
      return;
    }

    try {
      // Method 1: Use Jitsi's getNumberOfParticipants()
      const currentCount = apiRef.current.getNumberOfParticipants();
      
      console.log('🔍 Checking participant count:', {
        currentCount,
        previousCount: participantCount,
        connectionState,
        jitsiReady
      });

      // Update participant count state
      setParticipantCount(currentCount);

      // Update connection state based on participant count
      if (currentCount >= 2 && connectionState !== 'connected') {
        console.log('✅ Both participants detected - Setting state to CONNECTED');
        setConnectionState('connected');
        
        // Show success notification only once
        if (connectionState === 'waiting-partner') {
          toast.success('🎉 Partner connected! Session is now active!');
        }
      } else if (currentCount === 1 && (connectionState === 'connected' || connectionState === 'waiting-partner')) {
        console.log('⏳ Only one participant - Setting state to WAITING');
        setConnectionState('waiting-partner');
      } else if (currentCount === 0 && connectionState !== 'connecting') {
        console.log('🔄 No participants - Checking connection');
        setConnectionState('connecting');
      }

    } catch (error) {
      console.error('❌ Error checking participant count:', error);
    }
  }, [participantCount, connectionState, jitsiReady]);

  // Start participant count polling
  const startParticipantPolling = useCallback(() => {
    if (participantCheckIntervalRef.current) {
      clearInterval(participantCheckIntervalRef.current);
    }

    // Check every 2 seconds for participant changes
    participantCheckIntervalRef.current = setInterval(() => {
      if (!cleanupRef.current && jitsiReady && apiRef.current) {
        checkParticipantCount();
      }
    }, 2000);

    console.log('📊 Started participant polling');
  }, [checkParticipantCount, jitsiReady]);

  // Stop participant polling
  const stopParticipantPolling = useCallback(() => {
    if (participantCheckIntervalRef.current) {
      clearInterval(participantCheckIntervalRef.current);
      participantCheckIntervalRef.current = null;
      console.log('🛑 Stopped participant polling');
    }
  }, []);

  // Load Jitsi script promise
  const loadJitsiScript = () => {
    return new Promise((resolve, reject) => {
      if (window.JitsiMeetExternalAPI) {
        resolve();
        return;
      }

      console.log('📦 Loading Jitsi script...');
      setLoadingStep('Loading video system...');

      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = () => {
        console.log('✅ Jitsi script loaded successfully');
        setLoadingStep('Video system loaded');
        resolve();
      };
      script.onerror = () => {
        console.error('❌ Failed to load Jitsi script');
        setLoadingStep('Failed to load video system');
        reject(new Error('Failed to load Jitsi script'));
      };
      document.body.appendChild(script);
    });
  };

  // Simplified Jitsi initialization
  const initializeJitsi = useCallback(async (sessionData) => {
    if (initializationAttemptedRef.current || cleanupRef.current || !mountedRef.current) {
      console.log('⚠️ Skipping Jitsi init - already attempted or unmounted');
      return;
    }

    initializationAttemptedRef.current = true;
    setConnectionState('connecting');
    setLoadingStep('Setting up video conference...');
    
    console.log('🚀 Initializing Jitsi Meet...', { sessionData });
    
    const roomName = `focusmate-${sessionId}`.replace(/[^a-zA-Z0-9-]/g, '');
    
    try {
      // Load Jitsi script if not available
      if (!window.JitsiMeetExternalAPI) {
        setLoadingStep('Loading video system...');
        await loadJitsiScript();
      }

      setLoadingStep('Creating video room...');

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
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          enableClosePage: false,
          disableInviteFunctions: true,
          enableWelcomePage: false,
          requireDisplayName: false,
          resolution: isMobile ? 360 : 720,
          constraints: {
            video: {
              aspectRatio: 16 / 9,
              height: { ideal: isMobile ? 360 : 720, max: isMobile ? 480 : 1080 },
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
          TOOLBAR_BUTTONS: isMobile ? 
            ['microphone', 'camera', 'hangup'] :
            ['microphone', 'camera', 'chat', 'hangup', 'settings'],
          TOOLBAR_ALWAYS_VISIBLE: isMobile,
          FILM_STRIP_MAX_HEIGHT: isMobile ? 80 : 120,
          DISABLE_INVITE_FUNCTIONS: true
        }
      };

      console.log('🎯 Creating Jitsi API instance');
      setLoadingStep('Connecting to video...');
      
      apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      setupJitsiEventListeners(sessionData);
      
      console.log('✅ Jitsi API created successfully');
      
    } catch (error) {
      console.error('❌ Failed to create Jitsi API:', error);
      setError('Failed to initialize video connection. Please refresh and try again.');
      setConnectionState('failed');
      setLoading(false);
    }
  }, [sessionId, user, isMobile]);

  // Basic Jitsi listeners for emergency init
  const setupBasicJitsiListeners = useCallback(() => {
    if (!apiRef.current) return;
    
    apiRef.current.on('videoConferenceJoined', () => {
      console.log('✅ Emergency: Conference joined');
      setJitsiReady(true);
      setConnectionState('waiting-partner');
      startParticipantPolling();
    });

    apiRef.current.on('participantJoined', () => {
      setTimeout(checkParticipantCount, 500);
    });

    apiRef.current.on('participantLeft', () => {
      setTimeout(checkParticipantCount, 500);
    });
  }, [startParticipantPolling, checkParticipantCount]);

  // Setup Jitsi event listeners with improved participant tracking
  const setupJitsiEventListeners = useCallback((sessionData) => {
    if (!apiRef.current || cleanupRef.current) return;

    console.log('🔗 Setting up Jitsi event listeners');

    // Conference joined - user successfully joined
    apiRef.current.on('videoConferenceJoined', (event) => {
      if (!mountedRef.current || cleanupRef.current) return;
      
      console.log('✅ Conference joined:', event);
      
      setLoading(false);
      setJitsiReady(true);
      setConnectionState('waiting-partner');
      setLoadingStep('Ready');
      
      // Clear loading timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      
      // Determine user role
      if (sessionData.userId === user?.uid) {
        setUserRole('creator');
        toast.success('Session ready! Waiting for partner...');
      } else {
        setUserRole('joiner');
        toast.success('Joined session successfully!');
      }

      // Start polling for participants after joining
      setTimeout(() => {
        if (!cleanupRef.current) {
          startParticipantPolling();
          // Initial check
          checkParticipantCount();
        }
      }, 1000);
    });

    // Participant joined - someone else joined
    apiRef.current.on('participantJoined', (participant) => {
      if (!mountedRef.current || cleanupRef.current) return;
      
      console.log('👤 Participant joined event:', participant);
      
      // Immediate check after participant joins
      setTimeout(() => {
        if (!cleanupRef.current) {
          checkParticipantCount();
        }
      }, 500);
      
      toast.success(`${participant.displayName || 'Study partner'} joined! 🎉`);
    });

    // Participant left
    apiRef.current.on('participantLeft', (participant) => {
      if (!mountedRef.current || cleanupRef.current) return;
      
      console.log('👤 Participant left event:', participant);
      
      // Immediate check after participant leaves
      setTimeout(() => {
        if (!cleanupRef.current) {
          checkParticipantCount();
        }
      }, 500);
      
      toast(`${participant.displayName || 'Study partner'} left the session`);
    });

    // Conference left - user left
    apiRef.current.on('videoConferenceLeft', () => {
      if (!mountedRef.current || cleanupRef.current) return;
      
      console.log('📤 Left conference');
      setConnectionState('waiting-partner');
      setParticipantCount(0);
      stopParticipantPolling();
    });

    // Connection failed
    apiRef.current.on('connectionFailed', () => {
      console.log('❌ Connection failed');
      setConnectionState('failed');
      setError('Connection failed. Please check your internet and try again.');
      stopParticipantPolling();
      setLoading(false);
    });

    // Ready to close
    apiRef.current.on('readyToClose', () => {
      console.log('🔚 Ready to close');
      if (!cleanupRef.current) {
        endSession();
      }
    });

    // Error handling
    apiRef.current.on('cameraError', (error) => {
      console.error('📷 Camera error:', error);
      toast.error('Camera access failed. Please check permissions.');
      setLoading(false);
    });

    apiRef.current.on('micError', (error) => {
      console.error('🎤 Microphone error:', error);
      toast.error('Microphone access failed. Please check permissions.');
      setLoading(false);
    });

  }, [user?.uid, startParticipantPolling, stopParticipantPolling, checkParticipantCount]);

  // Session listener with better error handling and debugging
  useEffect(() => {
    if (!sessionId || !user?.uid) {
      console.log('❌ Missing sessionId or user, redirecting to dashboard');
      navigate('/dashboard');
      return;
    }

    if (sessionListenerRef.current) {
      console.log('⚠️ Session listener already exists, skipping');
      return;
    }

    console.log('📡 Setting up session listener for:', sessionId);
    setLoadingStep('Loading session data...');

    const unsubscribe = onSnapshot(
      doc(db, 'sessions', sessionId),
      (docSnap) => {
        if (!mountedRef.current || cleanupRef.current) return;
        
        console.log('📄 Session document snapshot received:', { exists: docSnap.exists() });
        
        if (docSnap.exists()) {
          const sessionData = { id: docSnap.id, ...docSnap.data() };
          console.log('✅ Session data loaded:', sessionData);
          
          // Check access permissions
          if (sessionData.userId !== user.uid && sessionData.partnerId !== user.uid) {
            console.log('❌ Access denied to session');
            setError('You do not have access to this session');
            setLoading(false);
            return;
          }

          // Check if session is ended
          if (sessionData.status === 'completed' || sessionData.status === 'cancelled') {
            console.log('❌ Session has ended:', sessionData.status);
            setError('This session has ended');
            setLoading(false);
            return;
          }
          
          setSession(sessionData);
          setLoadingStep('Session loaded, preparing video...');
          
          // Set user role
          if (sessionData.userId === user.uid) {
            setUserRole('creator');
            console.log('👑 User role: creator');
          } else if (sessionData.partnerId === user.uid) {
            setUserRole('joiner');
            console.log('🤝 User role: joiner');
          }
          
          // Initialize Jitsi only once when container is ready and session is active
          if (jitsiContainerRef.current && 
              !initializationAttemptedRef.current && 
              sessionData.status === 'scheduled') {
            
            console.log('🎬 Conditions met for Jitsi initialization');
            setLoadingStep('Initializing video system...');
            
            setTimeout(() => {
              if (mountedRef.current && !cleanupRef.current && !initializationAttemptedRef.current) {
                console.log('🚀 Starting Jitsi initialization');
                initializeJitsi(sessionData);
              }
            }, 1000);
          } else {
            console.log('⚠️ Jitsi initialization skipped:', {
              containerReady: !!jitsiContainerRef.current,
              alreadyAttempted: initializationAttemptedRef.current,
              sessionStatus: sessionData.status
            });
            
            // If we can't initialize, force loading to stop
            if (sessionData.status !== 'scheduled') {
              setLoading(false);
            }
          }
        } else {
          console.log('❌ Session document does not exist');
          setError('Session not found');
          setLoading(false);
        }
      },
      (error) => {
        if (!mountedRef.current || cleanupRef.current) return;
        console.error('❌ Session listener error:', error);
        setError('Failed to connect to session. Please refresh and try again.');
        setLoading(false);
      }
    );

    sessionListenerRef.current = unsubscribe;

    return () => {
      if (sessionListenerRef.current) {
        console.log('🧹 Cleaning up session listener');
        sessionListenerRef.current();
        sessionListenerRef.current = null;
      }
    };
  }, [sessionId, user?.uid, navigate, initializeJitsi]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current = true;
      
      stopParticipantPolling();
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          console.log('Cleanup error:', e);
        }
        apiRef.current = null;
      }
      
      initializationAttemptedRef.current = false;
    };
  }, [stopParticipantPolling]);

  // Force skip loading function
  const forceSkipLoading = useCallback(() => {
    console.log('🔄 Force skipping loading state');
    setLoading(false);
    setLoadingStep('Ready');
    
    if (!jitsiReady && jitsiContainerRef.current) {
      emergencyJitsiInit();
    } else {
      setConnectionState('waiting-partner');
    }
  }, [jitsiReady, emergencyJitsiInit]);

  // End session function
  const endSession = useCallback(async () => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;
    
    try {
      stopParticipantPolling();
      
      if (sessionId && session && session.status !== 'completed') {
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
  }, [sessionId, session, navigate, stopParticipantPolling]);

  // Cancel session function
  const cancelSession = useCallback(async () => {
    if (cleanupRef.current) return;
    
    try {
      stopParticipantPolling();
      
      if (sessionId) {
        await updateDoc(doc(db, 'sessions', sessionId), {
          status: 'cancelled',
          cancelledAt: serverTimestamp()
        });
      }

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
  }, [sessionId, navigate, stopParticipantPolling]);

  // Timer complete handler
  const onTimerComplete = useCallback(() => {
    toast.success('Time\'s up! Session completed! 🎯');
    setTimeout(() => {
      if (!cleanupRef.current) {
        endSession();
      }
    }, 2000);
  }, [endSession]);

  // Helper functions
  const getConnectionStatusText = () => {
    if (!networkOnline) return '📶 No internet connection';
    
    switch (connectionState) {
      case 'loading':
        return '⏳ Loading session...';
      case 'connecting':
        return '🟡 Connecting to video...';
      case 'waiting-partner':
        return userRole === 'creator' ? '⏳ Waiting for partner to join' : '⏳ Waiting for partner';
      case 'connected':
        return `🟢 Connected (${participantCount} participants)`;
      case 'failed':
        return '🔴 Connection failed';
      default:
        return '🟡 Loading...';
    }
  };

  const getPartnerStatusText = () => {
    if (!session) return 'Loading session...';
    
    if (!session.partnerId) {
      return 'No partner assigned yet';
    }
    
    const partnerName = session.partnerName || 'Study Partner';
    const isPartnerConnected = connectionState === 'connected' && participantCount >= 2;
    
    return `${partnerName} ${isPartnerConnected ? '(Connected ✅)' : '(Not connected yet)'}`;
  };

  const shouldShowTimer = () => {
    return connectionState === 'connected' && participantCount >= 2 && session;
  };

  // Loading state - with escape hatch
  if (loading) {
    return (
      <div className="video-session-loading">
        <div className="loading-container">
          <FiLoader className="spinner" />
          <h3>Setting up your focus session...</h3>
          <p>{loadingStep}</p>
          
          <div className="loading-debug">
            <small>Session ID: {sessionId}</small>
            <small>User: {user?.email}</small>
            <small>Container Ready: {jitsiContainerRef.current ? 'Yes' : 'No'}</small>
          </div>
          
          {/* Emergency escape hatch after 5 seconds */}
          <div className="loading-actions" style={{ marginTop: '20px' }}>
            <button 
              className="btn-secondary"
              onClick={forceSkipLoading}
              style={{ 
                padding: '8px 16px', 
                fontSize: '12px',
                opacity: 0.8
              }}
            >
              <FiRefreshCw /> Skip Loading
            </button>
          </div>
          
          {isMobile && (
            <div className="mobile-tips">
              <p>💡 Keep this page open for the best experience</p>
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

  return (
    <div className={`video-session ${isMobile ? 'mobile' : 'desktop'}`}>
      {/* Header */}
      <div className="video-header">
        <div className="session-info">
          <div className="session-title">
            <h3>{session?.goal || 'Focus Session'}</h3>
            {userRole && (
              <span className={`role-badge ${userRole}`}>
                {userRole === 'creator' ? '👑 Host' : '🤝 Participant'}
              </span>
            )}
          </div>
          
          <div className="session-meta">
            <span className="duration">
              <FiClock /> {session?.duration || 50}min
            </span>
            <span className={`connection-status ${connectionState}`}>
              <FiWifi />
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
            title={userRole === 'creator' ? 'End session for everyone' : 'Leave session'}
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
          {/* Connection status overlay - only show when actually needed */}
          {connectionState === 'connecting' && (
            <div className="video-overlay">
              <FiLoader className="spinner" />
              <h3>Connecting to video system...</h3>
              <p>Please wait while we establish the connection</p>
            </div>
          )}
          
          {/* Waiting for partner overlay - only when truly waiting */}
          {connectionState === 'waiting-partner' && jitsiReady && (
            <div className="video-overlay">
              <FiUsers className="waiting-icon" />
              <h3>Waiting for study partner</h3>
              <div className="waiting-animation">
                <div className="pulse-dot"></div>
                <div className="pulse-dot"></div>
                <div className="pulse-dot"></div>
              </div>
              <p>
                {userRole === 'creator' 
                  ? 'Share this session with your study partner' 
                  : 'The session creator will join soon'
                }
              </p>
              <small>Participants: {participantCount}/2</small>
            </div>
          )}

          {/* Connection failed overlay */}
          {connectionState === 'failed' && (
            <div className="video-overlay">
              <div className="error-icon">⚠️</div>
              <h3>Connection Failed</h3>
              <p>Unable to connect to the video system</p>
              <button 
                className="btn-primary"
                onClick={() => window.location.reload()}
              >
                Retry Connection
              </button>
            </div>
          )}

          {/* Success indicator when connected */}
          {connectionState === 'connected' && (
            <div className="connection-success-indicator">
              <FiCheck className="success-icon" />
              <span>Connected with {participantCount} participants</span>
            </div>
          )}
        </div>

        {/* Session Timer Overlay - only when both participants are connected */}
        {shouldShowTimer() && (
          <div className={`session-timer-overlay ${timerMinimized ? 'minimized' : ''}`}>
            {isMobile && (
              <button 
                className="timer-toggle"
                onClick={() => setTimerMinimized(!timerMinimized)}
              >
                {timerMinimized ? <FiChevronUp /> : <FiChevronDown />}
              </button>
            )}
            
            {!timerMinimized ? (
              <SessionTimer 
                duration={session.duration}
                onComplete={onTimerComplete}
                autoStart={true}
                showBreakReminder={false}
                isOverlay={true}
                isMobile={isMobile}
              />
            ) : (
              <div className="timer-minimized">
                <FiClock />
                <span>Timer Active</span>
              </div>
            )}
          </div>
        )}
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
              <span className="label">Your Role:</span>
              <span className={`value role-${userRole}`}>
                {userRole === 'creator' ? '👑 Session Host' : '🤝 Participant'}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="label">Partner:</span>
              <span className="value">
                {getPartnerStatusText()}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="label">Connection:</span>
              <span className={`value status-${connectionState}`}>
                {getConnectionStatusText()}
              </span>
            </div>

            <div className="detail-row">
              <span className="label">Participants:</span>
              <span className="value">{participantCount}/2 connected</span>
            </div>

            <div className="detail-row">
              <span className="label">Timer:</span>
              <span className="value">
                {shouldShowTimer() ? '🟢 Active and running' : '⏸️ Waiting for both participants'}
              </span>
            </div>

            <div className="detail-row">
              <span className="label">Duration:</span>
              <span className="value">{session?.duration || 50} minutes</span>
            </div>

            {/* Network status */}
            {!networkOnline && (
              <div className="detail-row error">
                <span className="label">Network:</span>
                <span className="value">📶 Offline - Check your connection</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Network status bar */}
      {!networkOnline && (
        <div className="network-status-bar offline">
          <FiWifi className="icon" />
          <span>No internet connection - Please check your network</span>
        </div>
      )}
    </div>
  );
}

export default VideoSession;