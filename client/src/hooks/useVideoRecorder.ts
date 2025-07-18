import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVideoRecorderOptions {
  onVideoFrame?: (frameData: string) => void;
  onError?: (error: string) => void;
  quality?: number; // JPEG quality (0-1)
}

interface VideoRecorderState {
  isEnabled: boolean;
  hasPermission: boolean;
  error: string | null;
}

export default function useVideoRecorder(options: UseVideoRecorderOptions = {}) {
  const {
    onVideoFrame,
    onError,
    quality = 0.7
  } = options;

  const [state, setState] = useState<VideoRecorderState>({
    isEnabled: false,
    hasPermission: false,
    error: null
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Request video permission and set up capture infrastructure
  const requestVideoPermission = useCallback(async (): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, error: null }));
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 30 } // Higher frame rate for better quality
        }
      });

      streamRef.current = stream;
      setState(prev => ({ ...prev, hasPermission: true }));
      
      // Create video element for capture (hidden)
      if (!videoRef.current) {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.style.display = 'none'; // Hidden from user
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
  }, [onError]);

  // Capture a single frame on demand
  const captureFrame = useCallback(async (): Promise<string | null> => {
    if (!state.hasPermission) {
      const granted = await requestVideoPermission();
      if (!granted) return null;
    }

    if (!videoRef.current || !canvasRef.current || !streamRef.current) {
      console.error('Video components not initialized');
      return null;
    }

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context && video.readyState >= 2) { // HAVE_CURRENT_DATA
        // Draw current video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64 JPEG
        const frameData = canvas.toDataURL('image/jpeg', quality);
        
        // Return base64 data without prefix
        const base64Data = frameData.split(',')[1];
        return base64Data;
      }
      
      return null;
    } catch (error) {
      console.error('Error capturing frame:', error);
      return null;
    }
  }, [state.hasPermission, requestVideoPermission, quality]);

  // Enable/disable video (grants/revokes camera permission)
  const toggleVideo = useCallback(async (enabled: boolean) => {
    setState(prev => ({ ...prev, isEnabled: enabled }));
    
    if (enabled) {
      await requestVideoPermission();
    } else {
      // Stop the stream and clean up resources
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setState(prev => ({ ...prev, hasPermission: false }));
    }
  }, [requestVideoPermission]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current && document.body.contains(videoRef.current)) {
        document.body.removeChild(videoRef.current);
      }
      if (canvasRef.current && document.body.contains(canvasRef.current)) {
        document.body.removeChild(canvasRef.current);
      }
    };
  }, []);

  return {
    ...state,
    requestVideoPermission,
    captureFrame,
    toggleVideo,
    videoElement: videoRef.current
  };
}