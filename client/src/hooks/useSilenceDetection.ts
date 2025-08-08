
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
  workflowStateMachine?: any; // Reference to the workflow state machine
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
    workflowStateMachine
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
    if (!enabled) {
      console.log('🔇 WORKFLOW: startInitialAudioTimer called but disabled');
      return;
    }
    
    if (!onInitialAudioTrigger) {
      console.error('🔇 WORKFLOW: startInitialAudioTimer called but no onInitialAudioTrigger provided!');
      return;
    }
    
    console.log('🔇 WORKFLOW: startInitialAudioTimer called', { 
      enabled, 
      delay: initialAudioDelay,
      hasAudioTrigger: !!onInitialAudioTrigger 
    });
    
    clearTimers();
    setIsWaitingForInitialAudio(true);
    setInitialAudioTimer(initialAudioDelay);
    
    logger.debug('Starting initial audio timer', { delay: initialAudioDelay });
    console.log('🔇 WORKFLOW: Initial audio timer started, will fire in:', initialAudioDelay, 'ms');

    initialAudioTimerRef.current = setInterval(() => {
      setInitialAudioTimer(prev => {
        const newTimer = prev - 100;
        if (newTimer <= 0) {
          console.log('🔇 WORKFLOW: Initial audio timer COMPLETED - calling onInitialAudioTrigger');
          clearInterval(initialAudioTimerRef.current!);
          initialAudioTimerRef.current = null;
          setIsWaitingForInitialAudio(false);
          setInitialAudioTimer(0);
          
          try {
            onInitialAudioTrigger();
            logger.info('Initial audio timer completed and triggered audio');
          } catch (error) {
            console.error('🔇 WORKFLOW: Error calling onInitialAudioTrigger:', error);
          }
          
          return 0;
        }
        return newTimer;
      });
    }, 100);
  }, [enabled, initialAudioDelay, onInitialAudioTrigger, clearTimers, logger]);

  // Start silence timer (after audio ends)
  const startPageTurnTimer = useCallback(() => {
    if (!enabled) return;
    
    console.log('🔇 WORKFLOW: startPageTurnTimer called, enabled:', enabled);
    clearTimers();
    setIsDetectingSilence(true);
    setSilenceTimer(silenceDuration);
    
    logger.debug('Starting silence timer', { duration: silenceDuration });
    console.log('🔇 WORKFLOW: Page turn timer started, duration:', silenceDuration);

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

  // Note: OpenAI event handling is now done by useOpenAIEventTranslator
  // This hook focuses only on silence detection timers

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
  };
}
