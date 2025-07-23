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

export default function useRealtimeAudio(options: UseRealtimeAudioOptions = {}) {
  const [state, setState] = useState<RealtimeAudioState>({
    isConnected: false,
    isRecording: false,
    isProcessing: false,
    error: null,
    videoEnabled: false,
    hasVideoPermission: false
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null); // WebSocket Reference
  const videoStreamRef = useRef<MediaStream | null>(null); // Video stream ref
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Direct frame capture function for getEyesTool
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

  // Expose frame capture function globally for getEyesTool
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

  // Connect to OpenAI Realtime API using WebRTC
  const connect = useCallback(async () => {
    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current || state.isConnected || pcRef.current) {
      console.log('Connection already in progress or established');
      return;
    }

    try {
      isConnectingRef.current = true;
      setState(prev => ({ ...prev, error: null }));

      // Get ephemeral token from server
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create session: ${response.status} - ${errorText}`);
      }

      const { client_secret } = await response.json();

      if (!client_secret) {
        throw new Error('No client secret received from server');
      }

      // Create WebRTC peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Get microphone and optionally video access
      const mediaConstraints: MediaStreamConstraints = {
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      };

      if (options.enableVideo) {
        mediaConstraints.video = {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 2 }
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

      streamRef.current = stream;

      // Add the audio track to peer connection
      const audioTrack = stream.getAudioTracks()[0];
      pc.addTrack(audioTrack, stream);

      // Handle video if enabled
      if (options.enableVideo && stream.getVideoTracks().length > 0) {
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
          canvas.id = 'realtime-frame-canvas'; // Add ID for easier cleanup
          canvasRef.current = canvas;
          document.body.appendChild(canvas);
        }
      }

      // Handle incoming audio from OpenAI
      pc.ontrack = (event) => {
        console.log('Received audio track from OpenAI');
        const remoteStream = event.streams[0];
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.autoplay = true;

        audio.onloadedmetadata = () => {
          console.log('Audio metadata loaded, starting playback');
        };

        audio.onerror = (error) => {
          console.error('Audio playback error:', error);
        };
      };

      // Handle data channel for text responses
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        dataChannelRef.current = channel;

        channel.onopen = async () => {
          console.log('Data channel opened');

          // Send start_session message with child ID to WebSocket
          try {
            const selectedChildId = localStorage.getItem("selectedChildId");
            const childId = selectedChildId ? parseInt(selectedChildId) : 1;
            
            // Start conversation via WebSocket instead of HTTP
            channel.send(JSON.stringify({
              type: 'start_session',
              childId: childId
            }));
            
            console.log(`Started realtime session for child ${childId}`);
          } catch (error) {
            console.error('Error starting realtime session:', error);
          }
        };

        channel.onmessage = async (messageEvent) => {
          try {
            const message = JSON.parse(messageEvent.data);
            console.log('Received message:', message);

            switch (message.type) {
              case 'conversation.item.input_audio_transcription.completed':
                // Store child input message in database
                
                console.log('Message object:', message);
                if (message.transcript) {
                  try {
                    await fetch('/api/store-realtime-message', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        type: 'child_input',
                        content: message.transcript,
                        transcription: message.transcript
                      })
                    });
                  } catch (error) {
                    console.error('Error storing child input message:', error);
                  }
                }
                options.onTranscriptionReceived?.(message.transcript);
                break;
              case 'response.text.delta':
                options.onResponseReceived?.(message.delta);
                break;
              case 'response.function_call_arguments.done':
                try {
                  if (message.name === 'getEyesTool') {
                    console.log('🔧 getEyesTool invoked:', {
                      name: message.name,
                      call_id: message.call_id,
                      arguments: message.arguments,
                      timestamp: new Date().toISOString()
                    });

                    // Test: Check if video elements are available
                    console.log('🔧 Video setup check:', {
                      hasVideo: !!videoRef.current,
                      hasCanvas: !!canvasRef.current,
                      videoReady: videoRef.current?.readyState >= 2,
                      dataChannelOpen: dataChannelRef.current?.readyState === 'open'
                    });

                    // Capture current frame and send to analyze-frame endpoint
                    const frameData = captureCurrentFrame();
                    console.log('🔧 Frame capture result:', {
                      frameDataLength: frameData?.length || 0,
                      hasFrameData: !!frameData
                    });

                    if (frameData) {
                      try {
                        const analysisResponse = await fetch('/api/analyze-frame', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            frameData,
                            reason: message.arguments?.reason || 'Child is showing something'
                          })
                        });

                        if (analysisResponse.ok) {
                          const result = await analysisResponse.json();
                          console.log('🔧 Frame analysis result:', result.analysis);

                          // Send the result back through data channel
                          if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
                            dataChannelRef.current.send(JSON.stringify({
                              type: 'conversation.item.create',
                              item: {
                                type: 'function_call_output',
                                call_id: message.call_id,
                                output: result.analysis
                              }
                            }));
                          }
                        } else {
                          console.error('Frame analysis failed');
                          if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
                            dataChannelRef.current.send(JSON.stringify({
                              type: 'conversation.item.create',
                              item: {
                                type: 'function_call_output',
                                call_id: message.call_id,
                                output: "I'm having trouble seeing what you're showing me right now. Can you try again?"
                              }
                            }));
                          }
                        }
                      } catch (error) {
                        console.error('Error in getEyesTool:', error);
                      }
                    } else {
                      console.log('No frame available for analysis');
                      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
                        dataChannelRef.current.send(JSON.stringify({
                          type: 'conversation.item.create',
                          item: {
                            type: 'function_call_output',
                            call_id: message.call_id,
                            output: "I don't see anything right now. Make sure your camera is on and try showing me again!"
                          }
                        }));
                      }
                    }
                  }
                } catch (frameError) {
                  console.error('Error in getEyesTool handler:', frameError);
                }
                break;
              case 'response.done':
                // Store Appu's response message in database
                if (message.response && message.response.output) {
                  try {
                    const responseText = message.response.output.map((item: any) => 
                      item.type === 'message' ? item.message.content.map((content: any) => 
                        content.type === 'text' ? content.text : ''
                      ).join('') : ''
                    ).join('');

                    if (responseText) {
                      await fetch('/api/store-realtime-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          type: 'appu_response',
                          content: responseText
                        })
                      });
                    }
                  } catch (error) {
                    console.error('Error storing Appu response message:', error);
                  }
                }
                setState(prev => ({ ...prev, isProcessing: false }));
                break;
              case 'error':
                console.error('Realtime API error:', message);
                setState(prev => ({ ...prev, error: message.error?.message || 'Unknown error' }));
                options.onError?.(message.error?.message || 'Unknown error');
                break;
              default:
                console.log('Unhandled message type:', message.type);
                break;
            }
          } catch (error) {
            console.error('Error parsing data channel message:', error);
          }
        };

        channel.onerror = (error) => {
          console.error('Data channel error:', error);
        };
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
  }, [options]);

  // Disconnect from the WebRTC connection
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

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Clean up video elements
    if (videoRef.current && document.body.contains(videoRef.current)) {
      document.body.removeChild(videoRef.current);
      videoRef.current = null;
    }

    if (canvasRef.current && document.body.contains(canvasRef.current)) {
      document.body.removeChild(canvasRef.current);
      canvasRef.current = null;
    }

    // Clean up video stream
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(track => track.stop());
      videoStreamRef.current = null;
    }

    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    setState(prev => ({ 
      ...prev, 
      isConnected: false, 
      isRecording: false,
      isProcessing: false,
      videoEnabled: false,
      hasVideoPermission: false
    }));

    console.log('Disconnected from realtime API');
  }, []);

  // Start recording (WebRTC handles this automatically when connected)
  const startRecording = useCallback(async () => {
    if (!state.isConnected) {
      await connect();
    } else {
      setState(prev => ({ ...prev, isRecording: true }));
      console.log('Started realtime audio recording');
    }
  }, [state.isConnected, connect]);

  // Stop recording
  const stopRecording = useCallback(() => {
    setState(prev => ({ ...prev, isRecording: false, isProcessing: true }));
    console.log('Stopped realtime audio recording');
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