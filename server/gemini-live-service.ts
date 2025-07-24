import { GoogleGenerativeAI } from "@google/generative-ai";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { APPU_SYSTEM_PROMPT } from "@shared/appuPrompts";
import { getCurrentTimeContext, DEFAULT_PROFILE } from "@shared/childProfile";
import { memoryService } from './memory-service';
import { createServiceLogger } from './logger';

const geminiLogger = createServiceLogger('gemini-live');

interface GeminiLiveSession {
  ws: WebSocket;
  geminiWs: WebSocket | null;
  isConnected: boolean;
  conversationId: number | null;
  childId: number;
  sessionStartTime: Date;
  messageCount: number;
}

export function setupGeminiLiveWebSocket(server: any) {
  geminiLogger.info('Setting up Gemini Live WebSocket server');
  
  const wss = new WebSocketServer({ 
    server: server, 
    path: '/gemini-ws',
    perMessageDeflate: false,
    maxPayload: 1024 * 1024 * 3, // 3MB for video frames
    clientTracking: true
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
    
    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_established',
      message: 'Gemini WebSocket connected successfully',
      timestamp: new Date().toISOString()
    }));

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        geminiLogger.debug('Received Gemini Live message', { messageType: message.type });
        
        // Echo back for debugging
        ws.send(JSON.stringify({
          type: 'echo',
          received: message,
          timestamp: new Date().toISOString()
        }));
      } catch (error: any) {
        geminiLogger.error('Error processing WebSocket message', { error: error.message });
      }
    });

    ws.on('close', () => {
      geminiLogger.info('Gemini Live WebSocket connection closed');
    });

    ws.on('error', (error: any) => {
      geminiLogger.error('Gemini Live WebSocket error', { error: error.message });
    });
  });

  wss.on('error', (error: any) => {
    geminiLogger.error('🚨 GEMINI WEBSOCKET SERVER ERROR', { error: error.message, stack: error.stack });
  });

  wss.on('listening', () => {
    geminiLogger.info('✅ GEMINI WEBSOCKET SERVER IS LISTENING on /gemini-ws');
  });

  return wss;
}