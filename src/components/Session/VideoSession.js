import React, { useState, useEffect, useRef, useCallback , useMemo } from 'react';
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

// SIMPLIFIED: Only 3 states needed
const CONNECTION_STATES = {
  LOADING: 'loading',
  ACTIVE: 'active',  // Session is active with timer
  ENDED: 'ended'
};

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Simplified refs
  const jitsiContainerRef = useRef(null);
  const apiRef = useRef(null);
  const mountedRef = useRef(true);
  const sessionListenerRef = useRef(null);
  
  // Simplified state - no complex connection states
  const [session, setSession] = useState(null);
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.LOADING);
  const [participantCount, setParticipantCount] = useState(1);
  const [error, setError] = useState(null);
  const [isMobile] = useState(window.innerWidth <= 768);
  const [userRole, setUserRole] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  
  // Audio/Video controls
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, []);

  // SIMPLIFIED: Load session and start immediately
  useEffect(() => {
    if (!sessionId || !user?.uid) {
      setError('Invalid session or user not authenticated');
      return;
    }

    initializeSessionFast();
  }, [sessionId, user?.uid]);

  // SUPER SIMPLE: Load session and start session immediately
  const initializeSessionFast = async () => {
    try {
      console.log('🚀 Fast session initialization...');
      
      // Load session data
      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
      
      if (!sessionDoc.exists()) {
        throw new Error('Session not found');
      }

      const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
      
      // Quick access validation
      const isCreator = sessionData.userId === user.uid;
      const isPartner = sessionData.partnerId === user.uid;
      const isInParticipants = sessionData.participants && sessionData.participants.includes(user.uid);
      
      if (!isCreator && !isPartner && !isInParticipants) {
        throw new Error('You do not have access to this session');
      }

      setSession(sessionData);
      setUserRole(isCreator ? 'creator' : 'partner');
      
      // Set up real-time listener
      setupSessionListener();
      
      // IMMEDIATELY start the session - no waiting!
      console.log('✅ Session loaded, starting immediately...');
      setConnectionState(CONNECTION_STATES.ACTIVE);
      
      toast.success('🎯 Focus session started! Begin working on your goal.');
      
      // Load video in background (non-blocking)
      setTimeout(() => {
        loadVideoInBackground();
      }, 1000);
      
    } catch (error) {
      console.error('❌ Session initialization failed:', error);
      setError(error.message);
    }
  };

  // Set up session listener (simple)
  const setupSessionListener = () => {
    if (sessionListenerRef.current) return;

    sessionListenerRef.current = onSnapshot(
      doc(db, 'sessions', sessionId),
      (docSnap) => {
        if (!mountedRef.current) return;
        
        if (docSnap.exists()) {
          const sessionData = { id: docSnap.id, ...docSnap.data() };
          setSession(sessionData);
          
          if (sessionData.status === 'completed' || sessionData.status === 'cancelled') {
            handleSessionEnd();
          }
        }
      },
      (error) => {
        console.error('Session listener error:', error);
      }
    );
  };

  // BACKGROUND video loading (doesn't block session)
  const loadVideoInBackground = async () => {
    try {
      console.log('🎥 Loading video in background...');
      
      // Load Jitsi script
      if (!window.JitsiMeetExternalAPI) {
        await loadJitsiScript();
      }

      if (!mountedRef.current || !jitsiContainerRef.current) {
        console.log('⚠️ Component unmounted, skipping video');
        return;
      }

      // Create Jitsi room
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
          prejoinPageEnabled: false,
          startWithAudioMuted: true,
          startWithVideoMuted: true,
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
          TOOLBAR_BUTTONS: isMobile ? 
            ['microphone', 'camera', 'hangup'] :
            ['microphone', 'camera', 'hangup', 'settings'],
          TOOLBAR_ALWAYS_VISIBLE: isMobile,
          DISABLE_INVITE_FUNCTIONS: true,
          DISABLE_DEEP_LINKING: true,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
        }
      };

      console.log('🔧 Creating Jitsi API...');
      apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      
      // Simple event listeners (don't affect session state)
      setupSimpleVideoEvents();
      
      // Mark video as ready after 3 seconds
      setTimeout(() => {
        if (mountedRef.current) {
          setVideoReady(true);
          toast.success('📹 Video chat is now available!');
        }
      }, 3000);
      
    } catch (error) {
      console.error('❌ Video background loading failed:', error);
      // Session continues without video - not a problem!
      toast('Video unavailable - focus session continues', {
        icon: '📚',
        duration: 3000
      });
    }
  };

  // Load Jitsi script (simple)
  const loadJitsiScript = () => {
    return new Promise((resolve, reject) => {
      if (window.JitsiMeetExternalAPI) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load video'));
      
      document.body.appendChild(script);
      
      setTimeout(() => {
        if (!window.JitsiMeetExternalAPI) {
          reject(new Error('Video load timeout'));
        }
      }, 10000);
    });
  };

  // Simple video events (don't block anything)
  const setupSimpleVideoEvents = () => {
    if (!apiRef.current) return;

    console.log('🎧 Setting up simple video events...');

    try {
      // Participant events
      apiRef.current.addEventListener('participantJoined', (participant) => {
        console.log('👤 Participant joined:', participant);
        setParticipantCount(prev => prev + 1);
        const name = participant.displayName || participant.formattedDisplayName || 'Study partner';
        toast.success(`${name} joined the video! 🤝`);
      });

      apiRef.current.addEventListener('participantLeft', (participant) => {
        console.log('👋 Participant left:', participant);
        setParticipantCount(prev => Math.max(1, prev - 1));
        const name = participant.displayName || participant.formattedDisplayName || 'Study partner';
        toast(`${name} left the video chat`);
      });

      // Audio/Video status
      apiRef.current.addEventListener('audioMuteStatusChanged', (event) => {
        setIsAudioMuted(event.muted);
      });

      apiRef.current.addEventListener('videoMuteStatusChanged', (event) => {
        setIsVideoMuted(event.muted);
      });

      // Ready to close
      apiRef.current.addEventListener('readyToClose', () => {
        endSession();
      });
    } catch (error) {
      console.log('Video event setup error (non-critical):', error);
    }
  };

  // Audio/Video controls
  const toggleAudio = useCallback(() => {
    if (apiRef.current) {
      try {
        apiRef.current.executeCommand('toggleAudio');
      } catch (error) {
        console.log('Audio toggle error:', error);
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (apiRef.current) {
      try {
        apiRef.current.executeCommand('toggleVideo');
      } catch (error) {
        console.log('Video toggle error:', error);
      }
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

  // Simple cleanup
  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up...');

    if (sessionListenerRef.current) {
      sessionListenerRef.current();
      sessionListenerRef.current = null;
    }

    if (apiRef.current) {
      try {
        apiRef.current.dispose();
      } catch (e) {
        console.log('Cleanup error:', e);
      }
      apiRef.current = null;
    }
  }, []);

  // Timer completion
  const onTimerComplete = useCallback(() => {
    toast.success('Time\'s up! Session completed! 🎯');
    setTimeout(endSession, 2000);
  }, [endSession]);

  // Retry session
  const retrySession = useCallback(() => {
    setError(null);
    setConnectionState(CONNECTION_STATES.LOADING);
    cleanup();
    setTimeout(initializeSessionFast, 1000);
  }, []);

  // Get partner info
  const partnerInfo = useMemo(() => {
    if (!session) return { hasPartner: false, name: 'Loading...' };

    if (!session.partnerId) {
      return {
        hasPartner: false,
        name: 'Looking for partner...',
        description: 'Others can join this session'
      };
    }

    const isCreator = session.userId === user?.uid;
    return {
      hasPartner: true,
      name: isCreator ? (session.partnerName || 'Study Partner') : (session.userName || 'Study Partner'),
      description: 'Ready to focus together'
    };
  }, [session, user?.uid]);

  // SIMPLE LOADING STATE
  if (connectionState === CONNECTION_STATES.LOADING) {
    return (
      <div className="video-session-loading">
        <div className="loading-container">
          <FiLoader className="spinner" />
          <h3>Starting your focus session</h3>
          <p>Just a moment...</p>
          
          {session && (
            <div className="session-preview">
              <h4>Focus Goal:</h4>
              <p className="session-goal">"{session.goal}"</p>
              <p>Duration: {session.duration} minutes</p>
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
          <div className="error-icon">
            <FiAlertCircle size={48} />
          </div>
          <h2>Session Error</h2>
          <p>{error}</p>
          <div className="error-actions">
            <button className="btn-primary" onClick={retrySession}>
              <FiRefreshCw /> Try Again
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

  // MAIN SESSION VIEW - Always active, video loads in background
  return (
    <div className={`video-session ${isMobile ? 'mobile' : 'desktop'}`}>
      {/* Header */}
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
            <span className="video-status">
              <FiWifi style={{ color: videoReady ? '#10b981' : '#f59e0b' }} /> 
              {videoReady ? 'Video Ready' : 'Video Loading...'}
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
          {/* Session is active - show encouragement */}
          {!videoReady && (
            <div className="video-overlay">
              <div className="session-active-icon">🎯</div>
              <h3>Focus Session Active!</h3>
              <p>Start working on your goal. Video is loading in the background.</p>
              
              <div className="session-details">
                <div className="detail">
                  <strong>Goal:</strong> {session?.goal}
                </div>
                <div className="detail">
                  <strong>Partner:</strong> {partnerInfo.name}
                </div>
                <div className="detail">
                  <strong>Description:</strong> {partnerInfo.description}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Session Timer - ALWAYS SHOWN */}
        <div className="session-timer-overlay">
          <SessionTimer 
            duration={session?.duration || 50}
            onComplete={onTimerComplete}
            autoStart={true}
            isOverlay={true}
            isMobile={isMobile}
          />
        </div>

        {/* Video Controls - only show when video is ready */}
        {isMobile && videoReady && apiRef.current && (
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

      {/* Session Info Footer */}
      <div className="session-footer">
        <div className="session-encouragement">
          <p>💡 <strong>Focus Tip:</strong> Put your phone away and eliminate distractions for maximum productivity!</p>
        </div>
      </div>
    </div>
  );
}

export default VideoSession;