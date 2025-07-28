
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
      /* Position video properly for rendering but keep it hidden from main UI
      video.style.position = 'fixed';
      video.style.top = '0px';
      video.style.left = '0px';
      video.style.width = '320px';
      video.style.height = '240px';
      video.style.zIndex = '-1000';
      video.style.visibility = 'hidden';
      */
      
      // Add event listeners to track video readiness
      video.onloadedmetadata = () => {
        logger.info('Video metadata loaded, ready for capture', { 
          videoWidth: video.videoWidth, 
          videoHeight: video.videoHeight,
          readyState: video.readyState
        });
      };
      
      video.oncanplay = () => {
        logger.info('Video can start playing, ready for capture', {
          currentTime: video.currentTime,
          duration: video.duration,
          readyState: video.readyState
        });
      };

      video.onloadeddata = () => {
        logger.info('Video loaded data, dimensions available', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState
        });
      };

      video.onplay = () => {
        logger.info('Video started playing', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState
        });
      };

      video.onerror = (error) => {
        logger.error('Video element error', { error });
      };
      
      videoRef.current = video;
      document.body.appendChild(video);
    } else {
      // Update existing video element with new stream
      videoRef.current.srcObject = stream;
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

    if (!video || !canvas) {
      logger.warn('Video or canvas element not available for capture');
      return null;
    }

    logger.info('Attempting frame capture', {
      videoSrc: !!video.srcObject,
      videoTracks: video.srcObject ? (video.srcObject as MediaStream).getVideoTracks().length : 0,
      readyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      currentTime: video.currentTime,
      paused: video.paused,
      ended: video.ended
    });

    // Check if video is ready (readyState 2 = HAVE_CURRENT_DATA, 3 = HAVE_FUTURE_DATA, 4 = HAVE_ENOUGH_DATA)
    if (video.readyState < 2) {
      logger.warn('Video not ready for capture', { 
        readyState: video.readyState,
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        ended: video.ended
      });
      return null;
    }

    // Check if video has actual dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      logger.warn('Video has no dimensions', { 
        videoWidth: video.videoWidth, 
        videoHeight: video.videoHeight,
        readyState: video.readyState,
        srcObject: !!video.srcObject
      });
      return null;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      logger.error('Could not get canvas 2D context');
      return null;
    }

    try {
      // Clear the canvas first
      context.clearRect(0, 0, canvas.width, canvas.height);
      
      // Set canvas size to match video dimensions for better quality
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw the video frame
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      
      // Convert to base64
      const frameData = canvas.toDataURL('image/jpeg', 0.8);
      const base64Data = frameData.split(',')[1];
      
      logger.info('Frame captured successfully', { 
        dataLength: base64Data.length,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height
      });
      
      return base64Data;
    } catch (error) {
      logger.error('Error capturing frame', { 
        error: error instanceof Error ? error.message : String(error),
        videoReadyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight
      });
      return null;
    }
  }, []);

  const requestPermissions = useCallback(async () => {
    try {
      const constraints = createMediaConstraints(options.enableVideo || false);
      logger.info('Requesting media permissions with constraints', constraints);
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      setupVideoElements(stream);
      setState(prev => ({ ...prev, stream, hasVideoPermission: true }));
      
      // Wait a bit for video to initialize properly
      if (options.enableVideo && stream.getVideoTracks().length > 0) {
        logger.info('Waiting for video to initialize...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
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
    cleanup,
    videoElement: videoRef.current,
    canvasElement: canvasRef.current
  };
}
