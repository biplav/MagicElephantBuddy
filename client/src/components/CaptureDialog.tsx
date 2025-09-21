import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Camera, X, AlertCircle } from 'lucide-react';
import { useMediaCapture } from '@/hooks/useMediaCapture';

interface CaptureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onFrameCaptured: (frameData: string) => void;
}

type CaptureState = 'initializing' | 'ready' | 'countdown' | 'capturing' | 'captured' | 'error';

// Custom hook for camera capture workflow
function useCameraCapture(mediaCapture: any, onFrameCaptured: (data: string) => void, onClose: () => void) {
  const [captureState, setCaptureState] = useState<CaptureState>('initializing');
  const [countdown, setCountdown] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);

  const timersRef = useRef<{ countdown?: NodeJS.Timeout; capture?: NodeJS.Timeout }>({});
  const initializingRef = useRef(false);

  const cleanup = useCallback(() => {
    console.log('🎥 CaptureDialog cleanup called');

    // Clear all timers
    Object.values(timersRef.current).forEach(timer => timer && clearTimeout(timer));
    timersRef.current = {};

    // Reset initialization flag
    initializingRef.current = false;

    // Cleanup media capture (stop camera)
    if (mediaCapture.cleanup) {
      console.log('🎥 Calling mediaCapture.cleanup() to stop camera');
      mediaCapture.cleanup();
    } else {
      console.warn('🎥 mediaCapture.cleanup not available');
    }

    // Reset states
    setCaptureState('initializing');
    setCountdown(3);
    setError(null);
    setCapturedFrame(null);
  }, [mediaCapture]);

  const captureFrame = useCallback(async () => {
    try {
      setCaptureState('capturing');

      console.log('Attempting frame capture using mediaCapture.captureFrame()...', {
        hasVideoPermission: mediaCapture.hasVideoPermission,
        hasCaptureMethod: typeof mediaCapture.captureFrame === 'function',
        streamActive: mediaCapture.stream?.active
      });

      // Use the captureFrame method from useMediaCapture hook
      const base64Data = await mediaCapture.captureFrame();

      if (!base64Data) {
        throw new Error('Failed to capture frame - no data returned');
      }

      // Convert base64 to data URL for display
      const frameData = `data:image/jpeg;base64,${base64Data}`;

      console.log('Frame captured successfully using mediaCapture method:', {
        dataLength: base64Data.length,
        frameDataLength: frameData.length
      });

      setCapturedFrame(frameData);
      setCaptureState('captured');

      // Auto-close after 3 seconds
      timersRef.current.capture = setTimeout(() => {
        console.log('🎥 Auto-closing dialog, cleaning up camera...');
        cleanup(); // Ensure camera cleanup happens before callbacks
        onFrameCaptured(frameData);
        onClose();
      }, 3000);

    } catch (err) {
      console.error('Frame capture failed:', err);
      setError(err instanceof Error ? err.message : 'Frame capture failed');
      setCaptureState('error');
    }
  }, [mediaCapture, onFrameCaptured, onClose]);

  const startCountdown = useCallback(() => {
    setCaptureState('countdown');
    setCountdown(3);

    timersRef.current.countdown = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timersRef.current.countdown) {
            clearInterval(timersRef.current.countdown);
            delete timersRef.current.countdown;
          }
          captureFrame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [captureFrame]);

  const initializeCamera = useCallback(async () => {
    // Prevent multiple simultaneous initialization attempts
    if (initializingRef.current) {
      console.log('Already initializing camera, skipping...');
      return;
    }

    initializingRef.current = true;

    try {
      setCaptureState('initializing');
      setError(null);

      console.log('Requesting camera permissions...');
      const stream = await mediaCapture.requestPermissions();

      console.log('Permissions granted, got stream:', !!stream);

      // Wait for the state to update and video element to be ready
      await new Promise(resolve => setTimeout(resolve, 1500));

      console.log('Checking camera availability...', {
        hasVideoPermission: mediaCapture.hasVideoPermission,
        videoElement: !!mediaCapture.videoElement,
        videoElementReady: mediaCapture.videoElement?.readyState,
        streamActive: !!stream && stream.active
      });

      // Check for stream instead of just permission flag (more reliable)
      if (stream && stream.active) {
        // Additional check for video element if needed
        if (!mediaCapture.videoElement) {
          console.log('Video element not ready yet, waiting a bit more...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('Camera ready, transitioning to ready state');
        setCaptureState('ready');
        // Auto-start countdown
        setTimeout(startCountdown, 1000);
      } else {
        throw new Error('Failed to get active camera stream');
      }
    } catch (err) {
      console.error('Failed to initialize camera:', err);
      setError(err instanceof Error ? err.message : 'Failed to access camera');
      setCaptureState('error');
    } finally {
      initializingRef.current = false;
    }
  }, [mediaCapture, startCountdown]);

  return {
    captureState,
    countdown,
    error,
    capturedFrame,
    cleanup,
    initializeCamera
  };
}

export default function CaptureDialog({ isOpen, onClose, onFrameCaptured }: CaptureDialogProps) {
  const mediaCapture = useMediaCapture({ enableVideo: true });
  const { captureState, countdown, error, capturedFrame, cleanup, initializeCamera } = useCameraCapture(
    mediaCapture,
    onFrameCaptured,
    onClose
  );

  // Initialize camera when dialog opens
  useEffect(() => {
    console.log('🎥 CaptureDialog useEffect triggered, isOpen:', isOpen);
    if (isOpen) {
      initializeCamera();
    } else {
      console.log('🎥 Dialog closed, calling cleanup from useEffect');
      cleanup();
    }
    return () => {
      console.log('🎥 CaptureDialog useEffect cleanup (component unmounting)');
      cleanup();
    };
  }, [isOpen]); // Only depend on isOpen to prevent infinite loop

  const handleClose = useCallback(() => {
    cleanup();
    onClose();
  }, [cleanup, onClose]);

  // Memoized video preview component that uses the same video element for capture
  const VideoPreview = useMemo(() => {
    return function VideoPreviewComponent({ children }: { children?: React.ReactNode }) {
      const videoRef = useRef<HTMLVideoElement>(null);

      useEffect(() => {
        const video = videoRef.current;

        // Use the same video element that mediaCapture uses for consistency
        if (video && mediaCapture.videoElement) {
          // Copy the stream from the media capture video element
          video.srcObject = mediaCapture.videoElement.srcObject;

          // Handle play promise properly to avoid interruption errors
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log('Video preview started playing successfully');
              })
              .catch((error) => {
                // Only log if it's not an interruption error
                if (error.name !== 'AbortError') {
                  console.error('Error playing video preview:', error);
                }
              });
          }
        }

        // Cleanup function to handle component unmount
        return () => {
          if (video) {
            video.pause();
            video.srcObject = null;
          }
        };
      }, [mediaCapture.videoElement]);

      return (
        <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
          {mediaCapture.videoElement && (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          )}
          {children}
        </div>
      );
    };
  }, [mediaCapture.videoElement]);

  const stateConfig = useMemo(() => ({
    initializing: {
      content: (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600">Initializing camera...</p>
        </div>
      )
    },
    ready: {
      content: (
        <div className="space-y-6">
          <VideoPreview>
            <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
              Live Camera
            </div>
          </VideoPreview>
          <div className="text-center space-y-2">
            <p className="text-gray-600">Position yourself in the camera view</p>
            <p className="text-sm text-gray-500">Starting capture countdown...</p>
          </div>
        </div>
      )
    },
    countdown: {
      content: (
        <div className="space-y-6">
          <VideoPreview>
            <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl font-bold text-white mb-2 animate-pulse">{countdown}</div>
                <p className="text-white text-lg">Get ready...</p>
              </div>
            </div>
          </VideoPreview>
          <div className="text-center">
            <p className="text-gray-600">Hold still! Capturing in {countdown} seconds...</p>
          </div>
        </div>
      )
    },
    capturing: {
      content: (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Camera className="h-12 w-12 text-blue-600 animate-pulse" />
          <p className="text-gray-600">Capturing frame...</p>
        </div>
      )
    },
    captured: {
      content: (
        <div className="space-y-6">
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
            {capturedFrame && (
              <img src={capturedFrame} alt="Captured frame" className="w-full h-full object-cover" />
            )}
            <div className="absolute top-4 left-4 bg-green-600 text-white px-2 py-1 rounded text-sm">
              ✓ Captured
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-green-600 font-medium">Frame captured successfully!</p>
            <p className="text-gray-600 text-sm">Processing analysis...</p>
          </div>
        </div>
      )
    },
    error: {
      content: (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <div className="text-center space-y-2">
            <p className="text-red-600 font-medium">Camera Error</p>
            <p className="text-gray-600 text-sm">{error}</p>
            <Button onClick={initializeCamera} variant="outline" size="sm">
              Try Again
            </Button>
          </div>
        </div>
      )
    }
  }), [VideoPreview, countdown, capturedFrame, error, initializeCamera]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Capture Frame
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={handleClose} className="h-6 w-6 p-0">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="mt-4">
          {stateConfig[captureState]?.content}
        </div>
      </DialogContent>
    </Dialog>
  );
}