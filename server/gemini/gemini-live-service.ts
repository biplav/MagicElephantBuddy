
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "../storage";
import { APPU_SYSTEM_PROMPT } from "../../shared/appuPrompts";
import { getCurrentTimeContext, DEFAULT_PROFILE } from "../../shared/childProfile";
import { memoryService } from '../memory-service';
import { createServiceLogger } from '../logger';
import { GeminiLiveSession, geminiSessionManager } from './gemini-session-manager';
import { geminiMessageHandler } from './gemini-message-handler';

const geminiLogger = createServiceLogger('gemini-live');

export function setupGeminiLiveWebSocket(server: any) {
  geminiLogger.info('Setting up Gemini Live WebSocket server with minimal config');

  // Use working WebSocket configuration that avoids RSV1 frame issues
  const wss = new WebSocketServer({ 
    server: server, 
    path: '/gemini-ws',
    perMessageDeflate: false,  // Critical: prevents compression frame issues
    skipUTF8Validation: false  // Critical: ensures proper frame validation
  });

  wss.on('connection', (ws: WebSocket, req) => {
    geminiLogger.info('🔗 NEW GEMINI WEBSOCKET CONNECTION ESTABLISHED', { 
      readyState: ws.readyState,
      origin: req.headers.origin,
      userAgent: req.headers['user-agent']?.slice(0, 100),
      remoteAddress: req.socket.remoteAddress,
      url: req.url,
      headers: Object.keys(req.headers),
      connectionId: Math.random().toString(36).substring(7)
    });

    // Send connection confirmation with explicit encoding
    const confirmationMessage = {
      type: 'connection_established',
      message: 'Connected'
    };

    const messageStr = JSON.stringify(confirmationMessage);
    geminiLogger.debug('Sending connection confirmation', { 
      messageStr,
      messageLength: messageStr.length,
      wsReadyState: ws.readyState 
    });

    try {
      ws.send(messageStr);
      geminiLogger.info('✅ Connection confirmation sent successfully');
    } catch (error: any) {
      geminiLogger.error('❌ Failed to send connection confirmation', { 
        error: error.message,
        wsReadyState: ws.readyState 
      });
    }
    
    const session: GeminiLiveSession = {
      ws: ws,
      geminiWs: null,
      isConnected: false,
      conversationId: null,
      childId: 1, // Default child ID, could be dynamic
      sessionStartTime: new Date(),
      messageCount: 0
    };

    ws.on('message', async (data: Buffer) => {
      await geminiMessageHandler.handleMessage(session, data);
    });

    ws.on('close', async () => {
      geminiLogger.info('Gemini Live WebSocket connection closed');
      await geminiSessionManager.endSession(session);
    });

    ws.on('error', (error) => {
      geminiLogger.error('Gemini Live WebSocket error', { error: error.message });
    });
  });

  geminiLogger.info('✅ GEMINI WEBSOCKET SERVER IS LISTENING on /gemini-ws');
  return wss;
}
