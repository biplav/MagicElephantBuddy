
import { useEffect, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface OpenAIEventTranslatorOptions {
  openaiConnection?: any;
  workflowStateMachine?: any;
  enabled?: boolean;
}

export function useOpenAIEventTranslator(options: OpenAIEventTranslatorOptions = {}) {
  const logger = createServiceLogger('openai-event-translator');
  const { openaiConnection, workflowStateMachine, enabled = true } = options;

  const translateOpenAIEvent = useCallback((event: any) => {
    if (!enabled || !workflowStateMachine) {
      logger.debug('🔄 Event translation skipped', { 
        enabled, 
        hasWorkflowStateMachine: !!workflowStateMachine 
      });
      return;
    }

    const eventInfo = {
      eventType: event.type,
      currentState: workflowStateMachine.currentState,
      timestamp: new Date().toISOString(),
      enabled
    };

    logger.debug('🔄 Translating OpenAI event to workflow state', eventInfo);
    console.log('🔄 OPENAI EVENT:', eventInfo);

    switch (event.type) {

      // Session and connection events
      case 'session.created':
        logger.info('📡 OpenAI session created');
        workflowStateMachine.handleLoading();
        break;

      case 'session.updated':
        logger.info('📡 OpenAI session updated');
        // Stay in current state or transition to IDLE if appropriate
        if (workflowStateMachine.currentState === 'LOADING') {
          workflowStateMachine.handleIdle();
        }
        break;

      // Appu (AI) speaking events
      case 'output_audio_buffer.started':
        logger.info('🔊 Appu started speaking (audio output started)');
        workflowStateMachine.handleAppuSpeakingStart();
        break;

      case 'output_audio_buffer.stopped':
        logger.info('🔇 Appu stopped speaking (audio output stopped)');
        workflowStateMachine.handleAppuSpeakingStop();
        break;

      case 'response.audio.delta':
        // Ensure we're in speaking state when receiving audio
        if (workflowStateMachine.currentState !== 'APPU_SPEAKING') {
          logger.info('🔊 Appu speaking (receiving audio delta)');
          workflowStateMachine.handleAppuSpeakingStart();
        }
        break;

      // Child (user) speaking events
      case 'input_audio_buffer.speech_started':
        logger.info('🎤 Child started speaking');
        workflowStateMachine.handleChildSpeechStart();
        break;

      case 'input_audio_buffer.speech_stopped':
        logger.info('🔇 Child stopped speaking');
        workflowStateMachine.handleChildSpeechStop();
        break;

      // Response processing events
      case 'response.created':
        logger.info('🤔 Appu is thinking (response created)');
        workflowStateMachine.handleAppuThinking();
        break;

      case 'response.done':
        logger.info('✅ Response completed');
        // Transition to idle if not currently speaking
        if (workflowStateMachine.currentState !== 'APPU_SPEAKING') {
          workflowStateMachine.handleIdle();
        }
        break;

      // Function call events
      case 'response.function_call_arguments.delta':
        logger.info('🔧 Function call in progress');
        workflowStateMachine.handleAppuThinking();
        break;

      case 'response.function_call_arguments.done':
        logger.info('🔧 Function call completed');
        // Stay in thinking state as function execution may continue
        workflowStateMachine.handleAppuThinking();
        break;

      // Error events
      case 'error':
        logger.error('❌ OpenAI error occurred', { 
          error: event.error?.message,
          type: event.error?.type 
        });
        workflowStateMachine.handleError(event.error?.message || 'OpenAI error occurred');
        break;

      case 'response.cancelled':
        logger.warn('⚠️ Response was cancelled');
        workflowStateMachine.handleError('Response was cancelled');
        break;

      // Rate limiting
      case 'rate_limits.updated':
        logger.debug('📊 Rate limits updated', { rateLimits: event.rate_limits });
        // No state change needed for rate limit updates
        break;

      // Transcription events (informational only)
      case 'conversation.item.input_audio_transcription.completed':
        logger.info('📝 User speech transcribed');
        // No state change needed - transcription is informational
        break;

      case 'response.audio_transcript.done':
        logger.info('📝 Appu response transcribed');
        // No state change needed - transcription is informational
        break;

      // Output item events
      case 'response.output_item.added':
        logger.debug('📄 Output item added', { 
          itemType: event.item?.type,
          itemRole: event.item?.role 
        });
        // No immediate state change needed
        break;

      case 'response.output_item.done':
        logger.debug('✅ Output item completed', { 
          itemType: event.item?.type 
        });
        // No immediate state change needed
        break;

      // Unknown events
      default:
        logger.debug('❓ Unknown OpenAI event - no translation needed', { 
          eventType: event.type 
        });
        break;
    }
  }, [enabled, workflowStateMachine, logger]);

  // Listen to OpenAI events and translate them
  useEffect(() => {
    if (!openaiConnection || !enabled || !workflowStateMachine) {
      logger.debug('🔄 Event translator setup skipped', { 
        hasConnection: !!openaiConnection, 
        enabled, 
        hasWorkflowStateMachine: !!workflowStateMachine 
      });
      return;
    }

    // Since the openaiConnection is the hook result, not the WebSocket directly,
    // we need to check if it has internal event handling capabilities
    // For now, we'll log that the translator is ready but events will be handled
    // internally by the useOpenAIConnection hook
    
    logger.info('🔗 OpenAI event translator initialized and ready');
    logger.debug('📋 Event translator will receive events from internal OpenAI connection handler');

    // No cleanup needed since we're not directly listening to events
    // The actual event handling happens inside useOpenAIConnection
    return () => {
      logger.info('🔌 OpenAI event translator deinitialized');
    };
  }, [openaiConnection, enabled, workflowStateMachine, logger]);

  return {
    translateOpenAIEvent,
    isEnabled: enabled
  };
}
