import { useState, useRef, useCallback } from "react";
import { logger } from "@/lib/logger";

interface MediaCaptureState {
  stream: MediaStream | null;
  videoEnabled: boolean;
  hasVideoPermission: boolean;
}

interface MediaCaptureOptions {
  enableVideo: boolean;
}

export const useMediaCapture = ({ enableVideo }: MediaCaptureOptions) => {
  const [state, setState] = useState<MediaCaptureState>({
    stream: null,
    videoEnabled: false,
    hasVideoPermission: false,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const createMediaConstraints = useCallback((enableVideo: boolean) => {
    const constraints: MediaStreamConstraints = {
      audio: true,
    };

    if (enableVideo) {
      constraints.video = {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      };
    }

    return constraints;
  }, []);

  const setupVideoElements = useCallback((stream: MediaStream) => {
    if (!enableVideo || stream.getVideoTracks().length === 0) {
      return;
    }

    // Create video element
    if (!videoRef.current) {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      
      // Position off-screen but visible for canvas capture
      video.style.position = "fixed";
      video.style.top = "-1000px";
      video.style.left = "-1000px";
      video.style.width = "320px";
      video.style.height = "240px";
      video.style.opacity = "0.01";
      video.style.zIndex = "-9999";
      video.width = 320;
      video.height = 240;

      videoRef.current = video;
      document.body.appendChild(video);
    }

    // Create canvas element
    if (!canvasRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      canvas.style.display = "none";
      canvasRef.current = canvas;
      document.body.appendChild(canvas);
    }

    setState(prev => ({ ...prev, videoEnabled: true }));
  }, [enableVideo]);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      logger.warn("Video or canvas not available for capture");
      return null;
    }

    if (video.readyState < 2 || video.paused) {
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
  }, []);

  const requestPermissions = useCallback(async () => {
    try {
      const constraints = createMediaConstraints(enableVideo);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      streamRef.current = stream;
      setupVideoElements(stream);
      
      setState(prev => ({ 
        ...prev, 
        stream, 
        hasVideoPermission: true 
      }));

      // Wait for video to be ready
      if (enableVideo && videoRef.current) {
        await new Promise<void>((resolve) => {
          const video = videoRef.current!;
          if (video.readyState >= 2) {
            resolve();
          } else {
            video.addEventListener('loadeddata', () => resolve(), { once: true });
          }
        });
      }

      return stream;
    } catch (error) {
      logger.error("Failed to get media permissions", { error });
      throw error;
    }
  }, [enableVideo, createMediaConstraints, setupVideoElements]);

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

    setState({
      stream: null,
      videoEnabled: false,
      hasVideoPermission: false,
    });
  }, []);

  return {
    ...state,
    captureFrame,
    requestPermissions,
    cleanup,
    videoElement: videoRef.current,
    canvasElement: canvasRef.current,
  };
};