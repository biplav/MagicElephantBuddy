import React, { createContext, useContext, useRef, useEffect } from 'react';
import { useBookManager } from '@/hooks/useBookManager';
import { createServiceLogger } from '@/lib/logger';

interface BookManagerContextType {
  bookManager: ReturnType<typeof useBookManager> | null;
}

const BookManagerContext = createContext<BookManagerContextType>({ bookManager: null });

interface BookManagerProviderProps {
  children: React.ReactNode;
  workflowStateMachine?: any;
  onStorybookPageDisplay?: (pageData: any) => void;
}

export function BookManagerProvider({ 
  children, 
  workflowStateMachine,
  onStorybookPageDisplay 
}: BookManagerProviderProps) {
  const logger = createServiceLogger('book-manager-provider');
  const initializationRef = useRef(false);
  
  // Default callback for storybook page display (can be overridden by individual components)
  const defaultStorybookCallback = (pageData: any) => {
    logger.info("Default storybook page display", { pageData });
    // This will be overridden by individual components when needed
  };
  
  // Create book manager instance ONCE at provider level
  const bookManager = useBookManager({
    workflowStateMachine: workflowStateMachine || null,
    onStorybookPageDisplay: onStorybookPageDisplay || defaultStorybookCallback,
    onFunctionCallResult: (callId: string, result: any) => {
      logger.info("Book function call result", { callId, result });
    },
    onError: (callId: string, error: string) => {
      logger.error("Book function call error", { callId, error });
    }
  });

  // Track initialization to ensure single instance
  useEffect(() => {
    if (!initializationRef.current) {
      initializationRef.current = true;
      logger.info("🚀 BOOK-MANAGER-PROVIDER: Initialized with single instance");
    }
  }, [logger]);

  const contextValue: BookManagerContextType = {
    bookManager
  };

  return (
    <BookManagerContext.Provider value={contextValue}>
      {children}
    </BookManagerContext.Provider>
  );
}

export function useBookManagerContext(): ReturnType<typeof useBookManager> {
  const context = useContext(BookManagerContext);
  
  if (!context.bookManager) {
    throw new Error('useBookManagerContext must be used within BookManagerProvider');
  }
  
  return context.bookManager;
}