import { useState, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface UseAudioRecorderOptions {
  onProcessingStart?: () => void;
  onResponseReceived?: (text: string) => void;
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
      
      // Read the audio response
      const audioResponse = await response.blob();
      
      // Play the audio response
      const audioUrl = URL.createObjectURL(audioResponse);
      const audio = new Audio(audioUrl);
      
      // Generate a random response text (this would normally come from the server)
      const responses = [
        "That sounds interesting! Tell me more about it.",
        "I love that! Let's talk more about it.",
        "Wow! I've never heard about that before.",
        "That's amazing! Do you want to know what I think?",
        "How fun! Let's play a game together next!"
      ];
      const responseText = responses[Math.floor(Math.random() * responses.length)];
      
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

  return {
    isReady,
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    requestMicrophonePermission
  };
}
