import { ref, set, onValue, push } from 'firebase/database';
import { realtimeDb } from '../config/firebase';

export class WebRTCService {
  constructor(sessionId, userId, isInitiator) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.isInitiator = isInitiator;
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    
    this.configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  async initializeMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      return this.localStream;
    } catch (error) {
      console.error('Media error:', error);
      throw error;
    }
  }

  async createPeerConnection(onRemoteStream) {
    this.peerConnection = new RTCPeerConnection(this.configuration);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        onRemoteStream(event.streams[0]);
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };

    this.listenForSignals();

    if (this.isInitiator) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      this.sendSignal({ type: 'offer', offer });
    }
  }

  sendSignal(data) {
    const signalRef = ref(realtimeDb, `sessions/${this.sessionId}/signals`);
    push(signalRef, {
      from: this.userId,
      data: JSON.stringify(data),
      timestamp: Date.now()
    });
  }

  listenForSignals() {
    const signalsRef = ref(realtimeDb, `sessions/${this.sessionId}/signals`);
    
    onValue(signalsRef, async (snapshot) => {
      const signals = snapshot.val();
      if (signals) {
        for (const [key, signal] of Object.entries(signals)) {
          if (signal.from !== this.userId) {
            try {
              const data = JSON.parse(signal.data);
              
              if (data.type === 'offer' && !this.isInitiator) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                this.sendSignal({ type: 'answer', answer });
              } else if (data.type === 'answer' && this.isInitiator) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
              } else if (data.type === 'ice-candidate') {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
              }
            } catch (error) {
              console.error('Signal processing error:', error);
            }
          }
        }
      }
    });
  }

  toggleAudio(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  toggleVideo(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  disconnect() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
  }
}