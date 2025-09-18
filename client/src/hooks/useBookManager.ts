
import { useCallback, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { createServiceLogger } from '@/lib/logger';
import type { BookRootState } from '@/store/bookStore';
import {
  transitionToState,
  setSelectedBook,
  setCurrentPage,
  enterReadingSession,
  exitReadingSession,
  setAudioElement,
  setIsPlayingAudio,
  updateBookAudioUrl,
  addPendingFunctionCall,
  removePendingFunctionCall
} from '@/store/bookStore';

interface BookManagerOptions {
  onStorybookPageDisplay?: (pageData: {
    pageImageUrl: string;
    pageText: string;
    pageNumber: number;
    totalPages: number;
    bookTitle: string;
    audioUrl?: string;
  }) => void;
  onFunctionCallResult?: (callId: string, result: any) => void;
  onError?: (callId: string, error: string) => void;
  workflowStateMachine?: any;
}

// Single instance tracker to prevent multiple initializations
let bookManagerInstanceCount = 0;

export function useBookManager(options: BookManagerOptions = {}) {
  const logger = createServiceLogger('book-manager');
  const dispatch = useDispatch();
  
  // Track instance creation
  useEffect(() => {
    bookManagerInstanceCount++;
    const instanceId = bookManagerInstanceCount;
    logger.info(`🔄 BOOK-MANAGER: Instance ${instanceId} created (total: ${bookManagerInstanceCount})`);
    
    return () => {
      logger.info(`🔄 BOOK-MANAGER: Instance ${instanceId} destroyed`);
    };
  }, [logger]);
  
  // Redux state selectors
  const bookState = useSelector((state: BookRootState) => state.book.bookState);
  const selectedBook = useSelector((state: BookRootState) => state.book.selectedBook);
  const currentPage = useSelector((state: BookRootState) => state.book.currentPage);
  const isInReadingSession = useSelector((state: BookRootState) => state.book.isInReadingSession);
  const isPlayingAudio = useSelector((state: BookRootState) => state.book.isPlayingAudio);
  const audioElement = useSelector((state: BookRootState) => state.book.audioElement);
  
  // Auto advance timer ref
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Clear auto advance timer
  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);
  
  // Load audio with URL
  const loadAudioPlayerWithAudioURL = useCallback((audioUrl: string) => {
    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    
    audio.onloadeddata = () => {
      logger.info('🔊 BOOK-AUDIO: Audio player loaded with URL', { audioUrl });
      dispatch(setAudioElement(audio));
      dispatch(transitionToState('AUDIO_READY_TO_PLAY'));
    };
    
    audio.onerror = (error) => {
      logger.error('🔊 BOOK-AUDIO: Error loading audio URL', { audioUrl, error });
      dispatch(transitionToState('ERROR'));
    };
    
    audio.onended = () => {
      logger.info('🔊 BOOK-AUDIO: Audio playback completed');
      dispatch(setIsPlayingAudio(false));
      dispatch(setAudioElement(null));
      dispatch(transitionToState('AUDIO_COMPLETED'));
    };
    
    audio.onpause = () => {
      logger.info('🔊 BOOK-AUDIO: Audio playback paused');
      dispatch(setIsPlayingAudio(false));
      dispatch(transitionToState('AUDIO_PAUSED'));
    };
    
    audio.onplay = () => {
      logger.info('🔊 BOOK-AUDIO: Audio playback started');
      dispatch(setIsPlayingAudio(true));
      dispatch(transitionToState('AUDIO_PLAYING'));
      options.workflowStateMachine?.handleAppuSpeakingStart('book-page-audio-start');
    };
    
    audio.load();
  }, [dispatch, logger, options.workflowStateMachine]);
  
  // Play page audio
  const playPageAudio = useCallback(() => {
    logger.info('🔊 BOOK-AUDIO: Starting audio playback', {
      audioUrl: selectedBook?.currentAudioUrl,
      currentState: bookState,
      page: currentPage,
      book: selectedBook?.title,
      workflowState: options.workflowStateMachine?.currentState
    });
    
    if (audioElement) {
      audioElement.play();
    }
  }, [audioElement, bookState, currentPage, selectedBook, logger, options.workflowStateMachine]);
  
  // Stop audio
  const stopAudio = useCallback(() => {
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      dispatch(setIsPlayingAudio(false));
      dispatch(setAudioElement(null));
      clearAutoAdvanceTimer();
      logger.info('🔊 BOOK-AUDIO: Audio stopped');
    }
  }, [audioElement, dispatch, clearAutoAdvanceTimer, logger]);
  
  // Navigate to next page
  const navigateToNextPage = useCallback(async () => {
    logger.info("navigateToNextPage called", { 
      hasSelectedBook: !!selectedBook,
      bookId: selectedBook?.id,
      currentPage,
      selectedBook,
      isInReadingSession,
      currentBookState: bookState
    });
    
    if (!selectedBook?.id) {
      logger.error("No book selected for navigation");
      dispatch(transitionToState('ERROR'));
      return false;
    }
    
    const nextPageNumber = currentPage + 1;
    
    if (selectedBook.totalPages && nextPageNumber > selectedBook.totalPages) {
      logger.info(`Already at last page (${currentPage}/${selectedBook.totalPages})`);
      dispatch(transitionToState('PAGE_COMPLETED'));
      return false;
    }
    
    try {
      dispatch(transitionToState('PAGE_LOADING'));
      
      const pageResponse = await fetch(`/api/books/${selectedBook.id}/page/${nextPageNumber}`);
      
      if (!pageResponse.ok) {
        dispatch(transitionToState('ERROR'));
        throw new Error(`Failed to fetch page: ${pageResponse.status}`);
      }
      
      const pageResponseData = await pageResponse.json();
      const pageData = pageResponseData.page;
      
      if (!pageData) {
        dispatch(transitionToState('ERROR'));
        throw new Error("Page data not found in response");
      }
      
      // Update Redux state
      dispatch(setCurrentPage(nextPageNumber));
      dispatch(updateBookAudioUrl(pageData.audioUrl || ''));
      
      // Clear auto advance timer
      clearAutoAdvanceTimer();
      
      // Transition to page loaded
      dispatch(transitionToState('PAGE_LOADED'));
      
      // Call display callback
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
      
      // Handle audio
      if (pageData.audioUrl) {
        loadAudioPlayerWithAudioURL(pageData.audioUrl);
        logger.info('📖 BOOK-AUDIO: Next page has audio URL, loading audio player', {
          audioUrl: pageData.audioUrl,
          page: nextPageNumber,
          book: pageData.bookTitle
        });
      } else {
        dispatch(transitionToState('IDLE'));
        logger.info('📖 BOOK-AUDIO: Next page has no audio URL, transitioning to IDLE', {
          page: nextPageNumber,
          book: pageData.bookTitle
        });
      }
      
      logger.info(`Successfully navigated to page ${nextPageNumber}`);
      return true;
      
    } catch (error: any) {
      logger.error("Error navigating to next page", { error: error.message });
      dispatch(transitionToState('ERROR'));
      return false;
    }
  }, [selectedBook, currentPage, bookState, dispatch, clearAutoAdvanceTimer, options.onStorybookPageDisplay, loadAudioPlayerWithAudioURL, logger]);
  
  // Handle book search tool
  const handleBookSearchTool = useCallback(async (callId: string, args: any) => {
    logger.info("bookSearchTool was called!", { callId, args });
    
    // Add to pending calls tracking
    dispatch(addPendingFunctionCall({
      callId,
      type: 'book_search',
      args
    }));
    
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
      
      let resultMessage: any;
      if (searchResults.books?.length > 0) {
        const selectedBookData = searchResults.books[0];
        
        // Update Redux store
        const bookToSet = {
          id: selectedBookData.id,
          title: selectedBookData.title,
          totalPages: selectedBookData.totalPages,
          summary: selectedBookData.summary,
          author: selectedBookData.author,
          genre: selectedBookData.genre
        };
        logger.info("Setting selected book in Redux", { bookToSet });
        dispatch(setSelectedBook(bookToSet));
        dispatch(setCurrentPage(0));
        
        const responseData = {
          title: selectedBookData.title,
          summary: selectedBookData.summary,
          id: selectedBookData.id,
          totalPages: selectedBookData.totalPages
        };
        resultMessage = responseData;
      } else {
        const responseData = {
          title: "No Books Found",
          summary: "No books found matching your search. Let me suggest something else!"
        };
        resultMessage = responseData;
      }
      
      // Remove from pending calls
      dispatch(removePendingFunctionCall(callId));
      
      // Emit result
      options.onFunctionCallResult?.(callId, resultMessage);
      
    } catch (error: any) {
      logger.error("Error in book search", { error: error.message });
      dispatch(removePendingFunctionCall(callId));
      options.onError?.(callId, "I'm having trouble searching for books right now. Please try again later.");
    }
  }, [dispatch, options.onFunctionCallResult, options.onError, logger]);
  
  // Handle display book page
  const handleDisplayBookPage = useCallback(async (callId: string, args: any) => {
    logger.info("display_book_page was called!", { callId, args });
    
    // Add to pending calls tracking
    dispatch(addPendingFunctionCall({
      callId,
      type: 'display_page',
      args
    }));
    
    const argsJson = JSON.parse(args);
    logger.info("Parsed display book page arguments", { callId, argsJson });
    
    try {
      dispatch(transitionToState('PAGE_LOADING'));
      
      let { bookId, pageNumber } = argsJson;
      if (!bookId || !pageNumber) {
        bookId = selectedBook?.id;
        pageNumber = currentPage + 1;
      }
      
      // Validate required parameters
      if (!bookId || bookId === 'undefined') {
        logger.error("No valid bookId available", { 
          argsBookId: argsJson.bookId,
          selectedBookId: selectedBook?.id,
          selectedBook: selectedBook 
        });
        dispatch(transitionToState('ERROR'));
        dispatch(removePendingFunctionCall(callId));
        options.onError?.(callId, "No book is currently selected. You must use book_search_tool first to find and select a book before you can display its pages.");
        return;
      }
      
      if (!pageNumber || pageNumber === 'undefined') {
        logger.error("No valid pageNumber available", { 
          argsPageNumber: argsJson.pageNumber,
          currentPage: currentPage 
        });
        dispatch(transitionToState('ERROR'));
        dispatch(removePendingFunctionCall(callId));
        options.onError?.(callId, "Invalid page number. Please specify a valid page to display.");
        return;
      }
      
      const pageResponse = await fetch(`/api/books/${bookId}/page/${pageNumber}`);
      
      if (!pageResponse.ok) {
        dispatch(transitionToState('ERROR'));
        throw new Error(`Failed to fetch page: ${pageResponse.status}`);
      }
      
      const pageResponseData = await pageResponse.json();
      const pageData = pageResponseData.page;
      
      if (!pageData) {
        dispatch(transitionToState('ERROR'));
        throw new Error("Page data not found in response");
      }
      
      // Update Redux store
      dispatch(setSelectedBook({
        id: bookId,
        title: pageData.bookTitle,
        totalPages: pageData.totalPages,
        currentAudioUrl: pageData.audioUrl
      }));
      dispatch(setCurrentPage(pageNumber));
      
      logger.info("Updated book state", { 
        bookId,
        currentPage: pageNumber,
        totalPages: pageData.totalPages,
        hasAudio: !!pageData.audioUrl
      });
      
      // Clear auto advance timer
      clearAutoAdvanceTimer();
      
      // Enter reading session
      dispatch(enterReadingSession());
      
      // Transition to page loaded
      dispatch(transitionToState('PAGE_LOADED'));
      
      // Call display callback
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
      
      // Handle audio
      if (pageData.audioUrl) {
        loadAudioPlayerWithAudioURL(pageData.audioUrl);
        logger.info('📖 BOOK-AUDIO: Page has audio URL, loading audio player', {
          audioUrl: pageData.audioUrl,
          page: pageNumber,
          book: pageData.bookTitle
        });
      } else {
        dispatch(transitionToState('IDLE'));
        logger.info('📖 BOOK-AUDIO: No audio URL available, transitioning to IDLE', {
          page: pageNumber,
          book: pageData.bookTitle
        });
      }
      
      // Remove from pending calls
      dispatch(removePendingFunctionCall(callId));
      
      // Emit result
      options.onFunctionCallResult?.(
        callId,
        `Page ${pageNumber} ready. ${pageData.audioUrl ? 'Audio will play automatically.' : 'No audio available for this page.'}`
      );
      
    } catch (error: any) {
      logger.error("Error displaying book page", { error: error.message });
      dispatch(transitionToState('ERROR'));
      dispatch(removePendingFunctionCall(callId));
      options.onError?.(callId, "I'm having trouble displaying that book page right now. Please try again.");
    }
  }, [selectedBook, currentPage, dispatch, clearAutoAdvanceTimer, options.onStorybookPageDisplay, options.onFunctionCallResult, options.onError, loadAudioPlayerWithAudioURL, logger]);
  
  // Workflow state monitoring
  useEffect(() => {
    if (!options.workflowStateMachine) {
      return;
    }
    
    const workflowState = options.workflowStateMachine.currentState;
    
    logger.debug('🔄 WORKFLOW-MONITOR: State check', {
      workflowState,
      bookState,
      isPlayingAudio,
      hasSelectedBook: !!selectedBook,
      hasAudioUrl: !!selectedBook?.currentAudioUrl,
      currentPage
    });
    
    // Pause book audio when someone starts speaking
    if (workflowState === 'APPU_SPEAKING' || workflowState === 'CHILD_SPEAKING') {
      if (isPlayingAudio && bookState === 'AUDIO_PLAYING') {
        logger.info('🔄 BOOK-WORKFLOW: Pausing book audio due to speech activity', {
          workflowState,
          bookState,
          speaker: workflowState === 'APPU_SPEAKING' ? 'Appu' : 'Child'
        });
        
        if (audioElement) {
          audioElement.pause();
          dispatch(setIsPlayingAudio(false));
        }
        dispatch(transitionToState('AUDIO_PAUSED'));
      }
      return;
    }
    
    // Handle workflow IDLE state
    if (workflowState === 'IDLE') {
      const hasAudioUrl = selectedBook?.currentAudioUrl;
      
      switch (bookState) {
        case 'AUDIO_READY_TO_PLAY':
        case 'AUDIO_PAUSED':
          if (!isPlayingAudio) {
            logger.info('🔄 BOOK-WORKFLOW: Workflow is IDLE, starting/resuming audio playback', {
              bookState,
              audioUrl: hasAudioUrl,
              page: currentPage,
              book: selectedBook?.title
            });
            playPageAudio();
          }
          break;
          
        case 'AUDIO_COMPLETED':
        case 'PAGE_COMPLETED':
          logger.info('🔄 BOOK-WORKFLOW: Workflow is IDLE, auto-advancing to next page', {
            bookState,
            currentPage,
            totalPages: selectedBook?.totalPages,
            book: selectedBook?.title
          });
          
          if (selectedBook && currentPage < (selectedBook.totalPages || 0)) {
            navigateToNextPage();
          }
          break;
      }
    }
  }, [options.workflowStateMachine?.currentState, bookState, isPlayingAudio, selectedBook, currentPage, audioElement, dispatch, playPageAudio, navigateToNextPage, logger]);
  
  // Track selectedBook changes for debugging
  useEffect(() => {
    if (selectedBook) {
      logger.info("✅ selectedBook updated in Redux store", { 
        bookId: selectedBook.id,
        title: selectedBook.title,
        totalPages: selectedBook.totalPages,
        hasSelectedBook: true
      });
    } else {
      logger.info("❌ selectedBook is null/undefined in Redux store", { 
        hasSelectedBook: false 
      });
    }
  }, [selectedBook, logger]);
  
  return {
    // State
    bookState,
    selectedBook,
    currentPage,
    isInReadingSession,
    isPlayingAudio,
    
    // Actions
    handleBookSearchTool,
    handleDisplayBookPage,
    navigateToNextPage,
    playPageAudio,
    stopAudio,
    enterReadingSession: () => dispatch(enterReadingSession()),
    exitReadingSession: () => dispatch(exitReadingSession()),
    
    // State API
    transitionToState: (state: any) => dispatch(transitionToState(state)),
  };
}
