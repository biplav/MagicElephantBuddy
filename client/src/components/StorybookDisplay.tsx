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

  // Auto page turning with silence detection
  const handleAutoPageAdvance = useCallback(() => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages && !isFlipping) {
      console.log('Auto-advancing to next page due to silence');
      handleNextPage();
    } else if (currentPage && currentPage.pageNumber >= currentPage.totalPages) {
      console.log('Reached end of book - auto page advance disabled');
      // Could trigger end-of-book celebration or suggestions here
    }
  }, [currentPage, isFlipping]);

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

  // Create stable references to the methods
  const setAppuSpeaking = silenceDetection.setAppuSpeaking;
  const setUserSpeaking = silenceDetection.setUserSpeaking;
  const setEnabled = silenceDetection.setEnabled;

  // Sync Appu and user speaking state with silence detection
  useEffect(() => {
    setAppuSpeaking(isAppuSpeaking);
  }, [isAppuSpeaking, setAppuSpeaking]);

  useEffect(() => {
    setUserSpeaking(isUserSpeaking);
  }, [isUserSpeaking, setUserSpeaking]);

  // Enable/disable silence detection based on visibility and settings
  useEffect(() => {
    setEnabled(autoPageTurnEnabled && isVisible);
  }, [autoPageTurnEnabled, isVisible, setEnabled]);

  useEffect(() => {
    if (currentPage?.pageImageUrl) {
      setImageLoaded(false);
    }
  }, [currentPage?.pageImageUrl]);

  const handleNextPage = useCallback(() => {
    if (currentPage && currentPage.pageNumber < currentPage.totalPages) {
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
  }, [currentPage, onNextPage, onPageNavigation, silenceDetection]);

  const handlePreviousPage = useCallback(() => {
    if (currentPage && currentPage.pageNumber > 1) {
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
  }, [currentPage, onPreviousPage, onPageNavigation, silenceDetection]);

  if (!isVisible || !currentPage) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <style jsx>{`
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
            {silenceDetection.isDetectingSilence && (
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