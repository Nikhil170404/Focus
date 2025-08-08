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
    
    this.configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };
  }

  async initializeMedia(constraints = null) {
    try {
      const defaultConstraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: 'user',
          frameRate: { ideal: 30, max: 60 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(
        constraints || defaultConstraints
      );
      
      return this.localStream;
    } catch (error) {
      console.error('Media error:', error);
      
      // Try with lower quality if high quality fails
      if (!constraints) {
        try {
          const fallbackConstraints = {
            video: {
              width: { ideal: 640, max: 1280 },
              height: { ideal: 480, max: 720 }
            },
            audio: true
          };
          
          this.localStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          return this.localStream;
        } catch (fallbackError) {
          console.error('Fallback media error:', fallbackError);
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  async createPeerConnection(onRemoteStream, onConnectionStateChange) {
    try {
      this.onRemoteStreamCallback = onRemoteStream;
      this.onConnectionStateChangeCallback = onConnectionStateChange;
      
      // Create peer connection
      this.peerConnection = new RTCPeerConnection(this.configuration);

      // Add local stream to peer connection
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

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal({
            type: 'ice-candidate',
            candidate: event.candidate,
            from: this.userId,
            timestamp: Date.now()
          });
        }
      };

      // Handle connection state changes
      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection.connectionState;
        console.log('Connection state changed:', state);
        
        if (this.onConnectionStateChangeCallback) {
          this.onConnectionStateChangeCallback(state);
        }

        // Handle connection failures
        if (state === 'failed') {
          console.log('Connection failed, attempting to restart ICE');
          this.peerConnection.restartIce();
        }
      };

      // Handle ICE connection state changes
      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection.iceConnectionState;
        console.log('ICE connection state:', state);
        
        if (state === 'disconnected') {
          console.log('ICE disconnected, attempting to reconnect');
        }
      };

      // Start listening for signals
      this.listenForSignals();

      // If we're the initiator, create offer
      if (this.isInitiator) {
        console.log('Creating offer as initiator');
        await this.createOffer();
      }

      return this.peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      throw error;
    }
  }

  async createOffer() {
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await this.peerConnection.setLocalDescription(offer);
      
      this.sendSignal({
        type: 'offer',
        offer: offer,
        from: this.userId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error creating offer:', error);
      throw error;
    }
  }

  async createAnswer(offer) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      this.sendSignal({
        type: 'answer',
        answer: answer,
        from: this.userId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error creating answer:', error);
      throw error;
    }
  }

  async sendSignal(data) {
    try {
      const signalRef = ref(realtimeDb, `sessions/${this.sessionId}/signals`);
      await push(signalRef, {
        ...data,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error sending signal:', error);
    }
  }

  listenForSignals() {
    const signalRef = ref(realtimeDb, `sessions/${this.sessionId}/signals`);
    
    this.signalListener = onValue(signalRef, async (snapshot) => {
      const signals = snapshot.val();
      if (signals) {
        // Get the latest signals and process them
        const signalEntries = Object.entries(signals);
        const latestSignals = signalEntries
          .filter(([key, signal]) => signal.from !== this.userId)
          .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
          .slice(0, 10); // Only process recent signals

        for (const [key, signal] of latestSignals) {
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
          if (this.peerConnection.signalingState === 'stable') {
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
          if (this.peerConnection.remoteDescription) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
          break;

        default:
          console.log('Unknown signal type:', signal.type);
      }
    } catch (error) {
      console.error('Error handling signal:', error);
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

  replaceVideoTrack(newVideoTrack) {
    if (this.peerConnection && this.localStream) {
      const sender = this.peerConnection.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      
      if (sender) {
        sender.replaceTrack(newVideoTrack);
        
        // Update local stream
        const oldVideoTrack = this.localStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          this.localStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        this.localStream.addTrack(newVideoTrack);
      }
    }
  }

  async switchCamera() {
    try {
      if (!this.localStream) return false;

      const videoTrack = this.localStream.getVideoTracks()[0];
      if (!videoTrack) return false;

      const currentFacingMode = videoTrack.getSettings().facingMode;
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: false
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      this.replaceVideoTrack(newVideoTrack);

      return true;
    } catch (error) {
      console.error('Error switching camera:', error);
      return false;
    }
  }

  getConnectionStats() {
    if (!this.peerConnection) return null;

    return this.peerConnection.getStats().then(stats => {
      const result = {
        audio: { inbound: null, outbound: null },
        video: { inbound: null, outbound: null },
        connection: null
      };

      stats.forEach(report => {
        if (report.type === 'inbound-rtp') {
          if (report.mediaType === 'audio') {
            result.audio.inbound = report;
          } else if (report.mediaType === 'video') {
            result.video.inbound = report;
          }
        } else if (report.type === 'outbound-rtp') {
          if (report.mediaType === 'audio') {
            result.audio.outbound = report;
          } else if (report.mediaType === 'video') {
            result.video.outbound = report;
          }
        } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          result.connection = report;
        }
      });

      return result;
    });
  }

  disconnect() {
    console.log('Disconnecting WebRTC');

    // Stop listening for signals
    if (this.signalListener) {
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
  }

  // Helper method to check if WebRTC is supported
  static isSupported() {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.RTCPeerConnection
    );
  }

  // Helper method to check if camera/microphone permissions are granted
  static async checkPermissions() {
    try {
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

  // Helper method to get available media devices
  static async getAvailableDevices() {
    try {
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
}

export default WebRTCService;