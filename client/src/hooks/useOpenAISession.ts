import { useState, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';
import { getSelectedChildId as getChildId } from '@/lib/childUtils';

interface OpenAISessionOptions {
  childId?: string;
  onSessionReady?: (sessionId: string) => void;
  onError?: (error: string) => void;
}

interface OpenAISessionState {
  isCreating: boolean;
  sessionId: string | null;
  error: string | null;
}

interface UseOpenAISessionOptions {
  childId?: string;
}

export function useOpenAISession(options: UseOpenAISessionOptions = {}) {
  const { childId } = options;
  const logger = createServiceLogger('openai-session');

  const [state, setState] = useState<OpenAISessionState>({
    isCreating: false,
    sessionId: null,
    error: null,
  });

  const getSelectedChildId = useCallback((): string => {
    return getChildId(childId);
  }, [childId]);

  const fetchEnhancedPrompt = useCallback(
    async (childId: string): Promise<string> => {
      try {
        logger.info("Fetching enhanced prompt from backend for child:", { childId });
        const promptResponse = await fetch(`/api/debug/enhanced-prompt/${childId}`);

        if (!promptResponse.ok) {
          throw new Error(`Failed to fetch enhanced prompt: ${promptResponse.status}`);
        }

        const promptData = await promptResponse.json();
        const enhancedInstructions = promptData.fullPrompt;

        logger.info("Enhanced prompt fetched successfully", {
          promptLength: enhancedInstructions.length,
          childId: childId,
        });

        return enhancedInstructions;
      } catch (error) {
        logger.error("Error fetching enhanced prompt", {
          error: error instanceof Error ? error.message : String(error),
          childId: childId,
        });
        // Return fallback prompt
        return `You are Appu, a friendly AI assistant helping child ${childId}. Keep responses short, simple, and engaging for young children.`;
      }
    },
    [logger],
  );

  const createSession = useCallback(async (): Promise<string> => {
    setState(prev => ({ ...prev, isCreating: true, error: null }));

    try {
      const childId = getSelectedChildId();
      logger.info("Creating OpenAI session for child:", { childId });

      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, modelType: "openai" }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create session: ${response.status} - ${errorText}`);
      }

      const { client_secret } = await response.json();
      if (!client_secret) {
        throw new Error("No client secret received from server");
      }

      const sessionId = `session_${Date.now()}`;
      setState(prev => ({
        ...prev,
        isCreating: false,
        sessionId,
        error: null,
      }));

      options.onSessionReady?.(sessionId);
      logger.info("OpenAI session created successfully", { sessionId, childId });

      return client_secret;
    } catch (error: any) {
      logger.error("Session creation failed", { error: error.message });
      const errorMsg = `Session creation failed: ${error.message}`;
      setState(prev => ({
        ...prev,
        isCreating: false,
        error: errorMsg,
      }));
      options.onError?.(errorMsg);
      throw error;
    }
  }, [getSelectedChildId, logger, options]);

  const createSessionConfig = useCallback(async (isInReadingSession: boolean = false) => {
    try {
      const childId = getSelectedChildId();
      const enhancedInstructions = await fetchEnhancedPrompt(childId);

      return {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: enhancedInstructions,
          voice: "alloy",
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: {
            model: "whisper-1",
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200,
          },
          temperature: 0.8,
          // max_response_output_tokens: isInReadingSession ? 150 : 300,
          max_response_output_tokens: 300,
        },
      };
    } catch (error: any) {
      logger.error("Error creating session config", { error: error.message });
      throw error;
    }
  }, [getSelectedChildId, fetchEnhancedPrompt, logger]);

  const updateSessionForReading = useCallback(() => {
    return {
      type: "session.update",
      session: {
        max_response_output_tokens: 250,
        temperature: 0.6,
      }
    };
  }, []);

  const restoreNormalSession = useCallback(() => {
    return {
      type: "session.update",
      session: {
        max_response_output_tokens: 300,
        temperature: 0.8,
      }
    };
  }, []);

  return {
    ...state,
    createSession,
    createSessionConfig,
    updateSessionForReading,
    restoreNormalSession,
    fetchEnhancedPrompt,
    getSelectedChildId,
  };
}