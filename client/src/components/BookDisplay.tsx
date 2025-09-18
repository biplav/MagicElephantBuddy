import React, { useState, useEffect, useCallback } from 'react';
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
}

export default function BookDisplay({
  pageData,
  onNextPage,
  onPreviousPage, 
  onClose,
  autoPlay = true
}: BookDisplayProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'previous'>('next');

  // Audio hook for playback control
  const { 
    playPageAudio, 
    isAudioPlaying, 
    pauseAudio, 
    resumeAudio,
    stopAudio,
    audioProgress
  } = useBookAudio({
    onAudioComplete: () => {
      // Parent component handles auto-advance
      console.log('📖 Page audio completed');
    }
  });

  // Reset image loading state when page changes
  useEffect(() => {
    setImageLoaded(false);
  }, [pageData?.id]);

  // Auto-play audio when image finishes loading
  useEffect(() => {
    if (pageData?.audioUrl && autoPlay && imageLoaded) {
      playPageAudio(pageData.audioUrl);
    }
  }, [pageData?.audioUrl, autoPlay, playPageAudio, imageLoaded]);

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

  const handleClose = () => {
    stopAudio();
    onClose();
  };

  const toggleAudio = () => {
    if (isAudioPlaying) {
      pauseAudio();
    } else if (pageData?.audioUrl) {
      if (audioProgress > 0) {
        resumeAudio();
      } else {
        playPageAudio(pageData.audioUrl);
      }
    }
  };

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
            initial={{
              x: flipDirection === 'next' ? 300 : -300,
              opacity: 0,
              rotateY: flipDirection === 'next' ? 45 : -45
            }}
            animate={{
              x: 0,
              opacity: 1,
              rotateY: 0
            }}
            exit={{
              x: flipDirection === 'next' ? -300 : 300,
              opacity: 0,
              rotateY: flipDirection === 'next' ? -45 : 45
            }}
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
                    
                    {/* Audio controls */}
                    {pageData.audioUrl && (
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
                    )}
                  </div>

                  {/* Audio progress bar */}
                  {audioProgress > 0 && (
                    <div className="mt-2">
                      <div className="w-full bg-white/20 rounded-full h-2">
                        <div 
                          className="bg-white h-2 rounded-full transition-all duration-200"
                          style={{ width: `${audioProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Page content */}
                <div className="grid md:grid-cols-2 gap-0 min-h-[400px]">
                  {/* Page image */}
                  <div className="relative bg-gray-50 flex items-center justify-center">
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

                  {/* Page text */}
                  <div className="p-6 flex flex-col justify-center">
                    <div className="prose prose-lg max-w-none">
                      <p 
                        className="text-gray-800 leading-relaxed text-lg"
                        data-testid="text-page-content"
                      >
                        {pageData.pageText}
                      </p>
                    </div>
                    
                    {/* Image description (if available) */}
                    {pageData.imageDescription && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <p 
                          className="text-sm text-blue-800 italic"
                          data-testid="text-image-description"
                        >
                          {pageData.imageDescription}
                        </p>
                      </div>
                    )}

                    {/* Audio status indicator */}
                    {isAudioPlaying && (
                      <div className="mt-4 flex items-center gap-2 text-blue-600">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse delay-100"></div>
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse delay-200"></div>
                        </div>
                        <span className="text-sm">Appu is reading...</span>
                      </div>
                    )}
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