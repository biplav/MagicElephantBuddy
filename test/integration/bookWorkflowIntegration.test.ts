
import { renderHook, act } from '@testing-library/react';
import { useWorkflowStateMachine } from '../../client/src/hooks/useWorkflowStateMachine';
import { useBookStateManager } from '../../client/src/hooks/useBookStateManager';
import { createServiceLogger } from '../../client/src/lib/logger';

// Mock the logger
jest.mock('../../client/src/lib/logger', () => ({
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

describe('Book-Workflow Integration Tests', () => {
  let workflowHook: any;
  let bookHook: any;

  const setupHooks = (options = {}) => {
    const { result: workflowResult } = renderHook(() => 
      useWorkflowStateMachine({ enabled: true, ...options })
    );
    
    const { result: bookResult } = renderHook(() => 
      useBookStateManager({
        workflowStateMachine: workflowResult.current,
        onStorybookPageDisplay: jest.fn(),
        onFunctionCallResult: jest.fn(),
        onError: jest.fn(),
        onBookStateChange: jest.fn(),
        onAutoPageAdvance: jest.fn(),
        ...options
      })
    );

    workflowHook = workflowResult;
    bookHook = bookResult;

    return { workflowHook, bookHook };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
  });

  describe('Audio Playback Coordination', () => {
    it('should coordinate book audio with workflow speech states', async () => {
      const { workflowHook, bookHook } = setupHooks();

      // Setup book with audio ready
      act(() => {
        bookHook.current.selectedBookRef.current = {
          id: 'book-1',
          title: 'Test Book',
          totalPages: 10,
          currentAudioUrl: 'http://example.com/audio.mp3'
        };
        bookHook.current.bookStateAPI.transitionToAudioReadyToPlay();
      });

      expect(bookHook.current.bookState).toBe('AUDIO_READY_TO_PLAY');

      // When workflow is IDLE, book audio should be ready to play
      expect(workflowHook.current.currentState).toBe('IDLE');

      // Simulate Appu starting to speak
      act(() => {
        workflowHook.current.handleAppuSpeakingStart('interruption-test');
      });

      expect(workflowHook.current.currentState).toBe('APPU_SPEAKING');

      // When Appu stops speaking, workflow should return to IDLE
      act(() => {
        workflowHook.current.handleAppuSpeakingStop('interruption-over');
      });

      expect(workflowHook.current.currentState).toBe('APPU_SPEAKING_STOPPED');

      // Return to idle
      act(() => {
        workflowHook.current.handleIdle('ready-for-book-audio');
      });

      expect(workflowHook.current.currentState).toBe('IDLE');
    });

    it('should handle child speaking interruption during book audio', () => {
      const { workflowHook, bookHook } = setupHooks();

      // Setup book in audio playing state
      act(() => {
        bookHook.current.selectedBookRef.current = {
          id: 'book-1',
          title: 'Test Book',
          totalPages: 10,
          currentAudioUrl: 'http://example.com/audio.mp3'
        };
        bookHook.current.bookStateAPI.transitionToAudioPlaying();
      });

      expect(bookHook.current.bookState).toBe('AUDIO_PLAYING');

      // Child starts speaking
      act(() => {
        workflowHook.current.handleChildSpeechStart('child-interruption');
      });

      expect(workflowHook.current.currentState).toBe('CHILD_SPEAKING');

      // Child stops speaking
      act(() => {
        workflowHook.current.handleChildSpeechStop('child-finished');
      });

      expect(workflowHook.current.currentState).toBe('CHILD_SPEAKING_STOPPED');
    });
  });

  describe('Auto Page Advance Integration', () => {
    it('should handle auto page advance when workflow is idle', async () => {
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

      const { workflowHook, bookHook } = setupHooks();

      // Setup book with completed audio
      act(() => {
        bookHook.current.selectedBookRef.current = {
          id: 'book-1',
          title: 'Test Book',
          totalPages: 10,
          currentAudioUrl: 'http://example.com/audio1.mp3'
        };
        bookHook.current.currentPageRef.current = 1;
        bookHook.current.bookStateAPI.transitionToAudioCompleted();
      });

      expect(bookHook.current.bookState).toBe('AUDIO_COMPLETED');
      expect(workflowHook.current.currentState).toBe('IDLE');

      // The workflow monitor should detect this and trigger auto advance
      // This would happen automatically in the useEffect, but we need to simulate it
      await act(async () => {
        const success = await bookHook.current.navigateToNextPage();
        expect(success).toBe(true);
      });

      expect(bookHook.current.currentPage).toBe(2);
      expect(bookHook.current.bookState).toBe('AUDIO_READY_TO_PLAY');
    });

    it('should not auto advance when workflow is not idle', () => {
      const { workflowHook, bookHook } = setupHooks();

      // Setup book with completed audio
      act(() => {
        bookHook.current.selectedBookRef.current = {
          id: 'book-1',
          title: 'Test Book',
          totalPages: 10,
          currentAudioUrl: 'http://example.com/audio1.mp3'
        };
        bookHook.current.currentPageRef.current = 1;
        bookHook.current.bookStateAPI.transitionToAudioCompleted();
      });

      // Set workflow to non-idle state
      act(() => {
        workflowHook.current.handleAppuSpeakingStart('blocking-advance');
      });

      expect(workflowHook.current.currentState).toBe('APPU_SPEAKING');
      expect(bookHook.current.bookState).toBe('AUDIO_COMPLETED');
      
      // Page should not auto advance
      expect(bookHook.current.currentPage).toBe(1);
    });
  });

  describe('Error Handling Integration', () => {
    it('should coordinate error states between workflow and book', () => {
      const { workflowHook, bookHook } = setupHooks();

      // Book encounters error
      act(() => {
        bookHook.current.bookStateAPI.transitionToError();
      });

      expect(bookHook.current.bookState).toBe('ERROR');

      // Workflow can also enter error state
      act(() => {
        workflowHook.current.handleError('System error');
      });

      expect(workflowHook.current.currentState).toBe('ERROR');
    });

    it('should handle audio playback errors with workflow notification', () => {
      const mockAudio = {
        play: jest.fn().mockRejectedValue(new Error('Audio blocked')),
        pause: jest.fn(),
        currentTime: 0,
        onplay: null,
        onended: null,
        onerror: null,
      };

      (global.Audio as jest.Mock).mockReturnValue(mockAudio);

      const { workflowHook, bookHook } = setupHooks();

      // Attempt to play audio
      act(() => {
        bookHook.current.playPageAudio('http://example.com/blocked-audio.mp3');
      });

      // Should handle the error gracefully
      expect(workflowHook.current.currentState).toBe('IDLE'); // Should remain stable
    });
  });

  describe('State Synchronization', () => {
    it('should maintain consistent state between workflow and book manager', () => {
      const stateChangeCallback = jest.fn();
      const { workflowHook, bookHook } = setupHooks({
        onStateChange: stateChangeCallback,
        onBookStateChange: stateChangeCallback
      });

      // Initial states should be IDLE
      expect(workflowHook.current.currentState).toBe('IDLE');
      expect(bookHook.current.bookState).toBe('IDLE');

      // Transition through various states
      act(() => {
        workflowHook.current.handleLoading('loading-book');
      });

      act(() => {
        bookHook.current.bookStateAPI.transitionToPageLoading();
      });

      expect(workflowHook.current.currentState).toBe('LOADING');
      expect(bookHook.current.bookState).toBe('PAGE_LOADING');

      act(() => {
        workflowHook.current.handleIdle('book-loaded');
      });

      act(() => {
        bookHook.current.bookStateAPI.transitionToPageLoaded();
      });

      expect(workflowHook.current.currentState).toBe('IDLE');
      expect(bookHook.current.bookState).toBe('PAGE_LOADED');
    });
  });

  describe('Complex Workflow Scenarios', () => {
    it('should handle complete reading session workflow', async () => {
      const mockSearchResponse = {
        books: [{
          id: 'book-1',
          title: 'Test Story',
          totalPages: 3,
          summary: 'A test story',
          author: 'Test Author',
          genre: 'Children'
        }]
      };

      const mockPageData = {
        page: {
          pageImageUrl: 'http://example.com/page1.jpg',
          pageText: 'Once upon a time...',
          pageNumber: 1,
          totalPages: 3,
          bookTitle: 'Test Story',
          audioUrl: 'http://example.com/audio1.mp3'
        }
      };

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPageData)
        });

      const { workflowHook, bookHook } = setupHooks();

      // 1. Search for book
      await act(async () => {
        await bookHook.current.handleBookSearchTool('search-1', '{"query":"test story"}');
      });

      expect(bookHook.current.selectedBook).toEqual(
        expect.objectContaining({ id: 'book-1', title: 'Test Story' })
      );

      // 2. Display first page
      await act(async () => {
        await bookHook.current.handleDisplayBookPage('display-1', '{"bookId":"book-1","pageNumber":1}');
      });

      expect(bookHook.current.bookState).toBe('AUDIO_READY_TO_PLAY');
      expect(bookHook.current.isInReadingSession).toBe(true);

      // 3. Workflow should be IDLE, ready for audio
      expect(workflowHook.current.currentState).toBe('IDLE');

      // 4. Simulate audio completion and auto advance
      act(() => {
        bookHook.current.bookStateAPI.transitionToAudioCompleted();
      });

      expect(bookHook.current.bookState).toBe('AUDIO_COMPLETED');
    });
  });
});
