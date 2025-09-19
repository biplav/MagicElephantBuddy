import { useState, useRef, useCallback, useEffect } from 'react';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('book-audio');

interface UseBookAudioOptions {
  onAudioComplete?: () => void;
  // onSpeakingChange removed completely from simplified audio system
}

interface UseBookAudioReturn {
  playPageAudio: (audioUrl: string) => Promise<void>;
  pauseAudio: () => void;
  stopAudio: () => void;
  isAudioPlaying: boolean;
}

export function useBookAudio(options: UseBookAudioOptions = {}): UseBookAudioReturn {
  const { onAudioComplete } = options;

  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isOperationInProgressRef = useRef(false); // Prevent race conditions

  // Clean up audio
  const cleanup = useCallback(() => {
    isOperationInProgressRef.current = false; // Reset operation flag

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeEventListener('ended', handleAudioEnded);
      audioRef.current.removeEventListener('error', handleAudioError);
      audioRef.current = null;
    }

    setIsAudioPlaying(false);
  }, []);

  // Handle audio completion
  const handleAudioEnded = useCallback(() => {
    logger.info('🔊 Audio playback completed');
    cleanup();
    onAudioComplete?.();
  }, [cleanup, onAudioComplete]);

  // Handle audio errors
  const handleAudioError = useCallback((error: Event) => {
    logger.error('🚨 Audio playback error', { error });
    cleanup();
  }, [cleanup]);


  // Play page audio
  const playPageAudio = useCallback(async (audioUrl: string): Promise<void> => {
    // Prevent race conditions
    if (isOperationInProgressRef.current) {
      logger.warn('🔊 Audio operation already in progress, skipping play request');
      return;
    }

    isOperationInProgressRef.current = true;

    try {
      logger.info('🔊 Starting audio playback', { audioUrl });

      // Stop any existing audio
      cleanup();

      // Create new audio element
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Set up event listeners
      audio.addEventListener('ended', handleAudioEnded);
      audio.addEventListener('error', handleAudioError);

      // Configure audio
      audio.preload = 'auto';
      audio.volume = 1.0;

      // Play audio with proper error handling
      try {
        await audio.play();
        setIsAudioPlaying(true);

        logger.info('🔊 Audio playback started successfully');
      } catch (playError) {
        // Handle specific play interruption errors
        if (playError.name === 'AbortError') {
          logger.warn('🔊 Audio play was interrupted, this is normal for rapid toggles');
        } else {
          throw playError;
        }
      }
    } catch (error) {
      logger.error('🚨 Failed to start audio playback', { error, audioUrl });
      cleanup();
      throw error;
    } finally {
      isOperationInProgressRef.current = false;
    }
  }, [cleanup, handleAudioEnded, handleAudioError]);

  // Pause audio
  const pauseAudio = useCallback(() => {
    // Prevent race conditions
    if (isOperationInProgressRef.current) {
      logger.warn('⏸️ Audio operation already in progress, skipping pause request');
      return;
    }

    if (audioRef.current && isAudioPlaying) {
      isOperationInProgressRef.current = true;

      try {
        audioRef.current.pause();
        setIsAudioPlaying(false);

        logger.info('⏸️ Audio paused');
      } catch (error) {
        logger.error('🚨 Failed to pause audio', { error });
      } finally {
        isOperationInProgressRef.current = false;
      }
    }
  }, [isAudioPlaying]);

  // Stop audio completely
  const stopAudio = useCallback(() => {
    logger.info('⏹️ Audio stopped');
    cleanup();
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    playPageAudio,
    pauseAudio,
    stopAudio,
    isAudioPlaying
  };
}