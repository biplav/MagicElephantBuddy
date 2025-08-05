import { useState, useRef, useCallback } from "react";
import { createServiceLogger } from "@/lib/logger";
import { useWebRTCConnection } from "./useWebRTCConnection";
import { useOpenAISession } from "./useOpenAISession";
import { useBookStateManager } from "./useBookStateManager";
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
  // Media capture functions passed from parent
  requestMediaPermissions?: () => Promise<MediaStream>;
  captureFrame?: () => string | null;
  cleanupMedia?: () => void;
  hasVideoPermission?: boolean;
}

interface OpenAIConnectionState {
  isConnected: boolean;
  isRecording: boolean;
  error: string | null;
  lastCapturedFrame: string | null;
}

interface UseOpenAIConnectionOptions {
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (response: string) => void;
  onFrameCaptured?: (frameData: string, analysis: string) => void;
  onStorybookPageDisplay?: (pageData: {
    pageImageUrl: string;
    pageText: string;
    pageNumber: number;
    totalPages: number;
    bookTitle: string;
  }) => void;
  onBookSelected?: (book: any) => void;
  onAppuSpeakingChange?: (speaking: boolean) => void;
  onUserSpeakingChange?: (speaking: boolean) => void;
}

export function useOpenAIConnection(options: OpenAIConnectionOptions = {}) {
  const logger = createServiceLogger("openai-connection");

  const [state, setState] = useState<OpenAIConnectionState>({
    isConnected: false,
    isRecording: false,
    error: null,
    lastCapturedFrame: null,
  });

  const [isAppuSpeaking, setIsAppuSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);

  // Initialize modular hooks
  const webrtcConnection = useWebRTCConnection({
    onConnectionStateChange: (state) => {
      setState((prev) => ({
        ...prev,
        isConnected: state === 'connected',
        isRecording: state === 'connected',
      }));
    },
    onTrackReceived: (event) => {
      logger.info("Received audio track from OpenAI");
    },
    onError: (error) => {
      setState((prev) => ({ ...prev, error }));
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
  const conversationIdRef = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize book state manager with event callbacks
  const bookStateManager = useBookStateManager({
    onStorybookPageDisplay: options.onStorybookPageDisplay,
    onFunctionCallResult: (callId: string, result: string) => {
      sendFunctionCallOutput(callId, result);
      // Trigger model response after function call
      dataChannelRef.current?.send(JSON.stringify({
        type: 'response.create'
      }));
    },
    onError: (callId: string, error: string) => {
      sendFunctionCallOutput(callId, error);
      // Trigger model response after error
      dataChannelRef.current?.send(JSON.stringify({
        type: 'response.create'
      }));
    }
  });

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

        // Update book state manager with the active data channel
        // This will be handled via a different approach since we can't call hooks conditionally

        try {
          const childId = getSelectedChildId();
          const enhancedInstructions = await fetchEnhancedPrompt(childId);

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
              // Optimize context window for token efficiency
              max_response_output_tokens: bookStateManager.isInReadingSession ? 150 : 300,
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
          const childId = options.childId || getSelectedChildId?.() || "1085268853542289410";

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

      // Book-related functionality now handled by bookStateManager

      const handleGetEyesTool = async (callId: string, args: any) => {
        logger.info("getEyesTool was called!", { callId, args });

        try {
          let frameData: string | null = null;

          // First check if video is enabled in options
          if (!options.enableVideo) {
            logger.warn("Video not enabled, cannot capture frame");
            sendFunctionCallOutput(
              callId,
              "I can't see anything because video is not enabled. Please enable video mode so I can see what you're showing me!",
            );
            return;
          }

          // Check if we already have camera permission and can capture
          // const mediaCapture = mediaCaptureRef.current;
          if (options.hasVideoPermission && options.captureFrame) {
            // Try capturing frame with retry mechanism
            let attempts = 0;
            const maxAttempts = 3;

            while (attempts < maxAttempts && !frameData) {
              attempts++;
              logger.info(`Frame capture attempt ${attempts}/${maxAttempts}`);

              frameData = options.captureFrame();

              if (!frameData && attempts < maxAttempts) {
                // Wait a bit before retrying
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
            }

            logger.info("Frame capture completed", {
              hasFrame: !!frameData,
              attempts,
              frameLength: frameData?.length || 0,
            });

            // Store the captured frame for UI display
            if (frameData) {
              setState((prev) => ({ ...prev, lastCapturedFrame: frameData }));
            }
          } else {
            // Request camera permission if not already granted
            logger.info("Requesting camera permission for frame capture");
            try {
              // const mediaCapture = mediaCaptureRef.current;
              if (options.requestMediaPermissions) {
                await options.requestMediaPermissions();
                // Wait a bit for video to initialize
                await new Promise((resolve) => setTimeout(resolve, 1000));
                // Try capturing after permission granted
                if (options.captureFrame) {
                  frameData = options.captureFrame();
                  logger.info("Captured frame after permission request", {
                    hasFrame: !!frameData,
                  });

                  // Store the captured frame for UI display
                  if (frameData) {
                    setState((prev) => ({
                      ...prev,
                      lastCapturedFrame: frameData,
                    }));
                  }
                }
              }
            } catch (permissionError) {
              logger.warn("Camera permission denied for getEyesTool", {
                error: permissionError,
              });
            }
          }

          if (!frameData) {
            // No frame available - return appropriate response
            sendFunctionCallOutput(
              callId,
              "I can't see anything right now. Please make sure your camera is working and try showing me again!",
            );
            return;
          }

          // Call the frame analysis API with enhanced context
          const response = await fetch("/api/analyze-frame", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              frameData,
              childId: getSelectedChildId(),
              conversationId: conversationIdRef.current,
              reason: args.reason || "Child wants to show something",
              lookingFor: args.lookingFor || null,
              context: args.context || null,
            }),
          });

          if (!response.ok) {
            throw new Error(`Analysis failed: ${response.status}`);
          }

          const analysisResult = await response.json();
          logger.info("Frame analysis completed", {
            analysis: analysisResult.analysis,
          });

          // Send the analysis result back to OpenAI
          sendFunctionCallOutput(callId, analysisResult.analysis);

          // Trigger model response after function call
          dataChannelRef.current?.send(JSON.stringify({
            type: 'response.create'
          }));
          logger.info("Triggered response.create after successful function call");
        } catch (error: any) {
          logger.error("Error handling getEyesTool", {
            error: error.message,
            stack: error.stack,
          });

          // Send error response back to OpenAI
          sendFunctionCallOutput(
            callId,
            "I'm having trouble seeing what you're showing me right now. Can you try again?",
          );

          // Trigger model response after error function call
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
            rawData: messageEvent.data?.substring(0, 500), // First 500 chars for inspection
          });

          const message = JSON.parse(messageEvent.data);

          logger.info("Parsed data channel message", {
            messageType: message.type,
            messageKeys: Object.keys(message),
            fullMessage: message,
          });

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

              // Mark Appu as speaking when receiving audio
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
                fullMessage: message,
              });
              break;
            case "response.output_item.added":
              logger.info("Response output item added", {
                itemId: message.item?.id,
                itemType: message.item?.type,
                itemRole: message.item?.role,
                itemStatus: message.item?.status,
                fullMessage: message,
              });
              // This event indicates OpenAI is adding a new item to the response
              // Could be text, audio, or tool calls
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
              } else if (message.name === "bookSearchTool") {
                await bookStateManager.handleBookSearchTool(message.call_id, message.arguments);
              } else if (message.name === "display_book_page") {
                await bookStateManager.handleDisplayBookPage(message.call_id, message.arguments);
              }
              break;
            case "response.done":
              logger.info("Response completed", {
                responseId: message.response?.id,
                status: message.response?.status,
                fullMessage: message,
              });

              // Mark Appu as no longer speaking when response is complete
              if (isAppuSpeaking) {
                setIsAppuSpeaking(false);
                options.onAppuSpeakingChange?.(false);
              }

              // Optimize token usage during reading sessions
              bookStateManager.optimizeTokenUsage();

              break;
            case "error":
              logger.error("Error message received", {
                errorMessage: message.error?.message,
                errorType: message.error?.type,
                errorCode: message.error?.code,
                fullError: message.error,
                fullMessage: message,
              });
              setState((prev) => ({
                ...prev,
                error: message.error?.message || "Unknown error",
              }));
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
        setState((prev) => ({ ...prev, error: "Data channel error occurred" }));
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
        setState((prev) => ({
          ...prev,
          isConnected: false,
          isRecording: false,
        }));
      };

      // Handle buffered amount changes
      channel.onbufferedamountlow = () => {
        logger.info("Data channel buffer amount low");
      };
    },
    [
      getSelectedChildId,
      fetchEnhancedPrompt,
      sendFunctionCallOutput,
      webrtcConnection,
      // Remove function dependencies that change on every render
      // These will be accessed via options parameter
    ],
  );

  const connect = useCallback(async () => {
    try {
      logger.info("Starting OpenAI WebRTC connection");

      // If video is enabled, ensure media capture is initialized first
      // const mediaCapture = mediaCaptureRef.current;
      if (options.enableVideo) {
        logger.info("Video enabled, requesting media permissions first");
        try {
          if (options.requestMediaPermissions) {
            await options.requestMediaPermissions();
            // Wait for video to be properly initialized
            await new Promise((resolve) => setTimeout(resolve, 1500));
            logger.info("Media permissions granted and video initialized");
          }
        } catch (mediaError) {
          logger.warn(
            "Video permission request failed, continuing without video",
            { error: mediaError },
          );
        }
      }

      // Handle session creation with explicit error handling
      const client_secret = await createSession().catch((sessionError) => {
        logger.error("Session creation failed", {
          error: sessionError.message,
          stack: sessionError.stack,
        });
        throw new Error(`Session creation failed: ${sessionError.message}`);
      });

      // Create peer connection using webrtcConnection
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
        video: options.enableVideo
          ? {
              width: { ideal: 320 },
              height: { ideal: 240 },
              frameRate: { ideal: 2 },
            }
          : false,
      };

      // Handle media stream with explicit error handling
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

      // Handle offer creation with explicit error handling
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

      // Handle API request with explicit error handling
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
      setState((prev) => ({ ...prev, error: error.message }));
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
    // Remove function dependencies that are accessed via options
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

    // Clean up media capture resources
    if (options.cleanupMedia) {
      options.cleanupMedia();
    }

    setState((prev) => ({
      ...prev,
      isConnected: false,
      isRecording: false,
      lastCapturedFrame: null,
    }));
  }, [options.cleanupMedia]);

  return {
    ...state,
    connect,
    disconnect,
    isAppuSpeaking,
    isUserSpeaking,
    // mediaCapture: mediaCaptureRef.current,
  };
}