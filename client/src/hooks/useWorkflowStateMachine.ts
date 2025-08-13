import { useState, useCallback, useEffect, useRef } from 'react';
import { createServiceLogger } from '@/lib/logger';

export type WorkflowState = 
  | 'LOADING'
  | 'APPU_SPEAKING' 
  | 'APPU_THINKING'
  | 'CHILD_SPEAKING'
  | 'APPU_SPEAKING_STOPPED'
  | 'CHILD_SPEAKING_STOPPED'
  | 'IDLE'
  | 'ERROR';

interface WorkflowStateMachineOptions {
  onStateChange?: (state: WorkflowState) => void;
  enabled?: boolean;
  openaiConnection?: any;
  autoIdleTimeoutMs?: number; // Default: 3000ms (3 seconds)
}

export function useWorkflowStateMachine(options: WorkflowStateMachineOptions = {}) {
  const logger = createServiceLogger('workflow-state-machine');

  const [currentState, setCurrentState] = useState<WorkflowState>('IDLE');
  const [isEnabled, setIsEnabled] = useState(options.enabled ?? true);
  
  // Auto-idle timer configuration and state
  const autoIdleTimeoutMs = options.autoIdleTimeoutMs ?? 3000; // Default 3 seconds
  const autoIdleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityTimeRef = useRef<number>(Date.now());

  // Auto-idle timer management
  const startAutoIdleTimer = useCallback(() => {
    // Clear any existing timer
    if (autoIdleTimerRef.current) {
      clearTimeout(autoIdleTimerRef.current);
    }

    // Don't start timer if disabled or already in IDLE/ERROR states
    if (!isEnabled || currentState === 'IDLE' || currentState === 'ERROR') {
      return;
    }

    logger.debug('⏰ Starting auto-idle timer', { 
      currentState, 
      timeoutMs: autoIdleTimeoutMs,
      enabled: isEnabled 
    });

    autoIdleTimerRef.current = setTimeout(() => {
      const timeSinceLastActivity = Date.now() - lastActivityTimeRef.current;
      
      logger.info('⏰ Auto-idle timer triggered', {
        currentState,
        timeSinceLastActivity,
        threshold: autoIdleTimeoutMs
      });

      // Only transition to IDLE if we're not already there and enough time has passed
      if (currentState !== 'IDLE' && currentState !== 'ERROR' && timeSinceLastActivity >= autoIdleTimeoutMs) {
        handleStateTransition('IDLE', 'auto-idle-timeout');
      }
    }, autoIdleTimeoutMs);
  }, [currentState, isEnabled, autoIdleTimeoutMs, logger]);

  const clearAutoIdleTimer = useCallback(() => {
    if (autoIdleTimerRef.current) {
      logger.debug('⏰ Clearing auto-idle timer');
      clearTimeout(autoIdleTimerRef.current);
      autoIdleTimerRef.current = null;
    }
  }, [logger]);

  const resetActivityTimer = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
    startAutoIdleTimer();
  }, [startAutoIdleTimer]);

  // Internal state management with enhanced monitoring
  const handleStateTransition = useCallback((newState: WorkflowState, context?: string) => {
    const oldState = currentState;

    if (oldState === newState) {
      // Don't transition to the same state unless it's an error
      if (newState !== 'ERROR') {
        logger.debug(`🔄 STATE IGNORED: Already in ${newState} state`);
        return;
      }
    }

    const timestamp = new Date().toISOString();
    const transitionInfo = {
      from: oldState,
      to: newState,
      timestamp,
      context: context || 'unknown',
      enabled: isEnabled
    };

    logger.info(`🔄 STATE TRANSITION: ${oldState} → ${newState}`, transitionInfo);
    console.log(`🔄 WORKFLOW STATE: ${oldState} → ${newState}`, {
      ...transitionInfo,
      duration: `${Date.now()}ms`
    });

    setCurrentState(newState);
    options.onStateChange?.(newState);

    // Manage auto-idle timer based on new state
    if (newState === 'IDLE' || newState === 'ERROR') {
      // Clear timer when reaching terminal states
      clearAutoIdleTimer();
    } else {
      // Reset activity timer for active states
      resetActivityTimer();
    }

    // Log state-specific information
    switch (newState) {
      case 'APPU_SPEAKING':
        console.log(`🔊 APPU: Started speaking (was ${oldState})`);
        break;
      case 'APPU_SPEAKING_STOPPED':
        console.log(`🔇 APPU: Stopped speaking (was ${oldState})`);
        break;
      case 'CHILD_SPEAKING':
        console.log(`🎤 CHILD: Started speaking (was ${oldState})`);
        break;
      case 'CHILD_SPEAKING_STOPPED':
        console.log(`🔇 CHILD: Stopped speaking (was ${oldState})`);
        break;
      case 'APPU_THINKING':
        console.log(`🤔 APPU: Processing/thinking (was ${oldState})`);
        break;
      case 'LOADING':
        console.log(`⏳ SYSTEM: Loading state (was ${oldState})`);
        break;
      case 'IDLE':
        console.log(`😴 SYSTEM: Idle state (was ${oldState})`);
        break;
      case 'ERROR':
        console.error(`❌ SYSTEM: Error state (was ${oldState})`);
        break;
    }
  }, [currentState, logger, options.onStateChange, isEnabled, clearAutoIdleTimer, resetActivityTimer]);

  // Event handlers for OpenAI events with enhanced context
  const handleAppuSpeakingStart = useCallback((context: string = 'openai-audio-start') => {
    if (!isEnabled) {
      logger.debug('🔊 Appu speaking start ignored (disabled)');
      return;
    }
    logger.debug('🔊 Appu started speaking', { context });
    handleStateTransition('APPU_SPEAKING', context);
  }, [isEnabled, handleStateTransition, logger]);

  const handleAppuSpeakingStop = useCallback((context: string = 'openai-audio-stop') => {
    if (!isEnabled) {
      logger.debug('🔇 Appu speaking stop ignored (disabled)');
      return;
    }
    logger.debug('🔇 Appu stopped speaking', { context });
    handleStateTransition('APPU_SPEAKING_STOPPED', context);
  }, [isEnabled, handleStateTransition, logger]);

  const handleAppuThinking = useCallback((context: string = 'openai-processing') => {
    if (!isEnabled) {
      logger.debug('🤔 Appu thinking ignored (disabled)');
      return;
    }
    logger.debug('🤔 Appu is thinking (processing)', { context });
    handleStateTransition('APPU_THINKING', context);
  }, [isEnabled, handleStateTransition, logger]);

  const handleChildSpeechStart = useCallback((context: string = 'openai-user-speech') => {
    if (!isEnabled) {
      logger.debug('🎤 Child speech start ignored (disabled)');
      return;
    }
    logger.debug('🎤 Child started speaking', { context });
    handleStateTransition('CHILD_SPEAKING', context);
  }, [isEnabled, handleStateTransition, logger]);

  const handleChildSpeechStop = useCallback((context: string = 'openai-user-speech-end') => {
    if (!isEnabled) {
      logger.debug('🔇 Child speech stop ignored (disabled)');
      return;
    }
    logger.debug('🔇 Child stopped speaking', { context });
    handleStateTransition('CHILD_SPEAKING_STOPPED', context);
  }, [isEnabled, handleStateTransition, logger]);

  const handleLoading = useCallback((context: string = 'system-loading') => {
    if (!isEnabled) {
      logger.debug('⏳ Loading ignored (disabled)');
      return;
    }
    logger.debug('⏳ Loading state', { context });
    handleStateTransition('LOADING', context);
  }, [isEnabled, handleStateTransition, logger]);

  const handleIdle = useCallback((context: string = 'system-idle') => {
    if (!isEnabled) {
      logger.debug('😴 Idle ignored (disabled)');
      return;
    }
    logger.debug('😴 Idle state', { context });
    handleStateTransition('IDLE', context);
  }, [isEnabled, handleStateTransition, logger]);

  const handleError = useCallback((errorMessage?: string, context: string = 'system-error') => {
    if (!isEnabled) {
      logger.debug('❌ Error ignored (disabled)');
      return;
    }
    logger.error('❌ Error state', { error: errorMessage, context });
    handleStateTransition('ERROR', `${context}: ${errorMessage || 'unknown error'}`);
  }, [isEnabled, handleStateTransition, logger]);

  // Note: OpenAI event handling is now done by useOpenAIEventTranslator

  // Manual controls
  const resetWorkflow = useCallback(() => {
    logger.info('🔄 Resetting workflow to IDLE');
    handleStateTransition('IDLE');
  }, [handleStateTransition, logger]);

  const setEnabled = useCallback((enabled: boolean) => {
    logger.info(`🔧 Setting workflow enabled: ${enabled}`);
    setIsEnabled(enabled);
    if (!enabled) {
      handleStateTransition('IDLE');
    }
  }, [handleStateTransition, logger]);

  // Enable/disable based on options
  useEffect(() => {
    setIsEnabled(options.enabled ?? true);
  }, [options.enabled]);

  // Cleanup auto-idle timer on unmount
  useEffect(() => {
    return () => {
      if (autoIdleTimerRef.current) {
        clearTimeout(autoIdleTimerRef.current);
      }
    };
  }, []);

  // Start auto-idle timer when enabled and not in terminal states
  useEffect(() => {
    if (isEnabled && currentState !== 'IDLE' && currentState !== 'ERROR') {
      startAutoIdleTimer();
    } else {
      clearAutoIdleTimer();
    }
  }, [isEnabled, currentState, startAutoIdleTimer, clearAutoIdleTimer]);

  return {
    // Current state
    currentState,
    isEnabled,

    // Manual event triggers (for testing or external use)
    handleAppuSpeakingStart,
    handleAppuSpeakingStop,
    handleAppuThinking,
    handleChildSpeechStart,
    handleChildSpeechStop,
    handleLoading,
    handleIdle,
    handleError,

    // Manual controls
    resetWorkflow,
    setEnabled,

    // Auto-idle timer controls
    startAutoIdleTimer,
    clearAutoIdleTimer,
    resetActivityTimer,

    // State checks (computed properties)
    isAppuSpeaking: currentState === 'APPU_SPEAKING',
    isAppuThinking: currentState === 'APPU_THINKING',
    isChildSpeaking: currentState === 'CHILD_SPEAKING',
    isAppuSpeakingStopped: currentState === 'APPU_SPEAKING_STOPPED',
    isChildSpeakingStopped: currentState === 'CHILD_SPEAKING_STOPPED',
    isLoading: currentState === 'LOADING',
    isIdle: currentState === 'IDLE',
    isError: currentState === 'ERROR',

    // Debug and monitoring info
    getDebugInfo: () => ({
      state: currentState,
      isEnabled,
      hasOpenAIConnection: !!options.openaiConnection,
      timestamp: new Date().toISOString(),
      autoIdleTimer: {
        timeoutMs: autoIdleTimeoutMs,
        isActive: !!autoIdleTimerRef.current,
        lastActivity: new Date(lastActivityTimeRef.current).toISOString(),
        timeSinceLastActivity: Date.now() - lastActivityTimeRef.current
      },
      stateChecks: {
        isAppuSpeaking: currentState === 'APPU_SPEAKING',
        isAppuThinking: currentState === 'APPU_THINKING',
        isChildSpeaking: currentState === 'CHILD_SPEAKING',
        isAppuSpeakingStopped: currentState === 'APPU_SPEAKING_STOPPED',
        isChildSpeakingStopped: currentState === 'CHILD_SPEAKING_STOPPED',
        isLoading: currentState === 'LOADING',
        isIdle: currentState === 'IDLE',
        isError: currentState === 'ERROR'
      }
    }),

    // Add state monitoring utility
    logCurrentState: () => {
      const debugInfo = {
        state: currentState,
        isEnabled,
        timestamp: new Date().toISOString(),
        uptime: Date.now()
      };
      logger.info('🔍 CURRENT WORKFLOW STATE', debugInfo);
      console.log('🔍 WORKFLOW STATE MONITOR:', debugInfo);
    }
  };
}