import { useState, useRef, useCallback, useEffect } from 'react';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('book-audio');

interface UseBookAudioOptions {
  onAudioComplete?: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
}

interface UseBookAudioReturn {
  playPageAudio: (audioUrl: string) => Promise<void>;
  pauseAudio: () => void;
  resumeAudio: () => void;
  stopAudio: () => void;
  isAudioPlaying: boolean;
  audioProgress: number;
  currentAudioUrl: string | null;
}

export function useBookAudio(options: UseBookAudioOptions = {}): UseBookAudioReturn {
  const { onAudioComplete } = options;
  
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up audio and intervals
  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeEventListener('ended', handleAudioEnded);
      audioRef.current.removeEventListener('error', handleAudioError);
      audioRef.current = null;
    }
    
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    
    setIsAudioPlaying(false);
    setAudioProgress(0);
    // Note: onSpeakingChange removed from simplified audio system  
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

  // Update progress
  const updateProgress = useCallback(() => {
    if (audioRef.current) {
      const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setAudioProgress(Math.round(progress));
    }
  }, []);

  // Play page audio
  const playPageAudio = useCallback(async (audioUrl: string): Promise<void> => {
    try {
      logger.info('🔊 Starting audio playback', { audioUrl });
      
      // Stop any existing audio
      cleanup();
      
      // Create new audio element
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setCurrentAudioUrl(audioUrl);
      
      // Set up event listeners
      audio.addEventListener('ended', handleAudioEnded);
      audio.addEventListener('error', handleAudioError);
      
      // Configure audio
      audio.preload = 'auto';
      audio.volume = 1.0;
      
      // Play audio
      await audio.play();
      setIsAudioPlaying(true);
      // Note: Don't call onSpeakingChange(true) for normal audio playback
      // This should only be called when child speaks, not when Appu reads
      
      // Start progress tracking
      progressIntervalRef.current = setInterval(updateProgress, 100);
      
      logger.info('🔊 Audio playback started successfully');
    } catch (error) {
      logger.error('🚨 Failed to start audio playback', { error, audioUrl });
      cleanup();
      throw error;
    }
  }, [cleanup, handleAudioEnded, handleAudioError, updateProgress]);

  // Pause audio
  const pauseAudio = useCallback(() => {
    if (audioRef.current && isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
      // Note: Don't call onSpeakingChange(false) for normal pause
      // This should only be called when child stops speaking
      
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      logger.info('⏸️ Audio paused');
    }
  }, [isAudioPlaying]);

  // Resume audio
  const resumeAudio = useCallback(async () => {
    if (audioRef.current && !isAudioPlaying) {
      try {
        await audioRef.current.play();
        setIsAudioPlaying(true);
        // Note: Don't call onSpeakingChange(true) for resume
        
        // Restart progress tracking
        progressIntervalRef.current = setInterval(updateProgress, 100);
        
        logger.info('▶️ Audio resumed');
      } catch (error) {
        logger.error('🚨 Failed to resume audio', { error });
      }
    }
  }, [isAudioPlaying, updateProgress]);

  // Stop audio completely
  const stopAudio = useCallback(() => {
    logger.info('⏹️ Audio stopped');
    cleanup();
    setCurrentAudioUrl(null);
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
    resumeAudio,
    stopAudio,
    isAudioPlaying,
    audioProgress,
    currentAudioUrl
  };
}