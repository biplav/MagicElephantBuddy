import { useState, useRef, useCallback, useEffect } from 'react';

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

export default function useRealtimeAudio(options: UseRealtimeAudioOptions = {}) {
  // Determine model type from options or default to OpenAI
  const modelType = options.modelType || 'openai';

  console.log('🔧 REALTIME AUDIO: Initializing with modelType:', modelType);

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
    if (!options.enableVideo || stream.getVideoTracks().length === 0) return;

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
    }
  }, [options.enableVideo]);

  // WebSocket handlers for Gemini
  const setupGeminiWebSocket = useCallback(async () => {
    try {
      console.log('🔗 GEMINI: Setting up WebSocket connection...');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/gemini-ws`;
      
      console.log('🔗 GEMINI: Attempting to connect to:', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🔗 GEMINI: WebSocket connected');
        setState(prev => ({ ...prev, isConnected: true }));

        // Start Gemini session
        const childId = getSelectedChildId();
        ws.send(JSON.stringify({
          type: 'start_session',
          childId: childId
        }));
      };

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('🔗 GEMINI: Received message:', message.type);

          switch (message.type) {
            case 'session_started':
              console.log('🔗 GEMINI: Session started, conversation ID:', message.conversationId);
              setState(prev => ({ ...prev, conversationId: message.conversationId }));
              break;

            case 'text_response':
              console.log('🔗 GEMINI: Text response received:', message.text);
              options.onResponseReceived?.(message.text);
              break;

            case 'vision_response':
              console.log('🔗 GEMINI: Vision response received:', message.text);
              options.onResponseReceived?.(message.text);
              break;

            case 'error':
              console.error('🔗 GEMINI: Error:', message.error);
              setState(prev => ({ ...prev, error: message.error }));
              options.onError?.(message.error);
              break;
          }
        } catch (error) {
          console.error('🔗 GEMINI: Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        console.log('🔗 GEMINI: WebSocket disconnected');
        setState(prev => ({ ...prev, isConnected: false, isRecording: false }));
      };

      ws.onerror = (error) => {
        console.error('🔗 GEMINI: WebSocket error:', error);
        console.error('🔗 GEMINI: WebSocket URL was:', wsUrl);
        console.error('🔗 GEMINI: WebSocket readyState:', ws.readyState);
        setState(prev => ({ ...prev, error: 'WebSocket connection failed' }));
        options.onError?.('WebSocket connection failed');
      };

    } catch (error: any) {
      console.error('🔗 GEMINI: Error setting up WebSocket:', error);
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
      console.log('Connection already in progress or established');
      return;
    }

    try {
      isConnectingRef.current = true;
      setState(prev => ({ ...prev, error: null }));

      if (state.modelType === 'gemini') {
        console.log('🔗 CONNECTING: Using Gemini WebSocket approach');
        await setupGeminiWebSocket();
      } else {
        console.log('🔗 CONNECTING: Using OpenAI WebRTC approach');
        await connectOpenAI();
      }

    } catch (error: any) {
      console.error('🔗 CONNECTING: Error:', error);
      setState(prev => ({ ...prev, error: error.message || 'Failed to connect' }));
      options.onError?.(error.message || 'Failed to connect');
    } finally {
      isConnectingRef.current = false;
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
    isConnectingRef.current = false;

    // Disconnect WebRTC (OpenAI)
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    // Disconnect WebSocket (Gemini)
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    cleanupElements();

    setState(prev => ({ 
      ...prev, 
      isConnected: false, 
      isRecording: false,
      isProcessing: false,
      videoEnabled: false,
      hasVideoPermission: false
    }));

    console.log('🔗 DISCONNECTED: Cleaned up all connections');
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

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