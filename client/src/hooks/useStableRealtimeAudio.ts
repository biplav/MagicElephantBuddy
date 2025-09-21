import { useMemo } from 'react';
import useRealtimeAudio from './useRealtimeAudio';
import { createServiceLogger } from '@/lib/logger';

// Stable wrapper that prevents re-initialization using useMemo
export function useStableRealtimeAudio(options: any) {
  const logger = createServiceLogger('stable-realtime-audio');
  
  // Create stable options to prevent unnecessary re-renders
  const stableOptions = useMemo(() => ({
    ...options,
    // Add a stability key to track critical changes only
    _stabilityKey: `${options.provider || 'default'}-${options.selectedChildId || 'no-child'}`
  }), [
    options.provider,
    options.selectedChildId,
    options.onError,
    options.onConversationStart,
    options.onStorybookPageDisplay,
    options.onBookReadingStart,
    options.onAudioPlaybook,
    options.onCapturedFrame,
    options.onAppuSpeakingChange,
    options.triggerFrameCapture
  ]);

  // Always call useRealtimeAudio (never conditional) - this prevents hook order violations
  const realtimeAudio = useRealtimeAudio(stableOptions);

  return realtimeAudio;
}