import { useState, useRef, useCallback, useEffect } from 'react';

interface UseRealtimeAudioOptions {
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (text: string) => void;
  onAudioResponseReceived?: (audioData: string) => void;
  onError?: (error: string) => void;
}

interface RealtimeAudioState {
  isConnected: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
}

export default function useRealtimeAudio(options: UseRealtimeAudioOptions = {}) {
  const [state, setState] = useState<RealtimeAudioState>({
    isConnected: false,
    isRecording: false,
    isProcessing: false,
    error: null
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  // Connect to the realtime WebSocket
  const connect = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/realtime`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('Connected to realtime WebSocket');
        setState(prev => ({ ...prev, isConnected: true }));
        
        // Start the realtime session
        ws.send(JSON.stringify({ type: 'start_session' }));
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'session_started':
              console.log('Realtime session started');
              break;
            case 'transcription':
              console.log('Received transcription:', message.text);
              options.onTranscriptionReceived?.(message.text);
              break;
            case 'text_response':
              console.log('Received text response:', message.text);
              options.onResponseReceived?.(message.text);
              break;
            case 'audio_response':
              console.log('Received audio response');
              options.onAudioResponseReceived?.(message.audio);
              break;
            case 'response_complete':
              console.log('Response complete');
              setState(prev => ({ ...prev, isProcessing: false }));
              break;
            case 'error':
              console.error('Realtime API error:', message.message);
              setState(prev => ({ ...prev, error: message.message }));
              options.onError?.(message.message);
              break;
            case 'session_ended':
              console.log('Realtime session ended');
              setState(prev => ({ ...prev, isConnected: false }));
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      ws.onclose = () => {
        console.log('Realtime WebSocket disconnected');
        setState(prev => ({ ...prev, isConnected: false, isRecording: false }));
      };
      
      ws.onerror = (error) => {
        console.error('Realtime WebSocket error:', error);
        setState(prev => ({ ...prev, error: 'WebSocket connection failed' }));
        options.onError?.('WebSocket connection failed');
      };
      
    } catch (error) {
      console.error('Error connecting to realtime API:', error);
      setState(prev => ({ ...prev, error: 'Failed to connect to realtime API' }));
      options.onError?.('Failed to connect to realtime API');
    }
  }, [options]);
  
  // Disconnect from the realtime WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'end_session' }));
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setState(prev => ({ 
      ...prev, 
      isConnected: false, 
      isRecording: false, 
      isProcessing: false 
    }));
  }, []);
  
  // Start recording audio and streaming to OpenAI
  const startRecording = useCallback(async () => {
    if (!state.isConnected || state.isRecording) return;
    
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      streamRef.current = stream;
      
      // Create audio context for processing
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      processor.onaudioprocess = (event) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const inputBuffer = event.inputBuffer.getChannelData(0);
          
          // Convert float32 to int16 PCM
          const pcmData = new Int16Array(inputBuffer.length);
          for (let i = 0; i < inputBuffer.length; i++) {
            pcmData[i] = Math.max(-32768, Math.min(32767, inputBuffer[i] * 32768));
          }
          
          // Convert to base64 and send to server
          const uint8Array = new Uint8Array(pcmData.buffer);
          let binary = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64Audio = btoa(binary);
          
          wsRef.current.send(JSON.stringify({
            type: 'audio_chunk',
            audio: base64Audio
          }));
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      setState(prev => ({ ...prev, isRecording: true }));
      console.log('Started realtime audio recording');
      
    } catch (error) {
      console.error('Error starting audio recording:', error);
      setState(prev => ({ ...prev, error: 'Failed to start audio recording' }));
      options.onError?.('Failed to start audio recording');
    }
  }, [state.isConnected, state.isRecording, options]);
  
  // Stop recording and commit audio for transcription
  const stopRecording = useCallback(() => {
    if (!state.isRecording) return;
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Commit the audio buffer for processing
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'commit_audio' }));
      setState(prev => ({ ...prev, isProcessing: true }));
    }
    
    setState(prev => ({ ...prev, isRecording: false }));
    console.log('Stopped realtime audio recording');
  }, [state.isRecording]);
  
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
    requestMicrophonePermission
  };
}