
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Book, Volume2 } from 'lucide-react';

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
}

export default function StorybookDisplay({ 
  currentPage, 
  onNextPage, 
  onPreviousPage, 
  onClose, 
  isVisible 
}: StorybookDisplayProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (currentPage?.pageImageUrl) {
      setImageLoaded(false);
    }
  }, [currentPage?.pageImageUrl]);

  if (!isVisible || !currentPage) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
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
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <CardContent className="flex-1 p-6 overflow-hidden">
          <div className="h-full flex flex-col lg:flex-row gap-6">
            
            {/* Image Section */}
            <div className="flex-1 flex items-center justify-center bg-white rounded-lg shadow-inner p-4">
              <div className="relative w-full h-full max-w-2xl">
                {!imageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                      <p className="text-gray-500">Loading page...</p>
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
              </div>
            </div>

            {/* Text Section */}
            <div className="lg:w-80 flex flex-col">
              <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-purple-200 flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <Volume2 className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-700">
                    Appu is reading...
                  </span>
                </div>
                <div className="prose prose-sm max-w-none">
                  <p className="text-gray-800 leading-relaxed text-base whitespace-pre-wrap">
                    {currentPage.pageText}
                  </p>
                </div>
              </div>
              
              {/* Controls */}
              <div className="flex justify-between items-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onPreviousPage();
                    onPageNavigation?.('previous');
                  }}
                  disabled={currentPage.pageNumber <= 1}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    onNextPage();
                    onPageNavigation?.('next');
                  }}
                  disabled={currentPage.pageNumber >= currentPage.totalPages}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
