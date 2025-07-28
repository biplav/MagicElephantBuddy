import { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { useMediaCapture } from '../hooks/useMediaCapture';

export default function FrameCaptureTest() {
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [isTestingFrame, setIsTestingFrame] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaCapture = useMediaCapture({ enableVideo: true });

  const handleRequestPermissions = useCallback(async () => {
    try {
      setError(null);
      await mediaCapture.requestPermissions();
      console.log('Media permissions granted successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get permissions';
      setError(errorMessage);
      console.error('Failed to get media permissions:', err);
    }
  }, [mediaCapture]);

  const handleTestCapture = useCallback(() => {
    try {
      setError(null);
      setIsTestingFrame(true);
      
      // Use the debug test function if available
      if ('testFrameCapture' in mediaCapture) {
        const testResult = (mediaCapture as any).testFrameCapture();
        if (testResult) {
          setCapturedFrame(`data:image/png;base64,${testResult}`);
          console.log('Test frame captured successfully');
        } else {
          setError('Test frame capture returned null');
        }
      } else {
        // Use regular capture
        const result = (mediaCapture as any).captureFrame();
        if (result) {
          setCapturedFrame(`data:image/png;base64,${result}`);
          console.log('Frame captured successfully');
        } else {
          setError('Frame capture returned null');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Frame capture failed';
      setError(errorMessage);
      console.error('Frame capture error:', err);
    } finally {
      setIsTestingFrame(false);
    }
  }, [mediaCapture]);

  const handleRegularCapture = useCallback(() => {
    try {
      setError(null);
      const result = (mediaCapture as any).captureFrame();
      if (result) {
        setCapturedFrame(`data:image/png;base64,${result}`);
        console.log('Regular frame captured successfully');
      } else {
        setError('Regular frame capture returned null');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Regular frame capture failed';
      setError(errorMessage);
      console.error('Regular frame capture error:', err);
    }
  }, [mediaCapture]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Frame Capture Debug Tool</h2>
      
      <div className="space-y-4 mb-6">
        <div className="flex space-x-4">
          <Button onClick={handleRequestPermissions} variant="outline">
            Request Camera Permission
          </Button>
          <Button onClick={handleTestCapture} disabled={isTestingFrame}>
            {isTestingFrame ? 'Testing...' : 'Test Capture (Debug)'}
          </Button>
          <Button onClick={handleRegularCapture}>
            Regular Capture
          </Button>
        </div>
        
        {error && (
          <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Media Capture Status:</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>Video Enabled: {mediaCapture.videoEnabled ? '✅' : '❌'}</div>
            <div>Has Permission: {mediaCapture.hasVideoPermission ? '✅' : '❌'}</div>
            <div>Video Element: {mediaCapture.videoElement ? '✅' : '❌'}</div>
            <div>Canvas Element: {mediaCapture.canvasElement ? '✅' : '❌'}</div>
          </div>
        </div>

        {capturedFrame && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Captured Frame:</h3>
            <div className="border rounded-lg p-4">
              <img 
                src={capturedFrame} 
                alt="Captured frame"
                className="max-w-full h-auto border rounded"
                style={{ maxHeight: '300px' }}
              />
              <div className="mt-2 text-sm text-gray-600">
                Image size: {Math.round(capturedFrame.length / 1024)} KB
              </div>
            </div>
          </div>
        )}

        {mediaCapture.videoElement && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Video Element Debug Info:</h3>
            <div className="text-sm space-y-1 font-mono bg-gray-100 p-4 rounded">
              <div>Ready State: {mediaCapture.videoElement.readyState}</div>
              <div>Video Width: {mediaCapture.videoElement.videoWidth}</div>
              <div>Video Height: {mediaCapture.videoElement.videoHeight}</div>
              <div>Current Time: {mediaCapture.videoElement.currentTime.toFixed(2)}s</div>
              <div>Paused: {mediaCapture.videoElement.paused ? 'Yes' : 'No'}</div>
              <div>Muted: {mediaCapture.videoElement.muted ? 'Yes' : 'No'}</div>
              <div>Has Source: {mediaCapture.videoElement.srcObject ? 'Yes' : 'No'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}