import { useRef, useEffect } from 'react';
import { useBookManager } from './useBookManager';
import { createServiceLogger } from '@/lib/logger';

// Single instance tracker
let globalBookManagerInstance: any = null;
let instanceCount = 0;

export function useSingletonBookManager(options: any = {}) {
  const logger = createServiceLogger('singleton-book-manager');
  const instanceRef = useRef<any>(null);

  // If global instance doesn't exist, create it
  if (!globalBookManagerInstance) {
    instanceCount++;
    logger.info(`🔄 SINGLETON-BOOK-MANAGER: Creating global instance #${instanceCount}`);
    
    // This will be created only once per application lifecycle
    globalBookManagerInstance = "PLACEHOLDER_FOR_BOOK_MANAGER";
  }

  // Always return the same global instance
  instanceRef.current = globalBookManagerInstance;

  useEffect(() => {
    logger.info(`🔗 SINGLETON-BOOK-MANAGER: Component connected to global instance #${instanceCount}`);
    
    return () => {
      logger.info(`🔌 SINGLETON-BOOK-MANAGER: Component disconnected from global instance #${instanceCount}`);
    };
  }, [logger]);

  return instanceRef.current;
}

export function resetBookManagerSingleton() {
  const logger = createServiceLogger('singleton-book-manager');
  logger.info('🧹 SINGLETON-BOOK-MANAGER: Resetting global instance');
  globalBookManagerInstance = null;
  instanceCount = 0;
}