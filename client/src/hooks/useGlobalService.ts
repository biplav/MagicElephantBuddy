import { useEffect, useRef } from 'react';
import GlobalServiceSingleton from '@/services/GlobalServiceSingleton';
import { createServiceLogger } from '@/lib/logger';

export function useGlobalService<T>(key: string, factory: () => T): T {
  const logger = createServiceLogger('use-global-service');
  const serviceRef = useRef<T | null>(null);
  const keyRef = useRef<string>(key);

  // Get or create the service from global singleton
  if (!serviceRef.current || keyRef.current !== key) {
    serviceRef.current = GlobalServiceSingleton.getInstance(key, factory);
    keyRef.current = key;
    logger.debug(`🔗 HOOK: Connected to global service '${key}'`);
  }

  useEffect(() => {
    logger.debug(`🔌 HOOK: Component mounted with service '${key}'`);
    
    return () => {
      logger.debug(`🔌 HOOK: Component unmounted with service '${key}'`);
      // Don't destroy the service - keep it alive for other components
    };
  }, [key, logger]);

  return serviceRef.current;
}