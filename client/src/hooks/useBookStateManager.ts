import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setSelectedBook } from '@/store/bookStore';
import type { BookRootState } from '@/store/bookStore';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('book-state-manager');

interface BookData {
  id: string;
  title: string;
  author: string;
  summary: string;
  totalPages: number;
  currentPage?: number;
  audioUrl?: string | null;
}

export const useBookStateManager = () => {
  const dispatch = useDispatch();
  const selectedBook = useSelector((state: BookRootState) => state.book.selectedBook);

  const handleBookSearch = useCallback(async (callId: string, args: any) => {
    logger.info("Book search started", { callId, args });
    
    try {
      const argsJson = typeof args === 'string' ? JSON.parse(args) : args;
      const response = await fetch('/api/books/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: argsJson.query }),
      });
      
      if (!response.ok) {
        throw new Error(`Book search failed: ${response.status}`);
      }
      
      const searchResults = await response.json();
      
      if (searchResults.books?.length > 0) {
        const bookData = searchResults.books[0];
        
        const selectedBookData = {
          id: bookData.id,
          title: bookData.title,
          author: bookData.author,
          summary: bookData.summary,
          totalPages: bookData.totalPages,
          currentPage: 1,
          audioUrl: null
        };
        
        logger.info("Setting selected book", selectedBookData);
        dispatch(setSelectedBook(selectedBookData));
        
        return {
          title: bookData.title,
          summary: bookData.summary,
          id: bookData.id,
          totalPages: bookData.totalPages
        };
      } else {
        return {
          title: "No Books Found",
          summary: "No books found matching your search. Let me suggest something else!"
        };
      }
    } catch (error: any) {
      logger.error("Book search error", error);
      throw error;
    }
  }, [dispatch]);

  const handleDisplayBookPage = useCallback(async (callId: string, args: any, handleStorybookPageDisplay: (data: any) => void) => {
    logger.info("Display book page started", { callId, args, hasSelectedBook: !!selectedBook });
    
    try {
      if (!selectedBook) {
        throw new Error("No book selected. Please search for a book first.");
      }
      
      const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
      const { pageRequest } = parsedArgs;
      
      let pageNumber = 1;
      
      if (pageRequest) {
        if (pageRequest === 'first' || pageRequest === 'start') {
          pageNumber = 1;
        } else if (pageRequest === 'next') {
          pageNumber = (selectedBook.currentPage || 1) + 1;
        } else if (pageRequest === 'previous' || pageRequest === 'back') {
          pageNumber = Math.max(1, (selectedBook.currentPage || 1) - 1);
        } else if (!isNaN(parseInt(pageRequest))) {
          pageNumber = parseInt(pageRequest);
        }
      }
      
      if (pageNumber < 1) pageNumber = 1;
      if (pageNumber > selectedBook.totalPages) pageNumber = selectedBook.totalPages;
      
      const pageResponse = await fetch(`/api/books/${selectedBook.id}/page/${pageNumber}`);
      
      if (!pageResponse.ok) {
        throw new Error(`Failed to fetch page: ${pageResponse.status}`);
      }
      
      const pageResponseData = await pageResponse.json();
      const pageData = pageResponseData.page;
      
      if (!pageData) {
        throw new Error("Page data not found in response");
      }
      
      handleStorybookPageDisplay({
        pageImageUrl: pageData.pageImageUrl,
        pageText: pageData.pageText,
        pageNumber: pageData.pageNumber,
        totalPages: pageData.totalPages,
        bookTitle: pageData.bookTitle,
        audioUrl: pageData.audioUrl,
      });
      
      logger.info("Display book page completed", { pageNumber, title: pageData.bookTitle });
      
      return {
        success: true,
        pageNumber: pageData.pageNumber,
        title: pageData.bookTitle
      };
    } catch (error: any) {
      logger.error("Display book page error", error);
      throw error;
    }
  }, [selectedBook]);

  return {
    selectedBook,
    handleBookSearch,
    handleDisplayBookPage
  };
};