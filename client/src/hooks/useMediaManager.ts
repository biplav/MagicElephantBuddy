
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

  // Initialize media permissions and setup (now only for audio)
  const initialize = useCallback(async () => {
    try {
      logger.info("Initializing media manager for audio", { enableVideo: options.enableVideo });
      
      const constraints: MediaStreamConstraints = {
        audio: true,
        // Video will be initialized lazily when needed
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      setState(prev => ({
        ...prev,
        isInitialized: true,
        hasVideoPermission: true, // We'll check video permission when actually needed
        stream,
      }));

      logger.info("Media manager initialized successfully (audio only)");
      return stream;

    } catch (error) {
      logger.error("Failed to initialize media manager", { error });
      options.onError?.('Failed to access microphone');
      throw error;
    }
  }, [options.enableVideo, options.onError, logger]);

  // Capture frame from video (deprecated - use getFrameAnalysis instead)
  const captureFrame = useCallback((): string | null => {
    logger.warn("captureFrame called - consider using getFrameAnalysis for better camera management");
    
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      logger.warn("Video or canvas not available for capture - use getFrameAnalysis instead");
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

  // Analyze current frame via backend with enhanced context
  const analyzeCurrentFrame = useCallback(async (analysisContext?: {
    reason?: string;
    lookingFor?: string;
    conversationId?: string;
    context?: string;
  }) => {
    if (!options.childId) {
      logger.warn("Cannot analyze frame: childId not provided");
      return {
        success: false,
        message: "I can't see anything because no child ID is available.",
        analysis: null
      };
    }

    setState(prev => ({ ...prev, isCapturing: true }));

    try {
      const frameData = captureFrame();
      if (!frameData) {
        logger.warn("No frame data captured for analysis");
        return {
          success: false,
          message: "I can't see anything right now. Please make sure your camera is working and try showing me again!",
          analysis: null
        };
      }

      logger.info("Sending frame for analysis", { childId: options.childId, analysisContext });

      const response = await fetch('/api/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId: options.childId,
          frameData,
          timestamp: Date.now(),
          reason: analysisContext?.reason || "Child wants to show something",
          lookingFor: analysisContext?.lookingFor || null,
          context: analysisContext?.context || null,
          conversationId: analysisContext?.conversationId || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Frame analysis failed: ${response.status}`);
      }

      const analysisResult = await response.json();
      
      setState(prev => ({ ...prev, lastAnalysis: analysisResult }));
      options.onFrameAnalyzed?.(analysisResult);

      logger.info("Frame analysis completed", { analysis: analysisResult.analysis });
      
      return {
        success: true,
        message: analysisResult.analysis,
        analysis: analysisResult
      };

    } catch (error) {
      logger.error("Frame analysis failed", { error });
      const errorMessage = 'I\'m having trouble seeing what you\'re showing me right now. Can you try again?';
      options.onError?.(errorMessage);
      
      return {
        success: false,
        message: errorMessage,
        analysis: null
      };
    } finally {
      setState(prev => ({ ...prev, isCapturing: false }));
    }
  }, [captureFrame, options.childId, options.onFrameAnalyzed, options.onError, logger]);

  // Get current frame analysis with lazy camera initialization
  const getFrameAnalysis = useCallback(async (analysisContext?: {
    reason?: string;
    lookingFor?: string;
    conversationId?: string;
    context?: string;
  }) => {

    logger.info("Starting camera for frame analysis");
    let tempStream: MediaStream | null = null;
    let tempVideo: HTMLVideoElement | null = null;
    let tempCanvas: HTMLCanvasElement | null = null;

    try {
      // Start camera only for this analysis
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: "user",
          frameRate: { ideal: 2 },
        }
      };

      tempStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Create temporary video element for this analysis
      tempVideo = document.createElement("video");
      tempVideo.autoplay = true;
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      tempVideo.width = 320;
      tempVideo.height = 240;
      tempVideo.style.display = 'none';
      
      tempVideo.srcObject = tempStream;
      document.body.appendChild(tempVideo);
      
      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        if (tempVideo!.readyState >= 2) {
          resolve();
        } else {
          tempVideo!.addEventListener('loadeddata', () => resolve(), { once: true });
        }
      });

      // Create temporary canvas for frame capture
      tempCanvas = document.createElement("canvas");
      tempCanvas.width = 320;
      tempCanvas.height = 240;
      tempCanvas.style.display = "none";
      document.body.appendChild(tempCanvas);

      // Capture frame from temporary video
      const context = tempCanvas.getContext("2d");
      if (!context) {
        throw new Error("Could not get canvas context");
      }

      // Set canvas size to match video
      tempCanvas.width = tempVideo.videoWidth || 320;
      tempCanvas.height = tempVideo.videoHeight || 240;

      // Draw video frame to canvas
      context.drawImage(tempVideo, 0, 0, tempCanvas.width, tempCanvas.height);

      // Convert to base64 string
      const dataURL = tempCanvas.toDataURL("image/jpeg", 0.8);
      const frameData = dataURL.split(",")[1];

      if (!frameData) {
        throw new Error("Failed to capture frame data");
      }

      logger.info("Frame captured successfully for analysis", {
        width: tempCanvas.width,
        height: tempCanvas.height,
        dataSize: frameData.length,
      });

      // Analyze the captured frame
      setState(prev => ({ ...prev, isCapturing: true }));

      const response = await fetch('/api/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId: options.childId,
          frameData,
          timestamp: Date.now(),
          reason: analysisContext?.reason || "Child wants to show something",
          lookingFor: analysisContext?.lookingFor || null,
          context: analysisContext?.context || null,
          conversationId: analysisContext?.conversationId || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Frame analysis failed: ${response.status}`);
      }

      const analysisResult = await response.json();
      
      setState(prev => ({ ...prev, lastAnalysis: analysisResult }));
      options.onFrameAnalyzed?.(analysisResult);

      logger.info("Frame analysis completed", { analysis: analysisResult.analysis });
      
      return {
        success: true,
        message: analysisResult.analysis,
        analysis: analysisResult
      };

    } catch (error) {
      logger.error("Frame analysis failed", { error });
      const errorMessage = error instanceof Error ? error.message : 'I\'m having trouble seeing what you\'re showing me right now. Can you try again?';
      options.onError?.(errorMessage);
      
      return {
        success: false,
        message: errorMessage,
        analysis: null
      };
    } finally {
      // Always cleanup temporary resources
      setState(prev => ({ ...prev, isCapturing: false }));
      
      if (tempStream) {
        tempStream.getTracks().forEach(track => {
          track.stop();
          logger.info("Stopped camera track after analysis");
        });
      }
      
      if (tempVideo && document.body.contains(tempVideo)) {
        document.body.removeChild(tempVideo);
      }
      
      if (tempCanvas && document.body.contains(tempCanvas)) {
        document.body.removeChild(tempCanvas);
      }
      
      logger.info("Camera stopped and cleaned up after frame analysis");
    }
  }, [
    options.enableVideo,
    options.childId,
    options.onFrameAnalyzed,
    options.onError,
    logger
  ]);

  // Start continuous frame analysis
  const startContinuousAnalysis = useCallback((intervalMs: number = 5000) => {
    logger.info("Starting continuous frame analysis", { intervalMs });
    
    const interval = setInterval(() => {
      analyzeCurrentFrame();
    }, intervalMs);

    return interval;
  }, [analyzeCurrentFrame, logger]);

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

  // Internal cleanup that doesn't update state (for unmount)
  const internalCleanup = useCallback(() => {
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
    // NOTE: No setState here to avoid re-renders during unmount
  }, [logger]);

  // Public cleanup that updates state (for external calls)
  const cleanup = useCallback(() => {
    internalCleanup();
    
    setState({
      isInitialized: false,
      hasVideoPermission: false,
      videoEnabled: false,
      stream: null,
      isCapturing: false,
      lastAnalysis: null,
    });
  }, [internalCleanup]);

  // Cleanup on unmount - use internal cleanup to avoid state updates
  useEffect(() => {
    return () => {
      internalCleanup();
    };
  }, [internalCleanup]);

  return {
    // State
    ...state,
    
    // Methods
    initialize,
    captureFrame,
    analyzeCurrentFrame,
    getFrameAnalysis,
    startContinuousAnalysis,
    showLiveStream,
    hideLiveStream,
    cleanup,
    
    // Elements (for external components)
    videoElement: videoRef.current,
    canvasElement: canvasRef.current,
  };
}
