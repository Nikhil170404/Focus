import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, onSnapshot, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { 
  FiX,
  FiClock,
  FiUsers,
  FiArrowLeft,
  FiLoader,
  FiWifi,
  FiCheck,
  FiRefreshCw,
  FiAlertCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';

// SIMPLIFIED: Only 3 states needed
const CONNECTION_STATES = {
  LOADING: 'loading',
  ACTIVE: 'active',
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
  const timerIntervalRef = useRef(null);
  
  // Simplified state
  const [session, setSession] = useState(null);
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.LOADING);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState(null);
  const [isMobile] = useState(window.innerWidth <= 768);
  const [isTablet] = useState(window.innerWidth > 768 && window.innerWidth <= 1024);
  const [userRole, setUserRole] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [participantNames, setParticipantNames] = useState([]);
  
  // Timer state
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

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
      
      // Set initial participant count based on session data
      let initialCount = 1; // Current user
      const names = [user?.displayName || user?.email?.split('@')[0] || 'You'];
      
      if (sessionData.partnerId) {
        initialCount = 2;
        if (isCreator && sessionData.partnerName) {
          names.push(sessionData.partnerName);
        } else if (!isCreator && sessionData.userName) {
          names.push(sessionData.userName);
        }
      }
      
      setParticipantCount(initialCount);
      setParticipantNames(names);
      
      // Initialize timer
      const duration = sessionData.duration || 50;
      const totalSeconds = duration * 60;
      setTimeLeft(totalSeconds);
      setTotalTime(totalSeconds);
      
      // Set up real-time listener
      setupSessionListener();
      
      // IMMEDIATELY start the session - no waiting!
      console.log('✅ Session loaded, starting immediately...');
      setConnectionState(CONNECTION_STATES.ACTIVE);
      
      // Start timer automatically
      setTimerRunning(true);
      
      toast.success('🎯 Focus session started!');
      
      // Load video in background (non-blocking)
      setTimeout(() => {
        loadVideoInBackground();
      }, 1000);
      
    } catch (error) {
      console.error('❌ Session initialization failed:', error);
      setError(error.message);
    }
  };

  // Timer effect
  useEffect(() => {
    if (timerRunning && timeLeft > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          const newTime = prev - 1;
          if (newTime <= 0) {
            setTimerRunning(false);
            onTimerComplete();
            return 0;
          }
          return newTime;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [timerRunning, timeLeft]);

  // Format time display
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Calculate progress percentage
  const progress = useMemo(() => {
    if (totalTime === 0) return 0;
    return ((totalTime - timeLeft) / totalTime) * 100;
  }, [timeLeft, totalTime]);

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
          
          // Update participant information
          const names = [user?.displayName || user?.email?.split('@')[0] || 'You'];
          let count = 1;
          
          if (sessionData.partnerId) {
            count = 2;
            const isCreator = sessionData.userId === user.uid;
            if (isCreator && sessionData.partnerName) {
              names.push(sessionData.partnerName);
            } else if (!isCreator && sessionData.userName) {
              names.push(sessionData.userName);
            }
          }
          
          setParticipantCount(count);
          setParticipantNames(names);
          
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
          requireDisplayName: true,
          defaultLanguage: 'en',
          enableNoisyMicDetection: true,
          enableTalkWhileMuted: false,
          disableRemoteMute: false,
          enableAutomaticUrlCopy: false,
          toolbarButtons: isMobile ? 
            ['microphone', 'camera', 'hangup', 'tileview'] :
            ['microphone', 'camera', 'hangup', 'tileview', 'settings', 'fullscreen']
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false,
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          ENABLE_MOBILE_BROWSER: true,
          HIDE_DEEP_LINKING_LOGO: true,
          TOOLBAR_ALWAYS_VISIBLE: true,
          DISABLE_INVITE_FUNCTIONS: true,
          DISABLE_DEEP_LINKING: true,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
          HIDE_INVITE_MORE_HEADER: true,
          SHOW_CHROME_EXTENSION_BANNER: false,
          VERTICAL_FILMSTRIP: false,
          TILE_VIEW_MAX_COLUMNS: 2
        }
      };

      console.log('🔧 Creating Jitsi API...');
      apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      
      // Simple event listeners
      setupSimpleVideoEvents();
      
      // Mark video as ready after 2 seconds
      setTimeout(() => {
        if (mountedRef.current) {
          setVideoReady(true);
          toast.success('📹 Video ready!');
        }
      }, 2000);
      
    } catch (error) {
      console.error('❌ Video loading failed:', error);
      toast('Video unavailable - session continues', {
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

  // Simple video events
  const setupSimpleVideoEvents = () => {
    if (!apiRef.current) return;

    try {
      // Participant events
      apiRef.current.addEventListener('participantJoined', (participant) => {
        const name = participant.displayName || 'Study partner';
        toast.success(`${name} joined! 🤝`);
      });

      apiRef.current.addEventListener('participantLeft', (participant) => {
        const name = participant.displayName || 'Study partner';
        toast(`${name} left the session`);
      });

      // Ready to close
      apiRef.current.addEventListener('readyToClose', () => {
        endSession();
      });

    } catch (error) {
      console.log('Video event setup error (non-critical):', error);
    }
  };

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
      toast.success('Session completed! 🎉');
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

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
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
    toast.success('Time\'s up! 🎯');
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
        name: 'Waiting for partner',
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
          <h3>Starting Focus Session</h3>
          <p>Setting up your workspace...</p>
          
          {session && (
            <div className="session-preview">
              <h4>Goal:</h4>
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
          <p>Excellent work on your focus session!</p>
          <div className="ended-stats">
            <div className="stat">
              <span>Duration</span>
              <span>{session?.duration || 50} min</span>
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

  // MAIN SESSION VIEW - World-class clean interface
  return (
    <div className={`video-session ${isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'}`}>
      {/* Clean Header with inline timer */}
      <div className="video-header">
        <div className="session-info">
          <h3 className="session-title">{session?.goal || 'Focus Session'}</h3>
          <div className="session-meta">
            <span className="duration">
              <FiClock /> {session?.duration}min
            </span>
            <span className="participant-count">
              <FiUsers /> {participantCount}/2
            </span>
            {videoReady && (
              <span className="video-status">
                <FiWifi /> Ready
              </span>
            )}
          </div>
        </div>
        
        <div className="header-actions">
          {/* Inline Timer */}
          <div 
            className="header-timer"
            style={{ '--progress': `${progress}%` }}
          >
            <div className="timer-display">
              <div className={`timer-status ${!timerRunning ? 'paused' : ''}`}></div>
              <span className="timer-text">{formatTime(timeLeft)}</span>
            </div>
          </div>

          {/* Leave/End Button */}
          <button 
            onClick={userRole === 'creator' ? endSession : leaveSession} 
            className="btn-leave"
            title={userRole === 'creator' ? 'End session' : 'Leave session'}
          >
            {userRole === 'creator' ? <FiX /> : <FiArrowLeft />}
          </button>
        </div>
      </div>

      {/* Full Screen Video */}
      <div className="video-content">
        <div className="video-container">
          <div ref={jitsiContainerRef} className="jitsi-container">
            {/* Loading overlay only when video not ready */}
            {!videoReady && (
              <div className="video-overlay">
                <div className="session-active-icon">🎯</div>
                <h3>Focus Session Active</h3>
                <p>Your session has started! Video is loading...</p>
                
                <div className="session-details">
                  <div className="detail">
                    <strong>Goal:</strong>
                    <span>{session?.goal}</span>
                  </div>
                  <div className="detail">
                    <strong>Time Left:</strong>
                    <span>{formatTime(timeLeft)}</span>
                  </div>
                  <div className="detail">
                    <strong>Participants:</strong>
                    <span>{participantCount}/2</span>
                  </div>
                  <div className="detail">
                    <strong>Status:</strong>
                    <span>{partnerInfo.description}</span>
                  </div>
                </div>

                <div className="loading-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ 
                      width: videoReady ? '100%' : '70%'
                    }}></div>
                  </div>
                  <p>Connecting to video chat...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="bottom-status">
        <div className="status-indicator">
          <div className="status-icon">💡</div>
          <div className="status-text">
            <strong>Focus Tip:</strong> Eliminate distractions for maximum productivity
          </div>
        </div>
        
        {partnerInfo.hasPartner && (
          <div className="partner-status">
            <div className="partner-avatar">
              {partnerInfo.name.charAt(0).toUpperCase()}
            </div>
            <span>With {partnerInfo.name}</span>
          </div>
        )}
        
        {!partnerInfo.hasPartner && (
          <div className="partner-status">
            <div className="partner-avatar">⏳</div>
            <span>Waiting for partner</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default VideoSession;