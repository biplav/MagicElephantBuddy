import { useState, useRef, useCallback, useEffect } from 'react';

interface UseRealtimeAudioOptions {
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (text: string) => void;
  onAudioResponseReceived?: (audioData: string) => void;
  onError?: (error: string) => void;
  enableVideo?: boolean;
  onVideoFrame?: (frameData: string) => void;
}

interface RealtimeAudioState {
  isConnected: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  videoEnabled: boolean;
  hasVideoPermission: boolean;
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
}

export default function useRealtimeAudio(options: UseRealtimeAudioOptions = {}) {
  // State management
  const [state, setState] = useState<RealtimeAudioState>({
    isConnected: false,
    isRecording: false,
    isProcessing: false,
    error: null,
    videoEnabled: false,
    hasVideoPermission: false
  });

  // Refs for connection management
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
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

  const setupAudioTrack = useCallback((stream: MediaStream, pc: RTCPeerConnection) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    pc.addTrack(audioTrack, stream);

    console.log('🎤 AUDIO: Audio track added:', {
      kind: audioTrack.kind,
      enabled: audioTrack.enabled,
      readyState: audioTrack.readyState,
      label: audioTrack.label
    });

    // Monitor audio track state changes
    audioTrack.addEventListener('ended', () => console.log('🎤 AUDIO: Audio track ended'));
    audioTrack.addEventListener('mute', () => console.log('🎤 AUDIO: Audio track muted'));
    audioTrack.addEventListener('unmute', () => console.log('🎤 AUDIO: Audio track unmuted'));
  }, []);

  // Session management
  const createSession = useCallback(async (): Promise<string> => {
    const childId = getSelectedChildId();

    const response = await fetch('/api/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ childId })
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

  // WebRTC setup functions
  const setupPeerConnectionHandlers = useCallback((pc: RTCPeerConnection) => {
    // Handle incoming audio from OpenAI
    pc.ontrack = (event) => {
      console.log('Received audio track from OpenAI');
      const remoteStream = event.streams[0];
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;

      audio.onloadedmetadata = () => console.log('Audio metadata loaded, starting playback');
      audio.onerror = (error) => console.error('Audio playback error:', error);
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('WebRTC connection state:', pc.connectionState);

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
      console.log('ICE gathering state:', pc.iceGatheringState);
    };
  }, []);

  // Message handling functions
  const handleTranscriptionMessage = useCallback(async (message: any) => {
    console.log('🎤 TRANSCRIPTION: Transcription completed event received');
    console.log('🎤 TRANSCRIPTION: Message structure:', {
      type: message.type,
      transcript: message.transcript,
      hasTranscript: !!message.transcript,
      transcriptLength: message.transcript?.length || 0
    });

    if (message.transcript) {
      console.log('🎤 TRANSCRIPTION: Processing transcript:', message.transcript);

      try {
        const childId = getSelectedChildId();
        console.log('🎤 TRANSCRIPTION: Storing for child ID:', childId);
        
        const response = await fetch('/api/store-realtime-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'child_input',
            content: message.transcript,
            transcription: message.transcript,
            childId: childId
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Storage failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('🎤 TRANSCRIPTION: Stored message in database:', result);
      } catch (error) {
        console.error('🎤 TRANSCRIPTION: Error storing child input message:', error);
      }

      options.onTranscriptionReceived?.(message.transcript);
    } else {
      console.warn('🎤 TRANSCRIPTION: No transcript in message');
    }
  }, [options, getSelectedChildId]);

  const handleGetEyesTool = useCallback(async (message: any) => {
    console.log('🔧 getEyesTool invoked:', {
      name: message.name,
      call_id: message.call_id,
      arguments: message.arguments,
      timestamp: new Date().toISOString()
    });

    console.log('🔧 Video setup check:', {
      hasVideo: !!videoRef.current,
      hasCanvas: !!canvasRef.current,
      videoReady: videoRef.current?.readyState >= 2,
      dataChannelOpen: dataChannelRef.current?.readyState === 'open'
    });

    const frameData = captureCurrentFrame();
    console.log('🔧 Frame capture result:', {
      frameDataLength: frameData?.length || 0,
      hasFrameData: !!frameData
    });

    const sendToolResponse = (output: string) => {
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        dataChannelRef.current.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: message.call_id,
            output
          }
        }));
      }
    };

    if (frameData) {
      try {
        const analysisResponse = await fetch('/api/analyze-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frameData,
            reason: message.arguments?.reason || 'Child is showing something'
          })
        });

        if (analysisResponse.ok) {
          const result = await analysisResponse.json();
          console.log('🔧 Frame analysis result:', result.analysis);
          sendToolResponse(result.analysis);
        } else {
          console.error('Frame analysis failed');
          sendToolResponse("I'm having trouble seeing what you're showing me right now. Can you try again?");
        }
      } catch (error) {
        console.error('Error in getEyesTool:', error);
        sendToolResponse("I'm having trouble seeing what you're showing me right now. Can you try again?");
      }
    } else {
      console.log('No frame available for analysis');
      sendToolResponse("I don't see anything right now. Make sure your camera is on and try showing me again!");
    }
  }, [captureCurrentFrame]);

  const handleResponseDone = useCallback(async (message: any) => {
    console.log('🎤 RESPONSE: Response done event received:', message);
    
    try {
      let responseText = '';
      
      // Handle different response formats from OpenAI Realtime API
      if (message.response && message.response.output) {
        responseText = message.response.output.map((item: any) => {
          if (item.type === 'message' && item.message && item.message.content) {
            return item.message.content.map((content: any) => 
              content.type === 'text' ? content.text : ''
            ).join('');
          }
          return '';
        }).join('');
      } else if (message.text) {
        responseText = message.text;
      } else if (message.content) {
        responseText = message.content;
      }

      if (responseText && responseText.trim()) {
        console.log('🎤 RESPONSE: Storing response text:', responseText.slice(0, 100) + '...');
        const childId = getSelectedChildId();
        
        const response = await fetch('/api/store-realtime-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'appu_response',
            content: responseText,
            childId: childId
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Storage failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('🎤 RESPONSE: Stored response in database:', result);
      } else {
        console.warn('🎤 RESPONSE: No valid response text found to store');
      }
    } catch (error) {
      console.error('🎤 RESPONSE: Error storing Appu response message:', error);
    }
    
    setState(prev => ({ ...prev, isProcessing: false }));
  }, [getSelectedChildId]);

  const handleDataChannelMessage = useCallback(async (messageEvent: MessageEvent) => {
    try {
      const message = JSON.parse(messageEvent.data);
      console.log('🎤 REALTIME: Received message type:', message.type, 'at', new Date().toISOString());

      switch (message.type) {
        case 'conversation.item.input_audio_transcription.completed':
          console.log('🎤 REALTIME: Processing transcription completion');
          await handleTranscriptionMessage(message);
          break;
        case 'conversation.item.input_audio_transcription.delta':
          console.log('🎤 TRANSCRIPTION: Partial transcription delta:', message.delta);
          break;
        case 'conversation.item.input_audio_transcription.failed':
          console.error('🎤 TRANSCRIPTION: Transcription failed:', message.error);
          break;
        case 'input_audio_buffer.speech_started':
          console.log('🎤 AUDIO: Speech detection started');
          break;
        case 'input_audio_buffer.speech_stopped':
          console.log('🎤 AUDIO: Speech detection stopped');
          break;
        case 'input_audio_buffer.committed':
          console.log('🎤 AUDIO: Audio buffer committed for transcription');
          break;
        case 'response.text.delta':
          console.log('🎤 RESPONSE: Text delta received:', message.delta);
          options.onResponseReceived?.(message.delta);
          break;
        case 'response.audio.delta':
          console.log('🎤 RESPONSE: Audio delta received');
          options.onAudioResponseReceived?.(message.delta);
          break;
        case 'response.audio_transcript.delta':
          console.log('🎤 RESPONSE: Audio transcript delta:', message.delta);
          break;
        case 'response.audio_transcript.done':
          console.log('🎤 RESPONSE: Audio transcript done:', message.transcript);
          if (message.transcript) {
            await handleResponseDone({ text: message.transcript });
          }
          break;
        case 'response.function_call_arguments.done':
          if (message.name === 'getEyesTool') {
            console.log('🎤 TOOL: getEyesTool invoked');
            await handleGetEyesTool(message);
          }
          break;
        case 'response.done':
          console.log('🎤 REALTIME: Processing response completion');
          await handleResponseDone(message);
          break;
        case 'error':
          console.error('🎤 REALTIME: API error:', message);
          setState(prev => ({ ...prev, error: message.error?.message || 'Unknown error' }));
          options.onError?.(message.error?.message || 'Unknown error');
          break;
        default:
          console.log('🎤 REALTIME: Unhandled message type:', message.type, 'Full message:', message);
          if (message.type && message.type.includes('transcription')) {
            console.log('🎤 TRANSCRIPTION: Possible transcription message with unknown type');
          }
          break;
      }
    } catch (error) {
      console.error('🎤 REALTIME: Error parsing data channel message:', error);
    }
  }, [options, handleTranscriptionMessage, handleGetEyesTool, handleResponseDone]);

  const setupDataChannel = useCallback((pc: RTCPeerConnection) => {
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      dataChannelRef.current = channel;

      channel.onopen = async () => {
        console.log('Data channel opened');
        try {
          const childId = getSelectedChildId();
          channel.send(JSON.stringify({
            type: 'start_session',
            childId: childId
          }));
          console.log(`Started realtime session for child ${childId}`);
        } catch (error) {
          console.error('Error starting realtime session:', error);
        }
      };

      channel.onmessage = handleDataChannelMessage;
      channel.onerror = (error) => console.error('Data channel error:', error);
    };
  }, [getSelectedChildId, handleDataChannelMessage]);

  // Main connection function
  const connect = useCallback(async () => {
    if (isConnectingRef.current || state.isConnected || pcRef.current) {
      console.log('Connection already in progress or established');
      return;
    }

    try {
      isConnectingRef.current = true;
      setState(prev => ({ ...prev, error: null }));

      // Create session and get client secret
      const client_secret = await createSession();

      // Create WebRTC peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Setup connection handlers
      setupPeerConnectionHandlers(pc);
      setupDataChannel(pc);

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
        console.error('OpenAI Realtime API error:', errorText);
        throw new Error(`Failed to connect to OpenAI Realtime API: ${realtimeResponse.status}`);
      }

      const answerSdp = await realtimeResponse.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      console.log('WebRTC connection established with OpenAI Realtime API');

    } catch (error: any) {
      console.error('Error connecting to realtime API:', error);
      setState(prev => ({ ...prev, error: error.message || 'Failed to connect to realtime API' }));
      options.onError?.(error.message || 'Failed to connect to realtime API');
    } finally {
      isConnectingRef.current = false;
    }
  }, [state.isConnected, options, createSession, setupPeerConnectionHandlers, setupDataChannel, createMediaConstraints, setupAudioTrack, setupVideoElements]);

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

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
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

    console.log('Disconnected from realtime API');
  }, [cleanupElements]);

  // Recording controls
  const startRecording = useCallback(async () => {
    if (!state.isConnected) {
      await connect();
    } else {
      setState(prev => ({ ...prev, isRecording: true }));
      console.log('Started realtime audio recording');
    }
  }, [state.isConnected, connect]);

  const stopRecording = useCallback(() => {
    setState(prev => ({ ...prev, isRecording: false, isProcessing: true }));
    console.log('Stopped realtime audio recording');
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
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).captureCurrentFrame;
      }
    };
  }, [captureCurrentFrame]);

    const stopVideoCapture = useCallback(() => {
        if (videoStreamRef.current) {
          videoStreamRef.current.getTracks().forEach(track => track.stop());
          videoStreamRef.current = null;
        }
  
        if (frameIntervalRef.current) {
          clearInterval(frameIntervalRef.current);
          frameIntervalRef.current = null;
        }
  
        setState(prev => ({ ...prev, isVideoCapturing: false }));
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

  return {
    ...state,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    requestMicrophonePermission,
    captureCurrentFrame,
    isReady: state.isConnected
  };
}