
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Textarea } from './ui/textarea';

export default function ToolTester() {
  const [testResult, setTestResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runToolTest = async (testType: 'simple' | 'complete' = 'simple') => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/test-tool', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ testType })
      });

      const result = await response.json();
      setTestResult(result);
      console.log('🧪 Tool test result:', result);
    } catch (error) {
      console.error('Tool test failed:', error);
      setTestResult({ error: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const testLiveFrameCapture = () => {
    // Test if frame capture is working
    if (typeof window !== 'undefined' && (window as any).captureCurrentFrame) {
      const frameData = (window as any).captureCurrentFrame();
      console.log('🧪 Live frame capture test:', {
        hasFrameData: !!frameData,
        frameLength: frameData?.length || 0
      });
      
      if (frameData) {
        // Test with actual captured frame
        runToolTest('simple');
      } else {
        console.log('❌ No frame data captured - camera may not be active');
      }
    } else {
      console.log('❌ Frame capture function not available');
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>🔧 Tool Invocation Tester</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Button 
            onClick={() => runToolTest('simple')} 
            disabled={isLoading}
            variant="outline"
          >
            Test Analysis Pipeline
          </Button>
          
          <Button 
            onClick={() => runToolTest('complete')} 
            disabled={isLoading}
            variant="outline"
          >
            Test Complete Flow
          </Button>
          
          <Button 
            onClick={testLiveFrameCapture} 
            disabled={isLoading}
            variant="outline"
          >
            Test Live Frame Capture
          </Button>
        </div>

        {isLoading && (
          <div className="text-center text-gray-600">
            Running tool test...
          </div>
        )}

        {testResult && (
          <div className="space-y-2">
            <h3 className="font-semibold">Test Result:</h3>
            <Textarea
              value={JSON.stringify(testResult, null, 2)}
              readOnly
              className="h-64 font-mono text-sm"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
