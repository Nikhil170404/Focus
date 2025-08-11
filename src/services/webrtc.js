import { ref, push, onValue, off, serverTimestamp, set } from 'firebase/database';
import { realtimeDb } from '../config/firebase';

export class EnhancedWebRTCService {
  constructor(sessionId, userId, isInitiator) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.isInitiator = isInitiator;
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.onRemoteStreamCallback = null;
    this.onConnectionStateChangeCallback = null;
    this.onErrorCallback = null;
    this.signalListener = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.isDestroyed = false;
    
    // Enhanced configuration optimized for Vercel deployment
    this.configuration = {
      iceServers: [
        // Google STUN servers - most reliable globally
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        
        // Additional reliable STUN servers
        { urls: 'stun:stun.stunprotocol.org:3478' },
        { urls: 'stun:stun.services.mozilla.com' },
        { urls: 'stun:stun.ekiga.net' },
        
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
        {
          urls: 'turn:openrelay.metered.ca:80',
          credential: 'openrelayproject',
          username: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          credential: 'openrelayproject',
          username: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          credential: 'openrelayproject',
          username: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all'
    };

    console.log('🚀 WebRTC Service initialized', {
      sessionId,
      userId,
      isInitiator,
      isProduction: this.isProduction
    });
  }

  async initializeMedia(constraints = null) {
    try {
      console.log('🎥 Initializing media...');
      
      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera/microphone not supported in this browser');
      }

      // Check for secure context (HTTPS)
      if (!window.isSecureContext && this.isProduction) {
        throw new Error('Camera access requires HTTPS in production');
      }

      const defaultConstraints = {
        video: {
          width: { min: 320, ideal: 1280, max: 1920 },
          height: { min: 240, ideal: 720, max: 1080 },
          facingMode: 'user',
          frameRate: { min: 15, ideal: 30, max: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 16 }
        }
      };

      let stream;
      
      try {
        // Try with ideal settings first
        stream = await navigator.mediaDevices.getUserMedia(
          constraints || defaultConstraints
        );
        console.log('✅ High quality media stream obtained');
      } catch (primaryError) {
        console.warn('⚠️ High quality failed, trying fallback:', primaryError.message);
        
        // Fallback to lower quality
        const fallbackConstraints = {
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 15, max: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        };
        
        try {
          stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          console.log('✅ Medium quality media stream obtained');
        } catch (fallbackError) {
          console.warn('⚠️ Video failed, trying audio only:', fallbackError.message);
          
          // Last resort: audio only
          try {
            stream = await navigator.mediaDevices.getUserMedia({ 
              audio: {
                echoCancellation: true,
                noiseSuppression: true
              }
            });
            console.log('✅ Audio-only stream obtained');
          } catch (audioError) {
            throw new Error('Unable to access microphone');
          }
        }
      }
      
      this.localStream = stream;
      console.log('📊 Media tracks:', stream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState
      })));
      
      return stream;
    } catch (error) {
      console.error('❌ Media initialization error:', error);
      
      // Provide specific error messages
      if (error.name === 'NotAllowedError') {
        throw new Error('Camera/microphone access denied. Please allow permissions and reload.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No camera or microphone found. Please connect devices.');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('Camera/microphone not supported by your browser.');
      } else if (error.name === 'OverconstrainedError') {
        throw new Error('Camera settings not supported. Trying basic settings...');
      } else if (error.name === 'SecurityError') {
        throw new Error('Security error: Please ensure HTTPS connection.');
      } else {
        throw error;
      }
    }
  }

  async createPeerConnection(onRemoteStream, onConnectionStateChange, onError) {
    if (this.isDestroyed) return null;

    try {
      console.log('🔗 Creating peer connection...');
      
      this.onRemoteStreamCallback = onRemoteStream;
      this.onConnectionStateChangeCallback = onConnectionStateChange;
      this.onErrorCallback = onError;
      
      // Create peer connection
      this.peerConnection = new RTCPeerConnection(this.configuration);
      console.log('✅ Peer connection created');

      // Add local stream tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
          console.log('➕ Added local track:', track.kind);
        });
      }

      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        console.log('📡 Received remote track:', event.track.kind);
        const [remoteStream] = event.streams;
        this.remoteStream = remoteStream;
        
        if (this.onRemoteStreamCallback) {
          this.onRemoteStreamCallback(remoteStream);
        }
      };

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate:', event.candidate.type);
          this.sendSignal({
            type: 'ice-candidate',
            candidate: event.candidate,
            from: this.userId,
            timestamp: Date.now()
          }).catch(error => {
            console.error('❌ Failed to send ICE candidate:', error);
          });
        } else {
          console.log('✅ ICE gathering completed');
        }
      };

      // Enhanced connection state handling
      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection.connectionState;
        console.log('🔌 Connection state changed:', state);
        
        if (this.onConnectionStateChangeCallback) {
          this.onConnectionStateChangeCallback(state);
        }

        switch (state) {
          case 'connected':
            console.log('✅ Peer connection established');
            this.reconnectAttempts = 0;
            break;
          case 'disconnected':
            console.log('⚠️ Peer connection disconnected');
            this.handleDisconnection();
            break;
          case 'failed':
            console.log('❌ Peer connection failed');
            this.handleConnectionFailure();
            break;
          case 'closed':
            console.log('🔒 Peer connection closed');
            break;
        }
      };

      // Handle ICE connection state
      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection.iceConnectionState;
        console.log('🧊 ICE connection state:', state);
        
        if (state === 'connected' || state === 'completed') {
          console.log('✅ ICE connection established');
        } else if (state === 'failed') {
          console.log('❌ ICE connection failed');
          this.handleConnectionFailure();
        }
      };

      // Handle signaling state
      this.peerConnection.onsignalingstatechange = () => {
        console.log('📡 Signaling state:', this.peerConnection.signalingState);
      };

      // Start listening for signals
      this.listenForSignals();

      // Create offer if initiator
      if (this.isInitiator) {
        console.log('🎯 Creating offer as initiator');
        setTimeout(() => {
          this.createOffer();
        }, 1000);
      }

      return this.peerConnection;
    } catch (error) {
      console.error('❌ Error creating peer connection:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(`Failed to setup connection: ${error.message}`);
      }
      throw error;
    }
  }

  async createOffer() {
    if (this.isDestroyed || !this.peerConnection) return;

    try {
      console.log('📝 Creating WebRTC offer...');
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: this.reconnectAttempts > 0
      });
      
      await this.peerConnection.setLocalDescription(offer);
      console.log('✅ Local description set');
      
      await this.sendSignal({
        type: 'offer',
        offer: offer,
        from: this.userId,
        timestamp: Date.now()
      });
      console.log('📤 Offer sent');
    } catch (error) {
      console.error('❌ Error creating offer:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(`Failed to create offer: ${error.message}`);
      }
    }
  }

  async createAnswer(offer) {
    if (this.isDestroyed || !this.peerConnection) return;

    try {
      console.log('📝 Creating WebRTC answer...');
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('✅ Remote description set');
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      console.log('✅ Local description set for answer');
      
      await this.sendSignal({
        type: 'answer',
        answer: answer,
        from: this.userId,
        timestamp: Date.now()
      });
      console.log('📤 Answer sent');
    } catch (error) {
      console.error('❌ Error creating answer:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(`Failed to create answer: ${error.message}`);
      }
    }
  }

  async sendSignal(data) {
    if (this.isDestroyed) return;

    try {
      if (!this.sessionId) {
        throw new Error('Session ID not available');
      }

      const signalRef = ref(realtimeDb, `sessions/${this.sessionId}/signals`);
      await push(signalRef, {
        ...data,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('❌ Error sending signal:', error);
      // Don't throw here to avoid breaking the connection flow
    }
  }

  listenForSignals() {
    if (this.isDestroyed || !this.sessionId) {
      console.error('❌ Cannot listen for signals: Invalid state');
      return;
    }

    const signalRef = ref(realtimeDb, `sessions/${this.sessionId}/signals`);
    
    this.signalListener = onValue(signalRef, (snapshot) => {
      const signals = snapshot.val();
      if (signals && !this.isDestroyed) {
        // Process only recent signals from other users
        const signalEntries = Object.entries(signals)
          .filter(([_, signal]) => 
            signal.from !== this.userId && 
            signal.timestamp && 
            (Date.now() - signal.timestamp) < 60000 // Only signals from last minute
          )
          .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

        for (const [_, signal] of signalEntries) {
          this.handleSignal(signal).catch(error => {
            console.error('❌ Error handling signal:', error);
          });
        }
      }
    }, (error) => {
      console.error('❌ Error listening for signals:', error);
    });
  }

  async handleSignal(signal) {
    if (this.isDestroyed || !this.peerConnection || signal.from === this.userId) return;

    try {
      switch (signal.type) {
        case 'offer':
          console.log('📨 Received offer from', signal.from);
          if (this.peerConnection.signalingState === 'stable' || 
              this.peerConnection.signalingState === 'have-local-offer') {
            await this.createAnswer(signal.offer);
          }
          break;

        case 'answer':
          console.log('📨 Received answer from', signal.from);
          if (this.peerConnection.signalingState === 'have-local-offer') {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
            console.log('✅ Remote description set from answer');
          }
          break;

        case 'ice-candidate':
          console.log('🧊 Received ICE candidate from', signal.from);
          if (this.peerConnection.remoteDescription && 
              this.peerConnection.remoteDescription.type) {
            try {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (error) {
              console.warn('⚠️ Failed to add ICE candidate:', error.message);
            }
          } else {
            console.warn('⚠️ Received ICE candidate before remote description');
          }
          break;

        default:
          console.log('❓ Unknown signal type:', signal.type);
          break;
      }
    } catch (error) {
      console.error('❌ Error handling signal:', error);
    }
  }

  handleDisconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts && !this.isDestroyed) {
      this.reconnectAttempts++;
      console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.attemptReconnect();
        }
      }, 2000 * this.reconnectAttempts); // Exponential backoff
    } else {
      console.log('❌ Max reconnection attempts reached');
      if (this.onConnectionStateChangeCallback && !this.isDestroyed) {
        this.onConnectionStateChangeCallback('failed');
      }
    }
  }

  handleConnectionFailure() {
    console.log('❌ Connection failed, attempting ICE restart');
    if (this.peerConnection && this.reconnectAttempts < this.maxReconnectAttempts && !this.isDestroyed) {
      this.attemptReconnect();
    } else {
      console.log('❌ Max reconnection attempts reached after failure');
      if (this.onConnectionStateChangeCallback && !this.isDestroyed) {
        this.onConnectionStateChangeCallback('failed');
      }
    }
  }

  async attemptReconnect() {
    if (this.isDestroyed) return;

    try {
      if (this.peerConnection && this.peerConnection.connectionState !== 'closed') {
        console.log('🔄 Restarting ICE...');
        
        // Try ICE restart
        if (this.peerConnection.restartIce) {
          this.peerConnection.restartIce();
        }
        
        if (this.isInitiator) {
          setTimeout(() => {
            if (!this.isDestroyed) {
              this.createOffer();
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.error('❌ Reconnection attempt failed:', error);
      this.handleDisconnection();
    }
  }

  toggleAudio(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
      return true;
    }
    return false;
  }

  toggleVideo(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
      return true;
    }
    return false;
  }

  async replaceVideoTrack(newVideoTrack) {
    if (this.peerConnection && this.localStream && !this.isDestroyed) {
      const sender = this.peerConnection.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      
      if (sender) {
        try {
          await sender.replaceTrack(newVideoTrack);
          
          // Update local stream
          const oldVideoTrack = this.localStream.getVideoTracks()[0];
          if (oldVideoTrack) {
            this.localStream.removeTrack(oldVideoTrack);
            oldVideoTrack.stop();
          }
          this.localStream.addTrack(newVideoTrack);
          
          return true;
        } catch (error) {
          console.error('❌ Failed to replace video track:', error);
          return false;
        }
      }
    }
    return false;
  }

  async getConnectionStats() {
    if (!this.peerConnection || this.isDestroyed) return null;

    try {
      const stats = await this.peerConnection.getStats();
      const result = {
        audio: { inbound: null, outbound: null },
        video: { inbound: null, outbound: null },
        connection: null,
        bandwidth: { download: 0, upload: 0 }
      };

      stats.forEach(report => {
        switch (report.type) {
          case 'inbound-rtp':
            if (report.mediaType === 'audio') {
              result.audio.inbound = report;
            } else if (report.mediaType === 'video') {
              result.video.inbound = report;
            }
            break;
          case 'outbound-rtp':
            if (report.mediaType === 'audio') {
              result.audio.outbound = report;
            } else if (report.mediaType === 'video') {
              result.video.outbound = report;
            }
            break;
          case 'candidate-pair':
            if (report.state === 'succeeded') {
              result.connection = report;
              result.bandwidth.download = report.availableIncomingBitrate || 0;
              result.bandwidth.upload = report.availableOutgoingBitrate || 0;
            }
            break;
        }
      });

      return result;
    } catch (error) {
      console.error('❌ Error getting connection stats:', error);
      return null;
    }
  }

  disconnect() {
    console.log('🔌 Disconnecting WebRTC service');
    this.isDestroyed = true;

    // Stop listening for signals
    if (this.signalListener && this.sessionId) {
      const signalRef = ref(realtimeDb, `sessions/${this.sessionId}/signals`);
      off(signalRef, 'value', this.signalListener);
      this.signalListener = null;
    }

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }

    // Stop remote stream
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => {
        track.stop();
      });
      this.remoteStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Clear callbacks
    this.onRemoteStreamCallback = null;
    this.onConnectionStateChangeCallback = null;
    this.onErrorCallback = null;
    this.reconnectAttempts = 0;

    console.log('✅ WebRTC service disconnected');
  }

  // Static utility methods
  static isSupported() {
    const hasWebRTC = !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.RTCPeerConnection
    );
    
    const hasSecureContext = window.isSecureContext || 
                             window.location.hostname === 'localhost' || 
                             window.location.hostname === '127.0.0.1';
    
    return hasWebRTC && hasSecureContext;
  }

  static async checkPermissions() {
    try {
      if (!navigator.permissions) {
        return { camera: 'prompt', microphone: 'prompt' };
      }

      const permissions = await Promise.all([
        navigator.permissions.query({ name: 'camera' }),
        navigator.permissions.query({ name: 'microphone' })
      ]);

      return {
        camera: permissions[0].state,
        microphone: permissions[1].state
      };
    } catch (error) {
      console.error('❌ Error checking permissions:', error);
      return { camera: 'prompt', microphone: 'prompt' };
    }
  }

  static async getAvailableDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return { audioInputs: [], videoInputs: [], audioOutputs: [] };
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        audioInputs: devices.filter(device => device.kind === 'audioinput'),
        videoInputs: devices.filter(device => device.kind === 'videoinput'),
        audioOutputs: devices.filter(device => device.kind === 'audiooutput')
      };
    } catch (error) {
      console.error('❌ Error getting devices:', error);
      return { audioInputs: [], videoInputs: [], audioOutputs: [] };
    }
  }

  static getSystemInfo() {
    return {
      browser: navigator.userAgent,
      platform: navigator.platform,
      webrtcSupported: this.isSupported(),
      httpsEnabled: window.isSecureContext,
      localNetwork: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'),
      isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      connection: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt
      } : null
    };
  }
}

export default EnhancedWebRTCService;