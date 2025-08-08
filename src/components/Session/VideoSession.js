import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import SessionChat from './SessionChat';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiMaximize2, FiMessageCircle, FiSettings } from 'react-icons/fi';
import toast from 'react-hot-toast';

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState('timer');
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');
  const [session, setSession] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaError, setMediaError] = useState(null);

  useEffect(() => {
    initializeSession();
    
    // Cleanup function
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    // Handle fullscreen changes
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const initializeSession = async () => {
    try {
      setConnectionStatus('Loading session...');
      
      // Get session data
      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId || 'demo'));
      let sessionData;
      
      if (sessionDoc.exists()) {
        sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
      } else {
        // Create demo session if not exists
        sessionData = {
          id: 'demo',
          goal: 'Complete your focused work session',
          duration: 50,
          userId: user?.uid || 'demo-user',
          status: 'active'
        };
      }
      
      setSession(sessionData);
      
      // Initialize camera and microphone
      await setupLocalStream();
      
      // Simulate partner connection for demo
      setTimeout(() => {
        setConnectionStatus('Connected');
        simulatePartnerConnection();
      }, 2000);
      
    } catch (error) {
      console.error('Error initializing session:', error);
      setMediaError('Failed to initialize session');
      toast.error('Error setting up session');
    }
    setLoading(false);
  };

  const setupLocalStream = async () => {
    try {
      setConnectionStatus('Accessing camera and microphone...');
      
      const constraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      setConnectionStatus('Waiting for partner...');
      setMediaError(null);
      
      // Update session status to active
      if (sessionId && sessionId !== 'demo') {
        await updateDoc(doc(db, 'sessions', sessionId), {
          status: 'active',
          startedAt: new Date()
        });
      }
      
    } catch (error) {
      console.error('Media access error:', error);
      setMediaError('Camera/microphone access denied. Please allow access and refresh.');
      setConnectionStatus('Media access failed');
      
      // Fallback to demo mode without actual camera
      toast.error('Camera access denied. Running in demo mode.');
    }
  };

  const simulatePartnerConnection = () => {
    // In a real app, this would be the remote stream from WebRTC
    // For demo, we'll create a mock partner video
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      
      // Create a gradient background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#667eea');
      gradient.addColorStop(1, '#764ba2');
      
      const drawFrame = () => {
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add some animation
        ctx.fillStyle = 'white';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Partner Connected', canvas.width / 2, canvas.height / 2);
        ctx.fillText('🤝', canvas.width / 2, canvas.height / 2 + 40);
        
        requestAnimationFrame(drawFrame);
      };
      
      drawFrame();
      
      const mockStream = canvas.captureStream(30);
      setRemoteStream(mockStream);
      
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = mockStream;
      }
      
    } catch (error) {
      console.error('Error creating mock partner stream:', error);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioEnabled;
      });
    }
    setIsAudioEnabled(!isAudioEnabled);
    toast.success(isAudioEnabled ? 'Microphone muted' : 'Microphone unmuted');
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled;
      });
    }
    setIsVideoEnabled(!isVideoEnabled);
    toast.success(isVideoEnabled ? 'Camera turned off' : 'Camera turned on');
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
        // Stop all media tracks
        if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
        }
        if (remoteStream) {
          remoteStream.getTracks().forEach(track => track.stop());
        }

        // Update session status
        if (sessionId && sessionId !== 'demo') {
          await updateDoc(doc(db, 'sessions', sessionId), {
            status: 'completed',
            endedAt: new Date()
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
    endSession();
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
            <div className="video-label">Partner</div>
            {connectionStatus !== 'Connected' ? (
              <div className="video-connecting">
                <div className="pulse-loader"></div>
                <p>{connectionStatus}</p>
              </div>
            ) : !remoteStream ? (
              <div className="video-disabled">
                <div className="disabled-avatar">P</div>
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

          <button
            className="control-button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            <FiMaximize2 size={20} />
          </button>

          <button
            className="control-button mobile-sidebar-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title="Toggle sidebar"
          >
            <FiMessageCircle size={20} />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`session-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-tabs">
          <button
            className={`tab-button ${activeTab === 'timer' ? 'active' : ''}`}
            onClick={() => setActiveTab('timer')}
          >
            Timer
          </button>
          <button
            className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            className={`tab-button ${activeTab === 'goals' ? 'active' : ''}`}
            onClick={() => setActiveTab('goals')}
          >
            Goals
          </button>
        </div>

        <div className="sidebar-panel">
          {activeTab === 'timer' && (
            <div className="timer-panel">
              <SessionTimer 
                duration={session?.duration || 50} 
                onComplete={onTimerComplete}
              />
              <div className="session-info">
                <h4>Session Details</h4>
                <div className="info-item">
                  <span>Duration:</span>
                  <span>{session?.duration || 50} minutes</span>
                </div>
                <div className="info-item">
                  <span>Status:</span>
                  <span className="status active">Active</span>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'chat' && (
            <SessionChat 
              sessionId={sessionId || 'demo'} 
              userId={user?.uid || 'demo-user'} 
              userName={user?.displayName || 'You'} 
            />
          )}
          
          {activeTab === 'goals' && (
            <div className="goals-panel">
              <div className="goal-section">
                <h3>Session Goal</h3>
                <div className="goal-card">
                  <p>{session?.goal || 'Focus on your tasks and stay productive'}</p>
                </div>
              </div>
              
              <div className="notes-section">
                <h3>Progress Notes</h3>
                <textarea
                  className="notes-textarea"
                  placeholder="Track your progress, ideas, and accomplishments here..."
                  rows={8}
                />
                <button className="save-button">
                  <FiSettings size={16} />
                  Save Notes
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Mobile sidebar overlay */}
        <div 
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      </div>
    </div>
  );
}

export default VideoSession;