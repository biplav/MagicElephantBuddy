import { useState, useRef, useCallback, useEffect } from 'react';
import useVideoRecorder from '@/hooks/useVideoRecorder';

interface UseConversationWebSocketOptions {
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (text: string) => void;
  onError?: (error: string) => void;
  enableVideo?: boolean;
  serviceType?: 'realtime' | 'gemini'; // Choose which service to use
}

interface ConversationWebSocketState {
  isConnected: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  videoEnabled: boolean;
  hasVideoPermission: boolean;
}

export default function useConversationWebSocket(options: UseConversationWebSocketOptions = {}) {
  const [state, setState] = useState<ConversationWebSocketState>({
    isConnected: false,
    isRecording: false,
    isProcessing: false,
    error: null,
    videoEnabled: false,
    hasVideoPermission: false
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  const pendingVideoCaptureRef = useRef<string | null>(null);
  
  // Initialize video recorder for on-demand capture
  const videoRecorder = useVideoRecorder({
    onError: (error) => {
      console.error('Video recorder error:', error);
      options.onError?.(error);
    },
    quality: 0.8
  });
  
  // Connect to WebSocket service
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }
    
    try {
      setState(prev => ({ ...prev, error: null }));
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = options.serviceType === 'gemini' 
        ? `${protocol}//${window.location.host}/gemini-ws`
        : `${protocol}//${window.location.host}/ws/realtime`;
      
      console.log(`Connecting to ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setState(prev => ({ ...prev, isConnected: true }));
        
        // Wait a moment for connection to stabilize before sending start_session
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            console.log('Sending start_session message');
            ws.send(JSON.stringify({
              type: 'start_session',
              childId: 1 // Default child ID
            }));
          }
        }, 100);
      };
      
      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Received WebSocket message:', message);
          
          switch (message.type) {
            case 'connection_established':
              console.log('Connection established at:', message.timestamp);
              break;
              
            case 'session_started':
              console.log('Session started successfully');
              break;
              
            case 'transcription':
              options.onTranscriptionReceived?.(message.text);
              break;
              
            case 'text_response':
              options.onResponseReceived?.(message.text);
              break;
              
            case 'vision_response':
              // Handle vision analysis response
              console.log('Vision analysis:', message.text);
              options.onResponseReceived?.(message.text);
              break;
              
            case 'video_capture_requested':
              // AI is requesting a video frame
              console.log('Video capture requested:', message.reason);
              await handleVideoCaptureRequest(message.call_id);
              break;
              
            case 'error':
              console.error('WebSocket error:', message.error);
              setState(prev => ({ ...prev, error: message.error }));
              options.onError?.(message.error);
              break;
              
            default:
              console.log('Unhandled message type:', message.type);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({ ...prev, error: 'WebSocket connection error' }));
        options.onError?.('WebSocket connection error');
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setState(prev => ({ 
          ...prev, 
          isConnected: false, 
          isRecording: false,
          isProcessing: false
        }));
        wsRef.current = null;
      };
      
    } catch (error: any) {
      console.error('Error connecting to WebSocket:', error);
      setState(prev => ({ ...prev, error: error.message || 'Failed to connect' }));
      options.onError?.(error.message || 'Failed to connect');
    }
  }, [options]);
  
  // Handle video capture requests from AI
  const handleVideoCaptureRequest = useCallback(async (callId: string) => {
    if (!options.enableVideo) {
      console.log('Video capture requested but video is disabled');
      return;
    }
    
    try {
      // Request video permission if not already granted
      if (!videoRecorder.hasPermission) {
        const granted = await videoRecorder.requestVideoPermission();
        if (!granted) {
          console.error('Video permission denied');
          return;
        }
      }
      
      // Capture frame
      const frameData = await videoRecorder.captureFrame();
      
      if (frameData && wsRef.current?.readyState === WebSocket.OPEN) {
        // Send captured frame back to server
        wsRef.current.send(JSON.stringify({
          type: 'video_capture_response',
          frameData: frameData,
          call_id: callId
        }));
        
        console.log('Video frame captured and sent');
      } else {
        console.error('Failed to capture video frame');
      }
    } catch (error) {
      console.error('Error handling video capture request:', error);
    }
  }, [options.enableVideo, videoRecorder]);
  
  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setState(prev => ({ 
      ...prev, 
      isConnected: false, 
      isRecording: false,
      isProcessing: false,
      videoEnabled: false,
      hasVideoPermission: false
    }));
    
    console.log('Disconnected from WebSocket');
  }, []);
  
  // Send text message
  const sendTextMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'text_input',
        text: text
      }));
      console.log('Sent text message:', text);
    }
  }, []);
  
  // Send audio chunk
  const sendAudioChunk = useCallback((audioData: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'audio_chunk',
        audio: audioData
      }));
    }
  }, []);
  
  // Start recording
  const startRecording = useCallback(async () => {
    if (!state.isConnected) {
      await connect();
    }
    setState(prev => ({ ...prev, isRecording: true }));
    console.log('Started recording');
  }, [state.isConnected, connect]);
  
  // Stop recording
  const stopRecording = useCallback(() => {
    setState(prev => ({ ...prev, isRecording: false, isProcessing: true }));
    console.log('Stopped recording');
  }, []);
  
  // Request microphone permission
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
    sendTextMessage,
    sendAudioChunk,
    requestMicrophonePermission,
    videoRecorder,
    // Video-specific functions
    hasVideoPermission: videoRecorder.hasPermission,
    requestVideoPermission: videoRecorder.requestVideoPermission,
    captureFrame: videoRecorder.captureFrame,
    toggleVideo: videoRecorder.toggleVideo
  };
}