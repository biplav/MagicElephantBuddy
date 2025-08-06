import { useRef, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface BookStateManagerOptions {
  onStorybookPageDisplay?: (pageData: {
    pageImageUrl: string;
    pageText: string;
    pageNumber: number;
    totalPages: number;
    bookTitle: string;
    audioUrl?: string;
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

      // Send a structured JSON response with summary and title
      let resultMessage: string;
      if (searchResults.books?.length > 0) {
        const selectedBook = searchResults.books[0];
        selectedBookRef.current = {
          id: selectedBook.id,
          title: selectedBook.title,
          totalPages: selectedBook.totalPages,
          summary: selectedBook.summary,
          author: selectedBook.author,
          genre: selectedBook.genre
        };
        currentPageRef.current = 0;
        const responseData = {
          title: selectedBook.title,
          summary: selectedBook.summary,
          id: selectedBook.id,
          totalPages: selectedBook.totalPages
        };
        resultMessage = JSON.stringify(responseData);
      } else {
        const responseData = {
          title: "No Books Found",
          summary: "No books found matching your search. Let me suggest something else!"
        };
        resultMessage = JSON.stringify(responseData);
      }

      // Emit structured JSON result instead of plain text
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
      let { bookId, pageNumber } = argsJson;
      if (!bookId || !pageNumber) {
        bookId = selectedBookRef.current?.id;
        pageNumber = currentPageRef?.current + 1;
      }
      // Fetch page data from API
      const pageResponse = await fetch(`/api/books/${bookId}/page/${pageNumber}`);

      if (!pageResponse.ok) {
        throw new Error(`Failed to fetch page: ${pageResponse.status}`);
      }

      const pageResponse_data = await pageResponse.json();
      logger.info("Fetched page response", { pageResponse_data });

      // Extract the page data from the response
      const pageData = pageResponse_data.page;

      if (!pageData) {
        throw new Error("Page data not found in response");
      }

      // Update book state - always ensure we have the correct book data
      selectedBookRef.current = { 
        id: bookId, 
        title: pageData.bookTitle,
        totalPages: pageData.totalPages 
      };
      currentPageRef.current = pageNumber;
      
      logger.info("Updated book state", { 
        bookId: selectedBookRef.current.id,
        currentPage: currentPageRef.current,
        totalPages: selectedBookRef.current.totalPages
      });

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
          audioUrl: pageData.audioUrl,
        });
      }

      // Emit success result - silent mode for audio playback
      options.onFunctionCallResult?.(
        callId,
        `Page ${pageNumber} ready. Audio will play automatically.`
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

  // const optimizeTokenUsage = useCallback(() => {
  //   if (isInReadingSessionRef.current) {
  //     // Archive older messages during reading sessions to save tokens
  //     const maxMessages = 10;
  //     if (readingSessionMessagesRef.current.length > maxMessages) {
  //       const messagesToArchive = readingSessionMessagesRef.current.splice(0, 
  //         readingSessionMessagesRef.current.length - maxMessages
  //       );
  //       logger.info("Archived reading session messages for token optimization", {
  //         archivedCount: messagesToArchive.length,
  //         remainingCount: readingSessionMessagesRef.current.length
  //       });
  //     }
  //   }
  // }, [logger]);

  // Manual navigation functions for silence detection auto-advance
  const navigateToNextPage = useCallback(async () => {
    logger.info("navigateToNextPage called", { 
      hasSelectedBook: !!selectedBookRef.current, 
      bookId: selectedBookRef.current?.id,
      currentPage: currentPageRef.current,
      selectedBookRef: selectedBookRef.current,
      isInReadingSession: isInReadingSessionRef.current
    });

    // Enhanced validation with fallback recovery
    if (!selectedBookRef.current?.id) {
      logger.error("No book selected for navigation - this indicates a state sync issue", { 
        selectedBook: selectedBookRef.current,
        currentPage: currentPageRef.current,
        isInReadingSession: isInReadingSessionRef.current,
        suggestedFix: "StorybookDisplay should sync book state with BookStateManager"
      });
      return false;
    }

    const nextPageNumber = currentPageRef.current + 1;
    
    // Check if we're already at the last page
    if (selectedBookRef.current.totalPages && nextPageNumber > selectedBookRef.current.totalPages) {
      logger.info(`Already at last page (${currentPageRef.current}/${selectedBookRef.current.totalPages})`);
      return false;
    }

    logger.info(`Navigating to next page: ${nextPageNumber}`, { bookId: selectedBookRef.current.id });

    try {
      const pageResponse = await fetch(`/api/books/${selectedBookRef.current.id}/page/${nextPageNumber}`);

      if (!pageResponse.ok) {
        throw new Error(`Failed to fetch page: ${pageResponse.status}`);
      }

      const pageResponseData = await pageResponse.json();
      const pageData = pageResponseData.page;

      if (!pageData) {
        throw new Error("Page data not found in response");
      }

      // Update current page
      currentPageRef.current = nextPageNumber;

      // Call the display callback
      if (options.onStorybookPageDisplay) {
        options.onStorybookPageDisplay({
          pageImageUrl: pageData.pageImageUrl,
          pageText: pageData.pageText,
          pageNumber: pageData.pageNumber,
          totalPages: pageData.totalPages,
          bookTitle: pageData.bookTitle,
          audioUrl: pageData.audioUrl,
        });
      }

      logger.info(`Successfully navigated to page ${nextPageNumber}`);
      return true;

    } catch (error: any) {
      logger.error("Error navigating to next page", { error: error.message });
      return false;
    }
  }, [logger, options.onStorybookPageDisplay]);

  const navigateToPreviousPage = useCallback(async () => {
    logger.info("navigateToPreviousPage called", { 
      hasSelectedBook: !!selectedBookRef.current, 
      bookId: selectedBookRef.current?.id,
      currentPage: currentPageRef.current,
      selectedBookRef: selectedBookRef.current
    });

    if (!selectedBookRef.current?.id) {
      logger.error("No book selected for navigation", { 
        selectedBook: selectedBookRef.current,
        currentPage: currentPageRef.current,
        isInReadingSession: isInReadingSessionRef.current
      });
      return false;
    }

    const previousPageNumber = currentPageRef.current - 1;
    
    if (previousPageNumber < 1) {
      logger.info("Already at first page, cannot go back");
      return false;
    }

    logger.info(`Navigating to previous page: ${previousPageNumber}`, { bookId: selectedBookRef.current.id });

    try {
      const pageResponse = await fetch(`/api/books/${selectedBookRef.current.id}/page/${previousPageNumber}`);

      if (!pageResponse.ok) {
        throw new Error(`Failed to fetch page: ${pageResponse.status}`);
      }

      const pageResponseData = await pageResponse.json();
      const pageData = pageResponseData.page;

      if (!pageData) {
        throw new Error("Page data not found in response");
      }

      // Update current page
      currentPageRef.current = previousPageNumber;

      // Call the display callback
      if (options.onStorybookPageDisplay) {
        options.onStorybookPageDisplay({
          pageImageUrl: pageData.pageImageUrl,
          pageText: pageData.pageText,
          pageNumber: pageData.pageNumber,
          totalPages: pageData.totalPages,
          bookTitle: pageData.bookTitle,
          audioUrl: pageData.audioUrl,
        });
      }

      logger.info(`Successfully navigated to page ${previousPageNumber}`);
      return true;

    } catch (error: any) {
      logger.error("Error navigating to previous page", { error: error.message });
      return false;
    }
  }, [logger, options.onStorybookPageDisplay]);

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
    // optimizeTokenUsage,
    navigateToNextPage,
    navigateToPreviousPage,

    // Current state getters
    selectedBook: selectedBookRef.current,
    currentPage: currentPageRef.current,
    isInReadingSession: isInReadingSessionRef.current,
  };
}