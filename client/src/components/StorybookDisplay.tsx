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
  bookId?: string; // Add book ID to page data
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
  bookId?: string; // Add explicit book ID prop
  workflowStateMachine?: any; // Add workflow state machine
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
  bookStateManager,
  bookId,
  workflowStateMachine
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

  // Sync current page data with book state manager
  useEffect(() => {
    if (currentPage && bookStateManager && bookId) {
      // Ensure book state manager has the current book information
      bookStateManager.selectedBookRef.current = {
        id: bookId, // Use the explicit book ID prop
        title: currentPage.bookTitle,
        totalPages: currentPage.totalPages
      };
      bookStateManager.currentPageRef.current = currentPage.pageNumber;
      bookStateManager.isInReadingSessionRef.current = true;
      
      console.log('📚 SYNC: Updated BookStateManager with current page:', {
        bookId: bookId,
        bookTitle: currentPage.bookTitle,
        pageNumber: currentPage.pageNumber,
        totalPages: currentPage.totalPages,
        isInReadingSession: true
      });
    } else if (currentPage && bookStateManager && !bookId) {
      console.warn('📚 SYNC: Missing bookId prop - this may cause navigation issues');
    }
  }, [currentPage, bookStateManager, bookId]);

  // Auto page turning with silence detection
  const handleAutoPageAdvance = useCallback(() => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages && !isFlipping) {
      console.log('🔄 AUTO-ADVANCE: Auto-advancing to next page due to silence');
      handleInternalNextPage();
    } else if (currentPage && currentPage.pageNumber >= currentPage.totalPages) {
      console.log('📖 END-OF-BOOK: Reached end of book - auto page advance disabled');
      // Could trigger end-of-book celebration or suggestions here
    }
  }, [currentPage, isFlipping, handleInternalNextPage]);

  const handleSilenceInterrupted = useCallback(() => {
    console.log('Auto page advance interrupted by speech');
  }, []);

  // Audio management for workflow state machine
  const audioManager = {
    isPlaying: isPlayingAudio,
    
    playPageAudio: useCallback(() => {
      if (currentPage?.audioUrl) {
        console.log('🔊 AUDIO: Playing page audio:', currentPage.audioUrl);

        // Stop any existing audio
        if (audioElementRef.current) {
          audioElementRef.current.pause();
          audioElementRef.current.currentTime = 0;
          setIsPlayingAudio(false);
          onAppuSpeakingChangeRef.current?.(false);
        }

        const audio = new Audio(currentPage.audioUrl);
        audio.preload = 'auto';

        audio.onplay = () => {
          console.log('🔊 AUDIO: Audio started playing');
          setIsPlayingAudio(true);
          onAppuSpeakingChangeRef.current?.(true);
          workflowStateMachine?.handleAudioPlaybackStart();
          bookStateManager.bookStateAPI.transitionToAudioPlaying();
        };

        audio.onended = () => {
          console.log('🔊 AUDIO: Audio finished playing');
          setIsPlayingAudio(false);
          onAppuSpeakingChangeRef.current?.(false);
          audioElementRef.current = null;
          workflowStateMachine?.handleAudioPlaybackEnd();
          bookStateManager.bookStateAPI.transitionToAudioCompleted();
        };

        audio.onerror = (error) => {
          console.error('Error playing audio:', error);
          setIsPlayingAudio(false);
          onAppuSpeakingChangeRef.current?.(false);
          audioElementRef.current = null;
          workflowStateMachine?.handleError('Audio playback failed');
          bookStateManager.bookStateAPI.transitionToError();
        };

        audio.onpause = () => {
          console.log('Audio paused');
          setIsPlayingAudio(false);
          onAppuSpeakingChangeRef.current?.(false);
          bookStateManager.bookStateAPI.transitionToAudioPaused();
        };

        audioElementRef.current = audio;

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
              workflowStateMachine?.handleError('Audio autoplay blocked');
            });
        }
      }
    }, [currentPage?.audioUrl, workflowStateMachine]),
    
    pauseAudio: useCallback(() => {
      if (audioElementRef.current && !audioElementRef.current.paused) {
        const currentTime = audioElementRef.current.currentTime;
        audioElementRef.current.pause();
        console.log('🔊 AUDIO: Audio paused at position', currentTime);
        return currentTime;
      }
      return 0;
    }, []),
    
    resumeAudio: useCallback((position: number) => {
      if (audioElementRef.current) {
        audioElementRef.current.currentTime = position;
        const playPromise = audioElementRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('🔊 AUDIO: Audio resumed from position', position);
            })
            .catch(error => {
              console.error('Failed to resume audio:', error);
              workflowStateMachine?.handleError('Audio resume failed');
            });
        }
      }
    }, [workflowStateMachine]),
    
    stopAudio: useCallback(() => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
        setIsPlayingAudio(false);
        onAppuSpeakingChangeRef.current?.(false);
        audioElementRef.current = null;
        console.log('🔊 AUDIO: Audio stopped');
      }
    }, [])
  };

  const silenceDetection = useSilenceDetection({
    silenceDuration: 3000,
    initialAudioDelay: 1000,
    onSilenceDetected: handleAutoPageAdvance,
    onSilenceInterrupted: handleSilenceInterrupted,
    onInitialAudioTrigger: audioManager.playPageAudio,
    enabled: autoPageTurnEnabled && isVisible,
    openaiConnection: openaiConnection,
    workflowStateMachine: workflowStateMachine
  });

  // Register components with workflow state machine
  useEffect(() => {
    if (workflowStateMachine) {
      workflowStateMachine.registerSilenceDetection(silenceDetection);
      workflowStateMachine.registerAudioManager(audioManager);
      workflowStateMachine.registerBookStateManager(bookStateManager);
    }
  }, [workflowStateMachine, silenceDetection, audioManager, bookStateManager]);

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
                onClick={audioManager.playPageAudio}
                className="text-xs"
              >
                ▶️ Play Audio
              </Button>
            )}
            {bookStateManager.bookState !== 'IDLE' && (
              <Badge 
                variant={bookStateManager.bookState === 'ERROR' ? 'destructive' : 'outline'} 
                className="text-xs"
              >
                {bookStateManager.bookState.replace(/_/g, ' ')}
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