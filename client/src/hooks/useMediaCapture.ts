import { useState, useRef, useCallback } from "react";
import { createServiceLogger } from "@/lib/logger";

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
  const logger = createServiceLogger("media-capture");

  const [state, setState] = useState<MediaCaptureState>({
    videoEnabled: false,
    hasVideoPermission: false,
    stream: null,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isSetupRef = useRef<boolean>(false);

  const createMediaConstraints = useCallback(
    (enableVideo: boolean): MediaStreamConstraints => {
      const constraints: MediaStreamConstraints = {
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      };

      if (enableVideo) {
        constraints.video = {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 2 },
          facingMode: "user", // Front-facing camera
        };
      }

      return constraints;
    },
    [],
  );

  const setupVideoElements = useCallback(
    (stream: MediaStream) => {
      if (!options.enableVideo || stream.getVideoTracks().length === 0) {
        return;
      }

      // Check if video elements are already properly set up with the same stream
      if (isSetupRef.current && videoRef.current && canvasRef.current && videoRef.current.srcObject === stream) {
        logger.info("Video elements already set up with current stream, skipping setup");
        return;
      }

      logger.info("Setting up video elements");
      setState((prev) => ({
        ...prev,
        videoEnabled: true,
        hasVideoPermission: true,
      }));

      if (!videoRef.current) {
        const video = document.createElement("video");
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        
        // Make video visible but hidden off-screen for proper canvas capture
        video.style.position = "fixed";
        video.style.top = "-1000px"; 
        video.style.left = "-1000px";
        video.style.width = "320px";
        video.style.height = "240px";
        video.style.zIndex = "-9999";
        video.style.opacity = "0.01"; // Almost invisible but still rendered
        video.id = "media-capture-video";
        video.width = 320;
        video.height = 240;
        
        // Add event listeners to track video readiness
        video.onloadedmetadata = () => {
          logger.info("Video metadata loaded, ready for capture", {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState,
          });
        };

        video.oncanplay = () => {
          logger.info("Video can start playing, ready for capture", {
            currentTime: video.currentTime,
            duration: video.duration,
            readyState: video.readyState,
          });
        };

        video.onloadeddata = () => {
          logger.info("Video loaded data, dimensions available", {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState,
          });
        };

        video.onplay = () => {
          logger.info("Video started playing", {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState,
          });
        };

        video.onerror = (error) => {
          logger.error("Video element error", { error });
        };

        videoRef.current = video;
        document.body.appendChild(video);
      } else {
        // Update existing video element with new stream
        videoRef.current.srcObject = stream;
      }

      if (!canvasRef.current) {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        canvas.style.display = "none";
        canvas.id = "media-capture-canvas";
        canvasRef.current = canvas;
        document.body.appendChild(canvas);
      }

      // Mark setup as complete
      isSetupRef.current = true;
      logger.info("Video elements setup completed");
    },
    [options.enableVideo],
  );

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      logger.warn("Video or canvas element not available for capture");
      return null;
    }

    // Force video to play if it's not playing
    if (video.paused || video.readyState < 2) {
      logger.info("Video not playing or not ready, attempting to start playback");
      video.play().catch(err => {
        logger.error("Failed to play video", { error: err.message });
      });
      
      // Wait a moment for video to start
      setTimeout(() => {
        logger.info("Retrying capture after play attempt");
      }, 100);
      
      return null;
    }

    logger.info("Attempting frame capture", {
      videoSrc: !!video.srcObject,
      videoTracks: video.srcObject
        ? (video.srcObject as MediaStream).getVideoTracks().length
        : 0,
      readyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      currentTime: video.currentTime,
      paused: video.paused,
      ended: video.ended,
    });

    // Wait a moment for video to be properly loaded and playing
    if (video.readyState < 2 || video.currentTime === 0) {
      logger.warn("Video not ready for capture", {
        readyState: video.readyState,
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        ended: video.ended,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      
      // If video is paused, try to play it
      if (video.paused) {
        logger.info("Video was paused, attempting to play");
        video.play().catch(err => {
          logger.error("Failed to play video", { error: err.message });
        });
      }
      
      return null;
    }

    // Check if video has actual dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      logger.warn("Video has no dimensions", {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
        srcObject: !!video.srcObject,
      });
      return null;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      logger.error("Could not get canvas 2D context");
      return null;
    }

    try {
      // Set canvas size to match video dimensions for better quality
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Clear the canvas completely with white background to test
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);

      logger.info("Pre-draw video state", {
        videoSrcObject: !!video.srcObject,
        videoCurrentTime: video.currentTime,
        videoPaused: video.paused,
        videoMuted: video.muted,
        videoReadyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      });

      // Draw the video frame
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      
      logger.info("Post-draw canvas state", {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      });

      // Check if the captured image is too dark
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      let totalBrightness = 0;
      let pixelCount = 0;

      // Calculate average brightness
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        // Calculate luminance using standard formula
        const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
        totalBrightness += brightness;
        pixelCount++;
      }

      const averageBrightness = totalBrightness / pixelCount;
      
      logger.info("Frame brightness analysis", {
        averageBrightness,
        isDark: averageBrightness < 50,
        isVeryDark: averageBrightness < 20,
      });

      // If the image is too dark, apply brightness adjustment
      if (averageBrightness < 50) {
        logger.info("Applying brightness adjustment due to dark frame");
        
        // Apply brightness and contrast adjustment
        const adjustedImageData = context.createImageData(imageData);
        const adjustedPixels = adjustedImageData.data;
        
        const brightnessFactor = Math.max(1.5, 100 / averageBrightness); // Increase brightness
        const contrastFactor = 1.2; // Slight contrast increase
        
        for (let i = 0; i < pixels.length; i += 4) {
          // Apply brightness and contrast to RGB channels
          adjustedPixels[i] = Math.min(255, Math.max(0, (pixels[i] * brightnessFactor - 128) * contrastFactor + 128));
          adjustedPixels[i + 1] = Math.min(255, Math.max(0, (pixels[i + 1] * brightnessFactor - 128) * contrastFactor + 128));
          adjustedPixels[i + 2] = Math.min(255, Math.max(0, (pixels[i + 2] * brightnessFactor - 128) * contrastFactor + 128));
          adjustedPixels[i + 3] = pixels[i + 3]; // Keep alpha unchanged
        }
        
        // Put the adjusted image data back to canvas
        context.putImageData(adjustedImageData, 0, 0);
        
        logger.info("Brightness adjustment applied", {
          brightnessFactor,
          contrastFactor,
          originalBrightness: averageBrightness,
        });
      }

      // Convert to base64
      const frameData = canvas.toDataURL("image/jpeg", 0.8); // Use JPEG for better compression
      const base64Data = frameData.split(',')[1];

      logger.info("Frame captured successfully", {
        dataLength: base64Data.length,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        averageBrightness,
        wasAdjusted: averageBrightness < 50,
      });

      return base64Data;
    } catch (error) {
      logger.error("Error capturing frame", {
        error: error instanceof Error ? error.message : String(error),
        videoReadyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      return null;
    }
  }, []);

  const requestPermissions = useCallback(async () => {
    try {
      const constraints = createMediaConstraints(options.enableVideo || false);
      logger.info("Requesting media permissions with constraints", constraints);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      setupVideoElements(stream);
      setState((prev) => ({ ...prev, stream, hasVideoPermission: true }));

      // Wait a bit for video to initialize properly and ensure it's playing
      if (options.enableVideo && stream.getVideoTracks().length > 0) {
        logger.info("Waiting for video to initialize and start playing...");
        
        // Wait for video element to be ready
        await new Promise((resolve, reject) => {
          const video = videoRef.current;
          if (!video) {
            reject(new Error("Video element not found"));
            return;
          }

          let retries = 0;
          const maxRetries = 10;
          
          const checkVideoReady = () => {
            if (video.readyState >= 2 && video.videoWidth > 0 && !video.paused) {
              logger.info("Video is ready for capture", {
                readyState: video.readyState,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                currentTime: video.currentTime,
                paused: video.paused,
              });
              resolve(true);
            } else if (retries < maxRetries) {
              retries++;
              logger.info(`Video not ready yet, retry ${retries}/${maxRetries}`, {
                readyState: video.readyState,
                videoWidth: video.videoWidth,
                currentTime: video.currentTime,
                paused: video.paused,
              });
              
              // Try to play if paused
              if (video.paused) {
                video.play().catch(err => {
                  logger.error("Failed to play video during initialization", { error: err.message });
                });
              }
              
              setTimeout(checkVideoReady, 200);
            } else {
              logger.warn("Video failed to become ready after maximum retries");
              resolve(false); // Don't reject, just continue
            }
          };
          
          checkVideoReady();
        });
      }

      return stream;
    } catch (error) {
      logger.error("Media permission denied", { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw new Error("Media permission denied");
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
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      stream: null,
      videoEnabled: false,
      hasVideoPermission: false,
    }));

    isSetupRef.current = false;
  }, []);

  return {
    ...state,
    captureFrame,
    requestPermissions,
    cleanup,
    videoElement: videoRef.current,
    canvasElement: canvasRef.current,
    // Debug function to test frame capture
    testFrameCapture: useCallback(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video || !canvas) {
        logger.warn("Video or canvas not available for test");
        return null;
      }

      logger.info("Testing frame capture with detailed debugging", {
        videoSrcObject: !!video.srcObject,
        videoTracks: video.srcObject ? (video.srcObject as MediaStream).getVideoTracks().length : 0,
        videoReadyState: video.readyState,
        videoCurrentTime: video.currentTime,
        videoPaused: video.paused,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        videoMuted: video.muted,
        videoAutoplay: video.autoplay,
        videoPlaysInline: video.playsInline,
      });

      // Create a test canvas with red background
      const testCanvas = document.createElement('canvas');
      testCanvas.width = 320;
      testCanvas.height = 240;
      const testContext = testCanvas.getContext('2d');
      
      if (testContext) {
        // Fill with red to test canvas functionality
        testContext.fillStyle = 'red';
        testContext.fillRect(0, 0, testCanvas.width, testCanvas.height);
        
        // Try to draw video if available
        if (video.readyState >= 2 && video.videoWidth > 0) {
          testContext.drawImage(video, 0, 0, testCanvas.width, testCanvas.height);
          logger.info("Video drawn to test canvas");
        } else {
          logger.warn("Video not ready for test capture");
        }
        
        const dataUrl = testCanvas.toDataURL('image/png');
        logger.info("Test capture result", {
          dataLength: dataUrl.length,
          preview: dataUrl.substring(0, 100) + '...'
        });
        
        return dataUrl.split(',')[1]; // Return base64 part
      }
      
      return null;
    }, [])
  };
}
