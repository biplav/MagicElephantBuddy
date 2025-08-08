
// This hook has been removed and replaced by workflow state integration in BookStateManager
// Audio playback and auto page advance are now handled directly by BookStateManager
// monitoring workflow states, providing cleaner separation of concerns.

export function useSilenceDetection() {
  console.warn('useSilenceDetection is deprecated. Use BookStateManager workflow integration instead.');
  return {
    isDetectingSilence: false,
    isSilent: false,
    silenceTimer: 0,
    isEnabled: false,
    isWaitingForInitialAudio: false,
    initialAudioTimer: 0,
    startPageTurnTimer: () => {},
    startInitialAudioTimer: () => {},
    interruptSilence: () => {},
    resetSilenceDetection: () => {},
  };
}
