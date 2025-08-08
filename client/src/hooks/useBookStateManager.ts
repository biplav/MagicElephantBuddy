import { useRef, useCallback, useState, useEffect } from 'react';
import { createServiceLogger } from '@/lib/logger';

// Book State definitions
export type BookState = 
  | 'IDLE'
  | 'PAGE_LOADING'
  | 'PAGE_LOADED'
  | 'AUDIO_READY_TO_PLAY'
  | 'AUDIO_PLAYING'
  | 'AUDIO_PAUSED'
  | 'AUDIO_COMPLETED'
  | 'PAGE_COMPLETED'
  | 'ERROR';

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
  onBookStateChange?: (state: BookState) => void;
  workflowStateMachine?: any;
  onAutoPageAdvance?: () => void;
}

export function useBookStateManager(options: BookStateManagerOptions = {}) {
  const logger = createServiceLogger('book-state-manager');

  // Book State Management
  const [bookState, setBookState] = useState<BookState>('IDLE');

  // Book tracking refs
  const selectedBookRef = useRef<any>(null);
  const currentPageRef = useRef<number>(1);

  // Reading session optimization refs
  const isInReadingSessionRef = useRef<boolean>(false);
  const readingSessionMessagesRef = useRef<any[]>([]);

  // Audio management refs
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Book state transition handler
  const transitionToState = useCallback((newState: BookState) => {
    const previousState = bookState;
    logger.info(`📖 BOOK STATE: ${previousState} -> ${newState}`, {
      page: currentPageRef.current,
      book: selectedBookRef.current?.title
    });
    setBookState(newState);
    options.onBookStateChange?.(newState);
  }, [bookState, logger, options]);

  // Public API for state transitions
  const bookStateAPI = {
    transitionToPageLoading: () => transitionToState('PAGE_LOADING'),
    transitionToPageLoaded: () => transitionToState('PAGE_LOADED'),
    transitionToAudioReadyToPlay: () => transitionToState('AUDIO_READY_TO_PLAY'),
    transitionToAudioPlaying: () => transitionToState('AUDIO_PLAYING'),
    transitionToAudioPaused: () => transitionToState('AUDIO_PAUSED'),
    transitionToAudioCompleted: () => transitionToState('AUDIO_COMPLETED'),
    transitionToPageCompleted: () => transitionToState('PAGE_COMPLETED'),
    transitionToError: () => transitionToState('ERROR'),
    transitionToIdle: () => transitionToState('IDLE'),
    getCurrentState: () => bookState,
    isState: (state: BookState) => bookState === state
  };

  // Audio management with workflow integration
  const playPageAudio = useCallback((audioUrl: string) => {
    if (!audioUrl) return;

    console.log('🔊 BOOK-AUDIO: Playing page audio:', audioUrl);

    // Stop any existing audio
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      setIsPlayingAudio(false);
    }

    const audio = new Audio(audioUrl);
    audio.preload = 'auto';

    audio.onplay = () => {
      console.log('🔊 BOOK-AUDIO: Audio started playing');
      setIsPlayingAudio(true);
      transitionToState('AUDIO_PLAYING');
      options.workflowStateMachine?.handleAppuSpeakingStart('book-page-audio-start');
    };

    audio.onended = () => {
      console.log('🔊 BOOK-AUDIO: Audio finished playing');
      setIsPlayingAudio(false);
      audioElementRef.current = null;
      transitionToState('AUDIO_COMPLETED');
      options.workflowStateMachine?.handleAppuSpeakingStop('book-page-audio-end');
      
      // Start auto page advance timer
      console.log('🔄 BOOK-AUTO: Starting auto page advance timer');
      autoAdvanceTimerRef.current = setTimeout(() => {
        options.onAutoPageAdvance?.();
      }, 3000); // 3 second delay after audio ends
    };

    audio.onerror = (error) => {
      console.error('🔊 BOOK-AUDIO: Error playing audio:', error);
      setIsPlayingAudio(false);
      audioElementRef.current = null;
      transitionToState('ERROR');
      options.workflowStateMachine?.handleError('Audio playback failed');
    };

    audioElementRef.current = audio;
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.error('🔊 BOOK-AUDIO: Failed to play audio:', error);
        setIsPlayingAudio(false);
        options.workflowStateMachine?.handleError('Audio autoplay blocked');
      });
    }
  }, [transitionToState, options.workflowStateMachine, options.onAutoPageAdvance]);

  // Clear auto advance timer
  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  // Audio control methods
  const stopAudio = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      setIsPlayingAudio(false);
      audioElementRef.current = null;
      clearAutoAdvanceTimer();
      console.log('🔊 BOOK-AUDIO: Audio stopped');
    }
  }, [clearAutoAdvanceTimer]);

  // Monitor workflow state and automatically play audio when appropriate
  useEffect(() => {
    if (!options.workflowStateMachine) return;

    const workflowState = options.workflowStateMachine.currentState;
    
    // Only attempt audio playback when workflow is IDLE and book has audio ready
    if (workflowState === 'IDLE' && bookState === 'AUDIO_READY_TO_PLAY') {
      // Check if we have current page data with audio URL
      const hasAudioUrl = selectedBookRef.current?.currentAudioUrl;
      
      if (hasAudioUrl && !isPlayingAudio) {
        console.log('🔄 BOOK-WORKFLOW: Workflow is IDLE, auto-playing page audio');
        playPageAudio(hasAudioUrl);
      }
    }
  }, [options.workflowStateMachine?.currentState, bookState, isPlayingAudio, playPageAudio]);

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
      stopAudio();
      clearAutoAdvanceTimer();
    }
  }, [logger, stopAudio, clearAutoAdvanceTimer]);

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
      // Transition to loading state
      transitionToState('PAGE_LOADING');

      let { bookId, pageNumber } = argsJson;
      if (!bookId || !pageNumber) {
        bookId = selectedBookRef.current?.id;
        pageNumber = currentPageRef?.current + 1;
      }
      // Fetch page data from API
      const pageResponse = await fetch(`/api/books/${bookId}/page/${pageNumber}`);

      if (!pageResponse.ok) {
        transitionToState('ERROR');
        throw new Error(`Failed to fetch page: ${pageResponse.status}`);
      }

      const pageResponse_data = await pageResponse.json();
      logger.info("Fetched page response", { pageResponse_data });

      // Extract the page data from the response
      const pageData = pageResponse_data.page;

      if (!pageData) {
        transitionToState('ERROR');
        throw new Error("Page data not found in response");
      }

      // Update book state - always ensure we have the correct book data
      selectedBookRef.current = { 
        id: bookId, 
        title: pageData.bookTitle,
        totalPages: pageData.totalPages,
        currentAudioUrl: pageData.audioUrl
      };
      currentPageRef.current = pageNumber;
      
      logger.info("Updated book state", { 
        bookId: selectedBookRef.current.id,
        currentPage: currentPageRef.current,
        totalPages: selectedBookRef.current.totalPages,
        hasAudio: !!pageData.audioUrl
      });

      // Clear any existing auto advance timer
      clearAutoAdvanceTimer();

      // Enter reading session mode
      enterReadingSession();

      // Transition to page loaded
      transitionToState('PAGE_LOADED');

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

      // If there's audio, transition to audio ready and let workflow monitoring handle playback
      if (pageData.audioUrl) {
        transitionToState('AUDIO_READY_TO_PLAY');
      }

      // Emit success result - silent mode for audio playback
      options.onFunctionCallResult?.(
        callId,
        `Page ${pageNumber} ready. Audio will play automatically.`
      );

    } catch (error: any) {
      logger.error("Error displaying book page", { error: error.message });
      transitionToState('ERROR');

      // Emit error
      options.onError?.(
        callId,
        "I'm having trouble displaying that book page right now. Please try again."
      );
    }
  }, [transitionToState, enterReadingSession, options.onStorybookPageDisplay, options.onFunctionCallResult, options.onError, logger]);

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
      isInReadingSession: isInReadingSessionRef.current,
      currentBookState: bookState
    });

    // Enhanced validation with fallback recovery
    if (!selectedBookRef.current?.id) {
      logger.error("No book selected for navigation - this indicates a state sync issue", { 
        selectedBook: selectedBookRef.current,
        currentPage: currentPageRef.current,
        isInReadingSession: isInReadingSessionRef.current,
        suggestedFix: "StorybookDisplay should sync book state with BookStateManager"
      });
      transitionToState('ERROR');
      return false;
    }

    const nextPageNumber = currentPageRef.current + 1;
    
    // Check if we're already at the last page
    if (selectedBookRef.current.totalPages && nextPageNumber > selectedBookRef.current.totalPages) {
      logger.info(`Already at last page (${currentPageRef.current}/${selectedBookRef.current.totalPages})`);
      transitionToState('PAGE_COMPLETED');
      return false;
    }

    logger.info(`Navigating to next page: ${nextPageNumber}`, { bookId: selectedBookRef.current.id });

    try {
      // Transition to loading state
      transitionToState('PAGE_LOADING');

      const pageResponse = await fetch(`/api/books/${selectedBookRef.current.id}/page/${nextPageNumber}`);

      if (!pageResponse.ok) {
        transitionToState('ERROR');
        throw new Error(`Failed to fetch page: ${pageResponse.status}`);
      }

      const pageResponseData = await pageResponse.json();
      const pageData = pageResponseData.page;

      if (!pageData) {
        transitionToState('ERROR');
        throw new Error("Page data not found in response");
      }

      // Update current page and audio URL
      currentPageRef.current = nextPageNumber;
      selectedBookRef.current.currentAudioUrl = pageData.audioUrl;

      // Clear any existing auto advance timer
      clearAutoAdvanceTimer();

      // Transition to page loaded
      transitionToState('PAGE_LOADED');

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

      // If there's audio, transition to audio ready and let workflow monitoring handle playback
      if (pageData.audioUrl) {
        transitionToState('AUDIO_READY_TO_PLAY');
      }

      logger.info(`Successfully navigated to page ${nextPageNumber}`);
      return true;

    } catch (error: any) {
      logger.error("Error navigating to next page", { error: error.message });
      transitionToState('ERROR');
      return false;
    }
  }, [logger, options.onStorybookPageDisplay, bookState, transitionToState]);

  const navigateToPreviousPage = useCallback(async () => {
    logger.info("navigateToPreviousPage called", { 
      hasSelectedBook: !!selectedBookRef.current, 
      bookId: selectedBookRef.current?.id,
      currentPage: currentPageRef.current,
      selectedBookRef: selectedBookRef.current,
      currentBookState: bookState
    });

    if (!selectedBookRef.current?.id) {
      logger.error("No book selected for navigation", { 
        selectedBook: selectedBookRef.current,
        currentPage: currentPageRef.current,
        isInReadingSession: isInReadingSessionRef.current
      });
      transitionToState('ERROR');
      return false;
    }

    const previousPageNumber = currentPageRef.current - 1;
    
    if (previousPageNumber < 1) {
      logger.info("Already at first page, cannot go back");
      return false;
    }

    logger.info(`Navigating to previous page: ${previousPageNumber}`, { bookId: selectedBookRef.current.id });

    try {
      // Transition to loading state
      transitionToState('PAGE_LOADING');

      const pageResponse = await fetch(`/api/books/${selectedBookRef.current.id}/page/${previousPageNumber}`);

      if (!pageResponse.ok) {
        transitionToState('ERROR');
        throw new Error(`Failed to fetch page: ${pageResponse.status}`);
      }

      const pageResponseData = await pageResponse.json();
      const pageData = pageResponseData.page;

      if (!pageData) {
        transitionToState('ERROR');
        throw new Error("Page data not found in response");
      }

      // Update current page and audio URL
      currentPageRef.current = previousPageNumber;
      selectedBookRef.current.currentAudioUrl = pageData.audioUrl;

      // Clear any existing auto advance timer
      clearAutoAdvanceTimer();

      // Transition to page loaded
      transitionToState('PAGE_LOADED');

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

      // If there's audio, transition to audio ready and let workflow monitoring handle playback
      if (pageData.audioUrl) {
        transitionToState('AUDIO_READY_TO_PLAY');
      }

      logger.info(`Successfully navigated to page ${previousPageNumber}`);
      return true;

    } catch (error: any) {
      logger.error("Error navigating to previous page", { error: error.message });
      transitionToState('ERROR');
      return false;
    }
  }, [logger, options.onStorybookPageDisplay, bookState, transitionToState]);

  return {
    // State refs (for external access if needed)
    selectedBookRef,
    currentPageRef,
    isInReadingSessionRef,

    // Book State Management
    bookState,
    bookStateAPI,

    // Audio Management
    isPlayingAudio,
    playPageAudio,
    stopAudio,
    clearAutoAdvanceTimer,

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