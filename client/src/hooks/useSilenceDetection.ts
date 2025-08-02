import { useState, useEffect, useRef, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface SilenceDetectionOptions {
  silenceDuration?: number; // milliseconds of silence before triggering
  onSilenceDetected?: () => void;
  onSilenceInterrupted?: () => void;
  enabled?: boolean;
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
    enabled = false
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
    setUserSpeaking, // New method for OpenAI events
    interruptSilence,
    resetSilenceDetection
  };
}