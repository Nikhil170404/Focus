import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { ref, push, onValue, off, set } from 'firebase/database';
import { db, realtimeDb } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import SessionChat from './SessionChat';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiSettings, FiRefreshCw, FiMaximize2 } from 'react-icons/fi';
import toast from 'react-hot-toast';

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Video refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const signalListenerRef = useRef(null);
  
  // State
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [mediaError, setMediaError] = useState(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Enhanced STUN/TURN configuration for production
  const rtcConfiguration = {
    iceServers: [
      // Google STUN servers - most reliable
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      
      // Additional reliable STUN servers
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.services.mozilla.com' },
      
      // Free TURN servers for NAT traversal
      {
        urls: 'turn:numb.viagenie.ca',
        credential: 'muazkh',
        username: 'webrtc@live.com'
      },
      {
        urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
        credential: 'webrtc',
        username: 'webrtc'
      },
      
      // Additional TURN server
      {
        urls: 'turn:openrelay.metered.ca:80',
        credential: 'openrelayproject',
        username: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };

  // Initialize session
  useEffect(() => {
    if (!sessionId || !user) {
      navigate('/dashboard');
      return;
    }

    initializeSession();
    
    return () => {
      cleanup();
    };
  }, [sessionId, user]);

  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up video session...');
    
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('⏹️ Stopped track:', track.kind);
      });
      localStreamRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Remove signal listener
    if (signalListenerRef.current && sessionId) {
      const signalRef = ref(realtimeDb, `sessions/${sessionId}/signals`);
      off(signalRef, 'value', signalListenerRef.current);
      signalListenerRef.current = null;
    }

    // Clear state
    setLocalStream(null);
    setRemoteStream(null);
  }, [sessionId]);

  const initializeSession = async () => {
    try {
      console.log('🚀 Initializing session:', sessionId);
      setConnectionStatus('Loading session...');
      
      // Get session data with real-time listener
      const sessionRef = doc(db, 'sessions', sessionId);
      const unsubscribe = onSnapshot(sessionRef, async (doc) => {
        if (doc.exists()) {
          const sessionData = { id: doc.id, ...doc.data() };
          setSession(sessionData);
          
          // Determine if user is initiator
          const initiator = sessionData.userId === user.uid;
          setIsInitiator(initiator);
          
          console.log('📋 Session loaded:', { 
            initiator, 
            hasPartner: !!sessionData.partnerId,
            status: sessionData.status 
          });
          
          // Initialize media after session is loaded
          if (!localStreamRef.current) {
            await initializeMedia();
            await setupWebRTC();
          }
        } else {
          throw new Error('Session not found');
        }
      });

      return () => unsubscribe();
      
    } catch (error) {
      console.error('❌ Error initializing session:', error);
      setMediaError(error.message);
      toast.error('Failed to initialize session: ' + error.message);
      setLoading(false);
    }
  };

  const initializeMedia = async () => {
    try {
      console.log('🎥 Requesting media permissions...');
      setConnectionStatus('Accessing camera and microphone...');

      // Check for HTTPS in production
      if (window.location.protocol !== 'https:' && 
          window.location.hostname !== 'localhost' && 
          window.location.hostname !== '127.0.0.1') {
        throw new Error('Camera access requires HTTPS connection');
      }

      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support camera access');
      }

      let stream;
      
      try {
        // High quality attempt
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            facingMode: 'user',
            frameRate: { ideal: 30, max: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        console.log('✅ High quality media obtained');
      } catch (error) {
        console.warn('⚠️ High quality failed, trying medium:', error.message);
        
        try {
          // Medium quality fallback
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640, max: 1280 },
              height: { ideal: 480, max: 720 },
              facingMode: 'user'
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true
            }
          });
          console.log('✅ Medium quality media obtained');
        } catch (error2) {
          console.warn('⚠️ Video failed, trying audio only:', error2.message);
          
          // Audio only fallback
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true
          });
          setIsVideoEnabled(false);
          toast.warning('Camera not available, audio-only mode');
          console.log('✅ Audio-only media obtained');
        }
      }
      
      // Store stream reference
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      // Attach to video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('📺 Local video attached');
      }
      
      setConnectionStatus('Media ready');
      
    } catch (error) {
      console.error('❌ Media access error:', error);
      
      let errorMessage = 'Failed to access camera/microphone';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera access denied. Please allow permissions and refresh.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera or microphone found.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Your browser does not support video calling.';
      } else if (error.message.includes('HTTPS')) {
        errorMessage = error.message;
      }
      
      setMediaError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const setupWebRTC = async () => {
    try {
      console.log('🔗 Setting up WebRTC...');
      setConnectionStatus('Connecting to partner...');

      // Create peer connection
      peerConnectionRef.current = new RTCPeerConnection(rtcConfiguration);
      const pc = peerConnectionRef.current;

      // Add local stream tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
          console.log('➕ Added local track:', track.kind);
        });
      }

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log('📡 Received remote track:', event.track.kind);
        const [remoteStream] = event.streams;
        setRemoteStream(remoteStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          console.log('📺 Remote video attached');
        }
        setConnectionStatus('Connected');
        toast.success('Connected to your study partner!');
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate');
          sendSignal({
            type: 'ice-candidate',
            candidate: event.candidate,
            from: user.uid,
            timestamp: Date.now()
          });
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log('🔌 Connection state:', state);
        
        setConnectionStatus(getConnectionStatusText(state));
        
        if (state === 'connected') {
          setReconnectAttempts(0);
          setLoading(false);
        } else if (state === 'failed') {
          handleConnectionFailure();
        } else if (state === 'disconnected') {
          handleDisconnection();
        }
      };

      // Setup signaling
      setupSignaling();

      // Create offer if initiator
      if (isInitiator) {
        console.log('🎯 Creating offer as initiator');
        setTimeout(() => {
          createOffer();
        }, 1000);
      }

      setLoading(false);

    } catch (error) {
      console.error('❌ WebRTC setup error:', error);
      setMediaError('Failed to setup video connection: ' + error.message);
      setLoading(false);
    }
  };

  const setupSignaling = () => {
    const signalRef = ref(realtimeDb, `sessions/${sessionId}/signals`);
    
    signalListenerRef.current = onValue(signalRef, (snapshot) => {
      const signals = snapshot.val();
      if (signals) {
        Object.entries(signals).forEach(([key, signal]) => {
          // Only process recent signals from other users
          if (signal.from !== user.uid && 
              signal.timestamp && 
              Date.now() - signal.timestamp < 30000) {
            handleRemoteSignal(signal);
          }
        });
      }
    });
  };

  const sendSignal = async (signal) => {
    try {
      const signalRef = ref(realtimeDb, `sessions/${sessionId}/signals`);
      await push(signalRef, {
        ...signal,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('❌ Error sending signal:', error);
    }
  };

  const handleRemoteSignal = async (signal) => {
    const pc = peerConnectionRef.current;
    if (!pc || signal.from === user.uid) return;

    try {
      switch (signal.type) {
        case 'offer':
          console.log('📨 Received offer');
          if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal({
              type: 'answer',
              answer: answer,
              from: user.uid
            });
          }
          break;

        case 'answer':
          console.log('📨 Received answer');
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
          }
          break;

        case 'ice-candidate':
          console.log('🧊 Received ICE candidate');
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
          break;
      }
    } catch (error) {
      console.error('❌ Error handling signal:', error);
    }
  };

  const createOffer = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    try {
      console.log('📝 Creating offer...');
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      await sendSignal({
        type: 'offer',
        offer: offer,
        from: user.uid
      });
    } catch (error) {
      console.error('❌ Error creating offer:', error);
    }
  };

  const getConnectionStatusText = (state) => {
    switch (state) {
      case 'connecting': return 'Connecting to partner...';
      case 'connected': return 'Connected';
      case 'disconnected': return 'Reconnecting...';
      case 'failed': return 'Connection failed';
      case 'closed': return 'Connection closed';
      default: return 'Setting up...';
    }
  };

  const handleConnectionFailure = () => {
    if (reconnectAttempts < 3) {
      setReconnectAttempts(prev => prev + 1);
      toast.error(`Connection failed, retrying... (${reconnectAttempts + 1}/3)`);
      
      setTimeout(() => {
        if (isInitiator) {
          createOffer();
        }
      }, 2000 * (reconnectAttempts + 1));
    } else {
      toast.error('Unable to connect. Please refresh and try again.');
    }
  };

  const handleDisconnection = () => {
    setConnectionStatus('Partner disconnected');
    toast.warning('Partner disconnected');
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isAudioEnabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
      toast.success(isAudioEnabled ? 'Microphone muted' : 'Microphone unmuted');
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
      toast.success(isVideoEnabled ? 'Camera turned off' : 'Camera turned on');
    }
  };

  const reconnect = async () => {
    setConnectionStatus('Reconnecting...');
    setReconnectAttempts(0);
    cleanup();
    setTimeout(() => {
      initializeSession();
    }, 1000);
  };

  const endSession = async () => {
    if (window.confirm('Are you sure you want to end this session?')) {
      try {
        cleanup();

        if (sessionId) {
          await updateDoc(doc(db, 'sessions', sessionId), {
            status: 'completed',
            endedAt: serverTimestamp(),
            actualDuration: session?.duration || 50
          });
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

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const toggleChat = () => {
    setShowChat(!showChat);
  };

  // Loading state
  if (loading) {
    return (
      <div className="video-session-loading">
        <div className="loading-container">
          <div className="spinner large"></div>
          <h3>Setting up your focus session...</h3>
          <p className="status-text">{connectionStatus}</p>
          {mediaError && (
            <div className="error-message">
              <p>{mediaError}</p>
              <button onClick={() => window.location.reload()} className="btn-primary">
                <FiRefreshCw /> Refresh & Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (mediaError) {
    return (
      <div className="video-session-error">
        <div className="error-container">
          <h2>Unable to Start Video Session</h2>
          <p>{mediaError}</p>
          <div className="error-actions">
            <button onClick={() => window.location.reload()} className="btn-primary">
              <FiRefreshCw /> Try Again
            </button>
            <button onClick={() => navigate('/dashboard')} className="btn-secondary">
              Back to Dashboard
            </button>
          </div>
          
          <div className="help-tips">
            <h4>Troubleshooting Tips:</h4>
            <ul>
              <li>• Make sure you're using Chrome, Firefox, Safari, or Edge</li>
              <li>• Allow camera and microphone permissions</li>
              <li>• Check that your camera isn't being used by another app</li>
              <li>• Ensure you have a stable internet connection</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`video-session-page ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Session Header */}
      <div className="session-header">
        <div className="session-info">
          <h3>{session?.goal || 'Focus Session'}</h3>
          <div className="session-status">
            <span className="status-indicator">{connectionStatus}</span>
            {session?.partnerName && (
              <span className="partner-info">
                👥 with {session.partnerName}
              </span>
            )}
          </div>
        </div>
        <div className="session-actions">
          <button className="header-btn" onClick={toggleChat} title="Toggle Chat">
            💬 {showChat ? 'Hide' : 'Chat'}
          </button>
          <button className="header-btn" onClick={toggleFullscreen} title="Toggle Fullscreen">
            <FiMaximize2 />
          </button>
        </div>
      </div>

      <div className="session-content">
        {/* Videos Grid */}
        <div className="videos-container">
          <div className="videos-grid">
            {/* Local Video */}
            <div className="video-box local">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="video-stream"
              />
              <div className="video-label">You {!isVideoEnabled && '(Camera Off)'}</div>
              {!isVideoEnabled && (
                <div className="video-disabled">
                  <div className="avatar-placeholder">
                    {user?.displayName?.charAt(0) || 'U'}
                  </div>
                </div>
              )}
              {!isAudioEnabled && (
                <div className="muted-indicator">🔇</div>
              )}
            </div>

            {/* Remote Video */}
            <div className="video-box remote">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="video-stream"
              />
              <div className="video-label">
                {session?.partnerName || 'Waiting for partner...'}
              </div>
              {!remoteStream && (
                <div className="video-placeholder">
                  <div className="connection-status">
                    <div className="spinner"></div>
                    <p>Connecting to your study partner...</p>
                    <small>This usually takes a few seconds</small>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Controls Bar */}
          <div className="controls-bar">
            <button
              className={`control-button ${!isAudioEnabled ? 'muted' : ''}`}
              onClick={toggleAudio}
              title={isAudioEnabled ? 'Mute' : 'Unmute'}
            >
              {isAudioEnabled ? <FiMic /> : <FiMicOff />}
            </button>

            <button
              className={`control-button ${!isVideoEnabled ? 'muted' : ''}`}
              onClick={toggleVideo}
              title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {isVideoEnabled ? <FiVideo /> : <FiVideoOff />}
            </button>

            <button
              className="control-button"
              onClick={reconnect}
              title="Reconnect"
            >
              <FiRefreshCw />
            </button>

            <button
              className="control-button end-call"
              onClick={endSession}
              title="End session"
            >
              <FiPhoneOff />
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className={`session-sidebar ${showChat ? 'show-chat' : ''}`}>
          {/* Timer */}
          <div className="timer-section">
            <SessionTimer 
              duration={session?.duration || 50} 
              onComplete={onTimerComplete}
              autoStart={true}
            />
          </div>

          {/* Session Details */}
          <div className="session-details">
            <div className="detail-item">
              <span>Goal:</span>
              <p>{session?.goal || 'Stay focused and productive'}</p>
            </div>
            <div className="detail-item">
              <span>Duration:</span>
              <p>{session?.duration || 50} minutes</p>
            </div>
            <div className="detail-item">
              <span>Status:</span>
              <p className={connectionStatus === 'Connected' ? 'status-active' : ''}>
                {connectionStatus}
              </p>
            </div>
          </div>

          {/* Chat */}
          {showChat && (
            <div className="chat-section">
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