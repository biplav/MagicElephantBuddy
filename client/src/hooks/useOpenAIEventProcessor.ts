
import { useState, useCallback, useMemo } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface OpenAIEventProcessorOptions {
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (text: string) => void;
  onAudioResponseReceived?: (audioData: string) => void;
  onError?: (error: string) => void;
  onAppuSpeakingChange?: (speaking: boolean) => void;
  onUserSpeakingChange?: (speaking: boolean) => void;
  childId?: string;
}

interface SpeakingState {
  isAppuSpeaking: boolean;
  isUserSpeaking: boolean;
}

export function useOpenAIEventProcessor(options: OpenAIEventProcessorOptions = {}) {
  const logger = useMemo(() => createServiceLogger('openai-event-processor'), []);
  
  const [speakingState, setSpeakingState] = useState<SpeakingState>({
    isAppuSpeaking: false,
    isUserSpeaking: false
  });

  const storeTranscribedMessage = useCallback(async (
    transcript: string,
    type: "child_input" | "appu_response"
  ) => {
    try {
      if (!options.childId) {
        logger.warn('No childId provided, skipping message storage');
        return;
      }

      const apiType = type === "child_input" ? "child_input" : "appu_response";
      const requestBody = type === "child_input"
        ? {
            type: apiType,
            content: transcript,
            transcription: transcript,
            childId: options.childId,
          }
        : {
            type: apiType,
            content: transcript,
            childId: options.childId,
          };

      await fetch("/api/store-realtime-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      
      logger.info(
        `${type === "child_input" ? "Child message" : "Appu response"} stored in backend`,
        { transcript }
      );
    } catch (error) {
      logger.error(
        `Failed to store ${type === "child_input" ? "child message" : "Appu response"}`,
        { error }
      );
    }
  }, [options.childId, logger]);

  const setAppuSpeaking = useCallback((speaking: boolean) => {
    setSpeakingState(prev => {
      if (prev.isAppuSpeaking === speaking) return prev;
      return { ...prev, isAppuSpeaking: speaking };
    });
    options.onAppuSpeakingChange?.(speaking);
  }, [options.onAppuSpeakingChange]);

  const setUserSpeaking = useCallback((speaking: boolean) => {
    setSpeakingState(prev => {
      if (prev.isUserSpeaking === speaking) return prev;
      return { ...prev, isUserSpeaking: speaking };
    });
    options.onUserSpeakingChange?.(speaking);
  }, [options.onUserSpeakingChange]);

  const processEvent = useCallback(async (message: any) => {
    logger.info("Processing OpenAI event", {
      messageType: message.type,
      messageKeys: Object.keys(message),
    });

    switch (message.type) {
      case "input_audio_buffer.speech_started":
        logger.info("User speech started detected");
        setUserSpeaking(true);
        break;

      case "input_audio_buffer.speech_stopped":
        logger.info("User speech stopped detected");
        setUserSpeaking(false);
        break;

      case "conversation.item.input_audio_transcription.completed":
        logger.info("Transcription completed message", {
          hasTranscript: !!message.transcript,
          transcriptLength: message.transcript?.length,
          transcript: message.transcript,
        });
        if (message.transcript) {
          options.onTranscriptionReceived?.(message.transcript);
          await storeTranscribedMessage(message.transcript, "child_input");
        }
        break;

      case "response.audio_transcript.done":
        logger.info("Audio transcript done message", {
          hasTranscript: !!message.transcript,
          transcriptLength: message.transcript?.length,
          transcript: message.transcript,
        });
        if (message.transcript) {
          options.onResponseReceived?.(message.transcript);
          await storeTranscribedMessage(message.transcript, "appu_response");
        }
        break;

      case "response.audio.delta":
        logger.info("Audio delta message", {
          hasDelta: !!message.delta,
          deltaLength: message.delta?.length,
        });

        // Mark Appu as speaking when receiving audio
        if (!speakingState.isAppuSpeaking) {
          setAppuSpeaking(true);
        }

        options.onAudioResponseReceived?.(message.delta);
        break;

      case "session.created":
        logger.info("Session created successfully", {
          sessionId: message.session?.id,
          model: message.session?.model,
          voice: message.session?.voice,
        });
        break;

      case "rate_limits.updated":
        logger.info("Rate limits updated", {
          rateLimits: message.rate_limits,
        });
        break;

      case "output_audio_buffer.stopped":
        logger.info("Audio output buffer stopped");
        break;

      case "response.output_item.added":
        logger.info("Response output item added", {
          itemId: message.item?.id,
          itemType: message.item?.type,
          itemRole: message.item?.role,
          itemStatus: message.item?.status,
        });
        break;

      case "response.done":
        logger.info("Response completed", {
          responseId: message.response?.id,
          status: message.response?.status,
        });

        // Mark Appu as no longer speaking when response is complete
        if (speakingState.isAppuSpeaking) {
          setAppuSpeaking(false);
        }
        break;

      case "error":
        logger.error("Error message received", {
          errorMessage: message.error?.message,
          errorType: message.error?.type,
          errorCode: message.error?.code,
          fullError: message.error,
        });
        options.onError?.(message.error?.message || "Unknown error");
        break;

      default:
        logger.warn("Unknown message type received", {
          messageType: message.type,
          messageKeys: Object.keys(message),
        });
        break;
    }
  }, [
    logger,
    speakingState.isAppuSpeaking,
    setAppuSpeaking,
    setUserSpeaking,
    storeTranscribedMessage,
    options.onTranscriptionReceived,
    options.onResponseReceived,
    options.onAudioResponseReceived,
    options.onError
  ]);

  return {
    processEvent,
    speakingState,
    setAppuSpeaking,
    setUserSpeaking
  };
}
