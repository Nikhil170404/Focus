import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ref, push, onValue, off, serverTimestamp as rtServerTimestamp } from 'firebase/database';
import { db, realtimeDb } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiMaximize2, FiMinimize2, FiUsers, FiRefreshCw } from 'react-icons/fi';
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
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');
  const [session, setSession] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [partner, setPartner] = useState(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const [bothConnected, setBothConnected] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);

  // Enhanced WebRTC configuration
  const pcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.services.mozilla.com' }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };

  const cleanup = useCallback(() => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      if (signalListenerRef.current && sessionId) {
        const signalRef = ref(realtimeDb, `sessions/${sessionId}/signals`);
        off(signalRef, 'value', signalListenerRef.current);
        signalListenerRef.current = null;
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !user) {
      navigate('/dashboard');
      return;
    }

    initializeSession();
    
    const handleResize = () => {
      // Handle any resize logic if needed
    };
    
    const handleBeforeUnload = () => {
      cleanup();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanup();
    };
  }, [sessionId, user, cleanup, navigate]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const initializeSession = async () => {
    try {
      setConnectionStatus('Loading session...');
      setLoading(true);
      setMediaError(null);

      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
      
      if (!sessionDoc.exists()) {
        toast.error('Session not found');
        navigate('/dashboard');
        return;
      }

      const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
      setSession(sessionData);
      
      if (sessionData.userId !== user.uid && sessionData.partnerId !== user.uid) {
        toast.error('You are not authorized to join this session');
        navigate('/dashboard');
        return;
      }

      setIsInitiator(sessionData.userId === user.uid);
      
      // Listen for session updates to detect when both users are connected
      const unsubscribe = onSnapshot(doc(db, 'sessions', sessionId), (doc) => {
        if (doc.exists()) {
          const updatedData = { id: doc.id, ...doc.data() };
          setSession(updatedData);
          
          // Check if both users are connected
          const hasBothUsers = updatedData.userId && updatedData.partnerId;
          const wasAlreadyConnected = bothConnected;
          
          if (hasBothUsers && !wasAlreadyConnected) {
            setBothConnected(true);
            setSessionStartTime(new Date());
            toast.success('Both partners connected! Timer starting...');
          }
          
          if (updatedData.partnerId && updatedData.partnerId !== user.uid) {
            setPartner({
              id: updatedData.partnerId,
              name: updatedData.partnerName,
              photo: updatedData.partnerPhoto
            });
          }
        }
      });

      await setupLocalStream();
      await handlePartnerConnection(sessionData);

    } catch (error) {
      console.error('Error initializing session:', error);
      setMediaError('Failed to initialize session');
      toast.error('Error setting up session');
      setLoading(false);
    }
  };

  const handlePartnerConnection = async (sessionData) => {
    try {
      if (sessionData.partnerId && sessionData.partnerId !== user.uid) {
        setPartner({
          id: sessionData.partnerId,
          name: sessionData.partnerName,
          photo: sessionData.partnerPhoto
        });
        setConnectionStatus('Connecting to partner...');
        await setupWebRTCConnection();
        
        // If both users already exist, mark as connected
        if (sessionData.userId && sessionData.partnerId) {
          setBothConnected(true);
          setSessionStartTime(new Date());
        }
      } else {
        setConnectionStatus('Waiting for partner...');
        await findOrWaitForPartner(sessionData);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error handling partner connection:', error);
      setConnectionStatus('Failed to connect with partner');
      setLoading(false);
    }
  };

  const setupLocalStream = async () => {
    try {
      setConnectionStatus('Accessing camera and microphone...');
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support camera and microphone access');
      }

      const constraints = {
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.onloadedmetadata = () => {
          localVideoRef.current.play().catch(e => console.log('Video play failed:', e));
        };
      }
      
      setConnectionStatus('Media ready');
      setMediaError(null);
      
    } catch (error) {
      console.error('Media access error:', error);
      let errorMessage = 'Camera access issue: ';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Please allow camera access and refresh the page.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found. Please connect a camera and try again.';
      } else {
        errorMessage = `Media error: ${error.message}`;
      }
      
      setMediaError(errorMessage);
      setConnectionStatus('Media access failed');
      toast.error(errorMessage);
    }
  };

  const findOrWaitForPartner = async (sessionData) => {
    try {
      // Update session status and user info
      await updateDoc(doc(db, 'sessions', sessionId), {
        status: 'active',
        startedAt: serverTimestamp(),
        userName: user.displayName || user.email,
        userPhoto: user.photoURL
      });

    } catch (error) {
      console.error('Error finding partner:', error);
      setConnectionStatus('Failed to find partner');
    }
  };

  const setupWebRTCConnection = async () => {
    try {
      if (!localStreamRef.current) {
        throw new Error('Local stream not available');
      }

      setConnectionStatus('Setting up connection...');
      
      peerConnectionRef.current = new RTCPeerConnection(pcConfig);
      
      localStreamRef.current.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, localStreamRef.current);
      });

      peerConnectionRef.current.ontrack = (event) => {
        console.log('Received remote stream');
        const [remoteStream] = event.streams;
        setRemoteStream(remoteStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setConnectionStatus('Connected');
      };

      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({
            type: 'ice-candidate',
            candidate: event.candidate,
            from: user.uid,
            timestamp: Date.now()
          });
        }
      };

      peerConnectionRef.current.onconnectionstatechange = () => {
        const state = peerConnectionRef.current?.connectionState;
        console.log('Connection state:', state);
        
        switch (state) {
          case 'connected':
            setConnectionStatus('Connected');
            break;
          case 'disconnected':
            setConnectionStatus('Reconnecting...');
            break;
          case 'failed':
            setConnectionStatus('Connection failed');
            break;
          case 'connecting':
            setConnectionStatus('Connecting...');
            break;
          default:
            break;
        }
      };

      listenForSignals();

      if (isInitiator) {
        console.log('Creating offer as initiator');
        const offer = await peerConnectionRef.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await peerConnectionRef.current.setLocalDescription(offer);
        
        sendSignal({
          type: 'offer',
          offer: offer,
          from: user.uid,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      console.error('Error setting up WebRTC:', error);
      setConnectionStatus('Connection setup failed');
      toast.error('Failed to setup video connection');
    }
  };

  const sendSignal = async (data) => {
    try {
      if (!sessionId) return;
      
      const signalRef = ref(realtimeDb, `sessions/${sessionId}/signals`);
      await push(signalRef, {
        ...data,
        timestamp: rtServerTimestamp()
      });
    } catch (error) {
      console.error('Error sending signal:', error);
    }
  };

  const listenForSignals = () => {
    if (!sessionId) return;
    
    const signalRef = ref(realtimeDb, `sessions/${sessionId}/signals`);
    
    signalListenerRef.current = onValue(signalRef, async (snapshot) => {
      const signals = snapshot.val();
      if (signals) {
        const signalEntries = Object.entries(signals)
          .filter(([_, signal]) => signal.from !== user.uid)
          .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
          .slice(0, 5);

        for (const [_, signal] of signalEntries) {
          try {
            await handleSignal(signal);
          } catch (error) {
            console.error('Error handling signal:', error);
          }
        }
      }
    }, (error) => {
      console.error('Error listening for signals:', error);
    });
  };

  const handleSignal = async (signal) => {
    if (!peerConnectionRef.current || signal.from === user.uid) return;

    try {
      switch (signal.type) {
        case 'offer':
          console.log('Received offer');
          if (peerConnectionRef.current.signalingState === 'stable') {
            await peerConnectionRef.current.setRemoteDescription(signal.offer);
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            
            sendSignal({
              type: 'answer',
              answer: answer,
              from: user.uid,
              timestamp: Date.now()
            });
          }
          break;

        case 'answer':
          console.log('Received answer');
          if (peerConnectionRef.current.signalingState === 'have-local-offer') {
            await peerConnectionRef.current.setRemoteDescription(signal.answer);
          }
          break;

        case 'ice-candidate':
          console.log('Received ICE candidate');
          if (peerConnectionRef.current.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(signal.candidate);
          }
          break;

        default:
          console.log('Unknown signal type:', signal.type);
      }
    } catch (error) {
      console.error('Error handling signal:', error);
    }
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

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
      toast.error('Fullscreen not supported');
    }
  };

  const endSession = async () => {
    if (window.confirm('Are you sure you want to end this session?')) {
      try {
        cleanup();

        if (sessionId) {
          await updateDoc(doc(db, 'sessions', sessionId), {
            status: 'completed',
            endedAt: serverTimestamp(),
            actualDuration: Math.floor((new Date() - sessionStartTime) / 60000) || session?.duration
          });
        }

        toast.success('Session completed successfully!');
        navigate('/dashboard');
      } catch (error) {
        console.error('Error ending session:', error);
        toast.error('Error ending session');
        navigate('/dashboard');
      }
    }
  };

  const onTimerComplete = () => {
    toast.success('Session time completed!');
    setTimeout(() => {
      endSession();
    }, 3000);
  };

  if (loading) {
    return (
      <div className="video-loading-screen">
        <div className="loading-content">
          <div className="spinner large"></div>
          <h3>Setting up your focus session...</h3>
          <p>{connectionStatus}</p>
        </div>
      </div>
    );
  }

  if (mediaError) {
    return (
      <div className="video-error-screen">
        <div className="error-content">
          <div className="error-icon">⚠️</div>
          <h3>Camera Access Required</h3>
          <p>{mediaError}</p>
          <div className="error-actions">
            <button onClick={() => window.location.reload()} className="btn-primary">
              <FiRefreshCw size={16} />
              Try Again
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
    <div className={`video-session-page ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="video-container">
        {/* Session Header */}
        <div className="session-header">
          <div className="session-info">
            <h3>{session?.goal || 'Focus Session'}</h3>
            <div className="session-status">
              <span className={`status-indicator ${connectionStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                {connectionStatus}
              </span>
              {partner && (
                <span className="partner-info">
                  <FiUsers size={14} />
                  with {partner.name}
                </span>
              )}
            </div>
          </div>
          
          <div className="session-actions">
            <button 
              className="fullscreen-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <FiMinimize2 size={18} /> : <FiMaximize2 size={18} />}
            </button>
          </div>
        </div>

        {/* Videos Grid */}
        <div className="videos-grid">
          {/* Local Video */}
          <div className="video-box local-video">
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
                <div className="disabled-avatar">
                  {user?.displayName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || '?'}
                </div>
                <p>Camera Off</p>
              </div>
            )}
            <div className="video-controls-overlay">
              <span className={`mic-indicator ${!isAudioEnabled ? 'muted' : ''}`}>
                {isAudioEnabled ? <FiMic size={16} /> : <FiMicOff size={16} />}
              </span>
            </div>
          </div>

          {/* Remote Video */}
          <div className="video-box remote-video">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="video-stream"
            />
            <div className="video-label">
              {partner ? partner.name : 'Waiting for partner...'}
            </div>
            {connectionStatus !== 'Connected' ? (
              <div className="video-connecting">
                <div className="pulse-loader"></div>
                <p>{connectionStatus}</p>
              </div>
            ) : !remoteStream ? (
              <div className="video-disabled">
                <div className="disabled-avatar">
                  {partner?.name?.charAt(0).toUpperCase() || 'P'}
                </div>
                <p>Partner's camera off</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Control Bar */}
        <div className="controls-bar">
          <button
            className={`control-button ${!isAudioEnabled ? 'muted' : ''}`}
            onClick={toggleAudio}
            title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {isAudioEnabled ? <FiMic size={20} /> : <FiMicOff size={20} />}
          </button>

          <button
            className={`control-button ${!isVideoEnabled ? 'muted' : ''}`}
            onClick={toggleVideo}
            title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {isVideoEnabled ? <FiVideo size={20} /> : <FiVideoOff size={20} />}
          </button>

          <button
            className="control-button end-call"
            onClick={endSession}
            title="End Session"
          >
            <FiPhoneOff size={20} />
          </button>
        </div>
      </div>

      {/* Simple Timer Sidebar */}
      <div className="timer-sidebar">
        <div className="timer-container">
          <h3>Focus Timer</h3>
          <SessionTimer 
            duration={session?.duration || 50} 
            onComplete={onTimerComplete}
            sessionId={sessionId}
            autoStart={bothConnected}
            startTime={sessionStartTime}
          />
          
          <div className="session-details">
            <div className="detail-item">
              <span>Goal:</span>
              <p>{session?.goal || 'Stay focused and productive'}</p>
            </div>
            <div className="detail-item">
              <span>Duration:</span>
              <p>{session?.duration || 50} minutes</p>
            </div>
            {bothConnected && (
              <div className="detail-item">
                <span>Status:</span>
                <p className="status-active">Session Active</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoSession;