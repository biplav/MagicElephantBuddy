import { useState, useRef, useCallback, useEffect } from 'react';
import { createServiceLogger } from '@/lib/logger';
import { WebSocketErrorLogger } from '@/lib/websocket-error-logger';
import { WebSocketErrorAnalyzer } from '@/lib/websocket-error-analyzer';

interface UseRealtimeAudioOptions {
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (text: string) => void;
  onAudioResponseReceived?: (audioData: string) => void;
  onError?: (error: string) => void;
  enableVideo?: boolean;
  onVideoFrame?: (frameData: string) => void;
  modelType?: 'openai' | 'gemini'; // Add model type option
}

interface RealtimeAudioState {
  isConnected: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  videoEnabled: boolean;
  hasVideoPermission: boolean;
  modelType: 'openai' | 'gemini';
  conversationId?: number;
}

interface MediaElements {
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
}

interface ConnectionRefs {
  pc: RTCPeerConnection | null;
  stream: MediaStream | null;
  dataChannel: RTCDataChannel | null;
  videoStream: MediaStream | null;
  frameInterval: NodeJS.Timeout | null;
  ws: WebSocket | null; // Add WebSocket ref for Gemini
}

// Import the modular utilities
import { WebSocketConnectionTracker } from '@/lib/websocket-connection-tracker';
import { WebSocketSessionManager } from '@/lib/websocket-session-manager';
import { WebSocketMessageHandler } from '@/lib/websocket-message-handler';

// Define callback types for message handling
interface MessageHandlerCallbacks {
  onSessionStarted: (conversationId: number) => void;
  onTextResponse: (text: string) => void;
  onVisionResponse: (text: string) => void;
  onError: (error: string) => void;
}

export default function useRealtimeAudio(options: UseRealtimeAudioOptions = {}) {
  // Initialize service loggers
  const realtimeLogger = createServiceLogger('realtime-audio');
  const geminiLogger = createServiceLogger('gemini-ws');
  const openaiLogger = createServiceLogger('openai-webrtc');
  const mediaLogger = createServiceLogger('media-capture');

  // Determine model type from options or default to OpenAI
  const modelType = options.modelType || 'openai';

  realtimeLogger.info('Initializing hook', { modelType, enableVideo: options.enableVideo });

  // State management
  const [state, setState] = useState<RealtimeAudioState>({
    isConnected: false,
    isRecording: false,
    isProcessing: false,
    error: null,
    videoEnabled: false,
    hasVideoPermission: false,
    modelType
  });

  // Update state.modelType when options.modelType changes
  useEffect(() => {
    if (state.modelType !== modelType) {
      realtimeLogger.info('Model type change detected', { 
        from: state.modelType, 
        to: modelType 
      });

      // Clean up any existing connections before switching
      if (state.isConnected) {
        realtimeLogger.warn('Cleaning up existing connection before model switch');
        disconnect();
      }

      setState(prev => ({ ...prev, modelType, isConnected: false, isRecording: false }));
    }
  }, [modelType, state.modelType]);

  // Refs for connection management
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null); // WebSocket for Gemini
  const videoStreamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to get selected child ID
  const getSelectedChildId = useCallback((): number => {
    const selectedChildId = localStorage.getItem("selectedChildId");
    return selectedChildId ? parseInt(selectedChildId) : 1;
  }, []);

  // Frame capture functionality
  const captureCurrentFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState >= 2) {
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = canvas.toDataURL('image/jpeg', 0.7);
        return frameData.split(',')[1]; // Return base64 data without prefix
      }
    }
    return null;
  }, []);

  // Media setup functions
  const createMediaConstraints = useCallback((enableVideo: boolean): MediaStreamConstraints => {
    const constraints: MediaStreamConstraints = {
      audio: {
        sampleRate: 24000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    };

    if (enableVideo) {
      constraints.video = {
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 2 }
      };
    }

    return constraints;
  }, []);

  const setupVideoElements = useCallback((stream: MediaStream) => {
    if (!options.enableVideo || stream.getVideoTracks().length === 0) {
      mediaLogger.debug('Video setup skipped', { 
        enableVideo: options.enableVideo, 
        videoTracks: stream.getVideoTracks().length 
      });
      return;
    }

    mediaLogger.info('Setting up video elements');
    setState(prev => ({ ...prev, videoEnabled: true, hasVideoPermission: true }));

    // Set up video preview (hidden)
    if (!videoRef.current) {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.style.display = 'none';
      videoRef.current = video;
      document.body.appendChild(video);
      mediaLogger.debug('Video element created and added to DOM');
    }

    // Set up canvas for frame capture
    if (!canvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      canvas.style.display = 'none';
      canvas.id = 'realtime-frame-canvas';
      canvasRef.current = canvas;
      document.body.appendChild(canvas);
      mediaLogger.debug('Canvas element created for frame capture', { 
        width: canvas.width, 
        height: canvas.height 
      });
    }
  }, [options.enableVideo]);

  // WebSocket handlers for Gemini
  const setupGeminiWebSocket = useCallback(async () => {
    try {
      geminiLogger.info('Initiating WebSocket connection setup');

      // Force WSS for Replit environment
      const protocol = 'wss:';
      const wsUrl = `${protocol}//${window.location.host}/gemini-ws`;
      
      geminiLogger.info('WebSocket URL constructed', { 
        wsUrl,
        protocol,
        host: window.location.host,
        location: window.location.href
      });

      // Initialize modular utilities
      const connectionTracker = new WebSocketConnectionTracker(geminiLogger);
      const sessionManager = new WebSocketSessionManager(geminiLogger);

      const messageCallbacks: MessageHandlerCallbacks = {
        onSessionStarted: (conversationId: number) => {
          geminiLogger.info('Session started callback triggered', { conversationId });
          setState(prev => ({ ...prev, conversationId }));
        },
        onTextResponse: (text: string) => {
          geminiLogger.debug('Text response callback triggered', { textLength: text.length });
          options.onResponseReceived?.(text);
        },
        onVisionResponse: (text: string) => {
          geminiLogger.debug('Vision response callback triggered', { textLength: text.length });
          options.onResponseReceived?.(text);
        },
        onError: (error: string) => {
          geminiLogger.error('Error callback triggered', { error });
          setState(prev => ({ ...prev, error }));
          options.onError?.(error);
        }
      };

      const messageHandler = new WebSocketMessageHandler(geminiLogger, messageCallbacks);

      geminiLogger.info('Connection attempt starting', { 
        url: wsUrl,
        locationDetails: {
          host: window.location.host,
          hostname: window.location.hostname,
          port: window.location.port,
          protocol: window.location.protocol,
          pathname: window.location.pathname
        },
        timing: connectionTracker.startTracking()
      });

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
        geminiLogger.info('WebSocket object created successfully', {
          wsUrl,
          readyState: ws.readyState
        });
      } catch (wsCreateError: any) {
        geminiLogger.error('Failed to create WebSocket object', {
          error: wsCreateError.message,
          wsUrl
        });
        throw new Error(`Failed to create WebSocket: ${wsCreateError.message}`);
      }
      geminiLogger.debug('WebSocket object created', {
        readyState: ws.readyState,
        readyStateLabel: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState],
        protocols: ws.protocol,
        extensions: ws.extensions,
        binaryType: ws.binaryType,
        bufferedAmount: ws.bufferedAmount
      });
      wsRef.current = ws;

      // Set up connection timeout
      connectionTracker.setupTimeout(ws, wsUrl, 10000);

      ws.onopen = () => {
        connectionTracker.clearTimeout();
        connectionTracker.logConnectionSuccess(wsUrl, ws);

        geminiLogger.info('WebSocket onopen event triggered', {
          readyState: ws.readyState,
          protocol: ws.protocol,
          url: wsUrl
        });

        setState(prev => ({ ...prev, isConnected: true, error: null }));

        // Start Gemini session
        const childId = getSelectedChildId();
        sessionManager.sendSessionStart(ws, childId);
      };

      ws.onmessage = (event) => {
        messageHandler.handleMessage(event);
      };

      ws.onerror = (error) => {
        connectionTracker.clearTimeout();

        const errorLogger = new WebSocketErrorLogger(geminiLogger);
        const analysis = errorLogger.logComprehensiveError({
          error,
          ws,
          url: wsUrl
        });

        // Update state with the analyzed error
        setState(prev => ({ ...prev, error: analysis.message, isConnected: false }));
        options.onError?.(analysis.message);

        // Clean up WebSocket reference
        if (wsRef.current === ws) {
          wsRef.current = null;
          geminiLogger.debug('WebSocket reference cleared due to error', {
            errorCategory: analysis.category,
            shouldRetry: analysis.shouldRetry
          });
        }
      };

      ws.onclose = (event) => {
        connectionTracker.clearTimeout();
        connectionTracker.logConnectionClose(event, wsUrl);

        setState(prev => ({ ...prev, isConnected: false, isRecording: false }));

        // Clean up WebSocket reference
        if (wsRef.current === ws) {
          wsRef.current = null;
          geminiLogger.debug('WebSocket reference cleared on close', {
            closeCode: event.code,
            wasClean: event.wasClean
          });
        }
      };

    } catch (error: any) {
      geminiLogger.error('Error during WebSocket setup', { 
        error: error.message,
        stack: error.stack,
        errorType: error.constructor.name
      });
      setState(prev => ({ ...prev, error: error.message }));
      options.onError?.(error.message);
    }
  }, [options, getSelectedChildId]);



  // Send text to Gemini via WebSocket
  const sendTextToGemini = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('🔗 GEMINI: Sending text:', text);
      wsRef.current.send(JSON.stringify({
        type: 'text_input',
        text: text
      }));

      // Call transcription callback
      options.onTranscriptionReceived?.(text);
    }
  }, [options]);

  // Send video frame to Gemini
  const sendVideoFrameToGemini = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const frameData = captureCurrentFrame();
      if (frameData) {
        console.log('🔗 GEMINI: Sending video frame');
        wsRef.current.send(JSON.stringify({
          type: 'video_frame',
          frameData: frameData
        }));
      }
    }
  }, [captureCurrentFrame]);

  // OpenAI WebRTC setup functions (existing code)
  const setupAudioTrack = useCallback((stream: MediaStream, pc: RTCPeerConnection) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    pc.addTrack(audioTrack, stream);

    console.log('🎤 OPENAI: Audio track added:', {
      kind: audioTrack.kind,
      enabled: audioTrack.enabled,
      readyState: audioTrack.readyState,
      label: audioTrack.label
    });

    audioTrack.addEventListener('ended', () => console.log('🎤 OPENAI: Audio track ended'));
    audioTrack.addEventListener('mute', () => console.log('🎤 OPENAI: Audio track muted'));
    audioTrack.addEventListener('unmute', () => console.log('🎤 OPENAI: Audio track unmuted'));
  }, []);

  // Session management for OpenAI
  const createOpenAISession = useCallback(async (): Promise<string> => {
    const childId = getSelectedChildId();

    const response = await fetch('/api/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        childId,
        modelType: 'openai'
      })
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

  // WebRTC setup functions for OpenAI
  const setupPeerConnectionHandlers = useCallback((pc: RTCPeerConnection) => {
    pc.ontrack = (event) => {
      console.log('🎤 OPENAI: Received audio track from OpenAI');
      const remoteStream = event.streams[0];
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;

      audio.onloadedmetadata = () => console.log('🎤 OPENAI: Audio metadata loaded, starting playback');
      audio.onerror = (error) => console.error('🎤 OPENAI: Audio playback error:', error);
    };

    pc.onconnectionstatechange = () => {
      console.log('🎤 OPENAI: WebRTC connection state:', pc.connectionState);

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

    pc.onicegatheringstatechange = () => {
      console.log('🎤 OPENAI: ICE gathering state:', pc.iceGatheringState);
    };
  }, []);

  // OpenAI message handling (existing code)
  const handleOpenAIDataChannelMessage = useCallback(async (messageEvent: MessageEvent) => {
    try {
      const message = JSON.parse(messageEvent.data);
      console.log('🎤 OPENAI: Received message type:', message.type, 'at', new Date().toISOString());

      switch (message.type) {
        case 'conversation.item.input_audio_transcription.completed':
          console.log('🎤 OPENAI: Processing transcription completion');
          if (message.transcript) {
            options.onTranscriptionReceived?.(message.transcript);

            // Store transcription
            try {
              const childId = getSelectedChildId();
              await fetch('/api/store-realtime-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'child_input',
                  content: message.transcript,
                  transcription: message.transcript,
                  childId: childId
                })
              });
            } catch (error) {
              console.error('🎤 OPENAI: Error storing transcription:', error);
            }
          }
          break;

        case 'response.audio_transcript.done':
          console.log('🎤 OPENAI: Audio transcript done:', message.transcript);
          if (message.transcript) {
            options.onResponseReceived?.(message.transcript);

            // Store response
            try {
              const childId = getSelectedChildId();
              await fetch('/api/store-realtime-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'appu_response',
                  content: message.transcript,
                  childId: childId
                })
              });
            } catch (error) {
              console.error('🎤 OPENAI: Error storing response:', error);
            }
          }
          break;

        case 'response.audio.delta':
          console.log('🎤 OPENAI: Audio delta received');
          options.onAudioResponseReceived?.(message.delta);
          break;

        case 'error':
          console.error('🎤 OPENAI: API error:', message);
          setState(prev => ({ ...prev, error: message.error?.message || 'Unknown error' }));
          options.onError?.(message.error?.message || 'Unknown error');
          break;
      }
    } catch (error) {
      console.error('🎤 OPENAI: Error parsing data channel message:', error);
    }
  }, [options, getSelectedChildId]);

  const setupOpenAIDataChannel = useCallback((pc: RTCPeerConnection) => {
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      dataChannelRef.current = channel;

      channel.onopen = async () => {
        console.log('🎤 OPENAI: Data channel opened');
        try {
          const childId = getSelectedChildId();
          channel.send(JSON.stringify({
            type: 'start_session',
            childId: childId
          }));
          console.log(`🎤 OPENAI: Started realtime session for child ${childId}`);
        } catch (error) {
          console.error('🎤 OPENAI: Error starting realtime session:', error);
        }
      };

      channel.onmessage = handleOpenAIDataChannelMessage;
      channel.onerror = (error) => console.error('🎤 OPENAI: Data channel error:', error);
    };
  }, [getSelectedChildId, handleOpenAIDataChannelMessage]);

  // OpenAI WebRTC connection function
  const connectOpenAI = useCallback(async () => {
    try {
      console.log('🎤 OPENAI: Starting WebRTC connection...');

      // Create session and get client secret
      const client_secret = await createOpenAISession();

      // Create WebRTC peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Setup connection handlers
      setupPeerConnectionHandlers(pc);
      setupOpenAIDataChannel(pc);

      // Get media stream
      const mediaConstraints = createMediaConstraints(options.enableVideo || false);
      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      streamRef.current = stream;

      // Setup audio and video
      setupAudioTrack(stream, pc);
      setupVideoElements(stream);

      // Create offer and connect to OpenAI
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await pc.setLocalDescription(offer);

      // Send offer to OpenAI Realtime API
      const realtimeResponse = await fetch('https://api.openai.com/v1/realtime', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client_secret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });

      if (!realtimeResponse.ok) {
        const errorText = await realtimeResponse.text();
        console.error('🎤 OPENAI: Realtime API error:', errorText);
        throw new Error(`Failed to connect to OpenAI Realtime API: ${realtimeResponse.status}`);
      }

      const answerSdp = await realtimeResponse.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      console.log('🎤 OPENAI: WebRTC connection established');

    } catch (error: any) {
      console.error('🎤 OPENAI: Error connecting:', error);
      setState(prev => ({ ...prev, error: error.message || 'Failed to connect to OpenAI' }));
      options.onError?.(error.message || 'Failed to connect to OpenAI');
    }
  }, [options, createOpenAISession, setupPeerConnectionHandlers, setupOpenAIDataChannel, createMediaConstraints, setupAudioTrack, setupVideoElements]);

  // Main connection function - routes to appropriate method based on model type
  const connect = useCallback(async () => {
    if (isConnectingRef.current || state.isConnected) {
      realtimeLogger.warn('Connection attempt blocked', {
        reason: isConnectingRef.current ? 'already connecting' : 'already connected',
        currentState: { isConnecting: isConnectingRef.current, isConnected: state.isConnected }
      });
      return;
    }

    try {
      isConnectingRef.current = true;
      setState(prev => ({ ...prev, error: null }));

      realtimeLogger.info('Starting connection process', { modelType: state.modelType });

      if (state.modelType === 'gemini') {
        realtimeLogger.info('Using Gemini WebSocket connection method');
        await setupGeminiWebSocket();
      } else {
        realtimeLogger.info('Using OpenAI WebRTC connection method');
        await connectOpenAI();
      }

      realtimeLogger.info('Connection process completed successfully');

    } catch (error: any) {
      realtimeLogger.error('Connection process failed', {
        error: error.message,
        stack: error.stack,
        modelType: state.modelType
      });
      setState(prev => ({ ...prev, error: error.message || 'Failed to connect' }));
      options.onError?.(error.message || 'Failed to connect');
    } finally {
      isConnectingRef.current = false;
      realtimeLogger.debug('Connection attempt flag cleared');
    }
  }, [state.isConnected, state.modelType, options, setupGeminiWebSocket, connectOpenAI]);

  // Cleanup function
  const cleanupElements = useCallback(() => {
    // Clean up video elements
    if (videoRef.current && document.body.contains(videoRef.current)) {
      document.body.removeChild(videoRef.current);
      videoRef.current = null;
    }

    if (canvasRef.current && document.body.contains(canvasRef.current)) {
      document.body.removeChild(canvasRef.current);
      canvasRef.current = null;
    }

    // Clean up streams
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(track => track.stop());
      videoStreamRef.current = null;
    }

    // Clear intervals
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  }, []);

  // Disconnect function
  const disconnect = useCallback(() => {
    realtimeLogger.info('Starting disconnect process');
    isConnectingRef.current = false;

    let cleanupActions = [];

    // Disconnect WebRTC (OpenAI)
    if (pcRef.current) {
      openaiLogger.info('Closing WebRTC peer connection');
      pcRef.current.close();
      pcRef.current = null;
      cleanupActions.push('WebRTC peer connection');
    }

    if (dataChannelRef.current) {
      openaiLogger.info('Closing WebRTC data channel');
      dataChannelRef.current.close();
      dataChannelRef.current = null;
      cleanupActions.push('WebRTC data channel');
    }

    // Disconnect WebSocket (Gemini)
    if (wsRef.current) {
      geminiLogger.info('Closing WebSocket connection');
      wsRef.current.close();
      wsRef.current = null;
      cleanupActions.push('Gemini WebSocket');
    }

    cleanupElements();
    cleanupActions.push('media elements');

    setState(prev => ({ 
      ...prev, 
      isConnected: false, 
      isRecording: false,
      isProcessing: false,
      videoEnabled: false,
      hasVideoPermission: false
    }));

    realtimeLogger.info('Disconnect process completed', {
      cleanedUp: cleanupActions,
      totalActions: cleanupActions.length
    });
  }, [cleanupElements]);

  // Recording controls
  const startRecording = useCallback(async () => {
    if (!state.isConnected) {
      await connect();
    } else {
      setState(prev => ({ ...prev, isRecording: true }));
      console.log('🎤 RECORDING: Started');
    }
  }, [state.isConnected, connect]);

  const stopRecording = useCallback(() => {
    setState(prev => ({ ...prev, isRecording: false, isProcessing: true }));
    console.log('🎤 RECORDING: Stopped');
  }, []);

  // Permission request
  const requestMicrophonePermission = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);
      setState(prev => ({ ...prev, error: 'Microphone permission denied' }));
      options.onError?.('Microphone permission denied');
      return false;
    }
  }, [options]);

  // Global frame capture exposure
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).captureCurrentFrame = captureCurrentFrame;
      (window as any).sendTextToGemini = sendTextToGemini;
      (window as any).sendVideoFrameToGemini = sendVideoFrameToGemini;
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).captureCurrentFrame;
        delete (window as any).sendTextToGemini;
        delete (window as any).sendVideoFrameToGemini;
      }
    };
  }, [captureCurrentFrame, sendTextToGemini, sendVideoFrameToGemini]);

    const stopVideoCapture = useCallback(() => {
        if (videoStreamRef.current) {
          videoStreamRef.current.getTracks().forEach(track => track.stop());
          videoStreamRef.current = null;
        }

        if (frameIntervalRef.current) {
          clearInterval(frameIntervalRef.current);
          frameIntervalRef.current = null;
        }

        // setState(prev => ({ ...prev, isVideoCapturing: false }));
      }, []);

      // Handle tool-triggered frame capture
      const handleToolFrameCapture = useCallback(async (callId: string, toolName: string) => {
        console.log(`🔧 ${toolName} triggered - capturing frame...`);

        try {
          if (!videoStreamRef.current) {
            throw new Error('Camera not available');
          }

          // Capture current frame
          const canvas = document.createElement('canvas');
          const video = document.createElement('video');
          video.srcObject = videoStreamRef.current;
          video.play();

          await new Promise(resolve => {
            video.onloadedmetadata = resolve;
          });

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(video, 0, 0);

          // Convert to base64
          const frameData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

          // Send to analyze-frame endpoint
          const response = await fetch('/api/analyze-frame', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              frameData,
              sessionId: state.conversationId
            })
          });

          const result = await response.json();

          if (result.analysis) {
            // Send tool response back to server
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'tool_response',
                call_id: callId,
                tool_name: toolName,
                result: result.analysis
              }));
            }
          } else {
            throw new Error('No analysis result received');
          }

        } catch (error) {
          console.error('Tool frame capture failed:', error);

          // Send error response
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'tool_response',
              call_id: callId,
              tool_name: toolName,
              result: "I'm having trouble seeing right now. Can you try showing me again?"
            }));
          }
        }
      }, [state.conversationId]);

  // Cleanup on unmount and handle unhandled rejections
  useEffect(() => {
    // Add global handler for unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      geminiLogger.error('Unhandled promise rejection detected', {
        reason: event.reason,
        promise: event.promise,
        stack: event.reason?.stack
      });
      
      // Prevent default browser behavior
      event.preventDefault();
      
      // Update state with error if it's WebSocket related
      if (event.reason?.message?.includes('WebSocket') || 
          event.reason?.message?.includes('connection')) {
        setState(prev => ({ 
          ...prev, 
          error: 'Connection failed. Please try again.',
          isConnected: false 
        }));
        options.onError?.('Connection failed. Please try again.');
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      disconnect();
    };
  }, [disconnect, options]);

  // Expose additional methods for Gemini
  return {
    ...state,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    requestMicrophonePermission,
    captureCurrentFrame,
    sendTextToGemini, // Expose for manual text sending
    sendVideoFrameToGemini, // Expose for manual frame sending
    isReady: state.isConnected
  };
}