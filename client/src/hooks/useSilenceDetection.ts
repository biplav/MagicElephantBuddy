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
    appuSpeaking: false,
    userSpeaking: false,
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

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Batch UI update
    setUIState(prev => ({
      ...prev,
      isDetectingSilence: false,
      silenceTimer: 0
    }));
  }, []);

  // Start silence timer - stable function
  const startSilenceTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    const startTime = Date.now();

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

  // Core silence state checker - stable and efficient
  const checkSilenceState = useCallback(() => {
    if (!internalState.current.isEnabled) return;

    const isTrulySilent = !internalState.current.appuSpeaking && !internalState.current.userSpeaking;
    const wasDetecting = internalState.current.isDetectingSilence;
    const wasSilent = internalState.current.isSilent;

    // Update internal state
    internalState.current.isSilent = isTrulySilent;

    // Only update UI if something actually changed
    const uiNeedsUpdate = wasSilent !== isTrulySilent || wasDetecting !== internalState.current.isDetectingSilence;

    if (isTrulySilent) {
      // Start silence detection if not already started
      if (!internalState.current.silenceStartTime) {
        internalState.current.silenceStartTime = Date.now();
        internalState.current.isDetectingSilence = true;

        // Start countdown timer
        startSilenceTimer();

        logger.debug('True silence detected (neither Appu nor user speaking), starting timer');
        
        // Update UI
        setUIState(prev => ({
          ...prev,
          isSilent: true,
          isDetectingSilence: true
        }));
      } else if (uiNeedsUpdate) {
        // Just update silence state if needed
        setUIState(prev => ({ ...prev, isSilent: true }));
      }
    } else {
      // Either Appu or user is speaking - reset everything
      if (internalState.current.silenceStartTime) {
        resetSilenceDetection();
        callbacksRef.current.onSilenceInterrupted?.();
        logger.debug('Speech detected, resetting silence timer', { 
          appuSpeaking: internalState.current.appuSpeaking, 
          userSpeaking: internalState.current.userSpeaking 
        });
      } else if (uiNeedsUpdate) {
        // Just update silence state if needed
        setUIState(prev => ({ ...prev, isSilent: false }));
      }
    }
  }, [startSilenceTimer, resetSilenceDetection, logger]);

  // Stable public methods
  const setAppuSpeaking = useCallback((speaking: boolean) => {
    if (internalState.current.appuSpeaking === speaking) return; // Prevent unnecessary updates
    
    internalState.current.appuSpeaking = speaking;
    logger.debug('Appu speaking state changed', { speaking });
    checkSilenceState();
  }, [checkSilenceState, logger]);

  const setUserSpeaking = useCallback((speaking: boolean) => {
    if (internalState.current.userSpeaking === speaking) return; // Prevent unnecessary updates
    
    internalState.current.userSpeaking = speaking;
    logger.debug('User speaking state changed', { speaking });
    checkSilenceState();
  }, [checkSilenceState, logger]);

  const setEnabled = useCallback((enabled: boolean) => {
    if (internalState.current.isEnabled === enabled) return; // Prevent unnecessary updates
    
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
      logger.debug('OpenAI event received for silence detection', { 
        eventType: event.type,
        hasData: !!event.data 
      });

      switch (event.type) {
        case 'input_audio_buffer.speech_started':
          logger.debug('User speech started - interrupting silence');
          setUserSpeaking(true);
          break;
          
        case 'input_audio_buffer.speech_stopped':
          logger.debug('User speech stopped');
          setUserSpeaking(false);
          break;
          
        case 'response.audio.delta':
          // Appu is speaking when we receive audio deltas
          if (!internalState.current.appuSpeaking) {
            logger.debug('Appu speech started (audio delta received)');
            setAppuSpeaking(true);
          }
          break;
          
        case 'response.done':
          // Appu finished speaking when response is complete
          logger.debug('Appu speech ended (response done)');
          setAppuSpeaking(false);
          break;
          
        case 'conversation.item.input_audio_transcription.completed':
          // Additional confirmation that user speech has ended
          logger.debug('User transcription completed - speech ended');
          setUserSpeaking(false);
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
  }, [openaiConnection, enabled, setUserSpeaking, setAppuSpeaking, logger]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetSilenceDetection();
    };
  }, [resetSilenceDetection]);

  return silenceDetectionAPI;
}