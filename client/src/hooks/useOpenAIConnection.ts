import { useState, useCallback, useRef, useEffect } from "react";
import { createServiceLogger } from "@/lib/logger";
import { useWebRTCConnection } from "./useWebRTCConnection";
import { useOpenAISession } from "./useOpenAISession";
import { useMediaManager } from "./useMediaManager";
import { useBookManager } from "./useBookManager";

interface OpenAIConnectionOptions {
  childId?: string;
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (text: string) => void;
  onAudioResponseReceived?: (audioData: string) => void;
  onError?: (error: string) => void;
  enableVideo?: boolean;
  onStorybookPageDisplay?: (pageData: {
    pageImageUrl: string;
    pageText: string;
    pageNumber: number;
    totalPages: number;
    bookTitle: string;
  }) => void;
  onAppuSpeakingChange?: (speaking: boolean) => void;
  onUserSpeakingChange?: (speaking: boolean) => void;
}

interface OpenAIConnectionState {
  isConnected: boolean;
  isRecording: boolean;
  error: string | null;
  lastCapturedFrame: string | null;
}

interface UseOpenAIConnectionOptions {
  childId?: string;
  enableVideo?: boolean;
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (response: string) => void;
  onAudioResponseReceived?: (audioData: string) => void;
  onError?: (error: string) => void;
  onStorybookPageDisplay?: (pageData: {
    pageImageUrl: string;
    pageText: string;
    pageNumber: number;
    totalPages: number;
    bookTitle: string;
  }) => void;
  onBookSelected?: (book: any) => void;
  onAppuSpeakingChange?: (isSpeaking: boolean) => void;
  // Media functions
  captureFrame?: () => string | null;
  // Workflow integration
  workflowStateMachine?: any;
}

export function useOpenAIConnection(options: UseOpenAIConnectionOptions = {}) {
  const logger = createServiceLogger("openai-connection");

  // Connection state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isAppuSpeaking, setIsAppuSpeaking] = useState<boolean>(false);
  const [lastCapturedFrame, setLastCapturedFrame] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<number>(0);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);

  // Initialize Redux-based book manager (always available)
  const bookManager = useBookManager({
    workflowStateMachine: options.workflowStateMachine,
    onStorybookPageDisplay: options.onStorybookPageDisplay,
    onFunctionCallResult: (callId: string, result: any) => {
      sendFunctionCallResult(callId, result);
    },
    onError: (callId: string, error: string) => {
      sendFunctionCallError(callId, error);
    }
  });

  // Initialize media manager
  const mediaManager = useMediaManager({
    enableVideo: options.enableVideo,
    childId: options.childId,
    onError: options.onError,
  });

  // Initialize modular hooks
  const webrtcConnection = useWebRTCConnection({
    onConnectionStateChange: (state) => {
      setIsConnected(state === 'connected');
      setIsRecording(state === 'connected');
    },
    onTrackReceived: (event) => {
      logger.info("Received audio track from OpenAI");
    },
    onError: (error) => {
      setError(error);
      options.onError?.(error);
    },
  });

  const {
    createSession,
    createSessionConfig,
    updateSessionForReading,
    restoreNormalSession,
    fetchEnhancedPrompt,
    getSelectedChildId,
  } = useOpenAISession({ childId: options.childId });

  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const conversationIdRef = useRef<number | null>(null);

  // Helper method to send function call output
  const sendFunctionCallOutput = useCallback((callId: string, result: any) => {
    // Ensure output is a string to prevent data channel issues
    const output = typeof result === 'string' ? result : JSON.stringify(result);
    
    var response = JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: output,
      },
    });
    console.log("Sending function call output:", response);
    dataChannelRef.current?.send(response);
  }, []);

  // Helper methods for sending function call results and errors
  const sendFunctionCallResult = useCallback((callId: string, result: any) => {
    sendFunctionCallOutput(callId, { result });
    toolResponseDone();
  }, [sendFunctionCallOutput]);

  const function toolResponseDone() {
    dataChannelRef.current?.send(JSON.stringify({
      type: 'response.create'
    }));
  }

  const sendFunctionCallError = useCallback((callId: string, error: any) => {
    sendFunctionCallOutput(callId, { error });
    toolResponseDone();
  }, [sendFunctionCallOutput]);

  const setupDataChannel = useCallback(
    (pc: RTCPeerConnection) => {
      // Create the data channel as required by OpenAI WebRTC API
      const channel = pc.createDataChannel("oai-events");
      dataChannelRef.current = channel;

      // Handle connection state changes
      const checkReadyState = () => {
        logger.info("Data channel ready state changed", {
          readyState: channel.readyState,
          readyStateLabel:
            ["connecting", "open", "closing", "closed"][channel.readyState as unknown as number] ||
            "unknown",
        });
      };

      // Monitor ready state changes
      const stateCheckInterval = setInterval(checkReadyState, 1000);

      channel.onopen = async () => {
        logger.info("Data channel opened");
        clearInterval(stateCheckInterval);

        try {
          const childId = getSelectedChildId();
          const enhancedInstructions = await fetchEnhancedPrompt(childId);

          // Generate cache key based on child ID for consistent caching
          const cacheKey = `appu-child-${childId}-v1`;

          // Send session configuration with enhanced prompt
          const sessionConfig = {
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
              input_audio_noise_reduction:  {
                type: "far_field"
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.65,
                prefix_padding_ms: 200,
                silence_duration_ms: 800,
              },
              temperature: 0.8,
              max_response_output_tokens: 300 //,
            },
          };

          channel.send(JSON.stringify(sessionConfig));
          logger.info(
            "Session configuration sent successfully with enhanced prompt",
          );
        } catch (error) {
          logger.error("Error sending session configuration", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      };

      const storeTranscribedMessage = async (
        transcript: string,
        type: "child_input" | "appu_response",
      ) => {
        try {
          const childId = String(options.childId || getSelectedChildId?.() || "1085268853542289410");

          const requestBody =
            type === "child_input"
              ? {
                  type: "child_input",
                  content: transcript,
                  transcription: transcript,
                  childId: childId,
                }
              : {
                  type: "appu_response",
                  content: transcript,
                  childId: childId,
                };

          await fetch("/api/store-realtime-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          });
          logger.info(
            `${type === "child_input" ? "Child message" : "Appu response"} stored in backend`,
            { transcript },
          );
        } catch (error) {
          logger.error(
            `Failed to store ${type === "child_input" ? "child message" : "Appu response"}`,
            { error },
          );
        }
      };

      const handleGetEyesTool = async (callId: string, args: any) => {
        logger.info("getEyesTool was called!", { callId, args });

        try {
          const analysisResult = await mediaManager.getFrameAnalysis({
            reason: args.reason || "Child wants to show something",
            lookingFor: args.lookingFor || null,
            context: args.context || null,
            conversationId: conversationIdRef.current,
          });

          if (analysisResult.success && analysisResult.analysis) {
            const frameData = mediaManager.captureFrame();
            if (frameData) {
              setLastCapturedFrame(frameData);
            }
          }

          sendFunctionCallOutput(callId, analysisResult.message);

          dataChannelRef.current?.send(JSON.stringify({
            type: 'response.create'
          }));

          logger.info("Completed getEyesTool processing", {
            success: analysisResult.success,
            hasAnalysis: !!analysisResult.analysis
          });

        } catch (error: any) {
          logger.error("Error handling getEyesTool", {
            error: error.message,
            stack: error.stack,
          });

          sendFunctionCallOutput(
            callId,
            "I'm having trouble seeing what you're showing me right now. Can you try again?",
          );

          dataChannelRef.current?.send(JSON.stringify({
            type: 'response.create'
          }));
          logger.info("Triggered response.create after error function call");
        }
      };

      channel.onmessage = async (messageEvent: MessageEvent) => {
        try {
          logger.info("Raw data channel message received", {
            messageSize: messageEvent.data?.length,
            dataType: typeof messageEvent.data,
            rawData: messageEvent.data?.substring(0, 500),
          });

          // Add validation for message data
          if (!messageEvent.data || typeof messageEvent.data !== 'string') {
            logger.warn("Invalid message data received", { data: messageEvent.data });
            return;
          }

          const message = JSON.parse(messageEvent.data);

          logger.info("Parsed data channel message", {
            messageType: message.type,
            messageKeys: Object.keys(message),
            fullMessage: message,
          });

          // Translate OpenAI events to workflow state machine events
          if (options.workflowStateMachine) {
            try {
              switch (message.type) {
                case 'session.created':
                  options.workflowStateMachine.handleLoading();
                  break;
                case 'session.updated':
                  if (options.workflowStateMachine.currentState === 'LOADING') {
                    options.workflowStateMachine.handleIdle();
                  }
                  break;
                case 'output_audio_buffer.started':
                  options.workflowStateMachine.handleAppuSpeakingStart();
                  break;
                case 'output_audio_buffer.stopped':
                  options.workflowStateMachine.handleAppuSpeakingStop();
                  break;
                case 'response.audio.delta':
                  if (options.workflowStateMachine.currentState !== 'APPU_SPEAKING') {
                    options.workflowStateMachine.handleAppuSpeakingStart();
                  }
                  break;
                case 'input_audio_buffer.speech_started':
                  options.workflowStateMachine.handleChildSpeechStart();
                  break;
                case 'input_audio_buffer.speech_stopped':
                  options.workflowStateMachine.handleChildSpeechStop();
                  break;
                case 'response.created':
                  options.workflowStateMachine.handleAppuThinking();
                  break;
                case 'response.done':
                  if (options.workflowStateMachine.currentState !== 'APPU_SPEAKING') {
                    options.workflowStateMachine.handleIdle();
                  }
                  break;
                case 'error':
                  options.workflowStateMachine.handleError(message.error?.message || 'OpenAI error occurred');
                  break;
              }
            } catch (translationError) {
              logger.error('🚨 Error translating OpenAI event to workflow state', {
                error: translationError instanceof Error ? translationError.message : String(translationError),
                eventType: message.type
              });
            }
          }

          switch (message.type) {
            case "input_audio_buffer.speech_started":
              logger.info("User speech started detected");
              setIsUserSpeaking(true);
              options.onUserSpeakingChange?.(true);
              break;
            case "input_audio_buffer.speech_stopped":
              logger.info("User speech stopped detected");
              setIsUserSpeaking(false);
              options.onUserSpeakingChange?.(false);
              break;
            case "conversation.item.input_audio_transcription.completed":
              logger.info("Transcription completed message", {
                hasTranscript: !!message.transcript,
                transcriptLength: message.transcript?.length,
                transcript: message.transcript,
                fullMessage: message,
              });
              if (message.transcript) {
                options.onTranscriptionReceived?.(message.transcript);
                await storeTranscribedMessage(
                  message.transcript,
                  "child_input",
                );
              }
              break;
            case "response.audio_transcript.done":
              logger.info("Audio transcript done message", {
                hasTranscript: !!message.transcript,
                transcriptLength: message.transcript?.length,
                transcript: message.transcript,
                fullMessage: message,
              });
              if (message.transcript) {
                options.onResponseReceived?.(message.transcript);
                await storeTranscribedMessage(
                  message.transcript,
                  "appu_response",
                );
              }
              break;
            case "response.audio.delta":
              logger.info("Audio delta message", {
                hasDelta: !!message.delta,
                deltaLength: message.delta?.length,
                deltaType: typeof message.delta,
                delta: message.delta,
                fullMessage: message,
              });

              if (!isAppuSpeaking) {
                setIsAppuSpeaking(true);
                options.onAppuSpeakingChange?.(true);
              }

              options.onAudioResponseReceived?.(message.delta);
              break;
            case "session.created":
              logger.info("Session created successfully", {
                sessionId: message.session?.id,
                model: message.session?.model,
                voice: message.session?.voice,
                fullMessage: message,
              });
              break;
            case "rate_limits.updated":
              logger.info("Rate limits updated", {
                rateLimits: message.rate_limits,
                fullMessage: message,
              });
              break;
            case "output_audio_buffer.stopped":
              logger.info("Audio output buffer stopped", {
                "bufferLength": message.audio?.length || 0,
                "outputIndex": message.output_index
              });
              options.onAppuSpeakingChange?.(false);
              break;
            case "response.output_item.added":
              logger.info("Response output item added", {
                itemId: message.item?.id,
                itemType: message.item?.type,
                itemRole: message.item?.role,
                itemStatus: message.item?.status,
                fullMessage: message,
              });
              break;
            case "response.function_call_arguments.delta":
              logger.info("Function call arguments delta", {
                callId: message.call_id,
                name: message.name,
                delta: message.delta,
                fullMessage: message,
              });
              break;
            case "response.function_call_arguments.done":
              logger.info("Function call arguments done", {
                callId: message.call_id,
                name: message.name,
                arguments: message.arguments,
                fullMessage: message,
              });

              // Add validation for required fields
              if (!message.call_id || !message.name) {
                logger.error("Invalid function call message - missing required fields", {
                  hasCallId: !!message.call_id,
                  hasName: !!message.name,
                  message
                });
                break;
              }

              // Handle different tool calls with error handling
              try {
                if (message.name === "getEyesTool") {
                  await handleGetEyesTool(message.call_id, message.arguments);
                } else if (message.name === 'bookSearchTool' || message.name === 'book_search_tool') {
                  logger.info('🔧 Handling book_search_tool', { args: message.arguments });
                  bookManager.handleBookSearchTool(message.call_id, message.arguments);
                } else if (message.name === 'display_book_page') {
                  logger.info('🔧 Handling display_book_page', { args: message.arguments });
                  bookManager.handleDisplayBookPage(message.call_id, message.arguments);
                } else {
                  logger.warn('🔧 Unknown function call', { name: message.name, callId: message.call_id });
                  sendFunctionCallError(message.call_id, `Unknown function: ${message.name}`);
                }
              } catch (functionError) {
                logger.error('🔧 Error handling function call', {
                  name: message.name,
                  callId: message.call_id,
                  error: functionError instanceof Error ? functionError.message : String(functionError)
                });
                sendFunctionCallError(message.call_id, "Function execution failed");
              }
              break;
            case "response.done":
              logger.info("Response completed", {
                responseId: message.response?.id,
                status: message.response?.status,
                statusDetails: message.response?.status_details
              });

              // Track token usage from the response
              if (message.usage) {
                const responseTokens = (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0);
                setTokensUsed(prev => prev + responseTokens);
                logger.info("Token usage updated", {
                  inputTokens: message.usage.input_tokens,
                  outputTokens: message.usage.output_tokens,
                  totalResponseTokens: responseTokens,
                  cumulativeTokens: tokensUsed + responseTokens
                });
              }

              if (message.response?.status === "failed") {
                const errorMessage = message.response.status_details?.error?.message || "Response failed";
                logger.error("OpenAI response failed", {
                  "object": message.response.object,
                  "id": message.response.id,
                  "status": message.response.status,
                  "status_details": message.response.status_details
                });
              }
              break;
            case "error":
              logger.error("Error message received", {
                errorMessage: message.error?.message,
                errorType: message.error?.type,
                errorCode: message.error?.code,
                fullError: message.error,
                fullMessage: message,
              });
              setError(message.error?.message || "Unknown error");
              options.onError?.(message.error?.message || "Unknown error");
              break;
            default:
              logger.warn("Unknown message type received", {
                messageType: message.type,
                messageKeys: Object.keys(message),
                fullMessage: message,
              });
              break;
          }
        } catch (error) {
          logger.error("Error parsing data channel message", {
            error: error instanceof Error ? error.message : String(error),
            rawData: messageEvent.data?.substring(0, 200),
            dataType: typeof messageEvent.data,
            messageEventType: messageEvent.type,
          });
        }
      };

      channel.onerror = (error) => {
        logger.error("Data channel error", {
          error,
          readyState: channel.readyState,
          readyStateLabel:
            ["connecting", "open", "closing", "closed"][channel.readyState as unknown as number] ||
            "unknown",
        });

        // Only set error if the channel is actually closed, not just experiencing a temporary issue
        if (channel.readyState === 3) { // CLOSED state
          setError("Data channel connection lost");
          options.onError?.("Data channel connection failed");
        } else {
          logger.warn("Data channel error but still connected, attempting to continue");
        }
      };

      channel.onclose = (event) => {
        const closeEvent = event as CloseEvent;
        logger.info("Data channel closed", {
          readyState: channel.readyState,
          wasClean: closeEvent?.wasClean,
          code: closeEvent?.code,
          reason: closeEvent?.reason,
        });
        clearInterval(stateCheckInterval);
        setIsConnected(false);
        setIsRecording(false);
        setLastCapturedFrame(null);
      };

      channel.onbufferedamountlow = () => {
        logger.info("Data channel buffer amount low");
      };
    },
    [
      getSelectedChildId,
      fetchEnhancedPrompt,
      sendFunctionCallOutput,
      webrtcConnection,
      mediaManager,
      bookManager,
      logger,
      isAppuSpeaking,
      tokensUsed,
      options.onAppuSpeakingChange,
      options.workflowStateMachine,
      options.onStorybookPageDisplay,
      sendFunctionCallResult,
      sendFunctionCallError,
      conversationIdRef,
    ],
  );

  const connect = useCallback(async (retryCount = 0) => {
    const maxRetries = 3;
    try {
      logger.info("Starting OpenAI WebRTC connection");

      logger.info("Connection starting - camera will initialize when AI needs to see something");

      const client_secret = await createSession().catch((sessionError) => {
        logger.error("Session creation failed", {
          error: sessionError.message,
          stack: sessionError.stack,
        });
        throw new Error(`Session creation failed: ${sessionError.message}`);
      });

      const pc = webrtcConnection.createPeerConnection();
      pcRef.current = pc;

      setupDataChannel(pc);

      const mediaConstraints = {
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      };

      const stream = await navigator.mediaDevices
        .getUserMedia(mediaConstraints)
        .catch((mediaError) => {
          logger.error("Media access failed", {
            error: mediaError.message,
            name: mediaError.name,
            constraint: mediaError.constraint,
          });
          throw new Error(`Media access failed: ${mediaError.message}`);
        });

      streamRef.current = stream;

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        pc.addTrack(audioTrack, stream);
      }

      const offer = await pc
        .createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        })
        .catch((offerError) => {
          logger.error("Offer creation failed", {
            error: offerError.message,
          });
          throw new Error(`Offer creation failed: ${offerError.message}`);
        });

      await pc.setLocalDescription(offer).catch((localDescError) => {
        logger.error("Set local description failed", {
          error: localDescError.message,
        });
        throw new Error(
          `Set local description failed: ${localDescError.message}`,
        );
      });

      const realtimeResponse = await fetch(
        "https://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview-2024-12-17",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${client_secret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        },
      ).catch((fetchError) => {
        logger.error("OpenAI API request failed", {
          error: fetchError.message,
        });
        throw new Error(`OpenAI API request failed: ${fetchError.message}`);
      });

      if (!realtimeResponse.ok) {
        const errorText = await realtimeResponse
          .text()
          .catch(() => "Unable to read error response");
        throw new Error(
          `Failed to connect to OpenAI: ${realtimeResponse.status} - ${errorText}`,
        );
      }

      const answerSdp = await realtimeResponse.text().catch((textError) => {
        logger.error("Failed to read response text", {
          error: textError.message,
        });
        throw new Error(`Failed to read response: ${textError.message}`);
      });

      await pc
        .setRemoteDescription({ type: "answer", sdp: answerSdp })
        .catch((remoteDescError) => {
          logger.error("Set remote description failed", {
            error: remoteDescError.message,
          });
          throw new Error(
            `Set remote description failed: ${remoteDescError.message}`,
          );
        });

      logger.info("OpenAI WebRTC connection established");
    } catch (error: any) {
      logger.error("Error connecting to OpenAI:", {
        error: error.message,
        stack: error.stack,
        name: error.name,
      });

      if (retryCount < maxRetries) {
        logger.info(`Retrying connection, attempt ${retryCount + 1}/${maxRetries}`);
        setTimeout(() => connect(retryCount + 1), 2000); // Retry after 2 seconds
      } else {
        setError(error.message);
        options.onError?.(error.message);

        // Clean up on error
        if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      }
    }
  }, [
    createSession,
    webrtcConnection,
    setupDataChannel,
    options.enableVideo,
    mediaManager,
    options.onError,
    bookManager,
    logger,
  ]);

  const disconnect = useCallback(() => {
    logger.info("Disconnecting OpenAI connection");

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaManager.cleanup();

    setIsConnected(false);
    setIsRecording(false);
    setLastCapturedFrame(null);
    setTokensUsed(0);
  }, [mediaManager]);

  const sendMessage = useCallback((message: string) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'message', content: message }));
      logger.info("Sent message via data channel", { message });
    } else {
      logger.warn("Cannot send message: Data channel is not open.");
    }
  }, []);



  const state = {
    isConnected,
    isRecording,
    error,
    lastCapturedFrame,
    conversationId
  };

  return {
    ...state,
    connect,
    disconnect,
    sendMessage,
    tokensUsed,
    isAppuSpeaking,
    isUserSpeaking,
    captureFrame: mediaManager.captureFrame,
    hasVideoPermission: mediaManager.hasVideoPermission,
    videoElement: mediaManager.videoElement
  };
}