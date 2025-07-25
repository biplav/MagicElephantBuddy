
import { useState, useRef, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';
import { WebSocketConnectionTracker } from '@/lib/websocket-connection-tracker';
import { WebSocketSessionManager } from '@/lib/websocket-session-manager';
import { WebSocketMessageHandler } from '@/lib/websocket-message-handler';
import { WebSocketErrorLogger } from '@/lib/websocket-error-logger';

interface GeminiConnectionOptions {
  onTranscriptionReceived?: (transcription: string) => void;
  onResponseReceived?: (text: string) => void;
  onError?: (error: string) => void;
}

interface GeminiConnectionState {
  isConnected: boolean;
  isRecording: boolean;
  error: string | null;
  conversationId?: number;
}

interface MessageHandlerCallbacks {
  onSessionStarted: (conversationId: number) => void;
  onTextResponse: (text: string) => void;
  onVisionResponse: (text: string) => void;
  onError: (error: string) => void;
}

export function useGeminiConnection(options: GeminiConnectionOptions = {}) {
  const logger = createServiceLogger('gemini-connection');
  
  const [state, setState] = useState<GeminiConnectionState>({
    isConnected: false,
    isRecording: false,
    error: null
  });

  const wsRef = useRef<WebSocket | null>(null);

  const getSelectedChildId = useCallback((): number => {
    const selectedChildId = localStorage.getItem("selectedChildId");
    if (selectedChildId) {
      const parsed = parseInt(selectedChildId, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return 1085268853542289410;
  }, []);

  const connect = useCallback(async () => {
    try {
      logger.info('Initiating Gemini WebSocket connection setup');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/gemini-ws`;
      
      const connectionTracker = new WebSocketConnectionTracker(logger);
      const sessionManager = new WebSocketSessionManager(logger);

      const messageCallbacks: MessageHandlerCallbacks = {
        onSessionStarted: (conversationId: number) => {
          setState(prev => ({ ...prev, conversationId }));
        },
        onTextResponse: (text: string) => {
          options.onResponseReceived?.(text);
        },
        onVisionResponse: (text: string) => {
          options.onResponseReceived?.(text);
        },
        onError: (error: string) => {
          setState(prev => ({ ...prev, error }));
          options.onError?.(error);
        }
      };

      const messageHandler = new WebSocketMessageHandler(logger, messageCallbacks);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      connectionTracker.setupTimeout(ws, wsUrl, 10000);

      ws.onopen = () => {
        connectionTracker.clearTimeout();
        connectionTracker.logConnectionSuccess(wsUrl, ws);

        setState(prev => ({ ...prev, isConnected: true, error: null }));

        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const childId = getSelectedChildId();
            sessionManager.sendSessionStart(ws, childId);
          }
        }, 100);
      };

      ws.onmessage = (event) => {
        messageHandler.handleMessage(event);
      };

      ws.onerror = (error) => {
        connectionTracker.clearTimeout();
        const errorLogger = new WebSocketErrorLogger(logger);
        const analysis = errorLogger.logComprehensiveError({ error, ws, url: wsUrl });
        
        setState(prev => ({ ...prev, error: analysis.message, isConnected: false }));
        options.onError?.(analysis.message);
      };

      ws.onclose = (event) => {
        connectionTracker.clearTimeout();
        connectionTracker.logConnectionClose(event, wsUrl);
        
        setState(prev => ({ ...prev, isConnected: false, isRecording: false }));
        
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      };

    } catch (error: any) {
      logger.error('Error during WebSocket setup:', error);
      setState(prev => ({ ...prev, error: error.message }));
      options.onError?.(error.message);
    }
  }, [options, getSelectedChildId]);

  const disconnect = useCallback(() => {
    logger.info('Disconnecting Gemini WebSocket');
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState(prev => ({ 
      ...prev, 
      isConnected: false, 
      isRecording: false 
    }));
  }, []);

  const sendText = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'text_input',
        text: text
      }));
      options.onTranscriptionReceived?.(text);
    }
  }, [options]);

  const sendVideoFrame = useCallback((frameData: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'video_frame',
        frameData: frameData
      }));
    }
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    sendText,
    sendVideoFrame
  };
}
