import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVideoRecorderOptions {
  onVideoFrame?: (frameData: string) => void;
  onError?: (error: string) => void;
  frameRate?: number; // Frames per second to capture
  quality?: number; // JPEG quality (0-1)
}

interface VideoRecorderState {
  isEnabled: boolean;
  isStreaming: boolean;
  hasPermission: boolean;
  error: string | null;
}

export default function useVideoRecorder(options: UseVideoRecorderOptions = {}) {
  const {
    onVideoFrame,
    onError,
    frameRate = 2, // 2 FPS for reasonable bandwidth usage
    quality = 0.7
  } = options;

  const [state, setState] = useState<VideoRecorderState>({
    isEnabled: false,
    isStreaming: false,
    hasPermission: false,
    error: null
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Request video permission
  const requestVideoPermission = useCallback(async (): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, error: null }));
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: frameRate }
        }
      });

      streamRef.current = stream;
      setState(prev => ({ ...prev, hasPermission: true }));
      
      // Create video element for preview (optional)
      if (!videoRef.current) {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.style.display = 'none'; // Hidden preview
        videoRef.current = video;
        document.body.appendChild(video);
      }

      // Create canvas for frame capture
      if (!canvasRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        canvas.style.display = 'none';
        canvasRef.current = canvas;
        document.body.appendChild(canvas);
      }

      return true;
    } catch (error) {
      console.error('Video permission denied:', error);
      const errorMessage = 'Camera access denied. Please allow camera permissions.';
      setState(prev => ({ ...prev, error: errorMessage, hasPermission: false }));
      onError?.(errorMessage);
      return false;
    }
  }, [frameRate, onError]);

  // Start video streaming
  const startStreaming = useCallback(async () => {
    if (!state.hasPermission) {
      const granted = await requestVideoPermission();
      if (!granted) return;
    }

    if (!videoRef.current || !canvasRef.current || !streamRef.current) {
      console.error('Video components not initialized');
      return;
    }

    setState(prev => ({ ...prev, isStreaming: true, error: null }));

    // Start capturing frames at specified rate
    intervalRef.current = setInterval(() => {
      if (videoRef.current && canvasRef.current && onVideoFrame) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context && video.readyState >= 2) { // HAVE_CURRENT_DATA
          // Draw current video frame to canvas
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert to base64 JPEG
          const frameData = canvas.toDataURL('image/jpeg', quality);
          
          // Send frame data (remove data:image/jpeg;base64, prefix)
          const base64Data = frameData.split(',')[1];
          onVideoFrame(base64Data);
        }
      }
    }, 1000 / frameRate);
  }, [state.hasPermission, requestVideoPermission, onVideoFrame, frameRate, quality]);

  // Stop video streaming
  const stopStreaming = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState(prev => ({ ...prev, isStreaming: false }));
  }, []);

  // Enable/disable video
  const toggleVideo = useCallback(async (enabled: boolean) => {
    setState(prev => ({ ...prev, isEnabled: enabled }));
    
    if (enabled) {
      await startStreaming();
    } else {
      stopStreaming();
    }
  }, [startStreaming, stopStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current) {
        document.body.removeChild(videoRef.current);
      }
      if (canvasRef.current) {
        document.body.removeChild(canvasRef.current);
      }
    };
  }, []);

  return {
    ...state,
    requestVideoPermission,
    startStreaming,
    stopStreaming,
    toggleVideo,
    videoElement: videoRef.current
  };
}