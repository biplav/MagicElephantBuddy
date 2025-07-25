
import { useState, useRef, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';

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
  }, []);

  const setupDataChannel = useCallback((pc: RTCPeerConnection) => {
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      dataChannelRef.current = channel;

      channel.onopen = async () => {
        logger.info('Data channel opened');
        const childId = getSelectedChildId();
        channel.send(JSON.stringify({
          type: 'start_session',
          childId: childId
        }));
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
    };
  }, [getSelectedChildId, options.onTranscriptionReceived, options.onResponseReceived, options.onAudioResponseReceived, options.onError]);

  const connect = useCallback(async () => {
    try {
      logger.info('Starting OpenAI WebRTC connection');
      
      const client_secret = await createSession();
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

      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      streamRef.current = stream;

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        pc.addTrack(audioTrack, stream);
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await pc.setLocalDescription(offer);

      const realtimeResponse = await fetch('https://api.openai.com/v1/realtime', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client_secret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });

      if (!realtimeResponse.ok) {
        throw new Error(`Failed to connect to OpenAI: ${realtimeResponse.status}`);
      }

      const answerSdp = await realtimeResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      logger.info('OpenAI WebRTC connection established');

    } catch (error: any) {
      logger.error('Error connecting to OpenAI:', error);
      setState(prev => ({ ...prev, error: error.message }));
      options.onError?.(error.message);
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

    setState(prev => ({ 
      ...prev, 
      isConnected: false, 
      isRecording: false 
    }));
  }, []);

  return {
    ...state,
    connect,
    disconnect
  };
}
