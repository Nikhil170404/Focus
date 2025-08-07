import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import SessionChat from './SessionChat';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiMaximize2, FiMessageCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  
  const [localStream, setLocalStream] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState('goals');
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');
  const [session, setSession] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    initializeSession();
    
    return () => {
      // Cleanup
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const initializeSession = async () => {
    try {
      // Get session data
      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId || 'demo'));
      let sessionData;
      
      if (sessionDoc.exists()) {
        sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
      } else {
        // Create demo session if not exists
        sessionData = {
          id: 'demo',
          goal: 'Complete project tasks',
          duration: 50,
          userId: user?.uid || 'demo-user'
        };
      }
      
      setSession(sessionData);
      
      // Initialize camera and microphone
      await setupLocalStream();
      
      // Simulate partner connection after 2 seconds
      setTimeout(() => {
        setConnectionStatus('Partner Connected');
        simulatePartnerStream();
      }, 2000);
      
    } catch (error) {
      console.error('Error initializing session:', error);
      toast.error('Please allow camera and microphone access');
    }
    setLoading(false);
  };

  const setupLocalStream = async () => {
    try {
      setConnectionStatus('Accessing camera...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setConnectionStatus('Connecting to partner...');
    } catch (error) {
      console.error('Media access error:', error);
      // Fallback to demo mode without actual camera
      setConnectionStatus('Demo mode - Camera not available');
    }
  };

  const simulatePartnerStream = () => {
    // In a real app, this would be the remote stream from WebRTC
    // For demo, we'll just show a placeholder
    if (remoteVideoRef.current) {
      // You can set a demo video or leave it as placeholder
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioEnabled;
      });
    }
    setIsAudioEnabled(!isAudioEnabled);
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled;
      });
    }
    setIsVideoEnabled(!isVideoEnabled);
  };

  const endSession = () => {
    if (window.confirm('Are you sure you want to end this session?')) {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      toast.success('Session ended successfully!');
      navigate('/dashboard');
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Setting up your session...</p>
      </div>
    );
  }

  return (
    <div className="video-session-page">
      <div className="video-container">
        <div className="videos-grid">
          {/* Local Video */}
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
                <FiVideoOff size={48} />
                <p>Camera Off</p>
              </div>
            )}
          </div>

          {/* Remote Video */}
          <div className="video-box">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="video-stream"
            />
            <div className="video-label">Partner</div>
            {connectionStatus !== 'Partner Connected' && (
              <div className="video-connecting">
                <div className="pulse-loader"></div>
                <p>{connectionStatus}</p>
              </div>
            )}
          </div>
        </div>

        {/* Control Bar */}
        <div className="controls-bar">
          <button
            className={`control-button ${!isAudioEnabled ? 'muted' : ''}`}
            onClick={toggleAudio}
            title={isAudioEnabled ? 'Mute' : 'Unmute'}
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
            title="Fullscreen"
          >
            <FiMaximize2 size={20} />
          </button>

          <button
            className="control-button mobile-chat-toggle"
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
            <SessionTimer duration={session?.duration || 50} onComplete={endSession} />
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
                  <p>{session?.goal || 'Focus on your tasks'}</p>
                </div>
              </div>
              
              <div className="notes-section">
                <h3>Progress Notes</h3>
                <textarea
                  className="notes-textarea"
                  placeholder="Track your progress here..."
                  rows={8}
                />
                <button className="save-button">Save Notes</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VideoSession;