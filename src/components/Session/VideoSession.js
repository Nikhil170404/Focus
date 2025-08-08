import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, onSnapshot, collection, addDoc, query, where, orderBy, limit } from 'firebase/firestore';
import { ref, push, onValue, off } from 'firebase/database';
import { db, realtimeDb } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import SessionTimer from './SessionTimer';
import SessionChat from './SessionChat';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiMaximize2, FiMessageCircle, FiSettings, FiMinimize2 } from 'react-icons/fi';
import toast from 'react-hot-toast';

function VideoSession() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState('timer');
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');
  const [session, setSession] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [partner, setPartner] = useState(null);
  const [isInitiator, setIsInitiator] = useState(false);

  // WebRTC configuration
  const pcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    initializeSession();
    
    // Handle window resize
    const handleResize = () => {
      setIsSidebarOpen(window.innerWidth > 1024);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      cleanup();
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

  const cleanup = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    // Clean up Firebase listeners
    const signalRef = ref(realtimeDb, `sessions/${sessionId}/signals`);
    off(signalRef);
  };

  const initializeSession = async () => {
    try {
      setConnectionStatus('Loading session...');
      
      // Get session data
      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId || 'demo'));
      let sessionData;
      
      if (sessionDoc.exists()) {
        sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
        setSession(sessionData);
        
        // Check if we're the initiator (creator of the session)
        setIsInitiator(sessionData.userId === user?.uid);
        
        // Listen for session updates
        const unsubscribe = onSnapshot(doc(db, 'sessions', sessionId), (doc) => {
          if (doc.exists()) {
            const updatedData = { id: doc.id, ...doc.data() };
            setSession(updatedData);
            if (updatedData.partnerId && updatedData.partnerId !== user?.uid) {
              setPartner({
                id: updatedData.partnerId,
                name: updatedData.partnerName,
                photo: updatedData.partnerPhoto
              });
            }
          }
        });
        
        // Find or wait for partner
        await findOrWaitForPartner(sessionData);
        
      } else {
        // Create demo session if not exists
        sessionData = {
          id: 'demo',
          goal: 'Complete your focused work session',
          duration: 50,
          userId: user?.uid || 'demo-user',
          status: 'active'
        };
        setSession(sessionData);
      }
      
      // Initialize media
      await setupLocalStream();
      
    } catch (error) {
      console.error('Error initializing session:', error);
      setMediaError('Failed to initialize session');
      toast.error('Error setting up session');
    }
    setLoading(false);
  };

  const findOrWaitForPartner = async (sessionData) => {
    try {
      // If session already has a partner, set up connection
      if (sessionData.partnerId && sessionData.partnerId !== user?.uid) {
        setPartner({
          id: sessionData.partnerId,
          name: sessionData.partnerName,
          photo: sessionData.partnerPhoto
        });
        setConnectionStatus('Connecting to partner...');
        await setupWebRTCConnection();
        return;
      }

      // If no partner, try to find one
      const partnerQuery = query(
        collection(db, 'sessions'),
        where('startTime', '==', sessionData.startTime),
        where('duration', '==', sessionData.duration),
        where('status', '==', 'scheduled'),
        where('userId', '!=', user.uid),
        orderBy('createdAt', 'asc'),
        limit(1)
      );

      // Listen for potential partners
      const unsubscribe = onSnapshot(partnerQuery, async (snapshot) => {
        if (!snapshot.empty) {
          const partnerSession = snapshot.docs[0];
          const partnerData = partnerSession.data();
          
          // Update both sessions with partner info
          await Promise.all([
            updateDoc(doc(db, 'sessions', sessionId), {
              partnerId: partnerData.userId,
              partnerName: partnerData.userName,
              partnerPhoto: partnerData.userPhoto,
              status: 'active'
            }),
            updateDoc(doc(db, 'sessions', partnerSession.id), {
              partnerId: user.uid,
              partnerName: user.displayName,
              partnerPhoto: user.photoURL,
              status: 'active'
            })
          ]);

          setPartner({
            id: partnerData.userId,
            name: partnerData.userName,
            photo: partnerData.userPhoto
          });

          toast.success(`Connected with ${partnerData.userName}! 🤝`);
          setConnectionStatus('Connecting to partner...');
          await setupWebRTCConnection();
          unsubscribe();
        }
      });

      // Update session status to active and add user info
      await updateDoc(doc(db, 'sessions', sessionId), {
        status: 'active',
        startedAt: new Date(),
        userName: user.displayName,
        userPhoto: user.photoURL
      });

    } catch (error) {
      console.error('Error finding partner:', error);
      setConnectionStatus('Failed to find partner');
    }
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
      
      setConnectionStatus('Media ready');
      setMediaError(null);
      
    } catch (error) {
      console.error('Media access error:', error);
      setMediaError('Camera/microphone access denied. Please allow access and refresh.');
      setConnectionStatus('Media access failed');
      toast.error('Camera access denied. Please enable camera and microphone access.');
    }
  };

  const setupWebRTCConnection = async () => {
    try {
      // Create peer connection
      peerConnectionRef.current = new RTCPeerConnection(pcConfig);
      
      // Add local stream to peer connection
      if (localStream) {
        localStream.getTracks().forEach(track => {
          peerConnectionRef.current.addTrack(track, localStream);
        });
      }

      // Handle remote stream
      peerConnectionRef.current.ontrack = (event) => {
        console.log('Received remote stream');
        const [remoteStream] = event.streams;
        setRemoteStream(remoteStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setConnectionStatus('Connected');
      };

      // Handle ICE candidates
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({
            type: 'ice-candidate',
            candidate: event.candidate,
            from: user.uid
          });
        }
      };

      // Handle connection state changes
      peerConnectionRef.current.onconnectionstatechange = () => {
        const state = peerConnectionRef.current.connectionState;
        console.log('Connection state:', state);
        
        switch (state) {
          case 'connected':
            setConnectionStatus('Connected');
            break;
          case 'disconnected':
            setConnectionStatus('Disconnected');
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

      // Listen for signaling data
      listenForSignals();

      // If we're the initiator, create offer
      if (isInitiator) {
        console.log('Creating offer as initiator');
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        
        sendSignal({
          type: 'offer',
          offer: offer,
          from: user.uid
        });
      }

    } catch (error) {
      console.error('Error setting up WebRTC:', error);
      setConnectionStatus('Connection failed');
    }
  };

  const sendSignal = async (data) => {
    try {
      const signalRef = ref(realtimeDb, `sessions/${sessionId}/signals`);
      await push(signalRef, {
        ...data,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error sending signal:', error);
    }
  };

  const listenForSignals = () => {
    const signalRef = ref(realtimeDb, `sessions/${sessionId}/signals`);
    
    onValue(signalRef, async (snapshot) => {
      const signals = snapshot.val();
      if (signals) {
        const signalEntries = Object.entries(signals);
        const latestSignals = signalEntries
          .sort((a, b) => b[1].timestamp - a[1].timestamp)
          .slice(0, 10); // Process only recent signals

        for (const [key, signal] of latestSignals) {
          if (signal.from !== user.uid) {
            try {
              await handleSignal(signal);
            } catch (error) {
              console.error('Error handling signal:', error);
            }
          }
        }
      }
    });
  };

  const handleSignal = async (signal) => {
    if (!peerConnectionRef.current) return;

    try {
      switch (signal.type) {
        case 'offer':
          console.log('Received offer');
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal.offer));
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          
          sendSignal({
            type: 'answer',
            answer: answer,
            from: user.uid
          });
          break;

        case 'answer':
          console.log('Received answer');
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal.answer));
          break;

        case 'ice-candidate':
          console.log('Received ICE candidate');
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
          break;

        default:
          console.log('Unknown signal type:', signal.type);
      }
    } catch (error) {
      console.error('Error handling signal:', error);
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
        cleanup();

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

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
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
        <div className="video-header mobile-only">
          <div className="session-info-mobile">
            <h3>{session?.goal || 'Focus Session'}</h3>
            <span className="connection-status">{connectionStatus}</span>
          </div>
          <button className="sidebar-toggle-mobile" onClick={toggleSidebar}>
            <FiMessageCircle size={20} />
          </button>
        </div>

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
              {partner ? partner.name : 'Partner'}
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

          <button
            className="control-button desktop-only"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <FiMinimize2 size={20} /> : <FiMaximize2 size={20} />}
          </button>

          <button
            className="control-button desktop-only"
            onClick={toggleSidebar}
            title="Toggle sidebar"
          >
            <FiMessageCircle size={20} />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`session-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header mobile-only">
          <h3>Session Controls</h3>
          <button className="close-sidebar" onClick={toggleSidebar}>
            ×
          </button>
        </div>

        <div className="sidebar-tabs">
          <button
            className={`tab-button ${activeTab === 'timer' ? 'active' : ''}`}
            onClick={() => setActiveTab('timer')}
          >
            <span className="tab-icon">⏱️</span>
            <span className="tab-text">Timer</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <span className="tab-icon">💬</span>
            <span className="tab-text">Chat</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'goals' ? 'active' : ''}`}
            onClick={() => setActiveTab('goals')}
          >
            <span className="tab-icon">🎯</span>
            <span className="tab-text">Goals</span>
          </button>
        </div>

        <div className="sidebar-panel">
          {activeTab === 'timer' && (
            <div className="timer-panel">
              <SessionTimer 
                duration={session?.duration || 50} 
                onComplete={onTimerComplete}
                sessionId={sessionId}
              />
              <div className="session-info">
                <h4>Session Details</h4>
                <div className="info-item">
                  <span>Duration:</span>
                  <span>{session?.duration || 50} minutes</span>
                </div>
                <div className="info-item">
                  <span>Status:</span>
                  <span className={`status ${connectionStatus.toLowerCase().replace(' ', '-')}`}>
                    {connectionStatus}
                  </span>
                </div>
                {partner && (
                  <div className="info-item">
                    <span>Partner:</span>
                    <span>{partner.name}</span>
                  </div>
                )}
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
                  rows={6}
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
        {isSidebarOpen && (
          <div 
            className="sidebar-overlay mobile-only"
            onClick={toggleSidebar}
          />
        )}
      </div>
    </div>
  );
}

export default VideoSession;