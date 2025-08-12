// src/components/Session/VideoSession.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
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
  FiMessageSquare,
  FiUsers,
  FiClock
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const jitsiContainerRef = useRef(null);
  const apiRef = useRef(null);
  
  // State
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [partnerJoined, setPartnerJoined] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');

  // Initialize session
  useEffect(() => {
    if (!sessionId || !user) {
      navigate('/dashboard');
      return;
    }

    loadSession();
    
    return () => {
      if (apiRef.current) {
        apiRef.current.dispose();
      }
    };
  }, [sessionId, user]);

  const loadSession = async () => {
    try {
      // Listen to session changes
      const unsubscribe = onSnapshot(doc(db, 'sessions', sessionId), (doc) => {
        if (doc.exists()) {
          const sessionData = { id: doc.id, ...doc.data() };
          setSession(sessionData);
          
          // Initialize Jitsi when session is loaded
          if (!apiRef.current) {
            initializeJitsi(sessionData);
          }
          
          // Check if partner joined
          if (sessionData.partnerId && sessionData.partnerName) {
            setPartnerJoined(true);
            setConnectionStatus('Partner connected');
          } else {
            setConnectionStatus('Waiting for partner...');
          }
        } else {
          toast.error('Session not found');
          navigate('/dashboard');
        }
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Error loading session:', error);
      toast.error('Failed to load session');
      navigate('/dashboard');
    }
  };

  const initializeJitsi = (sessionData) => {
    // Clean domain name for Jitsi room
    const roomName = `focusmate-${sessionId}`.replace(/[^a-zA-Z0-9-]/g, '');
    
    const domain = 'meet.jit.si';
    const options = {
      roomName: roomName,
      width: '100%',
      height: '100%',
      parentNode: jitsiContainerRef.current,
      userInfo: {
        displayName: user.displayName || user.email,
        email: user.email
      },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        disableModeratorIndicator: true,
        enableEmailInStats: false,
        disableSimulcast: false,
        enableWelcomePage: false,
        enableClosePage: false,
        prejoinPageEnabled: false,
        disableInviteFunctions: true,
        disableRemoteMute: true,
        remoteVideoMenu: {
          disableKick: true
        },
        p2p: {
          enabled: true,
          preferH264: true
        },
        toolbarButtons: [
          'microphone',
          'camera',
          'desktop',
          'fullscreen',
          'fodeviceselection',
          'profile',
          'recording',
          'livestreaming',
          'settings',
          'videoquality',
          'stats'
        ],
        disableDeepLinking: true,
        defaultLocalDisplayName: user.displayName || 'You',
        defaultRemoteDisplayName: sessionData.partnerName || 'Partner'
      },
      interfaceConfigOverwrite: {
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        MOBILE_APP_PROMO: false,
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        BRAND_WATERMARK_LINK: '',
        SHOW_POWERED_BY: false,
        GENERATE_ROOMNAMES_ON_WELCOME_PAGE: false,
        DISPLAY_WELCOME_PAGE_CONTENT: false,
        APP_NAME: 'FocusMate',
        NATIVE_APP_NAME: 'FocusMate',
        PROVIDER_NAME: 'FocusMate',
        DEFAULT_BACKGROUND: '#1a1a2e',
        DEFAULT_LOCAL_DISPLAY_NAME: user.displayName || 'You',
        DEFAULT_REMOTE_DISPLAY_NAME: sessionData.partnerName || 'Partner',
        SHOW_CHROME_EXTENSION_BANNER: false
      },
      onload: () => {
        setLoading(false);
        setConnectionStatus('Connected');
        toast.success('Video session started!');
      }
    };

    // Load Jitsi API
    if (!window.JitsiMeetExternalAPI) {
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = () => {
        apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
        setupJitsiEventListeners();
      };
      document.body.appendChild(script);
    } else {
      apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
      setupJitsiEventListeners();
    }
  };

  const setupJitsiEventListeners = () => {
    if (!apiRef.current) return;

    // Participant events
    apiRef.current.on('participantJoined', (participant) => {
      setPartnerJoined(true);
      setConnectionStatus('Partner joined');
      toast.success(`${participant.displayName || 'Partner'} joined the session`);
    });

    apiRef.current.on('participantLeft', (participant) => {
      setPartnerJoined(false);
      setConnectionStatus('Partner left');
      toast.info(`${participant.displayName || 'Partner'} left the session`);
    });

    // Audio/Video events
    apiRef.current.on('audioMuteStatusChanged', (status) => {
      setIsAudioMuted(status.muted);
    });

    apiRef.current.on('videoMuteStatusChanged', (status) => {
      setIsVideoMuted(status.muted);
    });

    // Ready event
    apiRef.current.on('readyToClose', () => {
      endSession();
    });
  };

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

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    if (!isFullscreen) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const toggleChat = () => {
    setShowChat(!showChat);
  };

  const endSession = async () => {
    if (window.confirm('Are you sure you want to end this session?')) {
      try {
        // Update session status
        await updateDoc(doc(db, 'sessions', sessionId), {
          status: 'completed',
          endedAt: serverTimestamp(),
          actualDuration: session?.duration || 50
        });

        // Dispose Jitsi
        if (apiRef.current) {
          apiRef.current.dispose();
        }

        toast.success('Session completed! Great work! 🎉');
        navigate('/dashboard');
      } catch (error) {
        console.error('Error ending session:', error);
        navigate('/dashboard');
      }
    }
  };

  const onTimerComplete = () => {
    toast.success('Session time completed! Excellent focus! 🎯');
    setTimeout(() => {
      endSession();
    }, 3000);
  };

  if (loading) {
    return (
      <div className="video-loading">
        <div className="loading-content">
          <div className="spinner large"></div>
          <h3>Setting up your focus session...</h3>
          <p>{connectionStatus}</p>
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
          <div className="session-meta">
            <span className="status-badge">
              <FiUsers /> {partnerJoined ? 'Partner Connected' : 'Waiting for Partner'}
            </span>
            <span className="duration-badge">
              <FiClock /> {session?.duration || 50} minutes
            </span>
          </div>
        </div>
        
        <div className="header-controls">
          <button 
            className={`control-btn ${showChat ? 'active' : ''}`}
            onClick={toggleChat}
            title="Toggle Chat"
          >
            <FiMessageSquare />
          </button>
          <button 
            className="control-btn"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="video-content">
        {/* Video Container */}
        <div className="video-area">
          <div 
            ref={jitsiContainerRef} 
            className="jitsi-container"
            style={{ width: '100%', height: '100%' }}
          />
          
          {/* Floating Controls */}
          <div className="floating-controls">
            <button 
              className={`control-btn ${isAudioMuted ? 'muted' : ''}`}
              onClick={toggleAudio}
              title={isAudioMuted ? 'Unmute' : 'Mute'}
            >
              {isAudioMuted ? <FiMicOff /> : <FiMic />}
            </button>
            
            <button 
              className={`control-btn ${isVideoMuted ? 'muted' : ''}`}
              onClick={toggleVideo}
              title={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
            >
              {isVideoMuted ? <FiVideoOff /> : <FiVideo />}
            </button>
            
            <button 
              className="control-btn end-call"
              onClick={endSession}
              title="End Session"
            >
              <FiPhoneOff />
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className={`video-sidebar ${showChat ? 'show-chat' : ''}`}>
          {/* Timer */}
          <div className="sidebar-section">
            <SessionTimer 
              duration={session?.duration || 50} 
              onComplete={onTimerComplete}
              autoStart={true}
            />
          </div>

          {/* Session Details */}
          <div className="sidebar-section">
            <h4>Session Details</h4>
            <div className="detail-list">
              <div className="detail-item">
                <span className="detail-label">Goal:</span>
                <span className="detail-value">{session?.goal || 'Stay focused'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Partner:</span>
                <span className="detail-value">
                  {session?.partnerName || 'Waiting...'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Status:</span>
                <span className={`detail-value ${partnerJoined ? 'active' : ''}`}>
                  {partnerJoined ? '🟢 Active' : '⏳ Waiting'}
                </span>
              </div>
            </div>
          </div>

          {/* Chat */}
          {showChat && (
            <div className="sidebar-section chat-section">
              <SessionChat
                sessionId={sessionId}
                userId={user.uid}
                userName={user.displayName || 'You'}
                partnerId={session?.partnerId}
                partnerName={session?.partnerName}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VideoSession;