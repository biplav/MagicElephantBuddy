import { useState, useRef, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';
import { useMediaCapture } from './useMediaCapture';

interface OpenAIConnectionOptions {
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (text: string) => void;
  onAudioResponseReceived?: (audioData: string) => void;
  onError?: (error: string) => void;
  enableVideo?: boolean;
}

interface OpenAIConnectionState {
  isConnected: boolean;
  isRecording: boolean;
  error: string | null;
}

export function useOpenAIConnection(options: OpenAIConnectionOptions = {}) {
  const logger = createServiceLogger('openai-connection');

  const [state, setState] = useState<OpenAIConnectionState>({
    isConnected: false,
    isRecording: false,
    error: null
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  // Add media capture for frame analysis
  const mediaCapture = useMediaCapture({ enableVideo: options.enableVideo });

  const getSelectedChildId = useCallback((): string => {
    const selectedChildId = localStorage.getItem("selectedChildId");
    if (selectedChildId) {
      return selectedChildId;
    }
    return '1085268853542289410';
  }, []);

  const createSession = useCallback(async (): Promise<string> => {
    const childId = getSelectedChildId();
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childId, modelType: 'openai' })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create session: ${response.status} - ${errorText}`);
    }

    const { client_secret } = await response.json();
    if (!client_secret) {
      throw new Error('No client secret received from server');
    }
    return client_secret;
  }, [getSelectedChildId]);

  const setupPeerConnection = useCallback((pc: RTCPeerConnection) => {
    pc.ontrack = (event) => {
      logger.info('Received audio track from OpenAI');
      const remoteStream = event.streams[0];
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
    };

    pc.onconnectionstatechange = () => {
      logger.info('WebRTC connection state', { state: pc.connectionState });
      switch (pc.connectionState) {
        case 'connected':
          setState(prev => ({ ...prev, isConnected: true, isRecording: true }));
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          setState(prev => ({ ...prev, isConnected: false, isRecording: false }));
          break;
      }
    };

    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      logger.info('ICE connection state changed', { 
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState 
      });

      if (pc.iceConnectionState === 'failed') {
        logger.error('ICE connection failed');
        setState(prev => ({ ...prev, error: 'Connection failed' }));
        options.onError?.('Connection failed');
      }
    };

    // Handle ICE gathering state changes
    pc.onicegatheringstatechange = () => {
      logger.info('ICE gathering state changed', { iceGatheringState: pc.iceGatheringState });
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        logger.info('ICE candidate received', { 
          candidate: event.candidate.candidate.substring(0, 50) + '...' 
        });
      } else {
        logger.info('ICE candidate gathering complete');
      }
    };

    // Handle signaling state changes
    pc.onsignalingstatechange = () => {
      logger.info('Signaling state changed', { signalingState: pc.signalingState });
    };

    // Handle negotiation needed
    pc.onnegotiationneeded = () => {
      logger.info('Negotiation needed');
    };
  }, []);

  const fetchEnhancedPrompt = useCallback(async (childId: string): Promise<string> => {
    try {
      logger.info('Fetching enhanced prompt from backend for child:', childId);
      const promptResponse = await fetch(`/api/debug/enhanced-prompt/${childId}`);

      if (!promptResponse.ok) {
        throw new Error(`Failed to fetch enhanced prompt: ${promptResponse.status}`);
      }

      const promptData = await promptResponse.json();
      const enhancedInstructions = promptData.fullPrompt;

      logger.info('Enhanced prompt fetched successfully', {
        promptLength: enhancedInstructions.length,
        childId: childId
      });

      return enhancedInstructions;
    } catch (error) {
      logger.error('Error fetching enhanced prompt', {
        error: error instanceof Error ? error.message : String(error),
        childId: childId
      });
      // Return fallback prompt
      return `You are Appu, a friendly AI assistant helping child ${childId}. Keep responses short, simple, and engaging for young children.`;
    }
  }, []);

  const setupDataChannel = useCallback((pc: RTCPeerConnection) => {
    // Create the data channel as required by OpenAI WebRTC API
    const channel = pc.createDataChannel("oai-events");
    dataChannelRef.current = channel;

    // Handle connection state changes
    const checkReadyState = () => {
      logger.info('Data channel ready state changed', {
        readyState: channel.readyState,
        readyStateLabel: ['connecting', 'open', 'closing', 'closed'][channel.readyState] || 'unknown'
      });
    };

    // Monitor ready state changes
    const stateCheckInterval = setInterval(checkReadyState, 1000);

    channel.onopen = async () => {
      logger.info('Data channel opened');
      clearInterval(stateCheckInterval);

      try {
        const childId = getSelectedChildId();
        const enhancedInstructions = await fetchEnhancedPrompt(childId);

        // Send session configuration with enhanced prompt
        channel.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: enhancedInstructions,
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 200
            },
            temperature: 0.8
          }
        }));
        logger.info('Session configuration sent successfully with enhanced prompt');
      } catch (error) {
        logger.error('Error sending session configuration', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    };

    const storeTranscribedMessage = async (transcript: string, type: 'child_input' | 'appu_response') => {
      try {
        const childId = getSelectedChildId();
        const apiType = type === 'child_input' ? 'child_input' : 'appu_response';
        const requestBody = type === 'child_input' ? {
          type: apiType,
          content: transcript,
          transcription: transcript,
          childId: childId
        } : {
          type: apiType,
          content: transcript,
          childId: childId
        };

        await fetch('/api/store-realtime-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        logger.info(`${type === 'child_input' ? 'Child message' : 'Appu response'} stored in backend`, { transcript });
      } catch (error) {
        logger.error(`Failed to store ${type === 'child_input' ? 'child message' : 'Appu response'}`, { error });
      }
    };

    const handleGetEyesTool = async (callId: string, args: any) => {
      logger.info('getEyesTool was called!', { callId, args });
      
      try {
        let frameData = null;

        // First check if video is enabled in options
        if (!options.enableVideo) {
          logger.warn('Video not enabled, cannot capture frame');
          const result = { 
            analysis: "I can't see anything because video is not enabled. Please enable video mode so I can see what you're showing me!" 
          };
          
          dataChannelRef.current?.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: JSON.stringify(result)
            }
          }));
          return;
        }

        // Check if we already have camera permission and can capture
        if (mediaCapture.hasVideoPermission && mediaCapture.captureFrame) {
          frameData = mediaCapture.captureFrame();
          logger.info('Captured frame using existing permission', { hasFrame: !!frameData });
        } else {
          // Request camera permission if not already granted
          logger.info('Requesting camera permission for frame capture');
          try {
            await mediaCapture.requestPermissions();
            // Wait a bit for video to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Try capturing after permission granted
            if (mediaCapture.captureFrame) {
              frameData = mediaCapture.captureFrame();
              logger.info('Captured frame after permission request', { hasFrame: !!frameData });
            }
          } catch (permissionError) {
            logger.warn('Camera permission denied for getEyesTool', { error: permissionError });
          }
        }

        if (!frameData) {
          // No frame available - return appropriate response
          const result = { 
            analysis: "I can't see anything right now. Please make sure your camera is working and try showing me again!" 
          };
          
          dataChannelRef.current?.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: JSON.stringify(result)
            }
          }));
          return;
        }

        // Call the frame analysis API
        const response = await fetch('/api/analyze-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frameData,
            childId: getSelectedChildId(),
            reason: args.reason || 'Child wants to show something'
          })
        });

        if (!response.ok) {
          throw new Error(`Analysis failed: ${response.status}`);
        }

        const analysisResult = await response.json();
        logger.info('Frame analysis completed', { analysis: analysisResult.analysis });

        // Send the analysis result back to OpenAI
        dataChannelRef.current?.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({ analysis: analysisResult.analysis })
          }
        }));

      } catch (error: any) {
        logger.error('Error handling getEyesTool', { error: error.message, stack: error.stack });
        
        // Send error response back to OpenAI
        dataChannelRef.current?.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({ 
              analysis: "I'm having trouble seeing what you're showing me right now. Can you try again?" 
            })
          }
        }));
      }
    };

    channel.onmessage = async (messageEvent: MessageEvent) => {
      try {
        logger.info('Raw data channel message received', {
          messageSize: messageEvent.data?.length,
          dataType: typeof messageEvent.data,
          rawData: messageEvent.data?.substring(0, 500) // First 500 chars for inspection
        });

        const message = JSON.parse(messageEvent.data);

        logger.info('Parsed data channel message', {
          messageType: message.type,
          messageKeys: Object.keys(message),
          fullMessage: message
        });

        switch (message.type) {
          case 'conversation.item.input_audio_transcription.completed':
            logger.info('Transcription completed message', {
              hasTranscript: !!message.transcript,
              transcriptLength: message.transcript?.length,
              transcript: message.transcript,
              fullMessage: message
            });
            if (message.transcript) {
              options.onTranscriptionReceived?.(message.transcript);
              await storeTranscribedMessage(message.transcript, 'child_input');
            }
            break;
          case 'response.audio_transcript.done':
            logger.info('Audio transcript done message', {
              hasTranscript: !!message.transcript,
              transcriptLength: message.transcript?.length,
              transcript: message.transcript,
              fullMessage: message
            });
            if (message.transcript) {
              options.onResponseReceived?.(message.transcript);
              await storeTranscribedMessage(message.transcript, 'appu_response');
            }
            break;
          case 'response.audio.delta':
            logger.info('Audio delta message', {
              hasDelta: !!message.delta,
              deltaLength: message.delta?.length,
              deltaType: typeof message.delta,
              delta: message.delta,
              fullMessage: message
            });
            options.onAudioResponseReceived?.(message.delta);
            break;
          case 'session.created':
            logger.info('Session created successfully', {
              sessionId: message.session?.id,
              model: message.session?.model,
              voice: message.session?.voice,
              fullMessage: message
            });
            break;
          case 'rate_limits.updated':
            logger.info('Rate limits updated', {
              rateLimits: message.rate_limits,
              fullMessage: message
            });
            break;
          case 'output_audio_buffer.stopped':
            logger.info('Audio output buffer stopped', {
              fullMessage: message
            });
            break;
          case 'response.output_item.added':
            logger.info('Response output item added', {
              itemId: message.item?.id,
              itemType: message.item?.type,
              itemRole: message.item?.role,
              itemStatus: message.item?.status,
              fullMessage: message
            });
            // This event indicates OpenAI is adding a new item to the response
            // Could be text, audio, or tool calls
            break;
          case 'response.function_call_arguments.delta':
            logger.info('Function call arguments delta', {
              callId: message.call_id,
              name: message.name,
              delta: message.delta,
              fullMessage: message
            });
            break;
          case 'response.function_call_arguments.done':
            logger.info('Function call arguments done', {
              callId: message.call_id,
              name: message.name,
              arguments: message.arguments,
              fullMessage: message
            });
            // When getEyesTool is called, handle it here
            if (message.name === 'getEyesTool') {
              await handleGetEyesTool(message.call_id, message.arguments);
            }
            break;
          case 'response.done':
            logger.info('Response completed', {
              responseId: message.response?.id,
              status: message.response?.status,
              fullMessage: message
            });
            // This indicates that OpenAI has finished generating a complete response
            // No specific action needed, just logging for completeness
            break;
          case 'error':
            logger.error('Error message received', {
              errorMessage: message.error?.message,
              errorType: message.error?.type,
              errorCode: message.error?.code,
              fullError: message.error,
              fullMessage: message
            });
            setState(prev => ({ ...prev, error: message.error?.message || 'Unknown error' }));
            options.onError?.(message.error?.message || 'Unknown error');
            break;
          default:
            logger.warn('Unknown message type received', {
              messageType: message.type,
              messageKeys: Object.keys(message),
              fullMessage: message
            });
            break;
        }
      } catch (error) {
        logger.error('Error parsing data channel message', { 
          error: error instanceof Error ? error.message : String(error),
          rawData: messageEvent.data?.substring(0, 200),
          dataType: typeof messageEvent.data,
          messageEventType: messageEvent.type
        });
      }
    };

    channel.onerror = (error) => {
      logger.error('Data channel error', { 
        error,
        readyState: channel.readyState,
        readyStateLabel: ['connecting', 'open', 'closing', 'closed'][channel.readyState] || 'unknown'
      });
      setState(prev => ({ ...prev, error: 'Data channel error occurred' }));
      options.onError?.('Data channel connection failed');
    };

    channel.onclose = (event) => {
      logger.info('Data channel closed', {
        readyState: channel.readyState,
        wasClean: event?.wasClean,
        code: event?.code,
        reason: event?.reason
      });
      clearInterval(stateCheckInterval);
      setState(prev => ({ ...prev, isConnected: false, isRecording: false }));
    };

    // Handle buffered amount changes
    channel.onbufferedamountlow = () => {
      logger.info('Data channel buffer amount low');
    };
  }, [getSelectedChildId, fetchEnhancedPrompt, mediaCapture, options.onTranscriptionReceived, options.onResponseReceived, options.onAudioResponseReceived, options.onError]);

  const connect = useCallback(async () => {
    try {
      logger.info('Starting OpenAI WebRTC connection');

      // Handle session creation with explicit error handling
      const client_secret = await createSession().catch((sessionError) => {
        logger.error('Session creation failed', {
          error: sessionError.message,
          stack: sessionError.stack
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
          noiseSuppression: true
        },
        video: options.enableVideo ? {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 2 }
        } : false
      };

      // Handle media stream with explicit error handling
      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints).catch((mediaError) => {
        logger.error('Media access failed', {
          error: mediaError.message,
          name: mediaError.name,
          constraint: mediaError.constraint
        });
        throw new Error(`Media access failed: ${mediaError.message}`);
      });

      streamRef.current = stream;

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        pc.addTrack(audioTrack, stream);
      }

      // Handle offer creation with explicit error handling
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      }).catch((offerError) => {
        logger.error('Offer creation failed', {
          error: offerError.message
        });
        throw new Error(`Offer creation failed: ${offerError.message}`);
      });

      await pc.setLocalDescription(offer).catch((localDescError) => {
        logger.error('Set local description failed', {
          error: localDescError.message
        });
        throw new Error(`Set local description failed: ${localDescError.message}`);
      });

      // Handle API request with explicit error handling
      const realtimeResponse = await fetch('https://api.openai.com/v1/realtime', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client_secret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      }).catch((fetchError) => {
        logger.error('OpenAI API request failed', {
          error: fetchError.message
        });
        throw new Error(`OpenAI API request failed: ${fetchError.message}`);
      });

      if (!realtimeResponse.ok) {
        const errorText = await realtimeResponse.text().catch(() => 'Unable to read error response');
        throw new Error(`Failed to connect to OpenAI: ${realtimeResponse.status} - ${errorText}`);
      }

      const answerSdp = await realtimeResponse.text().catch((textError) => {
        logger.error('Failed to read response text', {
          error: textError.message
        });
        throw new Error(`Failed to read response: ${textError.message}`);
      });

      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp }).catch((remoteDescError) => {
        logger.error('Set remote description failed', {
          error: remoteDescError.message
        });
        throw new Error(`Set remote description failed: ${remoteDescError.message}`);
      });

      logger.info('OpenAI WebRTC connection established');

    } catch (error: any) {
      logger.error('Error connecting to OpenAI:', {
        error: error.message,
        stack: error.stack,
        name: error.name
      });
      setState(prev => ({ ...prev, error: error.message }));
      options.onError?.(error.message);

      // Clean up on error
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  }, [createSession, setupPeerConnection, setupDataChannel, options.enableVideo, options.onError]);

  const disconnect = useCallback(() => {
    logger.info('Disconnecting OpenAI connection');

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Clean up media capture resources
    mediaCapture.cleanup();

    setState(prev => ({ 
      ...prev, 
      isConnected: false, 
      isRecording: false 
    }));
  }, [mediaCapture]);

  return {
    ...state,
    connect,
    disconnect
  };
}