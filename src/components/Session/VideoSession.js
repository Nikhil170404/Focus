import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff } from 'react-icons/fi';
import toast from 'react-hot-toast';

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');

  // Simple WebRTC configuration
  const pcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
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
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  }, []);

  const initializeSession = async () => {
    try {
      // Get session data
      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
      
      if (!sessionDoc.exists()) {
        toast.error('Session not found');
        navigate('/dashboard');
        return;
      }

      const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
      setSession(sessionData);
      
      // Setup local media
      await setupLocalStream();
      
      // Simple peer connection setup
      setupPeerConnection();
      
      setLoading(false);
      setConnectionStatus('Ready');
      
    } catch (error) {
      console.error('Error initializing session:', error);
      toast.error('Failed to setup session');
      setLoading(false);
    }
  };

  const setupLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
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
      
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
    } catch (error) {
      console.error('Media access error:', error);
      
      // Try audio only if video fails
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setIsVideoEnabled(false);
      } catch (audioError) {
        toast.error('Camera and microphone access required');
      }
    }
  };

  const setupPeerConnection = () => {
    try {
      peerConnectionRef.current = new RTCPeerConnection(pcConfig);
      
      // Add local stream tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          peerConnectionRef.current.addTrack(track, localStreamRef.current);
        });
      }

      // Handle remote stream
      peerConnectionRef.current.ontrack = (event) => {
        const [remoteStream] = event.streams;
        setRemoteStream(remoteStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setConnectionStatus('Connected');
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
          default:
            break;
        }
      };

    } catch (error) {
      console.error('Error setting up peer connection:', error);
      setConnectionStatus('Setup failed');
    }
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
          >
            {isAudioEnabled ? <FiMic /> : <FiMicOff />}
          </button>

          <button
            className={`control-button ${!isVideoEnabled ? 'muted' : ''}`}
            onClick={toggleVideo}
          >
            {isVideoEnabled ? <FiVideo /> : <FiVideoOff />}
          </button>

          <button
            className="control-button end-call"
            onClick={endSession}
          >
            <FiPhoneOff />
          </button>
        </div>
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
        </div>
      </div>
    </div>
  );
}

export default VideoSession;