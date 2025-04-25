import { useState, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface UseAudioRecorderOptions {
  onProcessingStart?: () => void;
  onResponseReceived?: (text: string) => void;
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setIsReady(true);
      return true;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      return false;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    
    audioChunksRef.current = [];
    
    const mediaRecorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = mediaRecorder;
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      await processAudio(audioBlob);
    };
    
    mediaRecorder.start();
    setIsRecording(true);
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
      formData.append('audio', audioBlob, 'recording.webm');
      
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
    } catch (error) {
      console.error('Error processing audio:', error);
      
      // Fallback response in case of error
      options?.onResponseReceived?.("I didn't quite catch that. Can you try again?");
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
