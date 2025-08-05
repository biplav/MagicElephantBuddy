
import { useRef, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface BookStateManagerOptions {
  onStorybookPageDisplay?: (pageData: {
    pageImageUrl: string;
    pageText: string;
    pageNumber: number;
    totalPages: number;
    bookTitle: string;
  }) => void;
  onFunctionCallResult?: (callId: string, result: string) => void;
  onError?: (callId: string, error: string) => void;
}

export function useBookStateManager(options: BookStateManagerOptions = {}) {
  const logger = createServiceLogger('book-state-manager');

  // Book tracking refs
  const selectedBookRef = useRef<any>(null);
  const currentPageRef = useRef<number>(1);

  // Reading session optimization refs
  const isInReadingSessionRef = useRef<boolean>(false);
  const readingSessionMessagesRef = useRef<any[]>([]);

  // Helper function to manage reading session state
  const enterReadingSession = useCallback(() => {
    if (!isInReadingSessionRef.current) {
      logger.info("Entering optimized reading session mode");
      isInReadingSessionRef.current = true;
    }
  }, [logger]);

  const exitReadingSession = useCallback(() => {
    if (isInReadingSessionRef.current) {
      logger.info("Exiting reading session mode");
      isInReadingSessionRef.current = false;
      selectedBookRef.current = null;
      currentPageRef.current = 1;
    }
  }, [logger]);

  const handleBookSearchTool = useCallback(async (callId: string, args: any) => {
    logger.info("bookSearchTool was called!", { callId, args });

    const argsJson = JSON.parse(args);
    logger.info("Parsed JSON arguments", { callId, argsJson });

    try {
      const searchResponse = await fetch('/api/books/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: argsJson.query }),
      });

      if (!searchResponse.ok) {
        throw new Error(`Book search failed: ${searchResponse.status}`);
      }

      const searchResults = await searchResponse.json();
      logger.info("Book search results", { results: searchResults });

      // Send a concise message instead of the full JSON
      let resultMessage: string;
      if (searchResults.books?.length > 0) {
        if (searchResults.books.length === 1) {
          resultMessage = `Found "${searchResults.books[0].title}"! Ready to read it to you. Should I start?`;
        } else {
          resultMessage = `Found ${searchResults.books.length} books! Selected "${searchResults.books[0].title}". Should I start reading?`;
        }
      } else {
        resultMessage = `No books found. Let me suggest something else!`;
      }

      // Emit concise result message instead of full JSON
      options.onFunctionCallResult?.(callId, resultMessage);
      
    } catch (error: any) {
      logger.error("Error in book search", { error: error.message });
      
      // Emit error via callback
      options.onError?.(
        callId,
        "I'm having trouble searching for books right now. Please try again later."
      );
    }
  }, [options.onFunctionCallResult, options.onError, logger]);

  const handleDisplayBookPage = useCallback(async (callId: string, args: any) => {
    logger.info("display_book_page was called!", { callId, args });

    const argsJson = JSON.parse(args);
    logger.info("Parsed display book page arguments", { callId, argsJson });

    try {
      const { bookId, pageNumber } = argsJson;
      
      // Fetch page data from API
      const pageResponse = await fetch(`/api/books/${bookId}/pages/${pageNumber}`);
      
      if (!pageResponse.ok) {
        throw new Error(`Failed to fetch page: ${pageResponse.status}`);
      }

      const pageData = await pageResponse.json();
      logger.info("Fetched page data", { pageData });

      // Update book state
      selectedBookRef.current = { id: bookId };
      currentPageRef.current = pageNumber;

      // Enter reading session mode
      enterReadingSession();

      // Call the storybook display callback
      if (options.onStorybookPageDisplay) {
        options.onStorybookPageDisplay({
          pageImageUrl: pageData.pageImageUrl,
          pageText: pageData.pageText,
          pageNumber: pageData.pageNumber,
          totalPages: pageData.totalPages,
          bookTitle: pageData.bookTitle,
        });
      }

      // Emit success result
      options.onFunctionCallResult?.(
        callId,
        `Successfully displayed page ${pageNumber} of "${pageData.bookTitle}"`
      );

    } catch (error: any) {
      logger.error("Error displaying book page", { error: error.message });
      
      // Emit error
      options.onError?.(
        callId,
        "I'm having trouble displaying that book page right now. Please try again."
      );
    }
  }, [enterReadingSession, options.onStorybookPageDisplay, options.onFunctionCallResult, options.onError, logger]);

  const optimizeTokenUsage = useCallback(() => {
    if (isInReadingSessionRef.current) {
      // Archive older messages during reading sessions to save tokens
      const maxMessages = 10;
      if (readingSessionMessagesRef.current.length > maxMessages) {
        const messagesToArchive = readingSessionMessagesRef.current.splice(0, 
          readingSessionMessagesRef.current.length - maxMessages
        );
        logger.info("Archived reading session messages for token optimization", {
          archivedCount: messagesToArchive.length,
          remainingCount: readingSessionMessagesRef.current.length
        });
      }
    }
  }, [logger]);

  return {
    // State refs (for external access if needed)
    selectedBookRef,
    currentPageRef,
    isInReadingSessionRef,
    
    // Methods
    handleBookSearchTool,
    handleDisplayBookPage,
    enterReadingSession,
    exitReadingSession,
    optimizeTokenUsage,
    
    // Current state getters
    selectedBook: selectedBookRef.current,
    currentPage: currentPageRef.current,
    isInReadingSession: isInReadingSessionRef.current,
  };
}
