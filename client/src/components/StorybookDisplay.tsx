import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Book, Clock } from 'lucide-react';
import { useSilenceDetection } from '@/hooks/useSilenceDetection';

interface StorybookPage {
  pageImageUrl: string;
  pageText: string;
  pageNumber: number;
  totalPages: number;
  bookTitle: string;
  audioUrl?: string;
}

interface StorybookDisplayProps {
  currentPage: StorybookPage | null;
  onClose: () => void;
  isVisible: boolean;
  onPageNavigation?: (direction: 'next' | 'previous') => void;
  autoPageTurnEnabled?: boolean;
  onAppuSpeakingChange?: (speaking: boolean) => void;
  isAppuSpeaking?: boolean;
  isUserSpeaking?: boolean;
  openaiConnection?: any;
  bookStateManager: any; // Add book state manager as prop
}

export default function StorybookDisplay({
  currentPage,
  onClose,
  isVisible,
  onPageNavigation,
  autoPageTurnEnabled = true,
  onAppuSpeakingChange,
  isAppuSpeaking = false,
  isUserSpeaking = false,
  openaiConnection,
  bookStateManager
}: StorybookDisplayProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'previous'>('next');
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const onAppuSpeakingChangeRef = useRef(onAppuSpeakingChange);
  const silenceDetectionRef = useRef<any>(null);

  useEffect(() => {
    onAppuSpeakingChangeRef.current = onAppuSpeakingChange;
  }, [onAppuSpeakingChange]);

  // Internal navigation handlers
  const handleInternalNextPage = useCallback(async () => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages && !isFlipping) {
      console.log('Navigating to next page');

      // Stop current audio
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        setIsPlayingAudio(false);
        onAppuSpeakingChangeRef.current?.(false);
      }

      setFlipDirection('next');
      setIsFlipping(true);
      
      try {
        const success = await bookStateManager.navigateToNextPage();
        if (success) {
          onPageNavigation?.('next');
        }
      } catch (error) {
        console.error('Failed to navigate to next page:', error);
      } finally {
        setIsFlipping(false);
      }
    }
  }, [currentPage, isFlipping, bookStateManager, onPageNavigation]);

  const handleInternalPreviousPage = useCallback(async () => {
    if (currentPage && currentPage.pageNumber > 1 && !isFlipping) {
      console.log('Navigating to previous page');

      // Stop current audio
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        setIsPlayingAudio(false);
        onAppuSpeakingChangeRef.current?.(false);
      }

      setFlipDirection('previous');
      setIsFlipping(true);
      
      try {
        const success = await bookStateManager.navigateToPreviousPage();
        if (success) {
          onPageNavigation?.('previous');
        }
      } catch (error) {
        console.error('Failed to navigate to previous page:', error);
      } finally {
        setIsFlipping(false);
      }
    }
  }, [currentPage, isFlipping, bookStateManager, onPageNavigation]);

  // Auto page turning with silence detection
  const handleAutoPageAdvance = useCallback(() => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages && !isFlipping) {
      console.log('Auto-advancing to next page due to silence');
      handleInternalNextPage();
    } else if (currentPage && currentPage.pageNumber >= currentPage.totalPages) {
      console.log('Reached end of book - auto page advance disabled');
      // Could trigger end-of-book celebration or suggestions here
    }
  }, [currentPage, isFlipping, handleInternalNextPage]);

  const handleSilenceInterrupted = useCallback(() => {
    console.log('Auto page advance interrupted by speech');
  }, []);

  // Play audio when page changes - defined before silence detection to avoid circular dependency
  const playPageAudio = useCallback(() => {
    if (currentPage?.audioUrl) {
      console.log('🔊 WORKFLOW: Playing page audio:', currentPage.audioUrl);

      // Stop any existing audio
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
        setIsPlayingAudio(false);
        onAppuSpeakingChangeRef.current?.(false);
      }

      const audio = new Audio(currentPage.audioUrl);
      audio.preload = 'auto';

      audio.onloadstart = () => {
        console.log('Audio loading started');
      };

      audio.oncanplay = () => {
        console.log('Audio can start playing');
      };

      audio.onplay = () => {
        console.log('🔊 WORKFLOW: Audio started playing');
        setIsPlayingAudio(true);
        onAppuSpeakingChangeRef.current?.(true);
      };

      audio.onended = () => {
        console.log('🔊 WORKFLOW: Audio finished playing - starting silence detection for page turn');
        setIsPlayingAudio(false);
        onAppuSpeakingChangeRef.current?.(false);
        audioElementRef.current = null;
        
        // Start silence detection for page turn after audio ends
        console.log('🔇 WORKFLOW: Starting page turn timer');
        silenceDetectionRef.current?.startPageTurnTimer();
      };

      audio.onerror = (error) => {
        console.error('Error playing audio:', error, audio.error);
        setIsPlayingAudio(false);
        onAppuSpeakingChangeRef.current?.(false);
        audioElementRef.current = null;
      };

      audio.onpause = () => {
        console.log('Audio paused');
        setIsPlayingAudio(false);
        onAppuSpeakingChangeRef.current?.(false);
      };

      audioElementRef.current = audio;

      // Try to play with better error handling
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Audio play promise resolved successfully');
          })
          .catch(error => {
            console.error('Failed to play audio:', error);
            setIsPlayingAudio(false);
            onAppuSpeakingChangeRef.current?.(false);

            // Handle common autoplay restrictions
            if (error.name === 'NotAllowedError') {
              console.warn('Audio autoplay blocked by browser. User interaction required.');
            }
          });
      }
    }
  }, [currentPage?.audioUrl]); // Include currentPage.audioUrl dependency

  const silenceDetection = useSilenceDetection({
    silenceDuration: 3000, // 3 seconds for page turn
    initialAudioDelay: 1000, // 1 second delay for initial audio after Appu stops
    onSilenceDetected: handleAutoPageAdvance,
    onSilenceInterrupted: handleSilenceInterrupted,
    onInitialAudioTrigger: playPageAudio,
    enabled: autoPageTurnEnabled && isVisible,
    openaiConnection: openaiConnection,
    isPlayingAudio: isPlayingAudio
  });

  // Update silence detection ref
  useEffect(() => {
    silenceDetectionRef.current = silenceDetection;
  }, [silenceDetection]);

  /* Play audio based on different triggers with conditional logic
  useEffect(() => {
    if (currentPage?.audioUrl && imageLoaded && isVisible) {
      if (isAppuSpeaking) {
        // Let silence detection handle timing - no immediate play
        console.log('Appu is speaking - silence detection will handle audio timing');
      } else {
        // Appu is not speaking, safe to play immediately
        console.log('Page loaded - playing audio immediately');
        playPageAudio();
      }
    }
  }, [currentPage?.pageNumber, imageLoaded, isVisible, isAppuSpeaking, playPageAudio]);

  // Enable/disable silence detection based on visibility and settings
  useEffect(() => {
    silenceDetection.setEnabled(autoPageTurnEnabled && isVisible);
  }, [autoPageTurnEnabled, isVisible, silenceDetection]);
*/
  
  useEffect(() => {
    if (currentPage?.pageImageUrl) {
      setImageLoaded(false);
    }
  }, [currentPage?.pageImageUrl]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
      }
    };
  }, []);

  const handleNextPage = useCallback(() => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages) {
      // Interrupt silence detection when manually navigating
      silenceDetection.interruptSilence();
      handleInternalNextPage();
    }
  }, [currentPage, silenceDetection, handleInternalNextPage]);

  const handlePreviousPage = useCallback(() => {
    if (currentPage && currentPage.pageNumber > 1) {
      // Interrupt silence detection when manually navigating
      silenceDetection.interruptSilence();
      handleInternalPreviousPage();
    }
  }, [currentPage, silenceDetection, handleInternalPreviousPage]);

  if (!isVisible || !currentPage) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <style>{`
        .perspective-1000 {
          perspective: 1000px;
        }
      `}</style>
      <Card className="w-full max-w-4xl h-full max-h-[90vh] flex flex-col bg-gradient-to-br from-purple-50 to-pink-50">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-white rounded-t-lg">
          <div className="flex items-center gap-3">
            <Book className="h-6 w-6 text-purple-600" />
            <h2 className="text-xl font-bold text-purple-800 truncate">
              {currentPage.bookTitle}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-sm">
              Page {currentPage.pageNumber} of {currentPage.totalPages}
            </Badge>
            {isPlayingAudio && (
              <Badge variant="default" className="text-xs animate-pulse bg-green-600">
                🔊 Playing Audio
              </Badge>
            )}
            {currentPage?.audioUrl && !isPlayingAudio && (
              <Button
                variant="outline"
                size="sm"
                onClick={playPageAudio}
                className="text-xs"
              >
                ▶️ Play Audio
              </Button>
            )}
            {silenceDetection.isDetectingSilence && !isPlayingAudio && (
              <Badge variant="outline" className="text-xs animate-pulse">
                <Clock className="h-3 w-3 mr-1" />
                {Math.ceil(silenceDetection.silenceTimer / 1000)}s
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <CardContent className="flex-1 p-6 overflow-hidden">
          <div className="h-full flex flex-col gap-4">

            {/* Image Section with Page Flip Animation */}
            <div className="flex-1 flex items-center justify-center bg-white rounded-lg shadow-inner p-6 overflow-hidden">
              <div className="relative w-full h-full max-w-5xl perspective-1000">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentPage.pageNumber}
                    initial={{
                      rotateY: flipDirection === 'next' ? 90 : -90,
                      opacity: 0,
                      scale: 0.8
                    }}
                    animate={{
                      rotateY: 0,
                      opacity: 1,
                      scale: 1
                    }}
                    exit={{
                      rotateY: flipDirection === 'next' ? -90 : 90,
                      opacity: 0,
                      scale: 0.8
                    }}
                    transition={{
                      duration: 0.6,
                      ease: "easeInOut",
                      opacity: { duration: 0.3 },
                      scale: { duration: 0.4 }
                    }}
                    className="relative w-full h-full"
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    {!imageLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                          <p className="text-gray-500 text-lg">Loading page...</p>
                        </div>
                      </div>
                    )}
                    <img
                      src={currentPage.pageImageUrl}
                      alt={`Page ${currentPage.pageNumber} of ${currentPage.bookTitle}`}
                      className={`w-full h-full object-contain rounded-lg transition-opacity duration-300 ${
                        imageLoaded ? 'opacity-100' : 'opacity-0'
                      }`}
                      onLoad={() => setImageLoaded(true)}
                      onError={() => setImageLoaded(true)}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Controls - Now at the bottom */}
            <div className="flex justify-between items-center px-4">
              <Button
                variant="outline"
                size="lg"
                onClick={handlePreviousPage}
                disabled={currentPage.pageNumber <= 1 || isFlipping}
                className="flex items-center gap-2 transition-all duration-200"
              >
                <ChevronLeft className="h-5 w-5" />
                Previous
              </Button>

              <motion.div
                animate={{ scale: isFlipping ? 0.95 : 1 }}
                transition={{ duration: 0.2 }}
              >
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  Page {currentPage.pageNumber} of {currentPage.totalPages}
                </Badge>
              </motion.div>

              <Button
                variant="default"
                size="lg"
                onClick={handleNextPage}
                disabled={currentPage.pageNumber >= currentPage.totalPages || isFlipping}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 transition-all duration-200"
              >
                Next
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}