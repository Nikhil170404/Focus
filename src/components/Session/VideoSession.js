import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { ref, push, onValue, off, set } from 'firebase/database';
import { db, realtimeDb } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiSettings, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const signalListenerRef = useRef(null);
  
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
  const [showSettings, setShowSettings] = useState(false);

  // Enhanced STUN/TURN configuration for production
  const rtcConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.ekiga.net' },
      { urls: 'stun:stun.fwdnet.net' },
      { urls: 'stun:stun.ideasip.com' },
      // Free TURN servers for backup
      {
        urls: 'turn:numb.viagenie.ca',
        credential: 'muazkh',
        username: 'webrtc@live.com'
      },
      {
        urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
        credential: 'webrtc',
        username: 'webrtc'
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };

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
    console.log('Cleaning up video session...');
    
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind);
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
  }, [sessionId]);

  const initializeSession = async () => {
    try {
      console.log('Initializing session:', sessionId);
      
      // Get session data with real-time listener
      const sessionRef = doc(db, 'sessions', sessionId);
      const unsubscribe = onSnapshot(sessionRef, (doc) => {
        if (doc.exists()) {
          const sessionData = { id: doc.id, ...doc.data() };
          setSession(sessionData);
          
          // Determine if user is initiator (person who created the session)
          setIsInitiator(sessionData.userId === user.uid);
          
          console.log('Session data loaded:', sessionData);
        } else {
          toast.error('Session not found');
          navigate('/dashboard');
        }
      });

      // Check if browser supports WebRTC
      if (!window.RTCPeerConnection) {
        throw new Error('WebRTC is not supported in this browser');
      }

      // Check if we're on HTTPS or localhost
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        setMediaError('Video calling requires a secure connection (HTTPS)');
        toast.error('Video calling requires HTTPS');
      }

      // Initialize media
      await initializeMedia();
      
      // Setup WebRTC
      await setupWebRTC();
      
      setLoading(false);
      
      return () => unsubscribe();
      
    } catch (error) {
      console.error('Error initializing session:', error);
      setMediaError(error.message);
      toast.error('Failed to initialize session: ' + error.message);
      setLoading(false);
    }
  };

  const initializeMedia = async () => {
    try {
      console.log('Requesting media permissions...');
      setConnectionStatus('Requesting camera and microphone...');

      // Check for media devices
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Media devices not supported');
      }

      // Request permissions with fallback strategy
      let stream;
      try {
        // Try high quality first
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
            autoGainControl: true,
            sampleRate: { ideal: 44100 }
          }
        });
      } catch (highQualityError) {
        console.warn('High quality failed, trying medium quality:', highQualityError);
        
        try {
          // Fallback to medium quality
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user'
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true
            }
          });
        } catch (mediumQualityError) {
          console.warn('Medium quality failed, trying audio only:', mediumQualityError);
          
          // Last resort: audio only
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true
          });
          setIsVideoEnabled(false);
          toast.warning('Camera not available, audio-only mode');
        }
      }
      
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      console.log('Media initialized successfully');
      setConnectionStatus('Media ready');
      
    } catch (error) {
      console.error('Media access error:', error);
      
      let errorMessage = 'Failed to access camera/microphone';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera and microphone access denied. Please allow permissions and refresh.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera or microphone found. Please connect devices and try again.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Your browser does not support video calling.';
      }
      
      setMediaError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const setupWebRTC = async () => {
    try {
      console.log('Setting up WebRTC...');
      setConnectionStatus('Setting up connection...');

      // Create peer connection
      peerConnectionRef.current = new RTCPeerConnection(rtcConfiguration);
      const pc = peerConnectionRef.current;

      // Add local stream tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
          console.log('Added local track:', track.kind);
        });
      }

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        const [remoteStream] = event.streams;
        setRemoteStream(remoteStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setConnectionStatus('Connected');
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate');
          sendSignal({
            type: 'ice-candidate',
            candidate: event.candidate,
            from: user.uid,
            timestamp: Date.now()
          });
        } else {
          console.log('ICE gathering complete');
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log('Connection state:', state);
        setConnectionStatus(getConnectionStatusText(state));
        
        if (state === 'failed') {
          handleConnectionFailure();
        } else if (state === 'disconnected') {
          handleDisconnection();
        } else if (state === 'connected') {
          setReconnectAttempts(0);
          toast.success('Connected to partner!');
        }
      };

      // Handle ICE connection state
      pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
      };

      // Setup signaling
      setupSignaling();

      // If user is initiator, create offer after a short delay
      if (isInitiator) {
        setTimeout(() => {
          createOffer();
        }, 1000);
      }

    } catch (error) {
      console.error('WebRTC setup error:', error);
      throw error;
    }
  };

  const setupSignaling = () => {
    const signalRef = ref(realtimeDb, `sessions/${sessionId}/signals`);
    
    signalListenerRef.current = onValue(signalRef, (snapshot) => {
      const signals = snapshot.val();
      if (signals) {
        Object.entries(signals).forEach(([key, signal]) => {
          if (signal.from !== user.uid && signal.timestamp > Date.now() - 60000) {
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
      console.error('Error sending signal:', error);
    }
  };

  const handleRemoteSignal = async (signal) => {
    const pc = peerConnectionRef.current;
    if (!pc || signal.from === user.uid) return;

    try {
      switch (signal.type) {
        case 'offer':
          console.log('Received offer');
          await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal({
            type: 'answer',
            answer: answer,
            from: user.uid
          });
          break;

        case 'answer':
          console.log('Received answer');
          await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
          break;

        case 'ice-candidate':
          console.log('Received ICE candidate');
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
          break;

        default:
          console.log('Unknown signal type:', signal.type);
      }
    } catch (error) {
      console.error('Error handling signal:', error);
    }
  };

  const createOffer = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    try {
      console.log('Creating offer...');
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
      console.error('Error creating offer:', error);
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
      toast.error('Unable to connect to partner. Please refresh and try again.');
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
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const reconnect = async () => {
    setConnectionStatus('Reconnecting...');
    cleanup();
    await initializeSession();
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

        toast.success('Session completed!');
        navigate('/dashboard');
      } catch (error) {
        console.error('Error ending session:', error);
        navigate('/dashboard');
      }
    }
  };

  const onTimerComplete = () => {
    toast.success('Session time completed! Great work!');
    setTimeout(() => {
      endSession();
    }, 3000);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Setting up your session...</p>
        <p className="text-sm">{connectionStatus}</p>
      </div>
    );
  }

  if (mediaError) {
    return (
      <div className="video-session-page">
        <div className="error-container">
          <h2>Media Access Error</h2>
          <p>{mediaError}</p>
          <div className="error-actions">
            <button onClick={() => window.location.reload()} className="btn-primary">
              <FiRefreshCw /> Refresh & Try Again
            </button>
            <button onClick={() => navigate('/dashboard')} className="btn-secondary">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="video-session-page">
      <div className="video-container">
        {/* Session Info */}
        <div className="session-header">
          <div className="session-info">
            <h3>{session?.goal || 'Focus Session'}</h3>
            <span className="status-indicator">{connectionStatus}</span>
          </div>
          <div className="session-actions">
            <button className="fullscreen-btn" onClick={() => setShowSettings(!showSettings)}>
              <FiSettings />
            </button>
          </div>
        </div>

        {/* Videos */}
        <div className="videos-grid">
          <div className="video-box">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="video-stream"
            />
            <div className="video-label">You</div>
            {!isVideoEnabled && (
              <div className="video-disabled">
                <div className="avatar-placeholder">
                  {user?.displayName?.charAt(0) || 'U'}
                </div>
                <p>Camera Off</p>
              </div>
            )}
          </div>

          <div className="video-box">
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
                <div className="spinner"></div>
                <p>Connecting...</p>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
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

        {/* Debug info for development */}
        {process.env.NODE_ENV === 'development' && showSettings && (
          <div className="debug-info">
            <h4>Debug Info</h4>
            <p>Is Initiator: {isInitiator ? 'Yes' : 'No'}</p>
            <p>Connection Status: {connectionStatus}</p>
            <p>Reconnect Attempts: {reconnectAttempts}</p>
            <p>Local Stream: {localStream ? 'Active' : 'None'}</p>
            <p>Remote Stream: {remoteStream ? 'Active' : 'None'}</p>
          </div>
        )}
      </div>

      {/* Timer Sidebar */}
      <div className="timer-sidebar">
        <h3>Focus Timer</h3>
        <SessionTimer 
          duration={session?.duration || 50} 
          onComplete={onTimerComplete}
          autoStart={true}
        />
        
        <div className="session-details">
          <div className="detail-item">
            <span>Goal:</span>
            <p>{session?.goal || 'Stay focused'}</p>
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
      </div>
    </div>
  );
}

export default VideoSession;