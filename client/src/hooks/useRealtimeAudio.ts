import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createServiceLogger } from '@/lib/logger';
import { useOpenAIConnection } from './useOpenAIConnection';
import { useGeminiConnection } from './useGeminiConnection';
import { useMediaCapture } from './useMediaCapture'; // This will be replaced by mediaManager

// Placeholder for the new media manager hook
// In a real scenario, this would be imported from a new file, e.g., './useMediaManager'
// For this example, we'll assume it's available and has the necessary functions.
// const useMediaManager = (options: { enableVideo: boolean }) => {
//   const [videoEnabled, setVideoEnabled] = useState(options.enableVideo);
//   const [hasVideoPermission, setHasVideoPermission] = useState(false);
//   const videoStream = useRef<MediaStream | null>(null);

//   const requestPermissions = useCallback(async () => {
//     // Logic to request camera and microphone permissions
//     // Set hasVideoPermission based on result
//     // Set videoStream if camera is granted
//     console.log('Requesting media permissions...');
//     // Dummy implementation
//     await new Promise(resolve => setTimeout(resolve, 500));
//     setHasVideoPermission(true);
//     setVideoEnabled(true);
//     console.log('Media permissions granted.');
//     return true;
//   }, []);

//   const captureFrame = useCallback(() => {
//     if (!videoStream.current || !hasVideoPermission) return null;
//     // Logic to capture a frame from the video stream
//     console.log('Capturing frame...');
//     // Dummy frame data
//     return 'dummy_frame_data';
//   }, [hasVideoPermission, videoStream]);

//   const cleanup = useCallback(() => {
//     console.log('Cleaning up media resources...');
//     if (videoStream.current) {
//       videoStream.current.getTracks().forEach(track => track.stop());
//       videoStream.current = null;
//     }
//     setVideoEnabled(false);
//     setHasVideoPermission(false);
//     console.log('Media resources cleaned up.');
//   }, []);

//   return {
//     requestPermissions,
//     captureFrame,
//     cleanup,
//     videoEnabled,
//     hasVideoPermission,
//   };
// };


interface UseRealtimeAudioOptions {
  childId?: string;
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (text: string) => void;
  onAudioResponseReceived?: (audioData: string) => void;
  onError?: (error: string) => void;
  onVideoFrame?: (frameData: string) => void;
  onStorybookPageDisplay?: (pageData: {
    pageImageUrl: string;
    pageText: string;
    pageNumber: number;
    totalPages: number;
    bookTitle: string;
  }) => void;
  onBookSelected?: (book: any) => void;
  onAppuSpeakingChange?: (speaking: boolean) => void;
  modelType?: 'openai' | 'gemini';
}

interface RealtimeAudioState {
  isConnected: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  videoEnabled: boolean;
  hasVideoPermission: boolean;
  modelType: 'openai' | 'gemini';
  conversationId?: number;
  isAppuSpeaking: boolean;
}

export default function useRealtimeAudio(options: UseRealtimeAudioOptions = {}) {
  const logger = useMemo(() => createServiceLogger('realtime-audio'), []);
  const modelType = options.modelType || 'openai';

  // Initialize once per mount with useRef to avoid state updates
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!hasInitialized.current) {
      logger.info('Initializing hook', { modelType, enableVideo: false });
      hasInitialized.current = true;
    }
  }, [logger, modelType]);

  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Stabilize callback references to prevent unnecessary re-renders
  const stableCallbacks = useMemo(() => ({
    onTranscriptionReceived: options.onTranscriptionReceived,
    onResponseReceived: options.onResponseReceived,
    onAudioResponseReceived: options.onAudioResponseReceived,
    onError: options.onError,
    onStorybookPageDisplay: options.onStorybookPageDisplay,
    onBookSelected: options.onBookSelected,
    onAppuSpeakingChange: options.onAppuSpeakingChange
  }), [options.onTranscriptionReceived, options.onResponseReceived, options.onAudioResponseReceived, options.onError, options.onStorybookPageDisplay, options.onBookSelected, options.onAppuSpeakingChange]);

  // Initialize media manager - camera will be activated on-demand via getFrameAnalysis
  const mediaManager = useMediaCapture({ enableVideo: false });

  // Create stable connection options that don't change unless truly necessary
  const connectionOptions = useMemo(() => ({
    ...stableCallbacks,
    childId: options.childId,
    enableVideo: false, // Camera activated on-demand
  }), [
    stableCallbacks, 
    options.childId,
  ]);

  // Initialize connection hooks with stable options
  const openaiConnection = useOpenAIConnection(connectionOptions);
  const geminiConnection = useGeminiConnection(stableCallbacks);

  // Get the active connection based on model type
  const activeConnection = modelType === 'openai' ? openaiConnection : geminiConnection;

  // Combined state
  const state: RealtimeAudioState = {
    isConnected: activeConnection.isConnected,
    isRecording: activeConnection.isRecording,
    isProcessing: false, // This might need to be managed by the connections or a new state
    error: activeConnection.error,
    videoEnabled: mediaManager.videoEnabled, // Use mediaManager
    hasVideoPermission: mediaManager.hasVideoPermission, // Use mediaManager
    modelType,
    conversationId: 'conversationId' in activeConnection ? activeConnection.conversationId as number : undefined,
    isAppuSpeaking: 'isAppuSpeaking' in activeConnection ? activeConnection.isAppuSpeaking as boolean : false
  };

  // Handle model type changes
  const [previousModelType, setPreviousModelType] = useState<string>(modelType);

  useEffect(() => {
    // Only act when modelType actually changes
    if (previousModelType !== modelType) {
      logger.info('Model type change detected', { 
        from: previousModelType, 
        to: modelType 
      });

      // Disconnect other connections when switching
      if (modelType === 'openai' && geminiConnection.isConnected) {
        geminiConnection.disconnect();
      } else if (modelType === 'gemini' && openaiConnection.isConnected) {
        openaiConnection.disconnect();
      }

      setPreviousModelType(modelType);
    }
  }, [modelType, previousModelType, openaiConnection, geminiConnection, logger]);

  const connect = useCallback(async () => {
    if (isConnecting || state.isConnected) {
      logger.warn('Connection attempt blocked', {
        reason: isConnecting ? 'already connecting' : 'already connected'
      });
      return;
    }

    try {
      setIsConnecting(true);
      logger.info('Starting connection process', { modelType });

      // Request media permissions first
      await mediaManager.requestPermissions(); // Use mediaManager

      // Connect to the appropriate service
      await activeConnection.connect();

      logger.info('Connection process completed successfully');

    } catch (error: any) {
      logger.error('Connection process failed', {
        error: error.message,
        modelType
      });
      options.onError?.(error.message || 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, state.isConnected, modelType, activeConnection, mediaManager, options]); // Added mediaManager dependency

  const disconnect = useCallback(() => {
    logger.info('Starting disconnect process');

    openaiConnection.disconnect();
    geminiConnection.disconnect();
    mediaManager.cleanup(); // Use mediaManager

    logger.info('Disconnect process completed');
  }, [openaiConnection, geminiConnection, mediaManager]); // Added mediaManager dependency

  const startRecording = useCallback(async () => {
    if (!state.isConnected) {
      await connect();
    }
    logger.info('Recording started');
  }, [state.isConnected, connect]);

  const stopRecording = useCallback(() => {
    logger.info('Recording stopped');
    // Potentially call a stopRecording method on the activeConnection or mediaManager
  }, []);

  const requestMicrophonePermission = useCallback(async () => {
    try {
      // Use mediaManager for requesting permissions
      await mediaManager.requestPermissions();
      return true;
    } catch (error) {
      logger.error('Microphone permission denied', { error: error instanceof Error ? error.message : String(error) });
      options.onError?.('Microphone permission denied');
      return false;
    }
  }, [mediaManager, options]); // Added mediaManager dependency

  // Gemini-specific methods
  const sendTextToGemini = useCallback((text: string) => {
    if (modelType === 'gemini' && 'sendText' in geminiConnection) {
      geminiConnection.sendText(text);
    }
  }, [modelType, geminiConnection]);

  const sendVideoFrameToGemini = useCallback(() => {
    if (modelType === 'gemini' && 'sendVideoFrame' in geminiConnection) {
      const frameData = mediaManager.captureFrame(); // Use mediaManager
      if (frameData) {
        geminiConnection.sendVideoFrame(frameData);
      }
    }
  }, [modelType, geminiConnection, mediaManager]); // Added mediaManager dependency

  const captureCurrentFrame = useCallback(() => {
    return mediaManager.captureFrame(); // Use mediaManager
  }, [mediaManager]); // Added mediaManager dependency

  // Cleanup on unmount - use useRef to avoid dependency issues
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;

  useEffect(() => {
    return () => {
      disconnectRef.current();
    };
  }, []); // Empty dependency array to only run on mount/unmount

  // Mocking additional state and setters for a complete example
  const [isUserSpeaking, setIsUserSpeaking] = useState(false); // Assuming this state might be managed elsewhere or by connection
  const [setModelType] = useState<'openai' | 'gemini'>(modelType); // Dummy setter for demonstration

  // The return object needs to be updated to reflect the changes.
  // The original code snippet for changes was incomplete and likely referred to a different hook's return value.
  // We will construct the return value based on the original hook's intent and the new media manager concept.

  return {
    ...state,
    isConnecting,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    requestMicrophonePermission,
    captureCurrentFrame,
    sendTextToGemini,
    sendVideoFrameToGemini,
    isReady: state.isConnected,
    // Expose individual connections for direct access
    openaiConnection,
    geminiConnection,
    mediaManager, // Expose the mediaManager
    // Expose last captured frame from OpenAI connection if it exists there
    lastCapturedFrame: modelType === 'openai' ? openaiConnection.lastCapturedFrame : null
  };
}