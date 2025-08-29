import { useRef, useCallback, useMemo } from 'react';
import useRealtimeAudio from './useRealtimeAudio';
import { createServiceLogger } from '@/lib/logger';

// Stable wrapper to prevent re-initialization of realtime audio
export function useStableRealtimeAudio(options: any) {
  const logger = createServiceLogger('stable-realtime-audio');
  const stableOptionsRef = useRef(options);
  const instanceRef = useRef<any>(null);

  // Create stable options that only update if actual values change
  const stableOptions = useMemo(() => {
    const hasChanged = JSON.stringify(stableOptionsRef.current) !== JSON.stringify(options);
    if (hasChanged) {
      logger.info('🔄 Realtime audio options changed, updating...');
      stableOptionsRef.current = options;
    }
    return stableOptionsRef.current;
  }, [options, logger]);

  // Initialize realtime audio only once with stable options
  const realtimeAudio = useRealtimeAudio(stableOptions);

  // Track if this is a new instance
  if (instanceRef.current !== realtimeAudio) {
    if (instanceRef.current) {
      logger.warn('⚠️ STABLE-REALTIME-AUDIO: Instance changed - this should not happen!');
    } else {
      logger.info('🚀 STABLE-REALTIME-AUDIO: First initialization');
    }
    instanceRef.current = realtimeAudio;
  }

  return realtimeAudio;
}