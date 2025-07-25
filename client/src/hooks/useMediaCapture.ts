
import { useState, useRef, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface MediaCaptureOptions {
  enableVideo?: boolean;
}

interface MediaCaptureState {
  videoEnabled: boolean;
  hasVideoPermission: boolean;
  stream: MediaStream | null;
  videoUrl?: string;
}

export function useMediaCapture(options: MediaCaptureOptions = {}) {
  const logger = createServiceLogger('media-capture');
  
  const [state, setState] = useState<MediaCaptureState>({
    videoEnabled: false,
    hasVideoPermission: false,
    stream: null
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const createMediaConstraints = useCallback((enableVideo: boolean): MediaStreamConstraints => {
    const constraints: MediaStreamConstraints = {
      audio: {
        sampleRate: 24000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    };

    if (enableVideo) {
      constraints.video = {
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 2 }
      };
    }

    return constraints;
  }, []);

  const setupVideoElements = useCallback((stream: MediaStream) => {
    if (!options.enableVideo || stream.getVideoTracks().length === 0) {
      return;
    }

    logger.info('Setting up video elements');
    setState(prev => ({ ...prev, videoEnabled: true, hasVideoPermission: true }));

    if (!videoRef.current) {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.style.display = 'none';
      videoRef.current = video;
      document.body.appendChild(video);
    }

    if (!canvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      canvas.style.display = 'none';
      canvas.id = 'media-capture-canvas';
      canvasRef.current = canvas;
      document.body.appendChild(canvas);
    }
  }, [options.enableVideo]);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState >= 2) {
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = canvas.toDataURL('image/jpeg', 0.7);
        return frameData.split(',')[1];
      }
    }
    return null;
  }, []);

  const requestPermissions = useCallback(async () => {
    try {
      const constraints = createMediaConstraints(options.enableVideo || false);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      setupVideoElements(stream);
      setState(prev => ({ ...prev, stream, hasVideoPermission: true }));
      
      return stream;
    } catch (error) {
      logger.error('Media permission denied:', error);
      throw new Error('Media permission denied');
    }
  }, [options.enableVideo, createMediaConstraints, setupVideoElements]);

  const cleanup = useCallback(() => {
    if (videoRef.current && document.body.contains(videoRef.current)) {
      document.body.removeChild(videoRef.current);
      videoRef.current = null;
    }

    if (canvasRef.current && document.body.contains(canvasRef.current)) {
      document.body.removeChild(canvasRef.current);
      canvasRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setState(prev => ({ 
      ...prev, 
      stream: null, 
      videoEnabled: false, 
      hasVideoPermission: false 
    }));
  }, []);

  return {
    ...state,
    captureFrame,
    requestPermissions,
    cleanup
  };
}
