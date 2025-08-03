import { useState, useEffect, useRef, useCallback } from 'react';
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
  const logger = createServiceLogger('silence-detection');

  const {
    silenceDuration = 3000, // 3 seconds
    onSilenceDetected,
    onSilenceInterrupted,
    enabled = false,
    openaiConnection
  } = options;

  const [state, setState] = useState<SilenceDetectionState>({
    isDetectingSilence: false,
    isSilent: false,
    silenceTimer: 0,
    isEnabled: enabled
  });

  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const silenceStartTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appuSpeakingRef = useRef<boolean>(false);
  const userSpeakingRef = useRef<boolean>(false);

  // Start the countdown timer and update UI
  const startSilenceTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    const startTime = Date.now();

    timerIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, silenceDuration - elapsed);

      setState(prev => ({ ...prev, silenceTimer: remaining }));

      if (remaining <= 0) {
        // Silence duration completed
        clearInterval(timerIntervalRef.current!);
        onSilenceDetected?.();
        resetSilenceDetection();
        logger.info('Silence timer completed, triggering page advance');
      }
    }, 100); // Update timer every 100ms for smooth countdown
  }, [silenceDuration, onSilenceDetected, logger]);

  // Reset silence detection state
  const resetSilenceDetection = useCallback(() => {
    silenceStartTimeRef.current = null;

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isDetectingSilence: false,
      silenceTimer: 0
    }));
  }, []);

  // Check if we should start silence detection
  const checkSilenceState = useCallback(() => {
    if (!state.isEnabled) return;

    const isTrulySilent = !appuSpeakingRef.current && !userSpeakingRef.current;

    setState(prev => ({ ...prev, isSilent: isTrulySilent }));

    if (isTrulySilent) {
      // Start silence detection if not already started
      if (!silenceStartTimeRef.current) {
        silenceStartTimeRef.current = Date.now();
        setState(prev => ({ ...prev, isDetectingSilence: true }));

        // Start countdown timer
        startSilenceTimer();

        logger.debug('True silence detected (neither Appu nor user speaking), starting timer');
      }
    } else {
      // Either Appu or user is speaking - reset everything
      if (silenceStartTimeRef.current) {
        resetSilenceDetection();
        onSilenceInterrupted?.();
        logger.debug('Speech detected, resetting silence timer', { 
          appuSpeaking: appuSpeakingRef.current, 
          userSpeaking: userSpeakingRef.current 
        });
      }
    }
  }, [state.isEnabled, startSilenceTimer, resetSilenceDetection, onSilenceInterrupted, logger]);

  // Public methods to control Appu speaking state
  const setAppuSpeaking = useCallback((speaking: boolean) => {
    appuSpeakingRef.current = speaking;
    logger.debug('Appu speaking state changed', { speaking });
    checkSilenceState();
  }, [checkSilenceState, logger]);

  // Public methods to control user speaking state (called from OpenAI events)
  const setUserSpeaking = useCallback((speaking: boolean) => {
    userSpeakingRef.current = speaking;
    logger.debug('User speaking state changed', { speaking });
    checkSilenceState();
  }, [checkSilenceState, logger]);

  // Enable/disable silence detection
  const setEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, isEnabled: enabled }));

    if (!enabled) {
      resetSilenceDetection();
    }

    logger.info('Silence detection enabled state changed', { enabled });
  }, [resetSilenceDetection, logger]);

  // Manually interrupt silence detection (for external triggers)
  const interruptSilence = useCallback(() => {
    if (state.isDetectingSilence) {
      resetSilenceDetection();
      onSilenceInterrupted?.();
      logger.debug('Silence detection manually interrupted');
    }
  }, [state.isDetectingSilence, resetSilenceDetection, onSilenceInterrupted, logger]);

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
          if (!appuSpeakingRef.current) {
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
    // We'll add the event listener here
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

  // Update enabled state when prop changes
  useEffect(() => {
    setState(prev => ({ ...prev, isEnabled: enabled }));
  }, [enabled]);

  return {
    ...state,
    setEnabled,
    setAppuSpeaking,
    setUserSpeaking, // Keep for manual control if needed
    interruptSilence,
    resetSilenceDetection
  };
}