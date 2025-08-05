
import { useState, useRef, useCallback, useEffect } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface MediaManagerOptions {
  enableVideo?: boolean;
  onFrameAnalyzed?: (analysis: any) => void;
  onError?: (error: string) => void;
  childId?: string;
}

interface MediaManagerState {
  isInitialized: boolean;
  hasVideoPermission: boolean;
  videoEnabled: boolean;
  stream: MediaStream | null;
  isCapturing: boolean;
  lastAnalysis: any;
}

export function useMediaManager(options: MediaManagerOptions = {}) {
  const logger = createServiceLogger('media-manager');
  
  const [state, setState] = useState<MediaManagerState>({
    isInitialized: false,
    hasVideoPermission: false,
    videoEnabled: false,
    stream: null,
    isCapturing: false,
    lastAnalysis: null,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize video elements
  const setupVideoElements = useCallback((stream: MediaStream) => {
    if (!options.enableVideo || stream.getVideoTracks().length === 0) {
      return;
    }

    // Check for existing video element first
    if (!videoRef.current) {
      const existingVideo = document.querySelector('video[id="media-manager-video"]') as HTMLVideoElement;

      if (existingVideo) {
        logger.info("Reusing existing video element");
        videoRef.current = existingVideo;
      } else {
        // Create new video element
        const video = document.createElement("video");
        video.id = "media-manager-video";
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.width = 320;
        video.height = 240;
        video.style.display = 'none'; // Hidden by default
        
        videoRef.current = video;
        document.body.appendChild(video);
        logger.info("Created new video element");
      }
    }

    // Set video source and play
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(error => {
      logger.error("Failed to start video playback", { error });
    });

    // Setup canvas if needed
    if (!canvasRef.current) {
      const existingCanvas = document.querySelector('canvas[id="media-manager-canvas"]') as HTMLCanvasElement;

      if (existingCanvas) {
        logger.info("Reusing existing canvas element");
        canvasRef.current = existingCanvas;
      } else {
        const canvas = document.createElement("canvas");
        canvas.id = "media-manager-canvas";
        canvas.width = 320;
        canvas.height = 240;
        canvas.style.display = "none";
        
        canvasRef.current = canvas;
        document.body.appendChild(canvas);
        logger.info("Created new canvas element");
      }
    }

    setState(prev => ({ ...prev, videoEnabled: true }));
  }, [options.enableVideo, logger]);

  // Initialize media permissions and setup
  const initialize = useCallback(async () => {
    try {
      logger.info("Initializing media manager", { enableVideo: options.enableVideo });
      
      const constraints: MediaStreamConstraints = {
        audio: true,
      };

      if (options.enableVideo) {
        constraints.video = {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: "user",
          frameRate: { ideal: 2 },
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      setupVideoElements(stream);

      // Wait for video to be ready if video is enabled
      if (options.enableVideo && videoRef.current) {
        await new Promise<void>((resolve) => {
          const video = videoRef.current!;
          if (video.readyState >= 2) {
            resolve();
          } else {
            video.addEventListener('loadeddata', () => resolve(), { once: true });
          }
        });
      }

      setState(prev => ({
        ...prev,
        isInitialized: true,
        hasVideoPermission: true,
        stream,
      }));

      logger.info("Media manager initialized successfully");
      return stream;

    } catch (error) {
      logger.error("Failed to initialize media manager", { error });
      options.onError?.('Failed to access camera/microphone');
      throw error;
    }
  }, [options.enableVideo, options.onError, setupVideoElements, logger]);

  // Capture frame from video
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      logger.warn("Video or canvas not available for capture");
      return null;
    }

    if (video.paused) {
      logger.warn("Video is paused, attempting to play");
      try {
        video.play();
      } catch (error) {
        logger.error("Failed to play paused video", { error });
        return null;
      }
    }

    if (video.readyState < 2) {
      logger.warn("Video not ready for capture", {
        readyState: video.readyState,
        paused: video.paused,
      });
      return null;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      logger.error("Could not get canvas context");
      return null;
    }

    try {
      // Set canvas size to match video
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;

      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to base64 string
      const dataURL = canvas.toDataURL("image/jpeg", 0.8);
      const base64 = dataURL.split(",")[1];

      logger.info("Frame captured successfully", {
        width: canvas.width,
        height: canvas.height,
        dataSize: base64.length,
      });

      return base64;
    } catch (error) {
      logger.error("Frame capture failed", { error });
      return null;
    }
  }, [logger]);

  // Analyze current frame via backend
  const analyzeCurrentFrame = useCallback(async () => {
    if (!options.childId) {
      logger.warn("Cannot analyze frame: childId not provided");
      return null;
    }

    setState(prev => ({ ...prev, isCapturing: true }));

    try {
      const frameData = captureFrame();
      if (!frameData) {
        logger.warn("No frame data captured for analysis");
        return null;
      }

      logger.info("Sending frame for analysis", { childId: options.childId });

      const response = await fetch('/api/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId: options.childId,
          frameData,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Frame analysis failed: ${response.status}`);
      }

      const analysis = await response.json();
      
      setState(prev => ({ ...prev, lastAnalysis: analysis }));
      options.onFrameAnalyzed?.(analysis);

      logger.info("Frame analysis completed", { analysis });
      return analysis;

    } catch (error) {
      logger.error("Frame analysis failed", { error });
      options.onError?.('Failed to analyze video frame');
      return null;
    } finally {
      setState(prev => ({ ...prev, isCapturing: false }));
    }
  }, [captureFrame, options.childId, options.onFrameAnalyzed, options.onError, logger]);

  // Start continuous frame analysis
  const startContinuousAnalysis = useCallback((intervalMs: number = 5000) => {
    if (!options.enableVideo) {
      logger.warn("Cannot start continuous analysis: video not enabled");
      return null;
    }

    logger.info("Starting continuous frame analysis", { intervalMs });
    
    const interval = setInterval(() => {
      analyzeCurrentFrame();
    }, intervalMs);

    return interval;
  }, [analyzeCurrentFrame, options.enableVideo, logger]);

  // Show live video stream (for display components)
  const showLiveStream = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.style.display = 'block';
      return videoRef.current;
    }
    return null;
  }, []);

  // Hide live video stream
  const hideLiveStream = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.style.display = 'none';
    }
  }, []);

  // Cleanup resources
  const cleanup = useCallback(() => {
    logger.info("Cleaning up media manager");

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

    setState({
      isInitialized: false,
      hasVideoPermission: false,
      videoEnabled: false,
      stream: null,
      isCapturing: false,
      lastAnalysis: null,
    });
  }, [logger]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    // State
    ...state,
    
    // Methods
    initialize,
    captureFrame,
    analyzeCurrentFrame,
    startContinuousAnalysis,
    showLiveStream,
    hideLiveStream,
    cleanup,
    
    // Elements (for external components)
    videoElement: videoRef.current,
    canvasElement: canvasRef.current,
  };
}
