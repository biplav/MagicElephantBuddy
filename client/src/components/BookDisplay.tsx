import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, X, Book, Volume2, VolumeX } from 'lucide-react';
import { useBookAudio } from '@/hooks/useBookAudio';

interface Page {
  id: string;
  pageNumber: number;
  pageText: string;
  imageUrl: string;
  imageDescription?: string;
  audioUrl?: string;
}

interface BookDisplayProps {
  pageData: Page;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onClose: () => void;
  autoPlay?: boolean;
  showAudioControls?: boolean;
  onAudioStateChange?: (isPlaying: boolean) => void;
  externalAudioControl?: 'play' | 'pause' | 'toggle' | null;
}

export default function BookDisplay({
  pageData,
  onNextPage,
  onPreviousPage,
  onClose,
  autoPlay = true,
  showAudioControls = true,
  onAudioStateChange,
  externalAudioControl
}: BookDisplayProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'previous'>('next');
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);

  // Memoize audio completion handler to prevent re-renders
  const handleAudioComplete = useCallback(() => {
    console.log('📖 Page audio completed');
    onAudioStateChange?.(false);
  }, [onAudioStateChange]);

  // Simple audio state
  const {
    playPageAudio,
    isAudioPlaying,
    pauseAudio,
    stopAudio
  } = useBookAudio({
    onAudioComplete: handleAudioComplete
  });

  // Reset image loading state and auto-play flag when page changes
  useEffect(() => {
    setImageLoaded(false);
    setHasAutoPlayed(false);
  }, [pageData?.id]);

  // Memoize auto-play logic to prevent unnecessary effect runs
  const shouldAutoPlay = useMemo(() => {
    return pageData?.audioUrl && autoPlay && imageLoaded && !hasAutoPlayed;
  }, [pageData?.audioUrl, autoPlay, imageLoaded, hasAutoPlayed]);

  // Auto-play audio when conditions are met (only once per page)
  useEffect(() => {
    if (shouldAutoPlay) {
      setHasAutoPlayed(true);
      playPageAudio(pageData.audioUrl!).then(() => {
        onAudioStateChange?.(true);
      }).catch((error) => {
        console.error('Auto-play failed:', error);
      });
    }
  }, [shouldAutoPlay]);

  // Handle page navigation with animations
  const handleNextPage = useCallback(async () => {
    if (isFlipping) return;
    
    setFlipDirection('next');
    setIsFlipping(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 200)); // Animation delay
      onNextPage();
    } finally {
      setIsFlipping(false);
    }
  }, [isFlipping, onNextPage]);

  const handlePreviousPage = useCallback(async () => {
    if (isFlipping) return;
    
    setFlipDirection('previous');
    setIsFlipping(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 200)); // Animation delay
      onPreviousPage();
    } finally {
      setIsFlipping(false);
    }
  }, [isFlipping, onPreviousPage]);

  // Memoize handlers to prevent re-renders
  const handleClose = useCallback(() => {
    stopAudio();
    onClose();
  }, [stopAudio, onClose]);

  // Simple audio toggle function
  const toggleAudio = useCallback(() => {
    if (isAudioPlaying) {
      pauseAudio();
      onAudioStateChange?.(false);
    } else if (pageData?.audioUrl) {
      playPageAudio(pageData.audioUrl).then(() => {
        onAudioStateChange?.(true);
      }).catch((error) => {
        console.error('Audio play failed:', error);
      });
    }
  }, [isAudioPlaying, pageData?.audioUrl, pauseAudio, playPageAudio, onAudioStateChange]);

  // Memoize external control execution to reduce effect complexity
  const executeExternalControl = useCallback(() => {
    if (!externalAudioControl || !pageData?.audioUrl) return;

    switch (externalAudioControl) {
      case 'play':
        if (!isAudioPlaying) {
          playPageAudio(pageData.audioUrl).then(() => {
            onAudioStateChange?.(true);
          }).catch((error) => {
            console.error('External play failed:', error);
          });
        }
        break;
      case 'pause':
        if (isAudioPlaying) {
          pauseAudio();
          onAudioStateChange?.(false);
        }
        break;
      case 'toggle':
        toggleAudio();
        break;
    }
  }, [externalAudioControl, isAudioPlaying, pageData?.audioUrl, playPageAudio, pauseAudio, onAudioStateChange, toggleAudio]);

  // Handle external audio control commands
  useEffect(() => {
    executeExternalControl();
  }, [executeExternalControl]);

  if (!pageData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
      data-testid="book-display-overlay"
    >
      <div className="relative max-w-4xl w-full max-h-screen">
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 text-white hover:bg-white/20 z-10"
          onClick={handleClose}
          data-testid="button-close"
        >
          <X className="h-6 w-6" />
        </Button>

        {/* Main book display */}
        <AnimatePresence mode="wait">
          <motion.div
            key={pageData.id}
            initial={useMemo(() => ({
              x: flipDirection === 'next' ? 300 : -300,
              opacity: 0,
              rotateY: flipDirection === 'next' ? 45 : -45
            }), [flipDirection])}
            animate={{
              x: 0,
              opacity: 1,
              rotateY: 0
            }}
            exit={useMemo(() => ({
              x: flipDirection === 'next' ? -300 : 300,
              opacity: 0,
              rotateY: flipDirection === 'next' ? -45 : 45
            }), [flipDirection])}
            transition={{
              duration: 0.3,
              ease: "easeInOut"
            }}
            style={{
              transformStyle: "preserve-3d"
            }}
          >
            <Card className="bg-white shadow-2xl">
              <CardContent className="p-0">
                {/* Book header */}
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Book className="h-5 w-5" />
                      <span className="font-medium">Page {pageData.pageNumber}</span>
                    </div>

                    {/* Audio controls - centered */}
                    {pageData.audioUrl && showAudioControls && (
                      <div className="absolute left-1/2 transform -translate-x-1/2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={toggleAudio}
                          className="text-white hover:bg-white/20"
                          data-testid="button-toggle-audio"
                        >
                          {isAudioPlaying ? (
                            <VolumeX className="h-4 w-4 mr-2" />
                          ) : (
                            <Volume2 className="h-4 w-4 mr-2" />
                          )}
                          {isAudioPlaying ? 'Pause' : 'Play'}
                        </Button>
                      </div>
                    )}

                    {/* Empty space for balance */}
                    <div className="w-[60px]"></div>
                  </div>

                </div>

                {/* Page content */}
                <div className="flex flex-col">
                  {/* Page image - maximized space */}
                  <div className="relative bg-gray-50 flex items-center justify-center min-h-[500px] flex-1">
                    {pageData.imageUrl ? (
                      <img
                        src={pageData.imageUrl}
                        alt={`Page ${pageData.pageNumber}`}
                        className="max-w-full max-h-full object-contain"
                        onLoad={() => setImageLoaded(true)}
                        data-testid="img-page"
                      />
                    ) : (
                      <div className="text-gray-400 text-center p-8">
                        <Book className="h-16 w-16 mx-auto mb-4" />
                        <p>Image not available</p>
                      </div>
                    )}

                    {/* Loading indicator */}
                    {!imageLoaded && pageData.imageUrl && (
                      <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center">
                        <div className="text-gray-500">Loading...</div>
                      </div>
                    )}
                  </div>

                  {/* Page text - compact below image */}
                  <div className="p-4 bg-white">
                    <div className="prose prose-sm max-w-none">
                      <p
                        className="text-gray-800 leading-relaxed text-base mb-2"
                        data-testid="text-page-content"
                      >
                        {pageData.pageText}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 items-start">
                      {/* Image description (if available) */}
                      {pageData.imageDescription && (
                        <div className="flex-1 p-2 bg-blue-50 rounded text-xs">
                          <p
                            className="text-blue-800 italic"
                            data-testid="text-image-description"
                          >
                            {pageData.imageDescription}
                          </p>
                        </div>
                      )}

                      {/* Audio status indicator */}
                      {isAudioPlaying && (
                        <div className="flex items-center gap-2 text-blue-600">
                          <div className="flex space-x-1">
                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></div>
                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse delay-100"></div>
                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse delay-200"></div>
                          </div>
                          <span className="text-xs">Appu is reading...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Navigation controls */}
                <div className="border-t bg-gray-50 p-4">
                  <div className="flex justify-between items-center">
                    <Button
                      variant="outline"
                      onClick={handlePreviousPage}
                      disabled={isFlipping}
                      className="flex items-center gap-2"
                      data-testid="button-previous"
                    >
                      <ChevronLeft className="h-5 w-5" />
                      Previous
                    </Button>

                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="secondary"
                        data-testid="badge-page-number"
                      >
                        Page {pageData.pageNumber}
                      </Badge>
                    </div>

                    <Button
                      variant="outline"
                      onClick={handleNextPage}
                      disabled={isFlipping}
                      className="flex items-center gap-2"
                      data-testid="button-next"
                    >
                      Next
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}