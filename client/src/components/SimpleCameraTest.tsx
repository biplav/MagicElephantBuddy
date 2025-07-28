import { useState, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";

export default function SimpleCameraTest() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false 
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      
      console.log('Camera started successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start camera';
      setError(errorMessage);
      console.error('Camera error:', err);
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !stream) {
      setError('Camera not ready');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      setError('Could not get canvas context');
      return;
    }

    try {
      // Set canvas size to match video
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      // Draw current video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to base64
      const dataURL = canvas.toDataURL('image/png');
      setCapturedImage(dataURL);
      
      console.log('Photo captured successfully');
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to capture photo';
      setError(errorMessage);
      console.error('Capture error:', err);
    }
  }, [stream]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setCapturedImage(null);
    setError(null);
  }, [stream]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Simple Camera Test</h2>
      
      <div className="flex gap-4 mb-6">
        <Button onClick={startCamera} disabled={!!stream}>
          Start Camera
        </Button>
        <Button onClick={capturePhoto} disabled={!stream}>
          Capture Photo
        </Button>
        <Button onClick={stopCamera} disabled={!stream} variant="outline">
          Stop Camera
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded mb-6">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Live Camera Feed</h3>
          <div className="relative bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-auto max-h-96"
              style={{ display: stream ? 'block' : 'none' }}
            />
            {!stream && (
              <div className="aspect-video flex items-center justify-center text-gray-500">
                Camera not active
              </div>
            )}
          </div>
          
          {stream && videoRef.current && (
            <div className="mt-2 text-sm text-gray-600 space-y-1">
              <div>Video Size: {videoRef.current.videoWidth} x {videoRef.current.videoHeight}</div>
              <div>Ready State: {videoRef.current.readyState}</div>
              <div>Current Time: {videoRef.current.currentTime.toFixed(2)}s</div>
              <div>Paused: {videoRef.current.paused ? 'Yes' : 'No'}</div>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">Captured Photo</h3>
          <div className="relative bg-gray-100 rounded-lg overflow-hidden">
            {capturedImage ? (
              <img 
                src={capturedImage} 
                alt="Captured photo"
                className="w-full h-auto max-h-96 object-contain"
              />
            ) : (
              <div className="aspect-video flex items-center justify-center text-gray-500">
                No photo captured
              </div>
            )}
          </div>
          
          {capturedImage && (
            <div className="mt-2 text-sm text-gray-600">
              Image size: {Math.round(capturedImage.length / 1024)} KB
            </div>
          )}
        </div>
      </div>

      {/* Hidden canvas for image capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}