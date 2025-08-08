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
}

export function useWorkflowStateMachine(options: WorkflowStateMachineOptions = {}) {
  const logger = createServiceLogger('workflow-state-machine');

  const [currentState, setCurrentState] = useState<WorkflowState>('IDLE');
  const [isEnabled, setIsEnabled] = useState(options.enabled ?? true);

  // Internal state management
  const handleStateTransition = useCallback((newState: WorkflowState) => {
    const oldState = currentState;

    if (oldState === newState) {
      // Don't transition to the same state
      return;
    }

    logger.info(`🔄 STATE TRANSITION: ${oldState} → ${newState}`);
    console.log(`🔄 WORKFLOW STATE: ${oldState} → ${newState}`);

    setCurrentState(newState);
    options.onStateChange?.(newState);
  }, [currentState, logger, options.onStateChange]);

  // Event handlers for OpenAI events
  const handleAppuSpeakingStart = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('🔊 Appu started speaking');
    handleStateTransition('APPU_SPEAKING');
  }, [isEnabled, handleStateTransition, logger]);

  const handleAppuSpeakingStop = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('🔇 Appu stopped speaking');
    handleStateTransition('APPU_SPEAKING_STOPPED');
  }, [isEnabled, handleStateTransition, logger]);

  const handleAppuThinking = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('🤔 Appu is thinking (processing)');
    handleStateTransition('APPU_THINKING');
  }, [isEnabled, handleStateTransition, logger]);

  const handleChildSpeechStart = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('🎤 Child started speaking');
    handleStateTransition('CHILD_SPEAKING');
  }, [isEnabled, handleStateTransition, logger]);

  const handleChildSpeechStop = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('🔇 Child stopped speaking');
    handleStateTransition('CHILD_SPEAKING_STOPPED');
  }, [isEnabled, handleStateTransition, logger]);

  const handleLoading = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('⏳ Loading state');
    handleStateTransition('LOADING');
  }, [isEnabled, handleStateTransition, logger]);

  const handleIdle = useCallback(() => {
    if (!isEnabled) return;
    logger.debug('😴 Idle state');
    handleStateTransition('IDLE');
  }, [isEnabled, handleStateTransition, logger]);

  const handleError = useCallback((errorMessage?: string) => {
    if (!isEnabled) return;
    logger.error('❌ Error state', { error: errorMessage });
    handleStateTransition('ERROR');
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

    // State checks (computed properties)
    isAppuSpeaking: currentState === 'APPU_SPEAKING',
    isAppuThinking: currentState === 'APPU_THINKING',
    isChildSpeaking: currentState === 'CHILD_SPEAKING',
    isAppuSpeakingStopped: currentState === 'APPU_SPEAKING_STOPPED',
    isChildSpeakingStopped: currentState === 'CHILD_SPEAKING_STOPPED',
    isLoading: currentState === 'LOADING',
    isIdle: currentState === 'IDLE',
    isError: currentState === 'ERROR',

    // Debug info
    getDebugInfo: () => ({
      state: currentState,
      isEnabled,
      hasOpenAIConnection: !!options.openaiConnection
    })
  };
}