import { useState, useCallback, useEffect, useMemo } from 'react';
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
}

export default function useRealtimeAudio(options: UseRealtimeAudioOptions = {}) {
  const logger = useMemo(() => createServiceLogger('realtime-audio'), []);
  const modelType = options.modelType || 'openai';

  // Only log initialization once per component mount, not on every render
  const [hasInitialized, setHasInitialized] = useState(false);
  useEffect(() => {
    if (!hasInitialized) {
      logger.info('Initializing hook', { modelType, enableVideo: options.enableVideo });
      setHasInitialized(true);
    }
  }, [hasInitialized, logger, modelType, options.enableVideo]);

  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Memoize connection options to prevent unnecessary re-renders
  const openaiOptions = useMemo(() => ({
    onTranscriptionReceived: options.onTranscriptionReceived,
    onResponseReceived: options.onResponseReceived,
    onAudioResponseReceived: options.onAudioResponseReceived,
    onError: options.onError,
    enableVideo: options.enableVideo
  }), [options.onTranscriptionReceived, options.onResponseReceived, options.onAudioResponseReceived, options.onError, options.enableVideo]);

  const geminiOptions = useMemo(() => ({
    onTranscriptionReceived: options.onTranscriptionReceived,
    onResponseReceived: options.onResponseReceived,
    onError: options.onError
  }), [options.onTranscriptionReceived, options.onResponseReceived, options.onError]);

  const mediaCaptureOptions = useMemo(() => ({
    enableVideo: options.enableVideo
  }), [options.enableVideo]);

  // Initialize connection hooks with memoized options
  const openaiConnection = useOpenAIConnection(openaiOptions);
  const geminiConnection = useGeminiConnection(geminiOptions);
  const mediaCapture = useMediaCapture(mediaCaptureOptions);

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
    conversationId: 'conversationId' in activeConnection ? activeConnection.conversationId : undefined
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
      logger.error('Microphone permission denied:', error);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

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
    isReady: state.isConnected
  };
}