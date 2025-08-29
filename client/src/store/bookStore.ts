
import { createSlice, configureStore, PayloadAction } from '@reduxjs/toolkit';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('book-store');

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

interface SelectedBook {
  id: string;
  title: string;
  totalPages: number;
  summary?: string;
  author?: string;
  genre?: string;
  currentAudioUrl?: string;
}

interface BookStoreState {
  // Book state
  bookState: BookState;
  selectedBook: SelectedBook | null;
  currentPage: number;
  isInReadingSession: boolean;
  
  // Audio state
  isPlayingAudio: boolean;
  audioElement: HTMLAudioElement | null;
  
  // Function call tracking
  pendingFunctionCalls: Record<string, {
    callId: string;
    type: 'book_search' | 'display_page';
    args: any;
    timestamp: number;
  }>;
}

const initialState: BookStoreState = {
  bookState: 'IDLE',
  selectedBook: null,
  currentPage: 1,
  isInReadingSession: false,
  isPlayingAudio: false,
  audioElement: null,
  pendingFunctionCalls: {}
};

const bookSlice = createSlice({
  name: 'book',
  initialState,
  reducers: {
    // Book state transitions
    transitionToState: (state, action: PayloadAction<BookState>) => {
      const previousState = state.bookState;
      const newState = action.payload;
      
      logger.info(`📖 BOOK STATE TRANSITION: ${previousState} -> ${newState}`, {
        previousState,
        newState,
        currentPage: state.currentPage,
        selectedBook: state.selectedBook ? {
          id: state.selectedBook.id,
          title: state.selectedBook.title,
          totalPages: state.selectedBook.totalPages
        } : null,
        isInReadingSession: state.isInReadingSession,
        isPlayingAudio: state.isPlayingAudio
      });
      
      state.bookState = newState;
    },
    
    // Book selection
    setSelectedBook: (state, action: PayloadAction<SelectedBook>) => {
      state.selectedBook = action.payload;
      logger.info('📚 Book selected', { book: action.payload });
    },
    
    // Page navigation
    setCurrentPage: (state, action: PayloadAction<number>) => {
      state.currentPage = action.payload;
      logger.info('📄 Current page updated', { page: action.payload });
    },
    
    // Reading session
    enterReadingSession: (state) => {
      if (!state.isInReadingSession) {
        state.isInReadingSession = true;
        logger.info("📖 Entering optimized reading session mode");
      }
    },
    
    exitReadingSession: (state) => {
      if (state.isInReadingSession) {
        state.isInReadingSession = false;
        state.selectedBook = null;
        state.currentPage = 1;
        state.bookState = 'IDLE';
        state.isPlayingAudio = false;
        state.audioElement = null;
        logger.info("📖 Exiting reading session mode");
      }
    },
    
    // Audio management
    setAudioElement: (state, action: PayloadAction<HTMLAudioElement | null>) => {
      // For complex objects like HTMLAudioElement, we need to handle them differently
      // Store as any to avoid Redux Toolkit's Immer issues with DOM elements
      state.audioElement = action.payload as any;
    },
    
    setIsPlayingAudio: (state, action: PayloadAction<boolean>) => {
      state.isPlayingAudio = action.payload;
    },
    
    updateBookAudioUrl: (state, action: PayloadAction<string>) => {
      if (state.selectedBook) {
        state.selectedBook.currentAudioUrl = action.payload;
      }
    },
    
    // Function call tracking
    addPendingFunctionCall: (state, action: PayloadAction<{
      callId: string;
      type: 'book_search' | 'display_page';
      args: any;
    }>) => {
      const { callId, type, args } = action.payload;
      state.pendingFunctionCalls[callId] = {
        callId,
        type,
        args,
        timestamp: Date.now()
      };
    },
    
    removePendingFunctionCall: (state, action: PayloadAction<string>) => {
      delete state.pendingFunctionCalls[action.payload];
    },
    
    clearPendingFunctionCalls: (state) => {
      state.pendingFunctionCalls = {};
    }
  }
});

export const {
  transitionToState,
  setSelectedBook,
  setCurrentPage,
  enterReadingSession,
  exitReadingSession,
  setAudioElement,
  setIsPlayingAudio,
  updateBookAudioUrl,
  addPendingFunctionCall,
  removePendingFunctionCall,
  clearPendingFunctionCalls
} = bookSlice.actions;

export const bookStore = configureStore({
  reducer: {
    book: bookSlice.reducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['book/setAudioElement'],
        ignoredPaths: ['book.audioElement']
      }
    })
});

export type BookRootState = ReturnType<typeof bookStore.getState>;
export type BookDispatch = typeof bookStore.dispatch;

export default bookSlice.reducer;
