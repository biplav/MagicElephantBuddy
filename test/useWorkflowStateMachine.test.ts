
import { renderHook, act } from '@testing-library/react';
import { useWorkflowStateMachine } from '../client/src/hooks/useWorkflowStateMachine';
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

describe('useWorkflowStateMachine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with IDLE state when enabled', () => {
      const { result } = renderHook(() => useWorkflowStateMachine({ enabled: true }));
      
      expect(result.current.currentState).toBe('IDLE');
      expect(result.current.isEnabled).toBe(true);
      expect(result.current.isIdle).toBe(true);
    });

    it('should initialize with IDLE state when disabled', () => {
      const { result } = renderHook(() => useWorkflowStateMachine({ enabled: false }));
      
      expect(result.current.currentState).toBe('IDLE');
      expect(result.current.isEnabled).toBe(false);
    });
  });

  describe('State Transitions', () => {
    it('should transition to APPU_SPEAKING when handleAppuSpeakingStart is called', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ onStateChange, enabled: true })
      );

      act(() => {
        result.current.handleAppuSpeakingStart('test-context');
      });

      expect(result.current.currentState).toBe('APPU_SPEAKING');
      expect(result.current.isAppuSpeaking).toBe(true);
      expect(onStateChange).toHaveBeenCalledWith('APPU_SPEAKING');
    });

    it('should transition to CHILD_SPEAKING when handleChildSpeechStart is called', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ onStateChange, enabled: true })
      );

      act(() => {
        result.current.handleChildSpeechStart('child-speech-context');
      });

      expect(result.current.currentState).toBe('CHILD_SPEAKING');
      expect(result.current.isChildSpeaking).toBe(true);
      expect(onStateChange).toHaveBeenCalledWith('CHILD_SPEAKING');
    });

    it('should transition to APPU_THINKING when handleAppuThinking is called', () => {
      const { result } = renderHook(() => useWorkflowStateMachine({ enabled: true }));

      act(() => {
        result.current.handleAppuThinking('processing-context');
      });

      expect(result.current.currentState).toBe('APPU_THINKING');
      expect(result.current.isAppuThinking).toBe(true);
    });

    it('should transition to ERROR when handleError is called', () => {
      const { result } = renderHook(() => useWorkflowStateMachine({ enabled: true }));

      act(() => {
        result.current.handleError('Test error message', 'error-context');
      });

      expect(result.current.currentState).toBe('ERROR');
      expect(result.current.isError).toBe(true);
    });
  });

  describe('State Transition Chains', () => {
    it('should handle APPU speaking start and stop sequence', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ onStateChange, enabled: true })
      );

      // Start speaking
      act(() => {
        result.current.handleAppuSpeakingStart('start-context');
      });
      expect(result.current.currentState).toBe('APPU_SPEAKING');

      // Stop speaking
      act(() => {
        result.current.handleAppuSpeakingStop('stop-context');
      });
      expect(result.current.currentState).toBe('APPU_SPEAKING_STOPPED');
      expect(result.current.isAppuSpeakingStopped).toBe(true);

      expect(onStateChange).toHaveBeenCalledTimes(2);
    });

    it('should handle complex workflow: IDLE → LOADING → APPU_THINKING → APPU_SPEAKING → IDLE', () => {
      const { result } = renderHook(() => useWorkflowStateMachine({ enabled: true }));

      // Start with IDLE
      expect(result.current.currentState).toBe('IDLE');

      // Move to LOADING
      act(() => {
        result.current.handleLoading('api-request');
      });
      expect(result.current.currentState).toBe('LOADING');

      // Move to APPU_THINKING
      act(() => {
        result.current.handleAppuThinking('processing-response');
      });
      expect(result.current.currentState).toBe('APPU_THINKING');

      // Move to APPU_SPEAKING
      act(() => {
        result.current.handleAppuSpeakingStart('response-ready');
      });
      expect(result.current.currentState).toBe('APPU_SPEAKING');

      // Return to IDLE
      act(() => {
        result.current.handleIdle('workflow-complete');
      });
      expect(result.current.currentState).toBe('IDLE');
    });
  });

  describe('Auto-Idle Timer Behavior', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should automatically transition to IDLE after default timeout (3 seconds)', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ onStateChange, enabled: true })
      );

      // Move to APPU_SPEAKING
      act(() => {
        result.current.handleAppuSpeakingStart('test');
      });
      expect(result.current.currentState).toBe('APPU_SPEAKING');

      // Fast-forward time by 3 seconds
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(result.current.currentState).toBe('IDLE');
      expect(onStateChange).toHaveBeenLastCalledWith('IDLE');
    });

    it('should use custom timeout when provided', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ 
          onStateChange, 
          enabled: true, 
          autoIdleTimeoutMs: 5000 
        })
      );

      // Move to APPU_THINKING
      act(() => {
        result.current.handleAppuThinking('test');
      });
      expect(result.current.currentState).toBe('APPU_THINKING');

      // Fast-forward by 3 seconds (should not trigger)
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(result.current.currentState).toBe('APPU_THINKING');

      // Fast-forward by another 2 seconds (total 5 seconds)
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(result.current.currentState).toBe('IDLE');
    });

    it('should not auto-transition when already in IDLE or ERROR states', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ onStateChange, enabled: true })
      );

      // Already in IDLE - should not set timer
      expect(result.current.currentState).toBe('IDLE');
      
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(result.current.currentState).toBe('IDLE');
      expect(onStateChange).not.toHaveBeenCalled();

      // Move to ERROR state
      act(() => {
        result.current.handleError('test error');
      });
      expect(result.current.currentState).toBe('ERROR');

      // Should not auto-transition from ERROR
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(result.current.currentState).toBe('ERROR');
    });

    it('should reset timer on new activity', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ onStateChange, enabled: true })
      );

      // Move to APPU_SPEAKING
      act(() => {
        result.current.handleAppuSpeakingStart('test');
      });
      expect(result.current.currentState).toBe('APPU_SPEAKING');

      // Fast-forward by 2 seconds
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(result.current.currentState).toBe('APPU_SPEAKING');

      // New activity - should reset timer
      act(() => {
        result.current.handleAppuThinking('new activity');
      });
      expect(result.current.currentState).toBe('APPU_THINKING');

      // Fast-forward by 2 seconds (should not trigger, timer was reset)
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(result.current.currentState).toBe('APPU_THINKING');

      // Fast-forward by another 1 second (total 3 seconds from reset)
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.currentState).toBe('IDLE');
    });

    it('should not auto-transition when disabled', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ onStateChange, enabled: false })
      );

      // Try to move to APPU_SPEAKING (should be ignored when disabled)
      act(() => {
        result.current.handleAppuSpeakingStart('test');
      });
      expect(result.current.currentState).toBe('IDLE');

      // Fast-forward time
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(result.current.currentState).toBe('IDLE');
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it('should clear timer when manually transitioning to IDLE', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ onStateChange, enabled: true })
      );

      // Move to APPU_SPEAKING
      act(() => {
        result.current.handleAppuSpeakingStart('test');
      });
      expect(result.current.currentState).toBe('APPU_SPEAKING');

      // Manually transition to IDLE before timer expires
      act(() => {
        result.current.handleIdle('manual');
      });
      expect(result.current.currentState).toBe('IDLE');

      // Fast-forward time - should not trigger additional transitions
      const callCountBefore = onStateChange.mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(onStateChange.mock.calls.length).toBe(callCountBefore);
    });

    it('should provide auto-idle timer info in debug output', () => {
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ enabled: true, autoIdleTimeoutMs: 5000 })
      );

      // Move to active state
      act(() => {
        result.current.handleAppuSpeakingStart('test');
      });

      const debugInfo = result.current.getDebugInfo();
      expect(debugInfo.autoIdleTimer).toBeDefined();
      expect(debugInfo.autoIdleTimer.timeoutMs).toBe(5000);
      expect(debugInfo.autoIdleTimer.isActive).toBe(true);
      expect(debugInfo.autoIdleTimer.lastActivity).toBeDefined();
      expect(debugInfo.autoIdleTimer.timeSinceLastActivity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Disabled State Behavior', () => {
    it('should ignore state transitions when disabled', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ onStateChange, enabled: false })
      );

      act(() => {
        result.current.handleAppuSpeakingStart('test-context');
      });

      // Should remain in IDLE state
      expect(result.current.currentState).toBe('IDLE');
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it('should enable and disable workflow correctly', () => {
      const { result } = renderHook(() => useWorkflowStateMachine({ enabled: true }));

      // Initially enabled
      expect(result.current.isEnabled).toBe(true);

      // Disable workflow
      act(() => {
        result.current.setEnabled(false);
      });
      expect(result.current.isEnabled).toBe(false);
      expect(result.current.currentState).toBe('IDLE'); // Should reset to IDLE

      // Enable workflow
      act(() => {
        result.current.setEnabled(true);
      });
      expect(result.current.isEnabled).toBe(true);
    });
  });

  describe('Same State Transitions', () => {
    it('should ignore duplicate state transitions except for ERROR', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ onStateChange, enabled: true })
      );

      // First transition to APPU_SPEAKING
      act(() => {
        result.current.handleAppuSpeakingStart('first-call');
      });
      expect(onStateChange).toHaveBeenCalledTimes(1);

      // Second transition to same state should be ignored
      act(() => {
        result.current.handleAppuSpeakingStart('second-call');
      });
      expect(onStateChange).toHaveBeenCalledTimes(1); // Should not increment
    });

    it('should allow ERROR state transitions even if already in ERROR', () => {
      const onStateChange = jest.fn();
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ onStateChange, enabled: true })
      );

      // First error
      act(() => {
        result.current.handleError('First error');
      });
      expect(onStateChange).toHaveBeenCalledTimes(1);

      // Second error should still trigger transition
      act(() => {
        result.current.handleError('Second error');
      });
      expect(onStateChange).toHaveBeenCalledTimes(2);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset workflow to IDLE state', () => {
      const { result } = renderHook(() => useWorkflowStateMachine({ enabled: true }));

      // Move to different state
      act(() => {
        result.current.handleAppuSpeakingStart('test');
      });
      expect(result.current.currentState).toBe('APPU_SPEAKING');

      // Reset workflow
      act(() => {
        result.current.resetWorkflow();
      });
      expect(result.current.currentState).toBe('IDLE');
    });
  });

  describe('Debug Information', () => {
    it('should provide correct debug information', () => {
      const { result } = renderHook(() => 
        useWorkflowStateMachine({ 
          enabled: true,
          openaiConnection: { connected: true }
        })
      );

      act(() => {
        result.current.handleAppuSpeakingStart('debug-test');
      });

      const debugInfo = result.current.getDebugInfo();
      
      expect(debugInfo.state).toBe('APPU_SPEAKING');
      expect(debugInfo.isEnabled).toBe(true);
      expect(debugInfo.hasOpenAIConnection).toBe(true);
      expect(debugInfo.stateChecks.isAppuSpeaking).toBe(true);
      expect(debugInfo.stateChecks.isIdle).toBe(false);
    });
  });
});
