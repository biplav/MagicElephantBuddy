import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, BookOpen, ArrowLeft } from 'lucide-react';
import BookDisplay from '@/components/BookDisplay';
import { useBookAudio } from '@/hooks/useBookAudio';

interface Book {
  id: string;
  title: string;
  author?: string;
  summary?: string;
  totalPages: number;
  genre?: string;
}

interface Page {
  id: string;
  pageNumber: number;
  pageText: string;
  imageUrl: string;
  imageDescription?: string;
  audioUrl?: string;
}

interface BookWithPages extends Book {
  pages: Page[];
}

export default function BookReading() {
  // Simple state (no Redux)
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [isReading, setIsReading] = useState(false);
  // Removed isChildSpeaking state - no longer needed without real speech detection

  // TanStack Query for API calls (like AdminBookUpload.tsx)
  const { data: books, isLoading: booksLoading } = useQuery({
    queryKey: ['books'],
    queryFn: async () => {
      const response = await fetch('/api/admin/books');
      if (!response.ok) throw new Error('Failed to fetch books');
      return response.json();
    }
  });

  // Removed unused full book query - we fetch pages individually as needed

  const { data: pageData } = useQuery({
    queryKey: ['book-page', selectedBook?.id, currentPage],
    queryFn: async (): Promise<Page | null> => {
      if (!selectedBook?.id) return null;
      const response = await fetch(`/api/books/${selectedBook.id}/page/${currentPage}`);
      if (!response.ok) throw new Error('Failed to fetch page');
      const data = await response.json();
      
      // Check if data has the expected structure
      if (data.page) {
        return data.page as Page;
      } else {
        return data as Page;
      }
    },
    enabled: !!selectedBook?.id && currentPage > 0
  });

  // Audio hook for auto-play and auto-advance
  const { 
    playPageAudio, 
    isAudioPlaying, 
    pauseAudio, 
    resumeAudio,
    stopAudio
  } = useBookAudio({
    onAudioComplete: handleAudioComplete
    // onSpeakingChange removed - no longer needed for audio playback
  });

  // Auto-advance to next page when audio completes
  function handleAudioComplete() {
    if (selectedBook && currentPage < selectedBook.totalPages) {
      handleNextPage();
    } else {
      // Book finished
      setIsReading(false);
    }
  }

  // Simple functions (no complex hooks)
  const handleBookSearch = async (query: string) => {
    if (!query.trim()) return;
    
    try {
      const response = await fetch('/api/books/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: query, keywords: [query] })
      });
      
      if (!response.ok) throw new Error('Search failed');
      
      const result = await response.json();
      if (result.books?.length > 0) {
        selectBook(result.books[0]);
      }
    } catch (error) {
      console.error('Book search failed:', error);
    }
  };

  const selectBook = (book: Book) => {
    setSelectedBook(book);
    setCurrentPage(1);
    setIsReading(false);
  };

  const startReading = () => {
    setIsReading(true);
    setCurrentPage(1);
    // Auto-play will be handled by BookDisplay component
  };

  const handleNextPage = () => {
    if (selectedBook && currentPage < selectedBook.totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleClose = () => {
    stopAudio();
    setSelectedBook(null);
    setIsReading(false);
    setCurrentPage(1);
  };

  // Placeholder for future pause management when child speaks
  // Note: Disabled to prevent pause loop bug until real speech detection is implemented
  // TODO: Implement actual microphone access and speech detection
  /*
  useEffect(() => {
    if (isChildSpeaking && isAudioPlaying) {
      pauseAudio();
      const timer = setTimeout(() => {
        if (!isChildSpeaking) {
          resumeAudio();
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isChildSpeaking, isAudioPlaying, pauseAudio, resumeAudio]);
  */

  // Show book reading interface if book is selected and reading
  if (selectedBook && isReading && pageData) {
    return (
      <BookDisplay
        pageData={pageData}
        onNextPage={handleNextPage}
        onPreviousPage={handlePreviousPage}
        onClose={handleClose}
        autoPlay={true}
      />
    );
  }

  // Show book selection interface
  return (
    <div className="container mx-auto p-4 max-w-4xl" data-testid="book-reading-container">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => window.history.back()}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">Book Reading</h1>
        <p className="text-gray-600">Choose a book to read with Appu!</p>
      </div>

      {/* Search Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Books
          </CardTitle>
          <CardDescription>
            Search for books by title, theme, or ask for a specific type of story
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Search for a book... (e.g., 'animal stories', 'adventure')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleBookSearch(searchQuery)}
              data-testid="input-search"
            />
            <Button 
              onClick={() => handleBookSearch(searchQuery)}
              disabled={!searchQuery.trim()}
              data-testid="button-search"
            >
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Book Selection */}
      {selectedBook && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {selectedBook.title}
            </CardTitle>
            {selectedBook.author && (
              <CardDescription>by {selectedBook.author}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {selectedBook.summary && (
                <p className="text-sm text-gray-700">{selectedBook.summary}</p>
              )}
              
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary" data-testid="badge-pages">
                  {selectedBook.totalPages} pages
                </Badge>
                {selectedBook.genre && (
                  <Badge variant="outline" data-testid="badge-genre">
                    {selectedBook.genre}
                  </Badge>
                )}
              </div>

              <div className="flex gap-2 pt-3">
                <Button 
                  onClick={startReading}
                  disabled={booksLoading}
                  data-testid="button-start-reading"
                >
                  {booksLoading ? 'Loading...' : 'Start Reading'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedBook(null)}
                  data-testid="button-choose-different"
                >
                  Choose Different Book
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Books */}
      <Card>
        <CardHeader>
          <CardTitle>Available Books</CardTitle>
          <CardDescription>
            Choose from our collection of children's books
          </CardDescription>
        </CardHeader>
        <CardContent>
          {booksLoading ? (
            <p className="text-gray-500" data-testid="text-loading">Loading books...</p>
          ) : books && books.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {books.map((book: Book) => (
                <Card 
                  key={book.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedBook?.id === book.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  onClick={() => selectBook(book)}
                  data-testid={`card-book-${book.id}`}
                >
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-sm mb-1">{book.title}</h3>
                    {book.author && (
                      <p className="text-xs text-gray-600 mb-2">by {book.author}</p>
                    )}
                    <div className="flex gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {book.totalPages} pages
                      </Badge>
                      {book.genre && (
                        <Badge variant="outline" className="text-xs">
                          {book.genre}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-gray-500" data-testid="text-no-books">No books available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}