import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createServiceLogger } from '@/lib/logger';
import { useOpenAIConnection } from './useOpenAIConnection';
import { useGeminiConnection } from './useGeminiConnection';
import { useMediaCapture } from './useMediaCapture';

interface UseRealtimeAudioOptions {
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (text: string) => void;
  onAudioResponseReceived?: (audioData: string) => void;
  onError?: (error: string) => void;
  enableVideo?: boolean;
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
      logger.info('Initializing hook', { modelType, enableVideo: options.enableVideo });
      hasInitialized.current = true;
    }
  }, [logger, modelType, options.enableVideo]);

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

  // Initialize media capture at the top level with stable options
  const mediaCapture = useMediaCapture({ enableVideo: options.enableVideo || false });

  // Create stable connection options that don't change unless truly necessary
  const connectionOptions = useMemo(() => ({
    ...stableCallbacks,
    enableVideo: options.enableVideo,
    // Pass media functions directly to avoid circular dependencies
    requestMediaPermissions: mediaCapture.requestPermissions,
    captureFrame: mediaCapture.captureFrame,
    cleanupMedia: mediaCapture.cleanup,
    hasVideoPermission: mediaCapture.hasVideoPermission
  }), [
    stableCallbacks, 
    options.enableVideo,
    mediaCapture.requestPermissions,
    mediaCapture.captureFrame,
    mediaCapture.cleanup,
    mediaCapture.hasVideoPermission
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
    isProcessing: false,
    error: activeConnection.error,
    videoEnabled: mediaCapture.videoEnabled,
    hasVideoPermission: mediaCapture.hasVideoPermission,
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
      await mediaCapture.requestPermissions();

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
  }, [isConnecting, state.isConnected, modelType, activeConnection, mediaCapture, options]);

  const disconnect = useCallback(() => {
    logger.info('Starting disconnect process');

    openaiConnection.disconnect();
    geminiConnection.disconnect();
    mediaCapture.cleanup();

    logger.info('Disconnect process completed');
  }, [openaiConnection, geminiConnection, mediaCapture]);

  const startRecording = useCallback(async () => {
    if (!state.isConnected) {
      await connect();
    }
    logger.info('Recording started');
  }, [state.isConnected, connect]);

  const stopRecording = useCallback(() => {
    logger.info('Recording stopped');
  }, []);

  const requestMicrophonePermission = useCallback(async () => {
    try {
      await mediaCapture.requestPermissions();
      return true;
    } catch (error) {
      logger.error('Microphone permission denied', { error: error instanceof Error ? error.message : String(error) });
      options.onError?.('Microphone permission denied');
      return false;
    }
  }, [mediaCapture, options]);

  // Gemini-specific methods
  const sendTextToGemini = useCallback((text: string) => {
    if (modelType === 'gemini' && 'sendText' in geminiConnection) {
      geminiConnection.sendText(text);
    }
  }, [modelType, geminiConnection]);

  const sendVideoFrameToGemini = useCallback(() => {
    if (modelType === 'gemini' && 'sendVideoFrame' in geminiConnection) {
      const frameData = mediaCapture.captureFrame();
      if (frameData) {
        geminiConnection.sendVideoFrame(frameData);
      }
    }
  }, [modelType, geminiConnection, mediaCapture]);

  const captureCurrentFrame = useCallback(() => {
    return mediaCapture.captureFrame();
  }, [mediaCapture]);

  // Cleanup on unmount - use useRef to avoid dependency issues
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;

  useEffect(() => {
    return () => {
      disconnectRef.current();
    };
  }, []); // Empty dependency array to only run on mount/unmount

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
    mediaCapture,
    // Expose last captured frame from OpenAI connection
    lastCapturedFrame: modelType === 'openai' ? openaiConnection.lastCapturedFrame : null
  };
}