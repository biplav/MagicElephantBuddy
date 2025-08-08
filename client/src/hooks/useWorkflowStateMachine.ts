
import { useState, useCallback, useEffect, useRef } from 'react';
import { createServiceLogger } from '@/lib/logger';

export type WorkflowState = 
  | 'LOADING'
  | 'APPU_SPEAKING' 
  | 'WAITING_FOR_AUDIO'
  | 'AUDIO_PLAYING'
  | 'AUDIO_PAUSED'
  | 'SILENCE_TIMING'
  | 'TURNING_PAGE'
  | 'ERROR'
  | 'IDLE';

interface WorkflowStateMachineOptions {
  onStateChange?: (state: WorkflowState) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

interface WorkflowContext {
  currentPage?: any;
  isLastPage?: boolean;
  pausePosition?: number;
  errorMessage?: string;
}

export function useWorkflowStateMachine(options: WorkflowStateMachineOptions = {}) {
  const logger = createServiceLogger('workflow-state-machine');
  
  const [currentState, setCurrentState] = useState<WorkflowState>('IDLE');
  const [context, setContext] = useState<WorkflowContext>({});
  const [isEnabled, setIsEnabled] = useState(options.enabled ?? true);
  
  // Component references for coordination
  const silenceDetectionRef = useRef<any>(null);
  const audioManagerRef = useRef<any>(null);
  const bookStateManagerRef = useRef<any>(null);
  
  // Internal state management
  const handleStateTransition = useCallback((newState: WorkflowState, newContext?: Partial<WorkflowContext>) => {
    const oldState = currentState;
    
    logger.info('State transition', { 
      from: oldState, 
      to: newState,
      context: newContext 
    });
    
    setCurrentState(newState);
    
    if (newContext) {
      setContext(prev => ({ ...prev, ...newContext }));
    }
    
    options.onStateChange?.(newState);
    
    // Handle state-specific logic
    switch (newState) {
      case 'WAITING_FOR_AUDIO':
        // Start initial audio timer
        if (silenceDetectionRef.current) {
          logger.debug('Starting initial audio timer');
          silenceDetectionRef.current.startInitialAudioTimer();
        }
        break;
        
      case 'AUDIO_PLAYING':
        // Audio is now playing, silence detection should be paused
        break;
        
      case 'AUDIO_PAUSED':
        // Audio paused due to speech interruption
        break;
        
      case 'SILENCE_TIMING':
        // Start page turn timer
        if (silenceDetectionRef.current) {
          logger.debug('Starting page turn timer');
          silenceDetectionRef.current.startPageTurnTimer();
        }
        break;
        
      case 'TURNING_PAGE':
        // Navigate to next page
        if (bookStateManagerRef.current) {
          logger.debug('Navigating to next page');
          bookStateManagerRef.current.navigateToNextPage();
        }
        break;
        
      case 'ERROR':
        options.onError?.(newContext?.errorMessage || 'Unknown error');
        break;
    }
  }, [currentState, logger, options]);
  
  // Event handlers for different components
  const handleAppuSpeakingStart = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('Appu started speaking');
    handleStateTransition('APPU_SPEAKING');
  }, [isEnabled, handleStateTransition, logger]);
  
  const handleAppuSpeakingStop = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('Appu stopped speaking');
    
    // Check if audio is already playing
    if (audioManagerRef.current?.isPlaying) {
      logger.debug('Audio already playing, staying in AUDIO_PLAYING state');
      handleStateTransition('AUDIO_PLAYING');
    } else {
      logger.debug('No audio playing, transitioning to WAITING_FOR_AUDIO');
      handleStateTransition('WAITING_FOR_AUDIO');
    }
  }, [isEnabled, handleStateTransition, logger]);
  
  const handleInitialAudioTrigger = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('Initial audio timer completed - triggering audio playback');
    
    // Command audio manager to play audio
    if (audioManagerRef.current?.playPageAudio) {
      audioManagerRef.current.playPageAudio();
    }
  }, [isEnabled, logger]);
  
  const handleAudioPlaybackStart = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('Audio playback started');
    handleStateTransition('AUDIO_PLAYING');
  }, [isEnabled, handleStateTransition, logger]);
  
  const handleAudioPlaybackEnd = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('Audio playback ended - starting silence timing');
    handleStateTransition('SILENCE_TIMING');
  }, [isEnabled, handleStateTransition, logger]);
  
  const handleUserSpeechStart = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('User started speaking');
    
    switch (currentState) {
      case 'AUDIO_PLAYING':
        // Pause audio and remember position
        if (audioManagerRef.current?.pauseAudio) {
          const position = audioManagerRef.current.pauseAudio();
          handleStateTransition('AUDIO_PAUSED', { pausePosition: position });
        }
        break;
        
      case 'WAITING_FOR_AUDIO':
      case 'SILENCE_TIMING':
        // Interrupt any running timers
        if (silenceDetectionRef.current?.interruptSilence) {
          silenceDetectionRef.current.interruptSilence();
        }
        handleStateTransition('IDLE');
        break;
    }
  }, [isEnabled, currentState, handleStateTransition, logger]);
  
  const handleUserSpeechEnd = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('User stopped speaking');
    
    switch (currentState) {
      case 'AUDIO_PAUSED':
        // Resume audio from where it was paused
        if (audioManagerRef.current?.resumeAudio && context.pausePosition) {
          audioManagerRef.current.resumeAudio(context.pausePosition);
          handleStateTransition('AUDIO_PLAYING');
        }
        break;
        
      case 'IDLE':
        // Return to appropriate state based on context
        if (context.currentPage) {
          handleStateTransition('WAITING_FOR_AUDIO');
        }
        break;
    }
  }, [isEnabled, currentState, context, handleStateTransition, logger]);
  
  const handleSilenceDetected = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('Silence detected - triggering page turn');
    
    if (context.isLastPage) {
      logger.info('Reached end of book');
      handleStateTransition('IDLE');
    } else {
      handleStateTransition('TURNING_PAGE');
    }
  }, [isEnabled, context.isLastPage, handleStateTransition, logger]);
  
  const handlePageNavigationComplete = useCallback((newPage: any) => {
    if (!isEnabled) return;
    logger.debug('Page navigation completed', { pageNumber: newPage?.pageNumber });
    
    setContext(prev => ({ 
      ...prev, 
      currentPage: newPage,
      isLastPage: newPage?.pageNumber >= newPage?.totalPages 
    }));
    
    // Wait for Appu to speak about the new page
    handleStateTransition('LOADING');
  }, [isEnabled, handleStateTransition]);
  
  const handleError = useCallback((error: string) => {
    logger.error('Workflow error', { error });
    handleStateTransition('ERROR', { errorMessage: error });
  }, [handleStateTransition, logger]);
  
  // Manual controls
  const resetWorkflow = useCallback(() => {
    logger.info('Resetting workflow to IDLE');
    setContext({});
    handleStateTransition('IDLE');
    
    // Reset all component states
    if (silenceDetectionRef.current?.resetSilenceDetection) {
      silenceDetectionRef.current.resetSilenceDetection();
    }
    if (audioManagerRef.current?.stopAudio) {
      audioManagerRef.current.stopAudio();
    }
  }, [handleStateTransition, logger]);
  
  const pauseWorkflow = useCallback(() => {
    logger.info('Pausing workflow');
    setIsEnabled(false);
    
    // Pause all active timers and audio
    if (silenceDetectionRef.current?.interruptSilence) {
      silenceDetectionRef.current.interruptSilence();
    }
    if (audioManagerRef.current?.pauseAudio) {
      audioManagerRef.current.pauseAudio();
    }
  }, [logger]);
  
  const resumeWorkflow = useCallback(() => {
    logger.info('Resuming workflow');
    setIsEnabled(true);
    
    // Resume based on current state
    if (currentState === 'AUDIO_PAUSED' && context.pausePosition) {
      if (audioManagerRef.current?.resumeAudio) {
        audioManagerRef.current.resumeAudio(context.pausePosition);
      }
    }
  }, [currentState, context.pausePosition, logger]);
  
  // Component registration
  const registerSilenceDetection = useCallback((silenceDetection: any) => {
    silenceDetectionRef.current = silenceDetection;
    logger.debug('Registered silence detection component');
  }, [logger]);
  
  const registerAudioManager = useCallback((audioManager: any) => {
    audioManagerRef.current = audioManager;
    logger.debug('Registered audio manager component');
  }, [logger]);
  
  const registerBookStateManager = useCallback((bookStateManager: any) => {
    bookStateManagerRef.current = bookStateManager;
    logger.debug('Registered book state manager component');
  }, [logger]);
  
  // Enable/disable based on options
  useEffect(() => {
    setIsEnabled(options.enabled ?? true);
  }, [options.enabled]);
  
  return {
    // Current state
    currentState,
    context,
    isEnabled,
    
    // Event handlers for components
    handleAppuSpeakingStart,
    handleAppuSpeakingStop,
    handleInitialAudioTrigger,
    handleAudioPlaybackStart,
    handleAudioPlaybackEnd,
    handleUserSpeechStart,
    handleUserSpeechEnd,
    handleSilenceDetected,
    handlePageNavigationComplete,
    handleError,
    
    // Manual controls
    resetWorkflow,
    pauseWorkflow,
    resumeWorkflow,
    setEnabled: setIsEnabled,
    
    // Component registration
    registerSilenceDetection,
    registerAudioManager,
    registerBookStateManager,
    
    // State checks
    isAppuSpeaking: currentState === 'APPU_SPEAKING',
    isAudioPlaying: currentState === 'AUDIO_PLAYING',
    isAudioPaused: currentState === 'AUDIO_PAUSED',
    isSilenceTiming: currentState === 'SILENCE_TIMING',
    isTurningPage: currentState === 'TURNING_PAGE',
    isWaitingForAudio: currentState === 'WAITING_FOR_AUDIO',
    hasError: currentState === 'ERROR',
    
    // Debug info
    getDebugInfo: () => ({
      state: currentState,
      context,
      isEnabled,
      hasComponents: {
        silenceDetection: !!silenceDetectionRef.current,
        audioManager: !!audioManagerRef.current,
        bookStateManager: !!bookStateManagerRef.current
      }
    })
  };
}
