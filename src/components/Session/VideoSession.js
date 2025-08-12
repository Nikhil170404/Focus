// src/components/Session/VideoSession.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import { 
  FiVideo, 
  FiVideoOff, 
  FiMic, 
  FiMicOff, 
  FiPhoneOff,
  FiMaximize2,
  FiMinimize2,
  FiClock
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
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [jitsiReady, setJitsiReady] = useState(false);

  // Setup event listeners for Jitsi API
  const setupEventListeners = useCallback(() => {
    if (!apiRef.current) return;

    apiRef.current.on('audioMuteStatusChanged', (status) => {
      setIsAudioMuted(status.muted);
    });

    apiRef.current.on('videoMuteStatusChanged', (status) => {
      setIsVideoMuted(status.muted);
    });

    apiRef.current.on('readyToClose', () => {
      endSession();
    });
  }, []);

  // Initialize Jitsi Meet
  const initializeJitsi = useCallback((sessionData) => {
    // Ensure container exists before initializing
    if (!jitsiContainerRef.current) {
      console.error('Jitsi container ref is null');
      setLoading(false);
      toast.error('Video container not ready');
      return;
    }

    console.log('Starting Jitsi initialization...');
    const roomName = `focusmate-${sessionId}`.replace(/[^a-zA-Z0-9-]/g, '');
    const domain = 'meet.jit.si';
    
    const options = {
      roomName: roomName,
      width: '100%',
      height: '100%',
      parentNode: jitsiContainerRef.current,
      userInfo: {
        displayName: user?.displayName || user?.email?.split('@')[0] || 'User',
        email: user?.email
      },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false,
        disableInviteFunctions: true,
        disableDeepLinking: true,
        toolbarButtons: [
          'microphone',
          'camera',
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
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
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
          'videoquality',
          'tileview'
        ]
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
          apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
          setupEventListeners();
          setLoading(false);
          toast.success('Video session started!');
        } catch (error) {
          console.error('Error initializing Jitsi:', error);
          toast.error('Failed to initialize video session');
          setLoading(false);
        }
      };
      script.onerror = (error) => {
        console.error('Failed to load Jitsi script:', error);
        toast.error('Failed to load video session');
        setLoading(false);
      };
      document.body.appendChild(script);
    } else if (window.JitsiMeetExternalAPI) {
      console.log('Using existing Jitsi API');
      setJitsiReady(true);
      try {
        apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
        setupEventListeners();
        setLoading(false);
        toast.success('Video session started!');
      } catch (error) {
        console.error('Error initializing Jitsi:', error);
        toast.error('Failed to initialize video session');
        setLoading(false);
      }
    } else {
      console.log('Waiting for Jitsi script to load...');
      // Set a timeout to prevent infinite loading
      setTimeout(() => {
        if (loading) {
          console.error('Timeout waiting for Jitsi to load');
          setLoading(false);
          toast.error('Video session loading timeout');
        }
      }, 10000); // 10 second timeout
    }
  }, [sessionId, user, setupEventListeners, loading]);

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

      toast.success('Session completed! 🎉');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error ending session:', error);
      toast.error('Error ending session');
      navigate('/dashboard');
    }
  }, [sessionId, session, navigate]);

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
        console.log('Session snapshot received:', doc.exists(), doc.data());
        if (doc.exists()) {
          const sessionData = { id: doc.id, ...doc.data() };
          setSession(sessionData);
          
          // Initialize Jitsi only once and when container is ready
          if (!apiRef.current && jitsiContainerRef.current) {
            console.log('Initializing Jitsi with session data:', sessionData);
            initializeJitsi(sessionData);
          } else if (!jitsiContainerRef.current) {
            console.log('Jitsi container not ready yet');
            // Set a timeout to try again after the component has rendered
            setTimeout(() => {
              if (jitsiContainerRef.current && !apiRef.current) {
                console.log('Retrying Jitsi initialization');
                initializeJitsi(sessionData);
              }
            }, 100);
          }
        } else {
          console.log('Session document does not exist');
          toast.error('Session not found');
          navigate('/dashboard');
        }
      },
      (error) => {
        console.error('Error listening to session:', error);
        toast.error('Error loading session');
        setLoading(false);
        navigate('/dashboard');
      }
    );

    return () => {
      unsubscribe();
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [sessionId, user, navigate, initializeJitsi]);

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

  if (loading) {
    return (
      <div className="video-loading">
        <div className="spinner"></div>
        <p>Loading session...</p>
      </div>
    );
  }

  return (
    <div className={`video-session-container ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="video-header">
        <div className="session-info">
          <h3>{session?.goal || 'Focus Session'}</h3>
          <span className="duration-badge">
            <FiClock /> {session?.duration || 50} min
          </span>
        </div>
        
        <div className="header-controls">
          <button 
            onClick={toggleAudio} 
            className={`control-btn ${isAudioMuted ? 'muted' : ''}`}
            disabled={!apiRef.current}
          >
            {isAudioMuted ? <FiMicOff /> : <FiMic />}
          </button>
          <button 
            onClick={toggleVideo} 
            className={`control-btn ${isVideoMuted ? 'muted' : ''}`}
            disabled={!apiRef.current}
          >
            {isVideoMuted ? <FiVideoOff /> : <FiVideo />}
          </button>
          <button onClick={toggleFullscreen} className="control-btn">
            {isFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
          </button>
          <button onClick={endSession} className="control-btn end-call">
            <FiPhoneOff />
          </button>
        </div>
      </div>

      <div className="video-content">
        <div ref={jitsiContainerRef} className="jitsi-container" />
        
        <div className="timer-overlay">
          <SessionTimer 
            duration={session?.duration || 50} 
            onComplete={onTimerComplete}
            autoStart={true}
            showBreakReminder={false}
          />
        </div>
      </div>
    </div>
  );
}

export default VideoSession;