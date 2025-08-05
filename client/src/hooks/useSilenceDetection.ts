
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface SilenceDetectionOptions {
  silenceDuration?: number; // milliseconds of silence before triggering
  onSilenceDetected?: () => void;
  onSilenceInterrupted?: () => void;
  enabled?: boolean;
  openaiConnection?: any; // OpenAI connection instance to listen to events
}

interface SilenceDetectionState {
  isDetectingSilence: boolean;
  isSilent: boolean;
  silenceTimer: number; // remaining time in ms
  isEnabled: boolean;
}

export function useSilenceDetection(options: SilenceDetectionOptions = {}) {
  const logger = useMemo(() => createServiceLogger('silence-detection'), []);

  const {
    silenceDuration = 3000, // 3 seconds
    onSilenceDetected,
    onSilenceInterrupted,
    enabled = false,
    openaiConnection
  } = options;

  // UI state - only for things that need to trigger re-renders
  const [uiState, setUIState] = useState<SilenceDetectionState>({
    isDetectingSilence: false,
    isSilent: false,
    silenceTimer: 0,
    isEnabled: enabled
  });

  // Internal state - using refs for performance
  const internalState = useRef({
    isDetectingSilence: false,
    isSilent: false,
    isEnabled: enabled,
    silenceStartTime: null as number | null
  });

  // Timer refs
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Stable callback refs - these won't change unless the actual functions change
  const callbacksRef = useRef({
    onSilenceDetected,
    onSilenceInterrupted
  });

  // Update callback refs when they change
  useEffect(() => {
    callbacksRef.current = {
      onSilenceDetected,
      onSilenceInterrupted
    };
  }, [onSilenceDetected, onSilenceInterrupted]);

  // Update enabled state
  useEffect(() => {
    internalState.current.isEnabled = enabled;
    setUIState(prev => ({ ...prev, isEnabled: enabled }));
  }, [enabled]);

  // Reset silence detection - stable function
  const resetSilenceDetection = useCallback(() => {
    internalState.current.silenceStartTime = null;
    internalState.current.isDetectingSilence = false;
    internalState.current.isSilent = false;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Batch UI update
    setUIState(prev => ({
      ...prev,
      isDetectingSilence: false,
      isSilent: false,
      silenceTimer: 0
    }));

    logger.debug('Silence detection reset');
  }, [logger]);

  // Start silence timer - stable function
  const startSilenceTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    const startTime = Date.now();
    internalState.current.silenceStartTime = startTime;
    internalState.current.isDetectingSilence = true;
    internalState.current.isSilent = true;

    logger.debug('Starting silence timer');

    // Update UI to show timer started
    setUIState(prev => ({
      ...prev,
      isDetectingSilence: true,
      isSilent: true,
      silenceTimer: silenceDuration
    }));

    timerIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, silenceDuration - elapsed);

      // Update only the timer in UI
      setUIState(prev => ({ ...prev, silenceTimer: remaining }));

      if (remaining <= 0) {
        // Silence duration completed
        clearInterval(timerIntervalRef.current!);
        timerIntervalRef.current = null;
        
        // Reset internal state
        internalState.current.isDetectingSilence = false;
        internalState.current.silenceStartTime = null;
        
        // Update UI
        setUIState(prev => ({
          ...prev,
          isDetectingSilence: false,
          silenceTimer: 0
        }));

        // Trigger callback
        callbacksRef.current.onSilenceDetected?.();
        logger.info('Silence timer completed, triggering page advance');
      }
    }, 100); // Update timer every 100ms for smooth countdown
  }, [silenceDuration, logger]);

  // Stable public methods for backward compatibility (now simplified)
  const setAppuSpeaking = useCallback((speaking: boolean) => {
    // This is now handled by OpenAI events, but keeping for compatibility
    logger.debug('setAppuSpeaking called (legacy)', { speaking });
  }, [logger]);

  const setUserSpeaking = useCallback((speaking: boolean) => {
    // This is now handled by OpenAI events, but keeping for compatibility
    logger.debug('setUserSpeaking called (legacy)', { speaking });
  }, [logger]);

  const setEnabled = useCallback((enabled: boolean) => {
    if (internalState.current.isEnabled === enabled) return;
    
    internalState.current.isEnabled = enabled;
    setUIState(prev => ({ ...prev, isEnabled: enabled }));

    if (!enabled) {
      resetSilenceDetection();
    }

    logger.info('Silence detection enabled state changed', { enabled });
  }, [resetSilenceDetection, logger]);

  const interruptSilence = useCallback(() => {
    if (internalState.current.isDetectingSilence) {
      resetSilenceDetection();
      callbacksRef.current.onSilenceInterrupted?.();
      logger.debug('Silence detection manually interrupted');
    }
  }, [resetSilenceDetection, logger]);

  // Stable API object - only recreated when UI state actually changes
  const silenceDetectionAPI = useMemo(() => ({
    ...uiState,
    setEnabled,
    setAppuSpeaking,
    setUserSpeaking,
    interruptSilence,
    resetSilenceDetection
  }), [uiState, setEnabled, setAppuSpeaking, setUserSpeaking, interruptSilence, resetSilenceDetection]);

  // Listen to OpenAI Realtime API events for automatic speech detection
  useEffect(() => {
    if (!openaiConnection || !enabled) return;

    // Create event listeners for OpenAI events
    const handleOpenAIEvent = (event: any) => {
      if (!internalState.current.isEnabled) return;

      logger.debug('OpenAI event received for silence detection', { 
        eventType: event.type,
        hasData: !!event.data 
      });

      switch (event.type) {
        case 'output_audio_buffer.stopped':
          // Appu finished speaking - start silence timer
          logger.debug('Appu finished speaking (output_audio_buffer.stopped) - starting silence timer');
          startSilenceTimer();
          break;
          
        case 'input_audio_buffer.speech_started':
          // User started speaking - reset/interrupt silence timer
          logger.debug('User speech started (input_audio_buffer.speech_started) - resetting silence timer');
          if (internalState.current.isDetectingSilence) {
            resetSilenceDetection();
            callbacksRef.current.onSilenceInterrupted?.();
          }
          break;
      }
    };

    // If openaiConnection has an event emitter or similar mechanism
    if (openaiConnection.addEventListener) {
      openaiConnection.addEventListener('message', handleOpenAIEvent);
    } else if (openaiConnection.on) {
      openaiConnection.on('event', handleOpenAIEvent);
    }

    // Cleanup function
    return () => {
      if (openaiConnection.removeEventListener) {
        openaiConnection.removeEventListener('message', handleOpenAIEvent);
      } else if (openaiConnection.off) {
        openaiConnection.off('event', handleOpenAIEvent);
      }
    };
  }, [openaiConnection, enabled, startSilenceTimer, resetSilenceDetection, logger]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetSilenceDetection();
    };
  }, [resetSilenceDetection]);

  return silenceDetectionAPI;
}
