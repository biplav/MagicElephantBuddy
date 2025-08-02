
import { useState, useEffect, useRef, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface SilenceDetectionOptions {
  silenceThreshold?: number; // dB threshold for silence detection
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
    silenceThreshold = -50, // dB
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

  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const silenceStartTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appuSpeakingRef = useRef<boolean>(false);

  // Initialize audio analysis
  const initializeAudioAnalysis = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      analyzerRef.current = audioContextRef.current.createAnalyser();
      analyzerRef.current.fftSize = 256;
      analyzerRef.current.smoothingTimeConstant = 0.8;
      
      source.connect(analyzerRef.current);
      
      const bufferLength = analyzerRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
      
      logger.info('Audio analysis initialized for silence detection');
      
      startAnalysis();
    } catch (error) {
      logger.error('Failed to initialize audio analysis', { error });
    }
  }, [logger]);

  // Calculate audio level
  const getAudioLevel = useCallback(() => {
    if (!analyzerRef.current || !dataArrayRef.current) return -100;
    
    analyzerRef.current.getByteFrequencyData(dataArrayRef.current);
    
    let sum = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      sum += dataArrayRef.current[i];
    }
    
    const average = sum / dataArrayRef.current.length;
    // Convert to approximate dB scale
    const dB = 20 * Math.log10(average / 255);
    
    return dB;
  }, []);

  // Start continuous audio analysis
  const startAnalysis = useCallback(() => {
    const analyze = () => {
      if (!state.isEnabled || appuSpeakingRef.current) {
        animationFrameRef.current = requestAnimationFrame(analyze);
        return;
      }

      const currentLevel = getAudioLevel();
      const isSilent = currentLevel < silenceThreshold;
      
      setState(prev => ({ ...prev, isSilent }));
      
      if (isSilent) {
        // Start silence detection if not already started
        if (!silenceStartTimeRef.current) {
          silenceStartTimeRef.current = Date.now();
          setState(prev => ({ ...prev, isDetectingSilence: true }));
          
          // Start countdown timer
          startSilenceTimer();
          
          logger.debug('Silence detected, starting timer', { currentLevel, threshold: silenceThreshold });
        }
      } else {
        // Speech detected - reset everything
        if (silenceStartTimeRef.current) {
          resetSilenceDetection();
          onSilenceInterrupted?.();
          logger.debug('Speech detected, resetting silence timer', { currentLevel });
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(analyze);
    };
    
    analyze();
  }, [state.isEnabled, silenceThreshold, getAudioLevel, onSilenceInterrupted, logger]);

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

  // Public methods to control Appu speaking state
  const setAppuSpeaking = useCallback((speaking: boolean) => {
    appuSpeakingRef.current = speaking;
    if (speaking) {
      // If Appu starts speaking, reset silence detection
      resetSilenceDetection();
      logger.debug('Appu started speaking, pausing silence detection');
    } else {
      logger.debug('Appu stopped speaking, resuming silence detection');
    }
  }, [resetSilenceDetection, logger]);

  // Enable/disable silence detection
  const setEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, isEnabled: enabled }));
    
    if (enabled && !analyzerRef.current) {
      initializeAudioAnalysis();
    } else if (!enabled) {
      resetSilenceDetection();
    }
    
    logger.info('Silence detection enabled state changed', { enabled });
  }, [initializeAudioAnalysis, resetSilenceDetection, logger]);

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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      resetSilenceDetection();
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [resetSilenceDetection]);

  // Initialize when enabled
  useEffect(() => {
    if (state.isEnabled && !analyzerRef.current) {
      initializeAudioAnalysis();
    }
  }, [state.isEnabled, initializeAudioAnalysis]);

  return {
    ...state,
    setEnabled,
    setAppuSpeaking,
    interruptSilence,
    resetSilenceDetection
  };
}
