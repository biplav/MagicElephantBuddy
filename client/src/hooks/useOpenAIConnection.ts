import { useState, useCallback, useRef, useEffect } from "react";
import { createServiceLogger } from "@/lib/logger";
import { useWebRTCConnection } from "./useWebRTCConnection";
import { useOpenAISession } from "./useOpenAISession";
import { useMediaManager } from "./useMediaManager";

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

  // Initialize BookStateManager on-demand when needed
  const bookStateManager = useBookStateManager({
    workflowStateMachine: options.workflowStateMachine,
    onStorybookPageDisplay: options.onStorybookPageDisplay,
    onFunctionCallResult: (callId: string, result: string) => {
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

  // Helper method to send function call output
  const sendFunctionCallOutput = useCallback((callId: string, result: any) => {
    var response = JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: result,
      },
    });
    console.log("Sending function call output:", response);
    dataChannelRef.current?.send(response);
  }, []);

  // Helper methods for sending function call results and errors
  const sendFunctionCallResult = useCallback((callId: string, result: string) => {
    sendFunctionCallOutput(callId, { result });
  }, [sendFunctionCallOutput]);

  const sendFunctionCallError = useCallback((callId: string, error: string) => {
    sendFunctionCallOutput(callId, { error });
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
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 200,
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

          const message = JSON.parse(messageEvent.data);

          logger.info("Parsed data channel message", {
            messageType: message.type,
            messageKeys: Object.keys(message),
            fullMessage: message,
          });

          // Translate OpenAI events to workflow state machine events
          if (workflowStateMachine) {
            try {
              switch (message.type) {
                case 'session.created':
                  workflowStateMachine.handleLoading();
                  break;
                case 'session.updated':
                  if (workflowStateMachine.currentState === 'LOADING') {
                    workflowStateMachine.handleIdle();
                  }
                  break;
                case 'output_audio_buffer.started':
                  workflowStateMachine.handleAppuSpeakingStart();
                  break;
                case 'output_audio_buffer.stopped':
                  workflowStateMachine.handleAppuSpeakingStop();
                  break;
                case 'response.audio.delta':
                  if (workflowStateMachine.currentState !== 'APPU_SPEAKING') {
                    workflowStateMachine.handleAppuSpeakingStart();
                  }
                  break;
                case 'input_audio_buffer.speech_started':
                  workflowStateMachine.handleChildSpeechStart();
                  break;
                case 'input_audio_buffer.speech_stopped':
                  workflowStateMachine.handleChildSpeechStop();
                  break;
                case 'response.created':
                  workflowStateMachine.handleAppuThinking();
                  break;
                case 'response.done':
                  if (workflowStateMachine.currentState !== 'APPU_SPEAKING') {
                    workflowStateMachine.handleIdle();
                  }
                  break;
                case 'error':
                  workflowStateMachine.handleError(message.error?.message || 'OpenAI error occurred');
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
              // Handle different tool calls
              if (message.name === "getEyesTool") {
                await handleGetEyesTool(message.call_id, message.arguments);
              } else if (message.name === 'book_search_tool') {
                logger.info('🔧 Handling book_search_tool', { args: message.arguments });
                // Delegate to bookStateManager
                bookStateManager.handleBookSearchTool(message.call_id, message.arguments);

              } else if (message.name === 'display_book_page') {
                logger.info('🔧 Handling display_book_page', { args: message.arguments });
                // Delegate to bookStateManager  
                bookStateManager.handleDisplayBookPage(message.call_id, message.arguments);
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
        setError("Data channel error occurred");
        options.onError?.("Data channel connection failed");
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
      bookStateManager,
      logger,
      isAppuSpeaking,
      tokensUsed,
      options.onAppuSpeakingChange,
      options.workflowStateMachine,
      options.onStorybookPageDisplay,
      sendFunctionCallResult,
      sendFunctionCallError,
      conversationIdRef, // Include conversationIdRef if used inside
    ],
  );

  const connect = useCallback(async () => {
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
  }, [
    createSession,
    webrtcConnection,
    setupDataChannel,
    options.enableVideo,
    mediaManager,
    options.onError,
    bookStateManager, // Ensure bookStateManager is a dependency if used directly in connect
    logger,
    // ... other dependencies used within connect
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

  // State for tokens used
  const [tokensUsed, setTokensUsed] = useState<number>(0);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);

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