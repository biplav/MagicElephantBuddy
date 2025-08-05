import React, { useState, useEffect, useCallback } from 'react';
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
  onNextPage: () => void;
  onPreviousPage: () => void;
  onClose: () => void;
  isVisible: boolean;
  onPageNavigation?: (direction: 'next' | 'previous') => void;
  autoPageTurnEnabled?: boolean;
  onAppuSpeakingChange?: (speaking: boolean) => void;
  isAppuSpeaking?: boolean;
  isUserSpeaking?: boolean;
  openaiConnection?: any;
}

export default function StorybookDisplay({
  currentPage,
  onNextPage,
  onPreviousPage,
  onClose,
  isVisible,
  onPageNavigation,
  autoPageTurnEnabled = true,
  onAppuSpeakingChange,
  isAppuSpeaking = false,
  isUserSpeaking = false,
  openaiConnection
}: StorybookDisplayProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'previous'>('next');
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Auto page turning with silence detection
  const handleAutoPageAdvance = useCallback(() => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages && !isFlipping) {
      console.log('Auto-advancing to next page due to silence');
      
      // Stop current audio
      if (audioElement) {
        audioElement.pause();
        setIsPlayingAudio(false);
        onAppuSpeakingChange?.(false);
      }

      // Call onNextPage directly, not handleNextPage to avoid circular dependency
      setFlipDirection('next');
      setIsFlipping(true);
      setTimeout(() => {
        onNextPage();
        onPageNavigation?.('next');
        setIsFlipping(false);
      }, 500);
    } else if (currentPage && currentPage.pageNumber >= currentPage.totalPages) {
      console.log('Reached end of book - auto page advance disabled');
      // Could trigger end-of-book celebration or suggestions here
    }
  }, [currentPage, isFlipping, onNextPage, onPageNavigation, audioElement, onAppuSpeakingChange]);

  const handleSilenceInterrupted = useCallback(() => {
    console.log('Auto page advance interrupted by speech');
  }, []);

  const silenceDetection = useSilenceDetection({
    silenceDuration: 3000, // 3 seconds
    onSilenceDetected: handleAutoPageAdvance,
    onSilenceInterrupted: handleSilenceInterrupted,
    enabled: autoPageTurnEnabled && isVisible,
    openaiConnection: openaiConnection
  });

  // Play audio when page changes
  const playPageAudio = useCallback(() => {
    if (currentPage?.audioUrl && !isPlayingAudio) {
      console.log('Playing page audio:', currentPage.audioUrl);
      
      // Stop any existing audio
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }

      const audio = new Audio(currentPage.audioUrl);
      audio.volume = 0.8;

      audio.onplay = () => {
        setIsPlayingAudio(true);
        onAppuSpeakingChange?.(true);
      };

      audio.onended = () => {
        setIsPlayingAudio(false);
        onAppuSpeakingChange?.(false);
        setAudioElement(null);
      };

      audio.onerror = (error) => {
        console.error('Error playing audio:', error);
        setIsPlayingAudio(false);
        onAppuSpeakingChange?.(false);
        setAudioElement(null);
      };

      setAudioElement(audio);
      audio.play().catch(error => {
        console.error('Failed to play audio:', error);
        setIsPlayingAudio(false);
        onAppuSpeakingChange?.(false);
      });
    }
  }, [currentPage?.audioUrl, isPlayingAudio, audioElement, onAppuSpeakingChange]);

  // Auto-play audio when page loads
  useEffect(() => {
    if (currentPage?.audioUrl && imageLoaded && isVisible) {
      // Small delay to ensure smooth page transition
      const timer = setTimeout(() => {
        playPageAudio();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentPage?.audioUrl, imageLoaded, isVisible, playPageAudio]);

  // Enable/disable silence detection based on visibility and settings
  useEffect(() => {
    silenceDetection.setEnabled(autoPageTurnEnabled && isVisible);
  }, [autoPageTurnEnabled, isVisible, silenceDetection]);

  useEffect(() => {
    if (currentPage?.pageImageUrl) {
      setImageLoaded(false);
    }
  }, [currentPage?.pageImageUrl]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
    };
  }, [audioElement]);

  const handleNextPage = useCallback(() => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages) {
      // Stop current audio
      if (audioElement) {
        audioElement.pause();
        setIsPlayingAudio(false);
        onAppuSpeakingChange?.(false);
      }

      // Interrupt silence detection when manually navigating
      silenceDetection.interruptSilence();

      setFlipDirection('next');
      setIsFlipping(true);
      setTimeout(() => {
        onNextPage();
        onPageNavigation?.('next');
        setIsFlipping(false);
      }, 500);
    }
  }, [currentPage, onNextPage, onPageNavigation, silenceDetection, audioElement, onAppuSpeakingChange]);

  const handlePreviousPage = useCallback(() => {
    if (currentPage && currentPage.pageNumber > 1) {
      // Stop current audio
      if (audioElement) {
        audioElement.pause();
        setIsPlayingAudio(false);
        onAppuSpeakingChange?.(false);
      }

      // Interrupt silence detection when manually navigating
      silenceDetection.interruptSilence();

      setFlipDirection('previous');
      setIsFlipping(true);
      setTimeout(() => {
        onPreviousPage();
        onPageNavigation?.('previous');
        setIsFlipping(false);
      }, 500);
    }
  }, [currentPage, onPreviousPage, onPageNavigation, silenceDetection, audioElement, onAppuSpeakingChange]);

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