import { useState, useRef, useCallback, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface ResponseData {
  text: string;
  errorType?: string;
}

interface UseAudioRecorderOptions {
  onProcessingStart?: () => void;
  onResponseReceived?: (textOrData: string | ResponseData) => void;
  onTranscriptionReceived?: (transcription: string) => void;
  enableLocalPlayback?: boolean;
}

// Helper to create a visual indicator of the MediaRecorder state
function createOrUpdateRecordingIndicator(state: string) {
  // Check if we're in the browser environment
  if (typeof document === 'undefined') return;
  
  // Remove any existing indicator
  const existingIndicator = document.getElementById('media-recorder-status');
  if (existingIndicator) {
    document.body.removeChild(existingIndicator);
  }
  
  // Create a new indicator
  const indicator = document.createElement('div');
  indicator.id = 'media-recorder-status';
  
  // Style based on state
  let bgColor = 'green';
  let statusText = 'Recording';
  
  if (state === 'paused') {
    bgColor = 'orange';
    statusText = 'Paused';
  } else if (state === 'inactive') {
    bgColor = 'gray';
    statusText = 'Stopped';
  } else if (state === 'error') {
    bgColor = 'red';
    statusText = 'Error';
  }
  
  // Apply styles
  Object.assign(indicator.style, {
    position: 'fixed',
    top: '10px',
    right: '10px',
    padding: '5px 10px',
    backgroundColor: bgColor,
    color: 'white',
    borderRadius: '4px',
    fontSize: '12px',
    zIndex: '9999',
    opacity: '0.9',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontFamily: 'sans-serif'
  });
  
  // Add a recording indicator dot for the recording state
  if (state === 'recording') {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      width: '8px',
      height: '8px',
      backgroundColor: 'red',
      borderRadius: '50%',
      animation: 'pulse 1s infinite'
    });
    indicator.appendChild(dot);
    
    // Add the animation
    const styleId = 'recording-indicator-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  // Add the status text
  const text = document.createTextNode(`MediaRecorder: ${statusText}`);
  indicator.appendChild(text);
  
  // Add to DOM
  document.body.appendChild(indicator);
  
  // Auto-hide after 5 seconds if stopped/error
  if (state === 'inactive' || state === 'error') {
    setTimeout(() => {
      if (document.body.contains(indicator)) {
        indicator.style.opacity = '0';
        indicator.style.transition = 'opacity 0.5s';
        setTimeout(() => {
          if (document.body.contains(indicator)) {
            document.body.removeChild(indicator);
          }
        }, 500);
      }
    }, 5000);
  }
  
  return indicator;
}

export default function useAudioRecorder(options?: UseAudioRecorderOptions) {
  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recorderState, setRecorderState] = useState<string>('inactive');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Effect to update visual indicator when recorder state changes
  useEffect(() => {
    if (recorderState) {
      createOrUpdateRecordingIndicator(recorderState);
    }
  }, [recorderState]);
  
  const requestMicrophonePermission = useCallback(async () => {
    try {
      // First check if the browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('Browser does not support getUserMedia API');
        return false;
      }

      // Request permissions with explicit audio constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Store the stream for later use
      streamRef.current = stream;
      
      // Check if we actually got audio tracks
      if (stream.getAudioTracks().length === 0) {
        console.error('No audio tracks available in the stream');
        return false;
      }
      
      console.log('Microphone permission granted successfully');
      setIsReady(true);
      return true;
    } catch (error: any) {
      // Log specific error information to help with debugging
      console.error('Error accessing microphone:', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        console.error('User denied microphone permission');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        console.error('No microphone detected on this device');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        console.error('Microphone is already in use by another application');
      } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        console.error('Constraints cannot be satisfied by available devices');
      } else if (error.name === 'TypeError') {
        console.error('Empty constraints object');
      }
      
      return false;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      console.error("Cannot start recording: no media stream available");
      return;
    }
    
    try {
      // Reset audio chunks array
      audioChunksRef.current = [];
      
      // Check if the stream has active audio tracks
      const audioTracks = streamRef.current.getAudioTracks();
      if (audioTracks.length === 0 || !audioTracks[0].enabled) {
        console.error("No active audio tracks in the stream");
        return;
      }
      
      console.log("Creating MediaRecorder with stream");
      
      // Check what MIME types are supported and prefer wav/mp4 over webm
      const preferredMimeTypes = [
        'audio/wav',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/webm;codecs=opus',
        'audio/webm'
      ];
      
      const supportedMimeTypes = preferredMimeTypes.filter(mimeType => {
        try {
          return MediaRecorder.isTypeSupported(mimeType);
        } catch (e) {
          return false;
        }
      });
      
      if (supportedMimeTypes.length === 0) {
        console.error("No supported MIME types found for MediaRecorder");
        throw new Error("Browser does not support required audio formats");
      }
      
      console.log("Supported MIME types:", supportedMimeTypes);
      console.log("Using MIME type:", supportedMimeTypes[0]);
      
      // Use the first supported MIME type with better quality settings
      const mediaRecorderOptions: MediaRecorderOptions = {
        mimeType: supportedMimeTypes[0]
      };
      
      // Add better audio quality settings if supported
      if (supportedMimeTypes[0].includes('opus')) {
        mediaRecorderOptions.audioBitsPerSecond = 128000; // 128 kbps
      }
      
      const mediaRecorder = new MediaRecorder(streamRef.current, mediaRecorderOptions);
      mediaRecorderRef.current = mediaRecorder;
      
      // Add event handlers
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          console.log(`Audio chunk available: ${event.data.size} bytes, type: ${event.data.type}`);
          audioChunksRef.current.push(event.data);
          
          // Log total chunks size for debugging
          let totalSize = 0;
          audioChunksRef.current.forEach(chunk => {
            totalSize += chunk.size;
          });
          console.log(`Total audio data accumulated: ${totalSize} bytes from ${audioChunksRef.current.length} chunks`);
        } else {
          console.warn("Empty audio data received in ondataavailable event");
        }
      };
      
      // Add event handlers to track and visualize recorder state
      mediaRecorder.onstart = () => {
        console.log("MediaRecorder started");
        setRecorderState('recording');
      };
      
      mediaRecorder.onpause = () => {
        console.log("MediaRecorder paused");
        setRecorderState('paused');
      };
      
      mediaRecorder.onresume = () => {
        console.log("MediaRecorder resumed");
        setRecorderState('recording');
      };
      
      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setIsRecording(false);
        setRecorderState('error');
        createOrUpdateRecordingIndicator('error');
      };
      
      mediaRecorder.onstop = async () => {
        console.log("MediaRecorder stopped");
        setRecorderState('inactive');
        
        if (audioChunksRef.current.length === 0) {
          console.error("No audio data captured");
          return;
        }
        
        // Use the same MIME type that was supported for recording
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        console.log(`Creating audio blob with MIME type: ${mimeType} from ${audioChunksRef.current.length} chunks`);
        
        // Log the sizes of chunks to debug
        audioChunksRef.current.forEach((chunk, index) => {
          console.log(`Audio chunk ${index} size: ${chunk.size} bytes`);
        });
        
        // Create a blob with the correct MIME type
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        console.log(`Generated audio blob size: ${audioBlob.size} bytes`);
        
        // Always try to process the audio, even if it's small
        // Whisper can sometimes understand very short utterances
        try {
          if (audioBlob.size < 1024) {
            console.warn(`Audio blob is small (${audioBlob.size} bytes) but will attempt to process anyway`);
          } else {
            console.log(`Processing audio blob of size ${audioBlob.size} bytes`);
          }
            
          // Save a copy of the audio blob to the console for debugging
          const blobUrl = URL.createObjectURL(audioBlob);
          console.log(`Debug: Audio blob URL (copy to browser to test): ${blobUrl}`);
            
          // Create a direct link to test in debug panel
          const testElement = document.createElement('a');
          testElement.href = blobUrl;
          testElement.textContent = 'Test Audio';
          testElement.target = '_blank';
          testElement.style.display = 'none';
          document.body.appendChild(testElement);
          // Auto-click in dev mode
          // testElement.click();
            
          // Process the audio
          await processAudio(audioBlob);
            
        } catch (error) {
          console.error("Error during audio processing:", error);
            
          // If processing failed, start recording again
          console.log("Restarting recording after audio processing failed");
          startRecording();
        }
      };
      
      // Start recording with shorter timeslices (200ms) to get data more frequently
      // Smaller timeslice helps ensure we get data even for very short recordings
      mediaRecorder.start(200);
      
      // Store recording start time for minimum duration check
      recordingStartTimeRef.current = Date.now();
      
      // Wait a short moment before requesting data to ensure recorder is ready
      setTimeout(() => {
        try {
          // Only request data if the recorder is still in the recording state
          if (mediaRecorder.state === "recording") {
            mediaRecorder.requestData();
            console.log("Successfully requested initial data from MediaRecorder");
          } else {
            console.warn("Cannot request data: MediaRecorder not in recording state");
          }
        } catch (reqError) {
          console.error("Error requesting data from MediaRecorder:", reqError);
          // Continue recording even if requestData fails
        }
      }, 500);
      
      console.log("MediaRecorder started");
      setIsRecording(true);
      
      // Show recording duration timer
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        createOrUpdateRecordingIndicator(`recording (${elapsed}s)`);
      }, 1000);
    } catch (error) {
      console.error("Error starting MediaRecorder:", error);
      setIsRecording(false);
      
      // Attempt to recover from MediaRecorder errors
      // First, release any existing resources
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current = null;
          audioChunksRef.current = [];
        } catch (cleanupError) {
          console.error("Error cleaning up MediaRecorder:", cleanupError);
        }
      }
      
      // Wait a moment then try to restart the recording
      setTimeout(() => {
        console.log("Attempting to recover from MediaRecorder error...");
        
        try {
          // Re-request microphone access
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
              console.log("Successfully re-acquired microphone stream");
              streamRef.current = stream;
              
              // Update state to show recovery
              setRecorderState('inactive');
              
              // Don't auto-start recording immediately, let the user initiate it
              setIsReady(true);
            })
            .catch(streamError => {
              console.error("Failed to re-acquire microphone stream:", streamError);
            });
        } catch (recoveryError) {
          console.error("Failed to recover from MediaRecorder error:", recoveryError);
        }
      }, 2000);
    }
  }, []);

  const stopRecording = useCallback(() => {
    // Clear the recording timer
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    // Check minimum recording duration (at least 1 second)
    const recordingDuration = Date.now() - recordingStartTimeRef.current;
    const minDuration = 1000; // 1 second minimum
    
    if (recordingDuration < minDuration) {
      console.warn(`Recording too short: ${recordingDuration}ms (minimum: ${minDuration}ms)`);
      createOrUpdateRecordingIndicator(`Recording too short - need at least 1 second`);
      
      // Continue recording for the minimum duration
      setTimeout(() => {
        stopRecording();
      }, minDuration - recordingDuration);
      return;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        console.log(`Stopping MediaRecorder after ${recordingDuration}ms`);
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        // State update will happen through the onstop event handler
      } catch (error) {
        console.error("Error stopping MediaRecorder:", error);
        setIsRecording(false);
        setRecorderState('error');
        createOrUpdateRecordingIndicator('error');
      }
    } else {
      console.log("Cannot stop MediaRecorder - already inactive or null");
      setIsRecording(false);
      setRecorderState('inactive');
    }
  }, []);

  const processAudio = async (audioBlob: Blob) => {
    try {
      setIsProcessing(true);
      options?.onProcessingStart?.();
      
      // If local playback is enabled, play the audio locally and bypass the server
      if (options?.enableLocalPlayback) {
        console.log("Local playback mode is enabled - playing audio locally");
        
        // Create a URL for the blob
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Create a visible audio element for testing and add it to the DOM
        const audioElement = document.createElement('audio');
        audioElement.controls = true;
        audioElement.src = audioUrl;
        audioElement.style.position = 'fixed';
        audioElement.style.bottom = '60px';
        audioElement.style.left = '50%';
        audioElement.style.transform = 'translateX(-50%)';
        audioElement.style.zIndex = '1000';
        audioElement.style.backgroundColor = 'rgba(0,0,0,0.8)';
        audioElement.style.padding = '10px';
        audioElement.style.borderRadius = '8px';
        
        // Add a label
        const label = document.createElement('div');
        label.textContent = 'Local Playback Test';
        label.style.color = 'white';
        label.style.fontSize = '12px';
        label.style.textAlign = 'center';
        label.style.marginBottom = '5px';
        
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.bottom = '60px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.zIndex = '1000';
        container.style.backgroundColor = 'rgba(0,0,0,0.8)';
        container.style.padding = '10px';
        container.style.borderRadius = '8px';
        
        container.appendChild(label);
        container.appendChild(audioElement);
        document.body.appendChild(container);
        
        console.log("Added audio element to DOM for local playback test");
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
          if (document.body.contains(container)) {
            document.body.removeChild(container);
            URL.revokeObjectURL(audioUrl);
            console.log("Removed local playback audio element");
          }
        }, 10000);
        
        // Try to auto-play (will likely fail due to autoplay policy)
        audioElement.play()
          .then(() => {
            console.log("Local audio auto-play started successfully");
          })
          .catch(e => {
            console.log("Auto-play failed (expected due to browser policy):", e.message);
          });
        
        // Create a simulated response for the UI
        const simulatedResponse = {
          text: "Local playback mode - audio played back locally",
          transcribedText: "This is a local playback test. Audio was not sent to the server."
        };
        
        // Call the transcription callback if provided
        if (simulatedResponse.transcribedText) {
          options?.onTranscriptionReceived?.(simulatedResponse.transcribedText);
        }
        
        // Call the response callback
        options?.onResponseReceived?.(simulatedResponse.text);
        
        // End processing after a short delay to simulate server processing time
        setTimeout(() => {
          setIsProcessing(false);
        }, 1000);
        
        return;
      }
      
      // Normal processing mode - send to server
      // Create FormData to send the audio file
      const formData = new FormData();
      
      // Determine the appropriate file extension based on MIME type
      let fileExtension = 'webm';
      if (audioBlob.type.includes('wav')) {
        fileExtension = 'wav';
      } else if (audioBlob.type.includes('mp4')) {
        fileExtension = 'mp4';
      } else if (audioBlob.type.includes('ogg')) {
        fileExtension = 'ogg';
      }
      
      const filename = `recording.${fileExtension}`;
      console.log(`Sending audio with filename: ${filename}, type: ${audioBlob.type}`);
      formData.append('audio', audioBlob, filename);
      
      // Send audio to backend for processing
      const response = await fetch('/api/process-audio', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to process audio');
      }
      
      // Read the JSON response containing both text and audio data
      const responseData = await response.json();
      
      // Get the text response and transcription
      const responseText = responseData.text || "Thank you for reaching out";
      const transcribedText = responseData.transcribedText || "";
      
      // Call the transcription callback if provided
      if (transcribedText) {
        options?.onTranscriptionReceived?.(transcribedText);
      }
      
      try {
        // Convert Base64 audio data to a Blob
        const responseAudioBlob = base64ToBlob(
          responseData.audioData,
          responseData.contentType || 'audio/wav'
        );
        
        console.log(`Received audio blob size: ${responseAudioBlob.size} bytes, type: ${responseAudioBlob.type}`);
        
        // Play the audio response
        const audioUrl = URL.createObjectURL(responseAudioBlob);
        
        // Create a simple, highly visible audio player
        const audioContainer = document.createElement('div');
        audioContainer.id = 'appu-audio-player';
        audioContainer.style.cssText = `
          position: fixed !important;
          top: 20px !important;
          right: 20px !important;
          z-index: 99999 !important;
          background: #8B5CF6 !important;
          color: white !important;
          padding: 20px !important;
          border-radius: 15px !important;
          box-shadow: 0 8px 25px rgba(0,0,0,0.4) !important;
          font-family: Arial, sans-serif !important;
          min-width: 300px !important;
          border: 3px solid white !important;
        `;
        
        // Simple title
        const title = document.createElement('h3');
        title.textContent = "🐘 Appu's Voice";
        title.style.cssText = `
          margin: 0 0 15px 0 !important;
          font-size: 18px !important;
          text-align: center !important;
        `;
        
        // Large, prominent play button
        const playButton = document.createElement('button');
        playButton.textContent = '▶ PLAY APPU\'S VOICE';
        playButton.style.cssText = `
          width: 100% !important;
          padding: 15px !important;
          font-size: 16px !important;
          font-weight: bold !important;
          background: #10B981 !important;
          color: white !important;
          border: none !important;
          border-radius: 10px !important;
          cursor: pointer !important;
          margin-bottom: 10px !important;
        `;
        
        // Create hidden audio element
        const audioElement = document.createElement('audio');
        audioElement.src = audioUrl;
        audioElement.volume = 0.9;
        audioElement.preload = 'auto';
        
        console.log(`Audio element created with ${responseAudioBlob.size} bytes`);
        
        // Play button click handler
        playButton.onclick = () => {
          console.log("Play button clicked");
          playButton.textContent = '🔊 PLAYING...';
          playButton.disabled = true;
          
          audioElement.play()
            .then(() => {
              console.log("Audio playback started successfully");
            })
            .catch(e => {
              console.error("Audio playback failed:", e);
              playButton.textContent = '❌ PLAYBACK FAILED';
              playButton.disabled = false;
            });
        };
        
        // Reset button when audio ends
        audioElement.addEventListener('ended', () => {
          playButton.textContent = '▶ PLAY AGAIN';
          playButton.disabled = false;
        });
        
        // Simple close button
        const closeButton = document.createElement('button');
        closeButton.textContent = '✕ Close';
        closeButton.style.cssText = `
          width: 100% !important;
          padding: 8px !important;
          background: rgba(255,255,255,0.2) !important;
          color: white !important;
          border: none !important;
          border-radius: 5px !important;
          cursor: pointer !important;
          font-size: 12px !important;
        `;
        
        closeButton.onclick = () => {
          if (document.body.contains(audioContainer)) {
            document.body.removeChild(audioContainer);
            URL.revokeObjectURL(audioUrl);
            console.log("Audio player closed by user");
          }
        };
        
        // Remove any existing audio player
        const existing = document.getElementById('appu-audio-player');
        if (existing) {
          existing.remove();
        }
        
        // Assemble the audio player
        audioContainer.appendChild(title);
        audioContainer.appendChild(playButton);
        audioContainer.appendChild(closeButton);
        
        // Add to DOM with error handling
        try {
          document.body.appendChild(audioContainer);
          console.log("Audio player added to DOM successfully");
        } catch (error) {
          console.error("Failed to add audio player to DOM:", error);
        }
        
        // Auto-remove after 45 seconds
        setTimeout(() => {
          if (document.body.contains(audioContainer)) {
            document.body.removeChild(audioContainer);
            URL.revokeObjectURL(audioUrl);
            console.log("Audio player auto-removed after timeout");
          }
        }, 450000);
        
        // Trigger the callback immediately so the UI can update
        options?.onResponseReceived?.(responseText);
      } catch (audioError) {
        console.error('Error setting up audio playback:', audioError);
        options?.onResponseReceived?.(responseText);
      }
    } catch (error: any) {
      console.error('Error processing audio:', error);
      
      // Check for specific error types
      let errorMessage = "I didn't quite catch that. Can you try again?";
      let errorType = 'generic';
      
      if (error.status === 429 || (error.message && error.message.includes('rate limit'))) {
        errorMessage = "I'm feeling a bit tired right now. Can we talk again in a little bit?";
        errorType = 'rateLimit';
      } else if (error.status === 401 || error.status === 403) {
        errorMessage = "I need to take a quick break. Please try again later.";
        errorType = 'auth';
      } else if (error.status >= 500 && error.status <= 599) {
        errorMessage = "I'm having trouble thinking right now. Can we try again soon?";
        errorType = 'serviceUnavailable';
      } else if (error.message && error.message.includes('network')) {
        errorMessage = "I can't hear you very well. Please check your internet connection and try again.";
        errorType = 'network';
      }
      
      // Get error response from the server if available
      if (error.response && error.response.data && error.response.data.errorType) {
        errorType = error.response.data.errorType;
        if (error.response.data.userMessage) {
          errorMessage = error.response.data.userMessage;
        }
      }
      
      // Send the appropriate error message
      options?.onResponseReceived?.({
        text: errorMessage,
        errorType: errorType
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Helper function to convert Base64 to Blob
  const base64ToBlob = (base64: string, contentType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  };

  return {
    isReady,
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    requestMicrophonePermission,
    recorderState  // Expose the recorder state for debugging
  };
}
