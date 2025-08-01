import { useState, useRef, useCallback } from "react";
import { createServiceLogger } from "@/lib/logger";
import { useMediaCapture } from "./useMediaCapture";

interface OpenAIConnectionOptions {
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
}

export function useOpenAIConnection(options: OpenAIConnectionOptions = {}) {
  const logger = createServiceLogger("openai-connection");

  const [state, setState] = useState<OpenAIConnectionState>({
    isConnected: false,
    isRecording: false,
    error: null,
    lastCapturedFrame: null,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const conversationIdRef = useRef<string | null>(null); // Add conversationIdRef

  // Add media capture for frame analysis - moved to top level
  const mediaCapture = useMediaCapture({ enableVideo: options.enableVideo });

  const getSelectedChildId = useCallback((): string => {
    const selectedChildId = localStorage.getItem("selectedChildId");
    if (selectedChildId) {
      return selectedChildId;
    }
    return "1085268853542289410";
  }, []);

  const createSession = useCallback(async (): Promise<string> => {
    const childId = getSelectedChildId();
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId, modelType: "openai" }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create session: ${response.status} - ${errorText}`,
      );
    }

    const { client_secret } = await response.json();
    if (!client_secret) {
      throw new Error("No client secret received from server");
    }
    return client_secret;
  }, [getSelectedChildId]);

  const setupPeerConnection = useCallback((pc: RTCPeerConnection) => {
    pc.ontrack = (event) => {
      logger.info("Received audio track from OpenAI");
      const remoteStream = event.streams[0];
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
    };

    pc.onconnectionstatechange = () => {
      logger.info("WebRTC connection state", { state: pc.connectionState });
      switch (pc.connectionState) {
        case "connected":
          setState((prev) => ({
            ...prev,
            isConnected: true,
            isRecording: true,
          }));
          break;
        case "disconnected":
        case "failed":
        case "closed":
          setState((prev) => ({
            ...prev,
            isConnected: false,
            isRecording: false,
          }));
          break;
      }
    };

    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      logger.info("ICE connection state changed", {
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
      });

      if (pc.iceConnectionState === "failed") {
        logger.error("ICE connection failed");
        setState((prev) => ({ ...prev, error: "Connection failed" }));
        options.onError?.("Connection failed");
      }
    };

    // Handle ICE gathering state changes
    pc.onicegatheringstatechange = () => {
      logger.info("ICE gathering state changed", {
        iceGatheringState: pc.iceGatheringState,
      });
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        logger.info("ICE candidate received", {
          candidate: event.candidate.candidate.substring(0, 50) + "...",
        });
      } else {
        logger.info("ICE candidate gathering complete");
      }
    };

    // Handle signaling state changes
    pc.onsignalingstatechange = () => {
      logger.info("Signaling state changed", {
        signalingState: pc.signalingState,
      });
    };

    // Handle negotiation needed
    pc.onnegotiationneeded = () => {
      logger.info("Negotiation needed");
    };
  }, []);

  const fetchEnhancedPrompt = useCallback(
    async (childId: string): Promise<string> => {
      try {
        logger.info(
          "Fetching enhanced prompt from backend for child:",
          childId,
        );
        const promptResponse = await fetch(
          `/api/debug/enhanced-prompt/${childId}`,
        );

        if (!promptResponse.ok) {
          throw new Error(
            `Failed to fetch enhanced prompt: ${promptResponse.status}`,
          );
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
    [],
  );

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
            ["connecting", "open", "closing", "closed"][channel.readyState] ||
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

          // Send session configuration with enhanced prompt
          channel.send(
            JSON.stringify({
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
              },
            }),
          );
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
          const childId = getSelectedChildId();
          const apiType =
            type === "child_input" ? "child_input" : "appu_response";
          const requestBody =
            type === "child_input"
              ? {
                  type: apiType,
                  content: transcript,
                  transcription: transcript,
                  childId: childId,
                }
              : {
                  type: apiType,
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

      // Store the current selected book for display
      const selectedBookRef = useRef<any>(null);
      const currentPageRef = useRef<number>(1);

      const handleBookSearchTool = async (callId: string, args: any) => {
        logger.info("bookSearchTool was called!", { callId, args });

        const argsJson = JSON.parse(args);
        logger.info("Parsed JSON arguments", { callId, argsJson });

        try {
          // Search for books
          const searchBody = {
            context: argsJson.context,
            bookTitle: argsJson.bookTitle,
            keywords: argsJson.keywords,
            ageRange: argsJson.ageRange
          };

          const response = await fetch('/api/books/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(searchBody),
          });

          if (!response.ok) {
            throw new Error(`Book search failed: ${response.status}`);
          }

          const searchResults = await response.json();
          logger.info("Book search completed", { 
            resultsCount: searchResults.books?.length || 0,
            searchParams: args 
          });

          let resultMessage: string;

          if (searchResults.books?.length > 0) {
            // Store the first book for later display
            selectedBookRef.current = searchResults.books[0];
            currentPageRef.current = 1;
            
            logger.info("Stored book for display", { 
              bookTitle: selectedBookRef.current.title,
              totalPages: selectedBookRef.current.pages?.length || selectedBookRef.current.totalPages
            });

            if (searchResults.books.length === 1) {
              // Single book found - ready to read
              resultMessage = `Perfect! I found "${selectedBookRef.current.title}" by ${selectedBookRef.current.author || 'Unknown Author'}. This is a wonderful ${selectedBookRef.current.genre || 'story'} book with ${selectedBookRef.current.totalPages} pages. ${selectedBookRef.current.summary || selectedBookRef.current.description || ''}\n\nI'm ready to start reading it to you! Should I begin with the first page?`;
            } else {
              // Multiple books found - show options but store first one
              resultMessage = `I found ${searchResults.books.length} great books! I've selected "${selectedBookRef.current.title}" for us to read. It's ${selectedBookRef.current.summary || selectedBookRef.current.description || 'a wonderful story'}.\n\nShould I start reading this book to you, or would you like to hear about the other books I found?`;
            }
          } else {
            resultMessage = `I couldn't find any books matching your search. Let me try a different approach or suggest some popular stories instead!`;
            selectedBookRef.current = null;
          }

          sendFunctionCallOutput(callId, resultMessage);

          // Trigger model response
          dataChannelRef.current?.send(JSON.stringify({
            type: 'response.create'
          }));

        } catch (error: any) {
          logger.error("Error handling bookSearchTool", {
            error: error.message,
            args
          });

          sendFunctionCallOutput(
            callId,
            "I'm having trouble searching for books right now. Can you try asking for a story in a different way?"
          );

          // Trigger model response after error
          dataChannelRef.current?.send(JSON.stringify({
            type: 'response.create'
          }));
        }
      };

      const handleDisplayBookPage = async (callId: string, args: any) => {
        logger.info("display_book_page was called!", { callId, args });

        try {
          // Check if we have a stored book
          if (!selectedBookRef.current) {
            sendFunctionCallOutput(
              callId,
              "I need to search for a book first before I can display pages. What kind of story would you like to read?"
            );
            
            dataChannelRef.current?.send(JSON.stringify({
              type: 'response.create'
            }));
            return;
          }

          // Parse the page request (could be "first", "next", "previous", or a number)
          let targetPageNumber = currentPageRef.current;
          
          if (args.pageRequest) {
            const request = args.pageRequest.toLowerCase();
            if (request === 'first' || request === 'start') {
              targetPageNumber = 1;
            } else if (request === 'next') {
              targetPageNumber = Math.min(currentPageRef.current + 1, selectedBookRef.current.pages?.length || selectedBookRef.current.totalPages);
            } else if (request === 'previous' || request === 'back') {
              targetPageNumber = Math.max(currentPageRef.current - 1, 1);
            } else if (!isNaN(parseInt(request))) {
              targetPageNumber = Math.max(1, Math.min(parseInt(request), selectedBookRef.current.pages?.length || selectedBookRef.current.totalPages));
            }
          }

          // Get the page data from stored book
          const pages = selectedBookRef.current.pages || [];
          const targetPage = pages.find((p: any) => p.pageNumber === targetPageNumber);
          
          if (!targetPage) {
            sendFunctionCallOutput(
              callId,
              `I couldn't find page ${targetPageNumber} in "${selectedBookRef.current.title}". This book has ${pages.length} pages. Would you like me to show you page 1 instead?`
            );
            
            dataChannelRef.current?.send(JSON.stringify({
              type: 'response.create'
            }));
            return;
          }

          // Update current page
          currentPageRef.current = targetPageNumber;

          // Trigger the storybook display component
          if (options.onStorybookPageDisplay) {
            options.onStorybookPageDisplay({
              pageImageUrl: targetPage.imageUrl,
              pageText: targetPage.pageText,
              pageNumber: targetPage.pageNumber,
              totalPages: pages.length,
              bookTitle: selectedBookRef.current.title
            });
          }

          // Send page context back to Appu for better storytelling
          const pageContext = `Page ${targetPage.pageNumber} of "${selectedBookRef.current.title}" is now displayed. 

IMAGE DESCRIPTION: ${targetPage.imageDescription || 'A colorful illustration that matches the story'}

PAGE TEXT: "${targetPage.pageText}"

STORY CONTEXT: This is page ${targetPage.pageNumber} of ${pages.length} in the book. ${targetPage.pageNumber === 1 ? 'This is the beginning of our story.' : targetPage.pageNumber === pages.length ? 'This is the final page of our story.' : 'We are in the middle of our wonderful story.'}

Now please read this page aloud to the child in an engaging, storytelling voice. You can add expression and make it come alive!`;

          sendFunctionCallOutput(callId, pageContext);

          // Trigger model response
          dataChannelRef.current?.send(JSON.stringify({
            type: 'response.create'
          }));

          logger.info("Displayed page and sent context to Appu", {
            pageNumber: targetPageNumber,
            bookTitle: selectedBookRef.current.title,
            pageText: targetPage.pageText?.substring(0, 100) + "..."
          });

        } catch (error: any) {
          logger.error("Error handling display_book_page", {
            error: error.message,
            args
          });

          sendFunctionCallOutput(
            callId,
            "I'm having trouble displaying the book page right now. Let me try to continue with the story."
          );

          // Trigger model response after error
          dataChannelRef.current?.send(JSON.stringify({
            type: 'response.create'
          }));
        }
      };

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
          if (mediaCapture.hasVideoPermission && mediaCapture.captureFrame) {
            // Try capturing frame with retry mechanism
            let attempts = 0;
            const maxAttempts = 3;

            while (attempts < maxAttempts && !frameData) {
              attempts++;
              logger.info(`Frame capture attempt ${attempts}/${maxAttempts}`);

              frameData = mediaCapture.captureFrame();

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
              await mediaCapture.requestPermissions();
              // Wait a bit for video to initialize
              await new Promise((resolve) => setTimeout(resolve, 1000));
              // Try capturing after permission granted
              if (mediaCapture.captureFrame) {
                frameData = mediaCapture.captureFrame();
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
                await handleBookSearchTool(message.call_id, message.arguments);
              } else if (message.name === "display_book_page") {
                await handleDisplayBookPage(message.call_id, message.arguments);
              }
              break;
            case "response.done":
              logger.info("Response completed", {
                responseId: message.response?.id,
                status: message.response?.status,
                fullMessage: message,
              });
              // This indicates that OpenAI has finished generating a complete response
              // No specific action needed, just logging for completeness
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
            ["connecting", "open", "closing", "closed"][channel.readyState] ||
            "unknown",
        });
        setState((prev) => ({ ...prev, error: "Data channel error occurred" }));
        options.onError?.("Data channel connection failed");
      };

      channel.onclose = (event) => {
        logger.info("Data channel closed", {
          readyState: channel.readyState,
          wasClean: event?.wasClean,
          code: event?.code,
          reason: event?.reason,
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
      options.onTranscriptionReceived,
      options.onResponseReceived,
      options.onAudioResponseReceived,
      options.onError,
    ],
  );

  const connect = useCallback(async () => {
    try {
      logger.info("Starting OpenAI WebRTC connection");

      // If video is enabled, ensure media capture is initialized first
      if (options.enableVideo && mediaCapture) {
        logger.info("Video enabled, requesting media permissions first");
        try {
          await mediaCapture.requestPermissions();
          // Wait for video to be properly initialized
          await new Promise((resolve) => setTimeout(resolve, 1500));
          logger.info("Media permissions granted and video initialized");
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

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      setupPeerConnection(pc);
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
        "https://api.openai.com/v1/realtime",
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
    setupPeerConnection,
    setupDataChannel,
    options.enableVideo,
    options.onError,
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
    if (mediaCapture) {
      mediaCapture.cleanup();
    }

    setState((prev) => ({
      ...prev,
      isConnected: false,
      isRecording: false,
      lastCapturedFrame: null,
    }));
  }, [mediaCapture]);

  return {
    ...state,
    connect,
    disconnect,
    mediaCapture,
  };
}