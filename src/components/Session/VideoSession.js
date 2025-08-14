import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, onSnapshot, serverTimestamp, getDoc } from 'firebase/firestore';
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
  FiSettings,
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

  // Setup event listeners for Jitsi API
  const setupEventListeners = useCallback(() => {
    if (!apiRef.current) return;

    console.log('Setting up Jitsi event listeners');

    apiRef.current.on('audioMuteStatusChanged', (status) => {
      console.log('Audio mute status:', status.muted);
      setIsAudioMuted(status.muted);
    });

    apiRef.current.on('videoMuteStatusChanged', (status) => {
      console.log('Video mute status:', status.muted);
      setIsVideoMuted(status.muted);
    });

    apiRef.current.on('readyToClose', () => {
      console.log('Jitsi ready to close');
      endSession();
    });

    apiRef.current.on('participantJoined', (participant) => {
      console.log('Participant joined:', participant);
      setConnectionStatus('connected');
      if (participant.id !== user.uid) {
        toast.success(`${participant.displayName || 'Study partner'} joined! 🎉`);
      }
    });

    apiRef.current.on('participantLeft', (participant) => {
      console.log('Participant left:', participant);
      if (participant.id !== user.uid) {
        toast(`${participant.displayName || 'Study partner'} left the session`);
      }
    });

    apiRef.current.on('videoConferenceJoined', () => {
      console.log('Successfully joined video conference');
      setConnectionStatus('connected');
      setError(null);
    });

    apiRef.current.on('videoConferenceLeft', () => {
      console.log('Left video conference');
      setConnectionStatus('disconnected');
    });

  }, [user.uid]);

  // Initialize Jitsi Meet
  const initializeJitsi = useCallback((sessionData) => {
    if (!jitsiContainerRef.current) {
      console.error('Jitsi container ref is null');
      setError('Video container not ready');
      return;
    }

    if (!sessionData) {
      console.error('No session data available');
      setError('Session data not available');
      return;
    }

    console.log('Starting Jitsi initialization with session:', sessionData);
    
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
        toolbarButtons: [
          'microphone',
          'camera',
          'closedcaptions',
          'desktop',
          'fullscreen',
          'fodeviceselection',
          'hangup',
          'chat',
          'settings',
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
          'settings',
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
        console.log('Jitsi script loaded successfully');
        setJitsiReady(true);
        
        try {
          // Clear any existing instance
          if (apiRef.current) {
            apiRef.current.dispose();
          }
          
          apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
          setupEventListeners();
          setLoading(false);
          setConnectionStatus('connecting');
          toast.success('Video session started! 🎥');
        } catch (error) {
          console.error('Error initializing Jitsi:', error);
          setError(`Failed to initialize video session: ${error.message}`);
          setLoading(false);
        }
      };
      
      script.onerror = (error) => {
        console.error('Failed to load Jitsi script:', error);
        setError('Failed to load video session. Please check your internet connection.');
        setLoading(false);
      };
      
      document.body.appendChild(script);
      
    } else if (window.JitsiMeetExternalAPI) {
      console.log('Using existing Jitsi API');
      setJitsiReady(true);
      
      try {
        // Clear any existing instance
        if (apiRef.current) {
          apiRef.current.dispose();
        }
        
        apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
        setupEventListeners();
        setLoading(false);
        setConnectionStatus('connecting');
        toast.success('Video session started! 🎥');
      } catch (error) {
        console.error('Error initializing Jitsi:', error);
        setError(`Failed to initialize video session: ${error.message}`);
        setLoading(false);
      }
    }
  }, [sessionId, user, setupEventListeners]);

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
        apiRef.current.dispose();
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

  // Retry connection function
  const retryConnection = useCallback(() => {
    if (retryAttempts >= 3) {
      setError('Maximum retry attempts reached. Please refresh the page.');
      return;
    }

    setRetryAttempts(prev => prev + 1);
    setError(null);
    setLoading(true);
    
    // Dispose existing instance
    if (apiRef.current) {
      apiRef.current.dispose();
      apiRef.current = null;
    }
    
    // Clear the script loaded flag to force reload
    scriptLoadedRef.current = false;
    
    // Retry initialization
    setTimeout(() => {
      if (session) {
        initializeJitsi(session);
      }
    }, 1000);
  }, [retryAttempts, session, initializeJitsi]);

  // Main effect for session management
  useEffect(() => {
    if (!sessionId || !user) {
      console.log('Missing sessionId or user, redirecting to dashboard');
      navigate('/dashboard');
      return;
    }

    console.log('Setting up session listener for sessionId:', sessionId);

    // Listen to session changes
    const unsubscribe = onSnapshot(
      doc(db, 'sessions', sessionId), 
      (doc) => {
        console.log('Session snapshot received:', doc.exists());
        
        if (doc.exists()) {
          const sessionData = { id: doc.id, ...doc.data() };
          console.log('Session data:', sessionData);
          
          // Verify user access
          if (sessionData.userId !== user.uid && sessionData.partnerId !== user.uid) {
            console.error('User does not have access to this session');
            setError('You do not have access to this session');
            setLoading(false);
            return;
          }
          
          setSession(sessionData);
          
          // Initialize Jitsi only once and when container is ready
          if (!apiRef.current && jitsiContainerRef.current && !loading) {
            console.log('Initializing Jitsi with session data');
            initializeJitsi(sessionData);
          }
        } else {
          console.log('Session document does not exist');
          setError('Session not found');
          setLoading(false);
        }
      },
      (error) => {
        console.error('Error listening to session:', error);
        setError(`Error loading session: ${error.message}`);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [sessionId, user, navigate, initializeJitsi, loading]);

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
      apiRef.current.executeCommand('toggleAudio');
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleVideo');
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
  if (loading || !session) {
    return (
      <div className="video-session-loading">
        <div className="loading-container">
          <div className="spinner"></div>
          <p className="status-text">
            {!session ? 'Loading session...' : 'Connecting to video...'}
          </p>
          <small>This may take a few moments</small>
        </div>
      </div>
    );
  }

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
              {connectionStatus === 'connected' && '🟢 Connected'}
              {connectionStatus === 'connecting' && '🟡 Connecting...'}
              {connectionStatus === 'disconnected' && '🔴 Disconnected'}
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
            disabled={!apiRef.current}
            title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isAudioMuted ? <FiMicOff /> : <FiMic />}
          </button>
          
          <button 
            onClick={toggleVideo} 
            className={`control-btn ${isVideoMuted ? 'muted' : ''}`}
            disabled={!apiRef.current}
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
              {/* Fallback content while Jitsi loads */}
              {!jitsiReady && (
                <div className="video-placeholder">
                  <div className="connection-status">
                    <div className="spinner"></div>
                    <p>Initializing video conference...</p>
                    <small>Please wait while we set up your session</small>
                  </div>
                </div>
              )}
            </div>
            
            {/* Timer Overlay */}
            <div className="timer-overlay">
              <SessionTimer 
                duration={session?.duration || 50} 
                onComplete={onTimerComplete}
                autoStart={true}
                showBreakReminder={false}
                isOverlay={true}
              />
            </div>
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
            <p>{session.goal}</p>
          </div>
          {session.partnerId ? (
            <div className="detail-item">
              <span>Study Partner</span>
              <p className="status-active">
                {session.partnerName || 'Study Partner'}
              </p>
            </div>
          ) : (
            <div className="detail-item">
              <span>Status</span>
              <p>Waiting for partner...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VideoSession;