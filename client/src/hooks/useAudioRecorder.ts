import { useState, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface ResponseData {
  text: string;
  errorType?: string;
}

interface UseAudioRecorderOptions {
  onProcessingStart?: () => void;
  onResponseReceived?: (textOrData: string | ResponseData) => void;
  onTranscriptionReceived?: (transcription: string) => void;
}

export default function useAudioRecorder(options?: UseAudioRecorderOptions) {
  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
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
      
      // Check what MIME types are supported
      const supportedMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/wav',
        'audio/mp4'
      ].filter(mimeType => {
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
      
      // Use the first supported MIME type
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: supportedMimeTypes[0]
      });
      mediaRecorderRef.current = mediaRecorder;
      
      // Add event handlers
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setIsRecording(false);
      };
      
      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length === 0) {
          console.error("No audio data captured");
          return;
        }
        
        // Use the same MIME type that was supported for recording
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        console.log(`Creating audio blob with MIME type: ${mimeType}`);
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        // Check if we have valid audio data
        if (audioBlob.size > 0) {
          await processAudio(audioBlob);
        } else {
          console.error("Generated audio blob is empty");
        }
      };
      
      // Start recording with 1 second timeslices to get data more frequently
      mediaRecorder.start(1000);
      console.log("MediaRecorder started");
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting MediaRecorder:", error);
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const processAudio = async (audioBlob: Blob) => {
    try {
      setIsProcessing(true);
      options?.onProcessingStart?.();
      
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
      
      // Convert Base64 audio data to a Blob
      const responseAudioBlob = base64ToBlob(
        responseData.audioData,
        responseData.contentType || 'audio/wav'
      );
      
      // Play the audio response
      const audioUrl = URL.createObjectURL(responseAudioBlob);
      const audio = new Audio(audioUrl);
      
      // Play the audio and trigger the callback
      audio.onloadedmetadata = () => {
        audio.play();
        options?.onResponseReceived?.(responseText);
      };
      
      audio.onerror = (error) => {
        console.error('Error playing audio:', error);
        options?.onResponseReceived?.(responseText);
      };
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
    requestMicrophonePermission
  };
}
