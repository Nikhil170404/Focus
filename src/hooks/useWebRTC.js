import { useState, useEffect, useRef } from 'react';
import Peer from 'simple-peer';

export function useWebRTC(roomId, isInitiator) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const peerRef = useRef(null);

  useEffect(() => {
    initializeMedia();
    return () => cleanup();
  }, []);

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setLocalStream(stream);
      setConnectionStatus('ready');
    } catch (error) {
      console.error('Error accessing media devices:', error);
      setConnectionStatus('error');
    }
  };

  const createPeer = (onSignal) => {
    if (!localStream) return;

    peerRef.current = new Peer({
      initiator: isInitiator,
      trickle: false,
      stream: localStream
    });

    peerRef.current.on('signal', onSignal);
    
    peerRef.current.on('stream', (stream) => {
      setRemoteStream(stream);
      setConnectionStatus('connected');
    });

    peerRef.current.on('error', (error) => {
      console.error('Peer error:', error);
      setConnectionStatus('error');
    });

    peerRef.current.on('close', () => {
      setConnectionStatus('disconnected');
    });
  };

  const signalPeer = (signal) => {
    if (peerRef.current) {
      peerRef.current.signal(signal);
    }
  };

  const cleanup = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peerRef.current) {
      peerRef.current.destroy();
    }
  };

  return {
    localStream,
    remoteStream,
    connectionStatus,
    createPeer,
    signalPeer
  };
}