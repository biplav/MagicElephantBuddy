import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, Camera, ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'wouter';
import CaptureDialog from '@/components/CaptureDialog';
import { analyzeFrame } from '@/lib/frameAnalysis';

interface AnalysisResult {
  success: boolean;
  analysis?: string;
  confidence?: number;
  error?: string;
  timestamp?: Date;
}

export default function GetEyePage() {
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleCaptureClick = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const handleFrameCaptured = useCallback(async (frameData: string) => {
    console.log('📸 Frame captured on GetEyePage');
    setCapturedFrame(frameData);
    setIsDialogOpen(false);

    // Start analysis
    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const result = await analyzeFrame({
        frameData,
        reason: "User requested frame analysis",
        lookingFor: "general analysis of what's in the image",
        context: "User initiated capture from GetEye page",
        childId: "1085268853542289410" // Default child ID for testing
      });

      setAnalysisResult({
        success: true,
        analysis: result.analysis,
        confidence: result.confidence,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Frame analysis failed:', error);
      setAnalysisResult({
        success: false,
        error: error instanceof Error ? error.message : 'Analysis failed',
        timestamp: new Date()
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleDialogClose = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  const handleRetake = useCallback(() => {
    setCapturedFrame(null);
    setAnalysisResult(null);
    setIsDialogOpen(true);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Eye className="h-6 w-6 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-800">GetEye Tool</h1>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Camera className="h-3 w-3" />
            AI Vision Analysis
          </Badge>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Capture Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Frame Capture
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!capturedFrame ? (
                <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                  <Eye className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-600 text-center mb-4">
                    No frame captured yet. Click the button below to start capturing.
                  </p>
                  <Button
                    onClick={handleCaptureClick}
                    className="gap-2"
                    size="lg"
                  >
                    <Camera className="h-4 w-4" />
                    Capture Frame
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <img
                      src={capturedFrame}
                      alt="Captured frame"
                      className="w-full h-auto rounded-lg border shadow-sm"
                    />
                    <Badge
                      className="absolute top-2 right-2 bg-green-600"
                      variant="secondary"
                    >
                      Captured
                    </Badge>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleRetake}
                      variant="outline"
                      className="gap-2 flex-1"
                    >
                      <Camera className="h-4 w-4" />
                      Retake
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                AI Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!capturedFrame ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <div className="h-12 w-12 border-2 border-gray-300 rounded-full flex items-center justify-center mb-4">
                    <Eye className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-center">
                    Capture a frame to see AI analysis results
                  </p>
                </div>
              ) : isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
                  <p className="text-gray-600">Analyzing frame...</p>
                </div>
              ) : analysisResult ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={analysisResult.success ? "default" : "destructive"}
                      className="gap-1"
                    >
                      {analysisResult.success ? "✓ Success" : "✗ Failed"}
                    </Badge>
                    {analysisResult.timestamp && (
                      <span className="text-xs text-gray-500">
                        {analysisResult.timestamp.toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {analysisResult.success ? (
                    <div className="space-y-3">
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h4 className="font-medium text-blue-900 mb-2">Analysis Result:</h4>
                        <p className="text-blue-800 text-sm leading-relaxed">
                          {analysisResult.analysis}
                        </p>
                      </div>

                      {analysisResult.confidence && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">Confidence:</span>
                          <Badge variant="outline">
                            {Math.round(analysisResult.confidence * 100)}%
                          </Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                      <h4 className="font-medium text-red-900 mb-2">Error:</h4>
                      <p className="text-red-800 text-sm">
                        {analysisResult.error}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">How to Use GetEye Tool</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">1</div>
                <div>
                  <h4 className="font-medium mb-1">Capture Frame</h4>
                  <p className="text-gray-600">Click "Capture Frame" to open the camera dialog</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</div>
                <div>
                  <h4 className="font-medium mb-1">Position & Wait</h4>
                  <p className="text-gray-600">Position your camera and wait for the 3-second countdown</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">3</div>
                <div>
                  <h4 className="font-medium mb-1">View Analysis</h4>
                  <p className="text-gray-600">AI will analyze the captured frame and show results</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capture Dialog */}
      <CaptureDialog
        isOpen={isDialogOpen}
        onClose={handleDialogClose}
        onFrameCaptured={handleFrameCaptured}
      />
    </div>
  );
}