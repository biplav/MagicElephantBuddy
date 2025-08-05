
import { useState, useRef, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface WebRTCConnectionOptions {
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onTrackReceived?: (event: RTCTrackEvent) => void;
  mediaConstraints?: MediaStreamConstraints;
  onError?: (error: string) => void;
}

interface WebRTCConnectionState {
  isConnected: boolean;
  connectionState: RTCPeerConnectionState | null;
  iceConnectionState: RTCIceConnectionState | null;
  error: string | null;
}

export function useWebRTCConnection(options: WebRTCConnectionOptions = {}) {
  const logger = createServiceLogger('webrtc-connection');

  const [state, setState] = useState<WebRTCConnectionState>({
    isConnected: false,
    connectionState: null,
    iceConnectionState: null,
    error: null,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const setupPeerConnection = useCallback((pc: RTCPeerConnection) => {
    pc.ontrack = (event) => {
      logger.info("Received audio track from remote");
      const remoteStream = event.streams[0];
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      options.onTrackReceived?.(event);
    };

    pc.onconnectionstatechange = () => {
      logger.info("WebRTC connection state", { state: pc.connectionState });
      setState(prev => ({
        ...prev,
        connectionState: pc.connectionState,
        isConnected: pc.connectionState === 'connected'
      }));
      options.onConnectionStateChange?.(pc.connectionState);

      switch (pc.connectionState) {
        case "disconnected":
        case "failed":
        case "closed":
          setState(prev => ({ ...prev, isConnected: false }));
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      logger.info("ICE connection state changed", {
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
      });

      setState(prev => ({
        ...prev,
        iceConnectionState: pc.iceConnectionState
      }));

      if (pc.iceConnectionState === "failed") {
        logger.error("ICE connection failed");
        const errorMsg = "Connection failed";
        setState(prev => ({ ...prev, error: errorMsg }));
        options.onError?.(errorMsg);
      }
    };

    pc.onicegatheringstatechange = () => {
      logger.info("ICE gathering state changed", {
        iceGatheringState: pc.iceGatheringState,
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        logger.info("ICE candidate received", {
          candidate: event.candidate.candidate.substring(0, 50) + "...",
        });
      } else {
        logger.info("ICE candidate gathering complete");
      }
    };

    pc.onsignalingstatechange = () => {
      logger.info("Signaling state changed", {
        signalingState: pc.signalingState,
      });
    };

    pc.onnegotiationneeded = () => {
      logger.info("Negotiation needed");
    };
  }, [logger, options]);

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection();
    pcRef.current = pc;
    setupPeerConnection(pc);
    return pc;
  }, [setupPeerConnection]);

  const addMediaStream = useCallback(async (constraints?: MediaStreamConstraints) => {
    try {
      const mediaConstraints = constraints || options.mediaConstraints || {
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      streamRef.current = stream;

      if (pcRef.current) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          pcRef.current.addTrack(audioTrack, stream);
        }

        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          pcRef.current.addTrack(videoTracks[0], stream);
        }
      }

      return stream;
    } catch (error: any) {
      logger.error("Media access failed", {
        error: error.message,
        name: error.name,
      });
      const errorMsg = `Media access failed: ${error.message}`;
      setState(prev => ({ ...prev, error: errorMsg }));
      options.onError?.(errorMsg);
      throw error;
    }
  }, [options.mediaConstraints, logger, options]);

  const createOffer = useCallback(async () => {
    if (!pcRef.current) {
      throw new Error("Peer connection not initialized");
    }

    try {
      const offer = await pcRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await pcRef.current.setLocalDescription(offer);
      return offer;
    } catch (error: any) {
      logger.error("Offer creation failed", { error: error.message });
      const errorMsg = `Offer creation failed: ${error.message}`;
      setState(prev => ({ ...prev, error: errorMsg }));
      options.onError?.(errorMsg);
      throw error;
    }
  }, [logger, options]);

  const setRemoteDescription = useCallback(async (description: RTCSessionDescriptionInit) => {
    if (!pcRef.current) {
      throw new Error("Peer connection not initialized");
    }

    try {
      await pcRef.current.setRemoteDescription(description);
    } catch (error: any) {
      logger.error("Set remote description failed", { error: error.message });
      const errorMsg = `Set remote description failed: ${error.message}`;
      setState(prev => ({ ...prev, error: errorMsg }));
      options.onError?.(errorMsg);
      throw error;
    }
  }, [logger, options]);

  const cleanup = useCallback(() => {
    logger.info("Cleaning up WebRTC connection");

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setState({
      isConnected: false,
      connectionState: null,
      iceConnectionState: null,
      error: null,
    });
  }, [logger]);

  return {
    ...state,
    pc: pcRef.current,
    stream: streamRef.current,
    createPeerConnection,
    addMediaStream,
    createOffer,
    setRemoteDescription,
    cleanup,
  };
}
