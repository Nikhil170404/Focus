import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, onSnapshot, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { 
  FiClock,
  FiUsers,
  FiArrowLeft,
  FiLoader,
  FiWifi,
  FiRefreshCw,
  FiAlertCircle,
  FiPlay,
  FiPause,
  FiStopCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';

// Session states
const CONNECTION_STATES = {
  LOADING: 'loading',
  ACTIVE: 'active',
  ENDED: 'ended'
};

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Refs
  const jitsiContainerRef = useRef(null);
  const apiRef = useRef(null);
  const mountedRef = useRef(true);
  const sessionListenerRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const autoEndTimeoutRef = useRef(null);
  
  // Core state
  const [session, setSession] = useState(null);
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.LOADING);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState(null);
  const [isMobile] = useState(window.innerWidth <= 768);
  const [isTablet] = useState(window.innerWidth > 768 && window.innerWidth <= 1024);
  const [userRole, setUserRole] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [participantNames, setParticipantNames] = useState([]);
  
  // IMPROVED: Enhanced timer state
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const [autoEndWarning, setAutoEndWarning] = useState(false);
  const [timerPhase, setTimerPhase] = useState('ready'); // 'ready', 'running', 'warning', 'ending'

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    const cleanup = () => {
      console.log('🧹 Cleaning up...');

      if (sessionListenerRef.current) {
        sessionListenerRef.current();
        sessionListenerRef.current = null;
      }

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      if (autoEndTimeoutRef.current) {
        clearTimeout(autoEndTimeoutRef.current);
        autoEndTimeoutRef.current = null;
      }

      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          console.log('Cleanup error:', e);
        }
        apiRef.current = null;
      }
    };
    
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, []);

  // Initialize session
  useEffect(() => {
    const initSession = async () => {
      try {
        console.log('🚀 Initializing session...');
        
        const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
        
        if (!sessionDoc.exists()) {
          throw new Error('Session not found');
        }

        const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
        
        // Validate access
        const isCreator = sessionData.userId === user.uid;
        const isPartner = sessionData.partnerId === user.uid;
        const isInParticipants = sessionData.participants && sessionData.participants.includes(user.uid);
        
        if (!isCreator && !isPartner && !isInParticipants) {
          throw new Error('You do not have access to this session');
        }

        setSession(sessionData);
        setUserRole(isCreator ? 'creator' : 'partner');
        
        // Initialize participant info
        let initialCount = 1;
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
        
        // IMPROVED: Initialize timer with session timing
        const duration = sessionData.duration || 50;
        const totalSeconds = duration * 60;
        
        // Check if session should have already started
        const sessionStartTime = new Date(sessionData.startTime);
        const now = new Date();
        const timeSinceStart = (now - sessionStartTime) / 1000; // seconds
        
        if (timeSinceStart > 0) {
          // Session has already started, adjust timer
          const adjustedTimeLeft = Math.max(0, totalSeconds - timeSinceStart);
          setTimeLeft(Math.floor(adjustedTimeLeft));
          
          if (adjustedTimeLeft > 0) {
            setTimerRunning(true);
            setTimerPhase('running');
            toast.success('🎯 Joined session in progress!');
          } else {
            // Session should have ended
            toast.error('This session has already ended.');
            setTimeout(() => navigate('/dashboard'), 2000);
            return;
          }
        } else {
          // Session hasn't started yet, wait or start immediately
          setTimeLeft(totalSeconds);
          setTimerRunning(true);
          setTimerPhase('running');
          toast.success('🎯 Focus session started!');
        }
        
        setTotalTime(totalSeconds);
        
        // Set up real-time listener
        setupSessionListener();
        
        setConnectionState(CONNECTION_STATES.ACTIVE);
        
        // Load video in background
        setTimeout(() => {
          loadVideoInBackground();
        }, 1000);
        
      } catch (error) {
        console.error('❌ Session initialization failed:', error);
        setError(error.message);
      }
    };

    if (!sessionId || !user?.uid) {
      setError('Invalid session or user not authenticated');
      return;
    }

    initSession();
  }, [sessionId, user?.uid, navigate]);

  // IMPROVED: Timer effect with enhanced controls
  useEffect(() => {
    const handleTimerComplete = async () => {
      if (!mountedRef.current) return;

      console.log('⏰ Timer completed - auto-ending session');
      
      try {
        // Show completion celebration
        toast.success('🎉 Focus session completed! Excellent work!', { duration: 5000 });
        
        // Update session status
        if (sessionId && session?.status !== 'completed') {
          await updateDoc(doc(db, 'sessions', sessionId), {
            status: 'completed',
            endedAt: serverTimestamp(),
            actualDuration: session?.duration || 50,
            completedBy: 'timer'
          });
        }

        // Auto-redirect after 3 seconds
        autoEndTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            navigate('/dashboard');
          }
        }, 3000);
        
      } catch (error) {
        console.error('Error completing session:', error);
        // Still redirect even if update fails
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      }
    };

    if (timerRunning && timeLeft > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          const newTime = prev - 1;
          
          // Update timer phase based on remaining time
          if (newTime <= 300 && newTime > 60) { // Last 5 minutes
            setTimerPhase('warning');
            
            // Show warning at 5 minutes
            if (newTime === 300) {
              setAutoEndWarning(true);
              toast('⏰ 5 minutes remaining! Session will end automatically.', {
                duration: 5000,
                icon: '⚠️'
              });
            }
          } else if (newTime <= 60) { // Last minute
            setTimerPhase('ending');
            
            // Show final warning at 1 minute
            if (newTime === 60) {
              toast('🚨 Final minute! Session ending soon.', {
                duration: 3000,
                icon: '🔔'
              });
            }
            
            // Countdown notifications in last 10 seconds
            if (newTime <= 10 && newTime > 0) {
              toast(`${newTime}`, {
                duration: 1000,
                icon: '⏰'
              });
            }
          }
          
          // Auto-end session when timer reaches 0
          if (newTime <= 0) {
            setTimerRunning(false);
            setTimerPhase('ended');
            handleTimerComplete();
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
  }, [timerRunning, timeLeft, sessionId, session?.status, session?.duration, navigate]);

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

  // Get timer color based on phase
  const getTimerColor = useCallback(() => {
    switch (timerPhase) {
      case 'warning': return '#f59e0b';
      case 'ending': return '#ef4444';
      case 'ended': return '#6b7280';
      default: return '#10b981';
    }
  }, [timerPhase]);

  // Set up session listener
  const setupSessionListener = useCallback(() => {
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
            setConnectionState(CONNECTION_STATES.ENDED);
            setTimeout(() => {
              navigate('/dashboard');
            }, 2000);
          }
        }
      },
      (error) => {
        console.error('Session listener error:', error);
      }
    );
  }, [sessionId, user?.displayName, user?.email, user?.uid, navigate]);

  // Load video in background
  const loadVideoInBackground = async () => {
    try {
      console.log('🎥 Loading video...');
      
      if (!window.JitsiMeetExternalAPI) {
        await loadJitsiScript();
      }

      if (!mountedRef.current || !jitsiContainerRef.current) {
        return;
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
          prejoinPageEnabled: false,
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          enableClosePage: false,
          disableInviteFunctions: false,
          enableWelcomePage: false,
          requireDisplayName: true,
          defaultLanguage: 'en',
          enableNoisyMicDetection: true,
          enableTalkWhileMuted: false,
          disableRemoteMute: false,
          enableAutomaticUrlCopy: false,
          disableChat: false,
          enableChat: true,
          enableReactions: true,
          enableScreensharing: true,
          enableParticipantsPane: true,
          enableVirtualBackground: true,
          enableInsecureRoomNameWarning: false,
          enableNoAudioDetection: true,
          enableOpusRed: true,
          enableSaveLogs: false,
          enableUserRolesBasedOnToken: false
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false,
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          ENABLE_MOBILE_BROWSER: true,
          HIDE_DEEP_LINKING_LOGO: true,
          TOOLBAR_ALWAYS_VISIBLE: true,
          DISABLE_INVITE_FUNCTIONS: false,
          DISABLE_DEEP_LINKING: true,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
          HIDE_INVITE_MORE_HEADER: false,
          SHOW_CHROME_EXTENSION_BANNER: false,
          VERTICAL_FILMSTRIP: false,
          TILE_VIEW_MAX_COLUMNS: 2,
          TOOLBAR_BUTTONS: isMobile ? [
            'microphone', 
            'camera', 
            'closedcaptions',
            'desktop',
            'chat',
            'participants-pane',
            'tileview',
            'hangup'
          ] : [
            'microphone', 
            'camera', 
            'closedcaptions',
            'desktop',
            'fullscreen',
            'fodeviceselection',
            'hangup',
            'profile',
            'chat',
            'participants-pane',
            'settings',
            'raisehand',
            'videoquality',
            'filmstrip',
            'tileview',
            'videobackgroundblur'
          ],
          CHAT_ENABLED: true,
          DISPLAY_WELCOME_PAGE_CONTENT: false,
          DISPLAY_WELCOME_PAGE_TOOLBAR_ADDITIONAL_CONTENT: false,
          HIDE_PARTICIPANTS_STATS: false,
          DEFAULT_BACKGROUND: '#1e1b4b',
          OPTIMAL_BROWSERS: ['chrome', 'chromium', 'firefox', 'safari', 'webkit'],
          UNSUPPORTED_BROWSERS: []
        }
      };

      apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      
      setupVideoEvents();
      
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

  // Load Jitsi script
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
    });
  };

  // Setup video events
  const setupVideoEvents = () => {
    if (!apiRef.current) return;

    try {
      apiRef.current.addEventListener('participantJoined', (participant) => {
        const name = participant.displayName || 'Study partner';
        toast.success(`${name} joined! 🤝`);
      });

      apiRef.current.addEventListener('participantLeft', (participant) => {
        const name = participant.displayName || 'Study partner';
        toast(`${name} left the session`);
      });

      apiRef.current.addEventListener('readyToClose', () => {
        endSession();
      });

    } catch (error) {
      console.log('Video event setup error (non-critical):', error);
    }
  };

  // Manual end session
  const endSession = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      if (sessionId && session?.status !== 'completed') {
        await updateDoc(doc(db, 'sessions', sessionId), {
          status: 'completed',
          endedAt: serverTimestamp(),
          actualDuration: session?.duration || 50,
          completedBy: userRole === 'creator' ? 'creator' : 'partner'
        });
      }

      toast.success('Session ended! 🎉');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error ending session:', error);
      navigate('/dashboard');
    }
  }, [sessionId, session?.status, session?.duration, navigate, userRole]);

  // Leave session (for non-creators)
  const leaveSession = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  // Toggle timer
  const toggleTimer = useCallback(() => {
    if (timerPhase === 'ended') return;
    
    setTimerRunning(!timerRunning);
    setTimerPhase(timerRunning ? 'paused' : 'running');
    
    toast(timerRunning ? 'Timer paused' : 'Timer resumed', {
      icon: timerRunning ? '⏸️' : '▶️'
    });
  }, [timerRunning, timerPhase]);

  // Loading state
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
            <button className="btn-primary" onClick={() => window.location.reload()}>
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
  if (connectionState === CONNECTION_STATES.ENDED || timerPhase === 'ended') {
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

  // Main session view
  return (
    <div className={`video-session ${isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'}`}>
      {/* Header with integrated timer */}
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
          {/* Enhanced inline timer */}
          <div 
            className={`header-timer ${timerPhase}`}
            style={{ 
              '--progress': `${progress}%`,
              borderColor: getTimerColor(),
              color: getTimerColor()
            }}
          >
            <div className="timer-display">
              <div className={`timer-status ${!timerRunning ? 'paused' : ''}`}></div>
              <span className="timer-text">{formatTime(timeLeft)}</span>
            </div>
            
            {/* Timer controls */}
            <button 
              className="timer-control-btn"
              onClick={toggleTimer}
              title={timerRunning ? 'Pause timer' : 'Resume timer'}
            >
              {timerRunning ? <FiPause size={12} /> : <FiPlay size={12} />}
            </button>
          </div>

          {/* End session button */}
          <button 
            onClick={() => setShowEndConfirmation(true)}
            className="btn-leave"
            title={userRole === 'creator' ? 'End session' : 'Leave session'}
          >
            {userRole === 'creator' ? <FiStopCircle /> : <FiArrowLeft />}
          </button>
        </div>
      </div>

      {/* Full screen video */}
      <div className="video-content">
        <div className="video-container">
          <div ref={jitsiContainerRef} className="jitsi-container">
            {!videoReady && (
              <div className="video-overlay">
                <div className="session-active-icon">🎯</div>
                <h3>Focus Session Active</h3>
                <p>Video loading with collaboration tools...</p>
                
                <div className="session-details">
                  <div className="detail">
                    <strong>Goal:</strong>
                    <span>{session?.goal}</span>
                  </div>
                  <div className="detail">
                    <strong>Time Left:</strong>
                    <span style={{ color: getTimerColor() }}>{formatTime(timeLeft)}</span>
                  </div>
                  <div className="detail">
                    <strong>Progress:</strong>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="detail">
                    <strong>Phase:</strong>
                    <span style={{ color: getTimerColor() }}>
                      {timerPhase === 'warning' ? 'Final stretch!' : 
                       timerPhase === 'ending' ? 'Almost done!' : 
                       'Deep focus'}
                    </span>
                  </div>
                </div>

                <div className="loading-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: '70%' }}></div>
                  </div>
                  <p>Loading video tools...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="bottom-status">
        <div className="status-indicator">
          <div className="status-icon">
            {timerPhase === 'warning' ? '⚠️' : 
             timerPhase === 'ending' ? '🚨' : '💡'}
          </div>
          <div className="status-text">
            <strong>
              {timerPhase === 'warning' ? 'Final 5 minutes!' : 
               timerPhase === 'ending' ? 'Last minute!' : 
               'Focus Mode Active'}
            </strong>
          </div>
        </div>
        
        {participantCount > 1 ? (
          <div className="partner-status">
            <div className="partner-avatar">
              {participantNames[1]?.charAt(0).toUpperCase() || 'P'}
            </div>
            <span>With {participantNames[1] || 'Partner'}</span>
          </div>
        ) : (
          <div className="partner-status">
            <div className="partner-avatar">⏳</div>
            <span>Solo session</span>
          </div>
        )}
      </div>

      {/* Auto-end warning */}
      {autoEndWarning && (
        <div className="auto-end-warning">
          <div className="warning-content">
            <FiAlertCircle />
            <span>Session will end automatically when timer reaches 0</span>
            <button onClick={() => setAutoEndWarning(false)}>×</button>
          </div>
        </div>
      )}

      {/* End session confirmation */}
      {showEndConfirmation && (
        <div className="modal-overlay">
          <div className="end-session-modal">
            <h3>{userRole === 'creator' ? 'End Session?' : 'Leave Session?'}</h3>
            <p>
              {userRole === 'creator' 
                ? 'This will end the session for all participants.' 
                : 'You can rejoin if the session is still active.'}
            </p>
            <div className="session-summary">
              <div>Time elapsed: {formatTime(totalTime - timeLeft)}</div>
              <div>Time remaining: {formatTime(timeLeft)}</div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowEndConfirmation(false)}>
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={userRole === 'creator' ? endSession : leaveSession}
              >
                {userRole === 'creator' ? 'End Session' : 'Leave Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoSession;