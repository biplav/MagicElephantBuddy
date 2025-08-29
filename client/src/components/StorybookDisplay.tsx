import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Book, Clock } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { BookRootState } from '@/store/bookStore';


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
  bookId,
  workflowStateMachine
}: StorybookDisplayProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'previous'>('next');
  const onAppuSpeakingChangeRef = useRef(onAppuSpeakingChange);

  // Read book state from Redux store (read-only access)
  const bookState = useSelector((state: BookRootState) => state.book.bookState);
  const isPlayingAudio = useSelector((state: BookRootState) => state.book.isPlayingAudio);

  useEffect(() => {
    onAppuSpeakingChangeRef.current = onAppuSpeakingChange;
  }, [onAppuSpeakingChange]);

  // Sync audio playing state with parent component
  useEffect(() => {
    onAppuSpeakingChangeRef.current?.(isPlayingAudio);
  }, [isPlayingAudio]);

  // Internal navigation handlers
  const handleInternalNextPage = useCallback(async () => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages && !isFlipping) {
      console.log('Navigating to next page');

      // Audio control handled by parent component

      setFlipDirection('next');
      setIsFlipping(true);

      try {
        // Navigation is handled by external logic since StorybookDisplay is for display only
        const success = true;
        if (success) {
          onPageNavigation?.('next');
        }
      } catch (error) {
        console.error('Failed to navigate to next page:', error);
      } finally {
        setIsFlipping(false);
      }
    }
  }, [currentPage, isFlipping, onPageNavigation]);

  const handleInternalPreviousPage = useCallback(async () => {
    if (currentPage && currentPage.pageNumber > 1 && !isFlipping) {
      console.log('Navigating to previous page');

      // Audio control handled by parent component

      setFlipDirection('previous');
      setIsFlipping(true);

      try {
        // Navigation is handled by external logic since StorybookDisplay is for display only
        const success = true;
        if (success) {
          onPageNavigation?.('previous');
        }
      } catch (error) {
        console.error('Failed to navigate to previous page:', error);
      } finally {
        setIsFlipping(false);
      }
    }
  }, [currentPage, isFlipping, onPageNavigation]);

  // Sync current page data with book manager (Redux)
  useEffect(() => {
    if (currentPage && bookId) {
      // Ensure Redux store has the current book information
      const bookData = {
        id: bookId,
        title: currentPage.bookTitle,
        totalPages: currentPage.totalPages,
        currentAudioUrl: currentPage.audioUrl || null
      };
      
      // Note: Redux store updates are handled by parent components
      // StorybookDisplay is primarily for display purposes

      console.log('📚 SYNC: Updated Redux BookManager with current page:', {
        bookId: bookId,
        bookTitle: currentPage.bookTitle,
        pageNumber: currentPage.pageNumber,
        totalPages: currentPage.totalPages,
        isInReadingSession: true
      });
    } else if (currentPage && !bookId) {
      console.warn('📚 SYNC: Missing bookId prop - this may cause navigation issues');
    }
  }, [currentPage, bookId]);



  // Monitor page loading completion
  useEffect(() => {
    if (currentPage && imageLoaded && isVisible) {
      console.log('📖 PAGE-LOADED: Page fully loaded, transitioning book state');

      // Book state transitions are handled by the main book manager in parent components
    }
  }, [currentPage, imageLoaded, isVisible]);

  useEffect(() => {
    if (currentPage?.pageImageUrl) {
      setImageLoaded(false);
    }
  }, [currentPage?.pageImageUrl]);



  const handleNextPage = useCallback(() => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages) {
      // Note: Auto advance timer is handled by workflow state machine
      handleInternalNextPage();
    }
  }, [currentPage, handleInternalNextPage]);

  const handlePreviousPage = useCallback(() => {
    if (currentPage && currentPage.pageNumber > 1) {
      // Note: Auto advance timer is handled by workflow state machine
      handleInternalPreviousPage();
    }
  }, [currentPage, handleInternalPreviousPage]);

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
                onClick={() => {
                  // Audio playback handled by parent component
                  console.log('Audio playback requested for:', currentPage?.audioUrl);
                }}
                className="text-xs"
              >
                ▶️ Play Audio
              </Button>
            )}
            {bookState !== 'IDLE' && (
              <Badge
                variant={bookState === 'ERROR' ? 'destructive' : 'outline'}
                className="text-xs"
              >
                {bookState.replace(/_/g, ' ')}
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