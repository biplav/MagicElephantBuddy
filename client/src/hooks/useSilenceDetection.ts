
import { useState, useEffect, useRef, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface SilenceDetectionOptions {
  silenceDuration?: number;
  initialAudioDelay?: number;
  onSilenceDetected?: () => void;
  onSilenceInterrupted?: () => void;
  onInitialAudioTrigger?: () => void;
  enabled?: boolean;
  openaiConnection?: any;
  isPlayingAudio?: boolean;
}

export function useSilenceDetection(options: SilenceDetectionOptions = {}) {
  const {
    silenceDuration = 3000,
    initialAudioDelay = 1000,
    onSilenceDetected,
    onSilenceInterrupted,
    onInitialAudioTrigger,
    enabled = false,
    openaiConnection,
    isPlayingAudio = false
  } = options;

  const logger = createServiceLogger('silence-detection');
  
  // Simple state
  const [isDetectingSilence, setIsDetectingSilence] = useState(false);
  const [silenceTimer, setSilenceTimer] = useState(0);
  const [isWaitingForInitialAudio, setIsWaitingForInitialAudio] = useState(false);
  const [initialAudioTimer, setInitialAudioTimer] = useState(0);

  // Timer refs
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialAudioTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (initialAudioTimerRef.current) {
      clearInterval(initialAudioTimerRef.current);
      initialAudioTimerRef.current = null;
    }
    setIsDetectingSilence(false);
    setSilenceTimer(0);
    setIsWaitingForInitialAudio(false);
    setInitialAudioTimer(0);
  }, []);

  // Start initial audio timer (after Appu stops speaking)
  const startInitialAudioTimer = useCallback(() => {
    if (!enabled) return;
    
    clearTimers();
    setIsWaitingForInitialAudio(true);
    setInitialAudioTimer(initialAudioDelay);
    
    logger.debug('Starting initial audio timer', { delay: initialAudioDelay });

    initialAudioTimerRef.current = setInterval(() => {
      setInitialAudioTimer(prev => {
        const newTimer = prev - 100;
        if (newTimer <= 0) {
          clearInterval(initialAudioTimerRef.current!);
          initialAudioTimerRef.current = null;
          setIsWaitingForInitialAudio(false);
          setInitialAudioTimer(0);
          onInitialAudioTrigger?.();
          logger.info('Initial audio timer completed');
          return 0;
        }
        return newTimer;
      });
    }, 100);
  }, [enabled, initialAudioDelay, onInitialAudioTrigger, clearTimers, logger]);

  // Start silence timer (after audio ends)
  const startPageTurnTimer = useCallback(() => {
    if (!enabled) return;
    
    clearTimers();
    setIsDetectingSilence(true);
    setSilenceTimer(silenceDuration);
    
    logger.debug('Starting silence timer', { duration: silenceDuration });

    silenceTimerRef.current = setInterval(() => {
      setSilenceTimer(prev => {
        const newTimer = prev - 100;
        if (newTimer <= 0) {
          clearInterval(silenceTimerRef.current!);
          silenceTimerRef.current = null;
          setIsDetectingSilence(false);
          setSilenceTimer(0);
          onSilenceDetected?.();
          logger.info('Silence timer completed');
          return 0;
        }
        return newTimer;
      });
    }, 100);
  }, [enabled, silenceDuration, onSilenceDetected, clearTimers, logger]);

  // Interrupt silence
  const interruptSilence = useCallback(() => {
    if (isDetectingSilence) {
      clearTimers();
      onSilenceInterrupted?.();
      logger.debug('Silence interrupted');
    }
  }, [isDetectingSilence, clearTimers, onSilenceInterrupted, logger]);

  // Listen to OpenAI events
  useEffect(() => {
    if (!openaiConnection || !enabled) return;

    const handleOpenAIEvent = (event: any) => {
      if (!enabled) return;

      switch (event.type) {
        case 'output_audio_buffer.stopped':
          if (!isPlayingAudio) {
            logger.debug('Appu stopped speaking - starting initial audio timer');
            startInitialAudioTimer();
          }
          break;

        case 'input_audio_buffer.speech_started':
          logger.debug('User started speaking - interrupting timers');
          interruptSilence();
          break;
      }
    };

    if (openaiConnection.addEventListener) {
      openaiConnection.addEventListener('message', handleOpenAIEvent);
    } else if (openaiConnection.on) {
      openaiConnection.on('event', handleOpenAIEvent);
    }

    return () => {
      if (openaiConnection.removeEventListener) {
        openaiConnection.removeEventListener('message', handleOpenAIEvent);
      } else if (openaiConnection.off) {
        openaiConnection.off('event', handleOpenAIEvent);
      }
    };
  }, [openaiConnection, enabled, isPlayingAudio, startInitialAudioTimer, interruptSilence, logger]);

  // Clear timers when disabled or unmounted
  useEffect(() => {
    if (!enabled) {
      clearTimers();
    }
    return clearTimers;
  }, [enabled, clearTimers]);

  // Public API
  return {
    isDetectingSilence,
    isSilent: isDetectingSilence,
    silenceTimer,
    isEnabled: enabled,
    isWaitingForInitialAudio,
    initialAudioTimer,
    startPageTurnTimer,
    startInitialAudioTimer,
    interruptSilence,
    resetSilenceDetection: clearTimers,
    // Legacy methods for backward compatibility
    setEnabled: () => {}, 
    setAppuSpeaking: () => {},
    setUserSpeaking: () => {}
  };
}
