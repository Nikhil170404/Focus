import { ref, push, onValue, off, serverTimestamp } from 'firebase/database';
import { realtimeDb } from '../config/firebase';

export class WebRTCService {
  constructor(sessionId, userId, isInitiator) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.isInitiator = isInitiator;
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.onRemoteStreamCallback = null;
    this.onConnectionStateChangeCallback = null;
    this.signalListener = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    
    // Enhanced configuration for production
    this.configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.stunprotocol.org:3478' },
        { urls: 'stun:stun.services.mozilla.com' },
        // Add more STUN servers for better connectivity
        { urls: 'stun:stun.ekiga.net' },
        { urls: 'stun:stun.fwdnet.net' },
        { urls: 'stun:stun.ideasip.com' }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all'
    };
  }

  async initializeMedia(constraints = null) {
    try {
      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support video calling. Please use a modern browser like Chrome, Firefox, or Safari.');
      }

      // Check if we're on HTTPS (required for WebRTC in production)
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        throw new Error('Video calling requires a secure connection (HTTPS).');
      }

      const defaultConstraints = {
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
      };

      try {
        // Try high quality first
        this.localStream = await navigator.mediaDevices.getUserMedia(
          constraints || defaultConstraints
        );
      } catch (primaryError) {
        console.warn('High quality media failed, trying fallback:', primaryError);
        
        // Fallback to lower quality
        const fallbackConstraints = {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        };
        
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        } catch (fallbackError) {
          // Try audio only as last resort
          console.warn('Video failed, trying audio only:', fallbackError);
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      }
      
      return this.localStream;
    } catch (error) {
      console.error('Media initialization error:', error);
      
      // Provide specific error messages
      if (error.name === 'NotAllowedError') {
        throw new Error('Camera and microphone access denied. Please allow permissions in your browser settings and reload the page.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No camera or microphone found. Please connect a camera and microphone and try again.');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('Your browser does not support video calling. Please use Chrome, Firefox, Safari, or Edge.');
      } else if (error.name === 'OverconstrainedError') {
        throw new Error('Camera settings not supported. Trying with default settings...');
      } else {
        throw new Error(`Media access failed: ${error.message}`);
      }
    }
  }

  async createPeerConnection(onRemoteStream, onConnectionStateChange) {
    try {
      this.onRemoteStreamCallback = onRemoteStream;
      this.onConnectionStateChangeCallback = onConnectionStateChange;
      
      // Create peer connection with enhanced error handling
      this.peerConnection = new RTCPeerConnection(this.configuration);

      // Add local stream tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }

      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        console.log('Received remote stream');
        const [remoteStream] = event.streams;
        this.remoteStream = remoteStream;
        if (this.onRemoteStreamCallback) {
          this.onRemoteStreamCallback(remoteStream);
        }
      };

      // Handle ICE candidates with error handling
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal({
            type: 'ice-candidate',
            candidate: event.candidate,
            from: this.userId,
            timestamp: Date.now()
          }).catch(error => {
            console.error('Failed to send ICE candidate:', error);
          });
        }
      };

      // Enhanced connection state handling
      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection.connectionState;
        console.log('Connection state changed:', state);
        
        if (this.onConnectionStateChangeCallback) {
          this.onConnectionStateChangeCallback(state);
        }

        switch (state) {
          case 'connected':
            this.reconnectAttempts = 0;
            break;
          case 'disconnected':
            this.handleDisconnection();
            break;
          case 'failed':
            this.handleConnectionFailure();
            break;
          default:
            // Handle other states if needed
            break;
        }
      };

      // Handle ICE connection state changes
      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection.iceConnectionState;
        console.log('ICE connection state:', state);
        
        switch (state) {
          case 'disconnected':
            this.handleDisconnection();
            break;
          case 'failed':
            this.handleConnectionFailure();
            break;
          default:
            // Handle other ICE connection states if needed
            break;
        }
      };

      // Handle signaling state changes
      this.peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', this.peerConnection.signalingState);
      };

      // Handle ICE gathering state
      this.peerConnection.onicegatheringstatechange = () => {
        console.log('ICE gathering state:', this.peerConnection.iceGatheringState);
      };

      // Start listening for signals
      this.listenForSignals();

      // Create offer if initiator
      if (this.isInitiator) {
        console.log('Creating offer as initiator');
        await this.createOffer();
      }

      return this.peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      throw new Error(`Failed to setup video connection: ${error.message}`);
    }
  }

  async createOffer() {
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: this.reconnectAttempts > 0
      });
      
      await this.peerConnection.setLocalDescription(offer);
      
      await this.sendSignal({
        type: 'offer',
        offer: offer,
        from: this.userId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error creating offer:', error);
      throw new Error(`Failed to create connection offer: ${error.message}`);
    }
  }

  async createAnswer(offer) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      await this.sendSignal({
        type: 'answer',
        answer: answer,
        from: this.userId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error creating answer:', error);
      throw new Error(`Failed to create connection answer: ${error.message}`);
    }
  }

  async sendSignal(data) {
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
      console.error('Error sending signal:', error);
      // Don't throw here to avoid breaking the connection flow
    }
  }

  listenForSignals() {
    if (!this.sessionId) {
      console.error('Cannot listen for signals: No session ID');
      return;
    }

    const signalRef = ref(realtimeDb, `sessions/${this.sessionId}/signals`);
    
    this.signalListener = onValue(signalRef, async (snapshot) => {
      const signals = snapshot.val();
      if (signals) {
        // Process only recent signals from other users
        const signalEntries = Object.entries(signals)
          .filter(([_, signal]) => signal.from !== this.userId && signal.timestamp)
          .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
          .slice(0, 10); // Limit to recent signals

        for (const [_, signal] of signalEntries) {
          try {
            await this.handleSignal(signal);
          } catch (error) {
            console.error('Error handling signal:', error);
          }
        }
      }
    }, (error) => {
      console.error('Error listening for signals:', error);
    });
  }

  async handleSignal(signal) {
    if (!this.peerConnection || signal.from === this.userId) return;

    try {
      switch (signal.type) {
        case 'offer':
          console.log('Received offer');
          if (this.peerConnection.signalingState === 'stable' || 
              this.peerConnection.signalingState === 'have-local-offer') {
            await this.createAnswer(signal.offer);
          }
          break;

        case 'answer':
          console.log('Received answer');
          if (this.peerConnection.signalingState === 'have-local-offer') {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
          }
          break;

        case 'ice-candidate':
          console.log('Received ICE candidate');
          if (this.peerConnection.remoteDescription && 
              this.peerConnection.remoteDescription.type) {
            try {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (error) {
              console.warn('Failed to add ICE candidate:', error);
            }
          }
          break;

        default:
          console.log('Unknown signal type:', signal.type);
          break;
      }
    } catch (error) {
      console.error('Error handling signal:', error);
    }
  }

  handleDisconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      setTimeout(() => {
        this.attemptReconnect();
      }, 2000 * this.reconnectAttempts); // Exponential backoff
    } else {
      console.log('Max reconnection attempts reached');
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback('failed');
      }
    }
  }

  handleConnectionFailure() {
    console.log('Connection failed, attempting ICE restart');
    if (this.peerConnection && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.attemptReconnect();
    }
  }

  async attemptReconnect() {
    try {
      if (this.peerConnection) {
        console.log('Restarting ICE...');
        await this.peerConnection.restartIce();
        
        if (this.isInitiator) {
          await this.createOffer();
        }
      }
    } catch (error) {
      console.error('Reconnection attempt failed:', error);
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
    if (this.peerConnection && this.localStream) {
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
          console.error('Failed to replace video track:', error);
          return false;
        }
      }
    }
    return false;
  }

  async switchCamera() {
    try {
      if (!this.localStream) return false;

      const videoTrack = this.localStream.getVideoTracks()[0];
      if (!videoTrack) return false;

      const currentFacingMode = videoTrack.getSettings().facingMode;
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: newFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      const success = await this.replaceVideoTrack(newVideoTrack);
      
      if (!success) {
        newVideoTrack.stop();
      }
      
      return success;
    } catch (error) {
      console.error('Error switching camera:', error);
      return false;
    }
  }

  async getConnectionStats() {
    if (!this.peerConnection) return null;

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
      console.error('Error getting connection stats:', error);
      return null;
    }
  }

  disconnect() {
    console.log('Disconnecting WebRTC service');

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
    this.reconnectAttempts = 0;
  }

  // Static utility methods
  static isSupported() {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.RTCPeerConnection &&
      (window.location.protocol === 'https:' || window.location.hostname === 'localhost')
    );
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
      console.error('Error checking permissions:', error);
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
      console.error('Error getting devices:', error);
      return { audioInputs: [], videoInputs: [], audioOutputs: [] };
    }
  }

  static getSystemInfo() {
    return {
      browser: navigator.userAgent,
      platform: navigator.platform,
      webrtcSupported: this.isSupported(),
      httpsEnabled: window.location.protocol === 'https:',
      localNetwork: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    };
  }
}

export default WebRTCService;