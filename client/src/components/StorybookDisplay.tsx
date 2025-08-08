import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Book, Clock } from 'lucide-react';


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
  const onAppuSpeakingChangeRef = useRef(onAppuSpeakingChange);

  useEffect(() => {
    onAppuSpeakingChangeRef.current = onAppuSpeakingChange;
  }, [onAppuSpeakingChange]);

  // Sync audio playing state with parent component
  useEffect(() => {
    onAppuSpeakingChangeRef.current?.(audioManager.isPlaying);
  }, [audioManager.isPlaying]);

  // Internal navigation handlers
  const handleInternalNextPage = useCallback(async () => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages && !isFlipping) {
      console.log('Navigating to next page');

      // Stop audio via BookStateManager
      bookStateManager.stopAudio();

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

      // Stop audio via BookStateManager
      bookStateManager.stopAudio();

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

  

  // Simple audio control interface - delegates to BookStateManager
  const audioManager = {
    isPlaying: bookStateManager.isPlayingAudio,
    playPageAudio: () => {
      if (currentPage?.audioUrl) {
        bookStateManager.playPageAudio(currentPage.audioUrl);
      }
    },
    stopAudio: bookStateManager.stopAudio
  };

  

  

  // Monitor page loading completion
  useEffect(() => {
    if (currentPage && imageLoaded && isVisible) {
      console.log('📖 PAGE-LOADED: Page fully loaded, transitioning book state');
      
      // Transition from PAGE_LOADING to PAGE_LOADED when image is loaded
      if (bookStateManager.bookState === 'PAGE_LOADING') {
        bookStateManager.bookStateAPI.transitionToPageLoaded();
        
        // If there's audio, transition to audio ready
        if (currentPage.audioUrl) {
          bookStateManager.bookStateAPI.transitionToAudioReadyToPlay();
        }
      }
    }
  }, [currentPage, imageLoaded, isVisible, bookStateManager]);
  
  useEffect(() => {
    if (currentPage?.pageImageUrl) {
      setImageLoaded(false);
    }
  }, [currentPage?.pageImageUrl]);

  

  const handleNextPage = useCallback(() => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages) {
      // Clear auto advance timer when manually navigating
      bookStateManager.clearAutoAdvanceTimer();
      handleInternalNextPage();
    }
  }, [currentPage, bookStateManager, handleInternalNextPage]);

  const handlePreviousPage = useCallback(() => {
    if (currentPage && currentPage.pageNumber > 1) {
      // Clear auto advance timer when manually navigating
      bookStateManager.clearAutoAdvanceTimer();
      handleInternalPreviousPage();
    }
  }, [currentPage, bookStateManager, handleInternalPreviousPage]);

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
            {audioManager.isPlaying && (
              <Badge variant="default" className="text-xs animate-pulse bg-green-600">
                🔊 Playing Audio
              </Badge>
            )}
            {currentPage?.audioUrl && !audioManager.isPlaying && (
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