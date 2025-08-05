import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface SilenceDetectionOptions {
  silenceDuration?: number; // milliseconds of silence before triggering page turn
  initialAudioDelay?: number; // milliseconds to wait after Appu stops before playing audio
  onSilenceDetected?: () => void;
  onSilenceInterrupted?: () => void;
  onInitialAudioTrigger?: () => void; // Called when initial audio should play
  enabled?: boolean;
  openaiConnection?: any; // OpenAI connection instance to listen to events
  isPlayingAudio?: boolean; // Whether page audio is currently playing
}

interface SilenceDetectionState {
  isDetectingSilence: boolean;
  isSilent: boolean;
  silenceTimer: number; // remaining time in ms
  isEnabled: boolean;
  isWaitingForInitialAudio: boolean; // waiting for initial audio after Appu stops
  initialAudioTimer: number; // remaining time for initial audio delay
}

export function useSilenceDetection(options: SilenceDetectionOptions = {}) {
  const logger = useMemo(() => createServiceLogger('silence-detection'), []);

  const {
    silenceDuration = 3000, // 3 seconds
    initialAudioDelay = 1000, // 1 second
    onSilenceDetected,
    onSilenceInterrupted,
    onInitialAudioTrigger,
    enabled = false,
    openaiConnection,
    isPlayingAudio = false
  } = options;

  // UI state - only for things that need to trigger re-renders
  const [uiState, setUIState] = useState<SilenceDetectionState>({
    isDetectingSilence: false,
    isSilent: false,
    silenceTimer: 0,
    isEnabled: enabled,
    isWaitingForInitialAudio: false,
    initialAudioTimer: 0
  });

  // Internal state - using refs for performance
  const internalState = useRef({
    isDetectingSilence: false,
    isSilent: false,
    isEnabled: enabled,
    silenceStartTime: null as number | null,
    isWaitingForInitialAudio: false,
    initialAudioStartTime: null as number | null
  });

  // Timer refs
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialAudioTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Stable callback refs - these won't change unless the actual functions change
  const callbacksRef = useRef({
    onSilenceDetected,
    onSilenceInterrupted,
    onInitialAudioTrigger
  });

  // Update callback refs when they change
  useEffect(() => {
    callbacksRef.current = {
      onSilenceDetected,
      onSilenceInterrupted,
      onInitialAudioTrigger
    };
  }, [onSilenceDetected, onSilenceInterrupted, onInitialAudioTrigger]);

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
    internalState.current.isWaitingForInitialAudio = false;
    internalState.current.initialAudioStartTime = null;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (initialAudioTimerRef.current) {
      clearInterval(initialAudioTimerRef.current);
      initialAudioTimerRef.current = null;
    }

    // Batch UI update
    setUIState(prev => ({
      ...prev,
      isDetectingSilence: false,
      isSilent: false,
      silenceTimer: 0,
      isWaitingForInitialAudio: false,
      initialAudioTimer: 0
    }));

    logger.debug('Silence detection reset');
  }, [logger]);

  // Start initial audio timer - stable function
  const startInitialAudioTimer = useCallback(() => {
    if (initialAudioTimerRef.current) {
      clearInterval(initialAudioTimerRef.current);
    }

    const startTime = Date.now();
    internalState.current.initialAudioStartTime = startTime;
    internalState.current.isWaitingForInitialAudio = true;

    logger.debug('Starting initial audio timer', { delay: initialAudioDelay });

    // Update UI to show initial audio timer started
    setUIState(prev => ({
      ...prev,
      isWaitingForInitialAudio: true,
      initialAudioTimer: initialAudioDelay
    }));

    initialAudioTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, initialAudioDelay - elapsed);

      // Update only the timer in UI
      setUIState(prev => ({ ...prev, initialAudioTimer: remaining }));

      if (remaining <= 0) {
        // Initial audio delay completed
        clearInterval(initialAudioTimerRef.current!);
        initialAudioTimerRef.current = null;

        // Reset internal state
        internalState.current.isWaitingForInitialAudio = false;
        internalState.current.initialAudioStartTime = null;

        // Update UI
        setUIState(prev => ({
          ...prev,
          isWaitingForInitialAudio: false,
          initialAudioTimer: 0
        }));

        // Trigger initial audio callback
        callbacksRef.current.onInitialAudioTrigger?.();
        logger.info('Initial audio timer completed, triggering audio playback');
      }
    }, 100); // Update timer every 100ms for smooth countdown
  }, [initialAudioDelay, logger]);

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

  // Start page turn timer after audio ends
  const startPageTurnTimer = useCallback(() => {
    logger.debug('Starting page turn timer after audio ended');
    startSilenceTimer();
  }, [startSilenceTimer, logger]);

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
    resetSilenceDetection,
    startPageTurnTimer,
    startInitialAudioTimer
  }), [uiState, setEnabled, setAppuSpeaking, setUserSpeaking, interruptSilence, resetSilenceDetection, startPageTurnTimer, startInitialAudioTimer]);

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
          // Appu finished speaking - start initial audio timer if audio isn't already playing
          if (!isPlayingAudio) {
            logger.debug('Appu finished speaking (output_audio_buffer.stopped) - starting initial audio timer');
            startInitialAudioTimer();
          } else {
            logger.debug('Appu finished speaking but audio is already playing - no action needed');
          }
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
  }, [openaiConnection, enabled, startSilenceTimer, startInitialAudioTimer, resetSilenceDetection, isPlayingAudio, logger]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetSilenceDetection();
    };
  }, [resetSilenceDetection]);

  return silenceDetectionAPI;
}