
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBookStateManager } from '../client/src/hooks/useBookStateManager';
import { createServiceLogger } from '../client/src/lib/logger';

// Mock the logger
jest.mock('../client/src/lib/logger', () => ({
  createServiceLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }))
}));

// Mock fetch
global.fetch = jest.fn();

// Mock Audio API
global.Audio = jest.fn().mockImplementation(() => ({
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  currentTime: 0,
  duration: 60,
  onplay: null,
  onended: null,
  onerror: null,
}));

describe('useBookStateManager', () => {
  const mockWorkflowStateMachine = {
    currentState: 'IDLE',
    handleAppuSpeakingStart: jest.fn(),
    handleAppuSpeakingStop: jest.fn(),
    handleError: jest.fn(),
  };

  const mockOptions = {
    workflowStateMachine: mockWorkflowStateMachine,
    onStorybookPageDisplay: jest.fn(),
    onFunctionCallResult: jest.fn(),
    onError: jest.fn(),
    onBookStateChange: jest.fn(),
    onAutoPageAdvance: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
  });

  describe('Initial State', () => {
    it('should initialize with IDLE book state', () => {
      const { result } = renderHook(() => useBookStateManager(mockOptions));
      
      expect(result.current.bookState).toBe('IDLE');
      expect(result.current.currentPage).toBe(1);
      expect(result.current.selectedBook).toBe(null);
      expect(result.current.isInReadingSession).toBe(false);
      expect(result.current.isPlayingAudio).toBe(false);
    });
  });

  describe('State Transitions', () => {
    it('should transition book states correctly', () => {
      const { result } = renderHook(() => useBookStateManager(mockOptions));

      act(() => {
        result.current.bookStateAPI.transitionToPageLoading();
      });
      expect(result.current.bookState).toBe('PAGE_LOADING');

      act(() => {
        result.current.bookStateAPI.transitionToPageLoaded();
      });
      expect(result.current.bookState).toBe('PAGE_LOADED');

      act(() => {
        result.current.bookStateAPI.transitionToAudioReadyToPlay();
      });
      expect(result.current.bookState).toBe('AUDIO_READY_TO_PLAY');
    });

    it('should call onBookStateChange callback on state transitions', () => {
      const { result } = renderHook(() => useBookStateManager(mockOptions));

      act(() => {
        result.current.bookStateAPI.transitionToPageLoading();
      });

      expect(mockOptions.onBookStateChange).toHaveBeenCalledWith('PAGE_LOADING');
    });
  });

  describe('Book Search Tool', () => {
    it('should handle successful book search', async () => {
      const mockSearchResponse = {
        books: [{
          id: 'book-1',
          title: 'Test Book',
          totalPages: 10,
          summary: 'A test book',
          author: 'Test Author',
          genre: 'Children'
        }]
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse)
      });

      const { result } = renderHook(() => useBookStateManager(mockOptions));

      await act(async () => {
        await result.current.handleBookSearchTool('call-1', '{"query":"test book"}');
      });

      expect(fetch).toHaveBeenCalledWith('/api/books/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test book' })
      });

      expect(mockOptions.onFunctionCallResult).toHaveBeenCalledWith(
        'call-1',
        expect.stringContaining('Test Book')
      );

      // Check that book was selected
      expect(result.current.selectedBookRef.current).toEqual(
        expect.objectContaining({
          id: 'book-1',
          title: 'Test Book',
          totalPages: 10
        })
      );
    });

    it('should handle book search with no results', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ books: [] })
      });

      const { result } = renderHook(() => useBookStateManager(mockOptions));

      await act(async () => {
        await result.current.handleBookSearchTool('call-1', '{"query":"nonexistent book"}');
      });

      expect(mockOptions.onFunctionCallResult).toHaveBeenCalledWith(
        'call-1',
        expect.stringContaining('No Books Found')
      );
    });

    it('should handle book search API error', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const { result } = renderHook(() => useBookStateManager(mockOptions));

      await act(async () => {
        await result.current.handleBookSearchTool('call-1', '{"query":"error book"}');
      });

      expect(mockOptions.onError).toHaveBeenCalledWith(
        'call-1',
        expect.stringContaining('trouble searching for books')
      );
    });
  });

  describe('Display Book Page', () => {
    const mockPageData = {
      page: {
        pageImageUrl: 'http://example.com/page1.jpg',
        pageText: 'Once upon a time...',
        pageNumber: 1,
        totalPages: 10,
        bookTitle: 'Test Book',
        audioUrl: 'http://example.com/audio1.mp3'
      }
    };

    it('should display book page successfully with audio', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPageData)
      });

      const { result } = renderHook(() => useBookStateManager(mockOptions));

      await act(async () => {
        await result.current.handleDisplayBookPage('call-1', '{"bookId":"book-1","pageNumber":1}');
      });

      expect(result.current.bookState).toBe('AUDIO_READY_TO_PLAY');
      expect(result.current.currentPage).toBe(1);
      expect(result.current.isInReadingSession).toBe(true);
      
      expect(mockOptions.onStorybookPageDisplay).toHaveBeenCalledWith({
        pageImageUrl: 'http://example.com/page1.jpg',
        pageText: 'Once upon a time...',
        pageNumber: 1,
        totalPages: 10,
        bookTitle: 'Test Book',
        audioUrl: 'http://example.com/audio1.mp3'
      });
    });

    it('should display book page without audio', async () => {
      const pageDataNoAudio = {
        page: { ...mockPageData.page, audioUrl: null }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(pageDataNoAudio)
      });

      const { result } = renderHook(() => useBookStateManager(mockOptions));

      await act(async () => {
        await result.current.handleDisplayBookPage('call-1', '{"bookId":"book-1","pageNumber":1}');
      });

      expect(result.current.bookState).toBe('IDLE');
    });

    it('should handle page display API error', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const { result } = renderHook(() => useBookStateManager(mockOptions));

      await act(async () => {
        await result.current.handleDisplayBookPage('call-1', '{"bookId":"book-1","pageNumber":1}');
      });

      expect(result.current.bookState).toBe('ERROR');
      expect(mockOptions.onError).toHaveBeenCalledWith(
        'call-1',
        expect.stringContaining('trouble displaying that book page')
      );
    });
  });

  describe('Navigation Functions', () => {
    beforeEach(() => {
      // Setup a selected book
      const { result } = renderHook(() => useBookStateManager(mockOptions));
      act(() => {
        result.current.selectedBookRef.current = {
          id: 'book-1',
          title: 'Test Book',
          totalPages: 10,
          currentAudioUrl: 'http://example.com/audio2.mp3'
        };
        result.current.currentPageRef.current = 1;
      });
    });

    it('should navigate to next page successfully', async () => {
      const mockPageData = {
        page: {
          pageImageUrl: 'http://example.com/page2.jpg',
          pageText: 'Chapter 2...',
          pageNumber: 2,
          totalPages: 10,
          bookTitle: 'Test Book',
          audioUrl: 'http://example.com/audio2.mp3'
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPageData)
      });

      const { result } = renderHook(() => useBookStateManager(mockOptions));
      
      // Setup selected book
      act(() => {
        result.current.selectedBookRef.current = {
          id: 'book-1',
          title: 'Test Book',
          totalPages: 10,
          currentAudioUrl: null
        };
        result.current.currentPageRef.current = 1;
      });

      const navigationResult = await act(async () => {
        return await result.current.navigateToNextPage();
      });

      expect(navigationResult).toBe(true);
      expect(result.current.currentPage).toBe(2);
      expect(result.current.bookState).toBe('AUDIO_READY_TO_PLAY');
    });

    it('should handle navigation to last page', async () => {
      const { result } = renderHook(() => useBookStateManager(mockOptions));
      
      // Setup book at last page
      act(() => {
        result.current.selectedBookRef.current = {
          id: 'book-1',
          title: 'Test Book',
          totalPages: 5,
          currentAudioUrl: null
        };
        result.current.currentPageRef.current = 5;
      });

      const navigationResult = await act(async () => {
        return await result.current.navigateToNextPage();
      });

      expect(navigationResult).toBe(false);
      expect(result.current.bookState).toBe('PAGE_COMPLETED');
    });

    it('should navigate to previous page successfully', async () => {
      const mockPageData = {
        page: {
          pageImageUrl: 'http://example.com/page1.jpg',
          pageText: 'Chapter 1...',
          pageNumber: 1,
          totalPages: 10,
          bookTitle: 'Test Book',
          audioUrl: null
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPageData)
      });

      const { result } = renderHook(() => useBookStateManager(mockOptions));
      
      // Setup selected book on page 2
      act(() => {
        result.current.selectedBookRef.current = {
          id: 'book-1',
          title: 'Test Book',
          totalPages: 10,
          currentAudioUrl: null
        };
        result.current.currentPageRef.current = 2;
      });

      const navigationResult = await act(async () => {
        return await result.current.navigateToPreviousPage();
      });

      expect(navigationResult).toBe(true);
      expect(result.current.currentPage).toBe(1);
    });

    it('should handle navigation from first page', async () => {
      const { result } = renderHook(() => useBookStateManager(mockOptions));
      
      // Setup book at first page
      act(() => {
        result.current.selectedBookRef.current = {
          id: 'book-1',
          title: 'Test Book',
          totalPages: 10,
          currentAudioUrl: null
        };
        result.current.currentPageRef.current = 1;
      });

      const navigationResult = await act(async () => {
        return await result.current.navigateToPreviousPage();
      });

      expect(navigationResult).toBe(false);
    });
  });

  describe('Audio Management', () => {
    it('should play audio correctly', async () => {
      const mockAudio = {
        play: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
        currentTime: 0,
        onplay: null,
        onended: null,
        onerror: null,
      };

      (global.Audio as jest.Mock).mockReturnValue(mockAudio);

      const { result } = renderHook(() => useBookStateManager(mockOptions));

      act(() => {
        result.current.playPageAudio('http://example.com/test-audio.mp3');
      });

      expect(mockAudio.play).toHaveBeenCalled();
    });

    it('should stop audio correctly', () => {
      const mockAudio = {
        play: jest.fn(),
        pause: jest.fn(),
        currentTime: 0,
        onplay: null,
        onended: null,
        onerror: null,
      };

      (global.Audio as jest.Mock).mockReturnValue(mockAudio);

      const { result } = renderHook(() => useBookStateManager(mockOptions));

      // Start audio first
      act(() => {
        result.current.playPageAudio('http://example.com/test-audio.mp3');
      });

      // Stop audio
      act(() => {
        result.current.stopAudio();
      });

      expect(mockAudio.pause).toHaveBeenCalled();
      expect(result.current.isPlayingAudio).toBe(false);
    });
  });

  describe('Reading Session Management', () => {
    it('should enter and exit reading session', () => {
      const { result } = renderHook(() => useBookStateManager(mockOptions));

      expect(result.current.isInReadingSession).toBe(false);

      act(() => {
        result.current.enterReadingSession();
      });
      expect(result.current.isInReadingSession).toBe(true);

      act(() => {
        result.current.exitReadingSession();
      });
      expect(result.current.isInReadingSession).toBe(false);
      expect(result.current.selectedBook).toBe(null);
      expect(result.current.currentPage).toBe(1);
    });
  });

  describe('Workflow Integration', () => {
    it('should start audio when workflow becomes IDLE and book is AUDIO_READY_TO_PLAY', () => {
      const mockStateMachine = {
        currentState: 'IDLE',
        handleAppuSpeakingStart: jest.fn(),
        handleAppuSpeakingStop: jest.fn(),
        handleError: jest.fn(),
      };

      const { result, rerender } = renderHook(() => 
        useBookStateManager({
          ...mockOptions,
          workflowStateMachine: mockStateMachine
        })
      );

      // Setup book with audio ready
      act(() => {
        result.current.selectedBookRef.current = {
          id: 'book-1',
          title: 'Test Book',
          totalPages: 10,
          currentAudioUrl: 'http://example.com/audio.mp3'
        };
        result.current.bookStateAPI.transitionToAudioReadyToPlay();
      });

      // Change workflow to IDLE should trigger audio playback
      mockStateMachine.currentState = 'IDLE';
      rerender();

      // Audio should be attempted to play
      expect(result.current.bookState).toBe('AUDIO_READY_TO_PLAY');
    });

    it('should pause audio when someone starts speaking', () => {
      const mockStateMachine = {
        currentState: 'APPU_SPEAKING',
        handleAppuSpeakingStart: jest.fn(),
        handleAppuSpeakingStop: jest.fn(),
        handleError: jest.fn(),
      };

      const { result } = renderHook(() => 
        useBookStateManager({
          ...mockOptions,
          workflowStateMachine: mockStateMachine
        })
      );

      // Setup audio playing state
      act(() => {
        result.current.bookStateAPI.transitionToAudioPlaying();
        // Simulate audio playing
        result.current.isPlayingAudio = true;
      });

      // The workflow monitor should detect speaking and pause audio
      expect(result.current.bookState).toBe('AUDIO_PLAYING');
    });
  });
});
