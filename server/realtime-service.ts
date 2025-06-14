import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import OpenAI from 'openai';
import { storage } from './storage';
import { DEFAULT_PROFILE } from '../shared/childProfile';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface RealtimeSession {
  ws: WebSocket;
  openaiWs: WebSocket | null;
  isConnected: boolean;
  conversationId: number | null;
  childId: number;
  sessionStartTime: Date;
  messageCount: number;
}

const sessions = new Map<string, RealtimeSession>();

export function setupRealtimeWebSocket(server: any) {
  const wss = new WebSocketServer({ server, path: '/ws/realtime' });
  
  wss.on('connection', (ws: WebSocket) => {
    const sessionId = generateSessionId();
    console.log(`Realtime session connected: ${sessionId}`);
    
    // Initialize session with default child (for demo purposes, in production this would come from user authentication)
    const session: RealtimeSession = {
      ws,
      openaiWs: null,
      isConnected: false,
      conversationId: null,
      childId: 1, // Using the seeded child ID
      sessionStartTime: new Date(),
      messageCount: 0
    };
    sessions.set(sessionId, session);
    
    // Handle messages from client
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'start_session':
            // Create a new conversation in the database
            try {
              const conversation = await storage.createConversation({
                childId: session.childId
              });
              session.conversationId = conversation.id;
              console.log(`Created conversation ${conversation.id} for child ${session.childId}`);
            } catch (error) {
              console.error('Error creating conversation:', error);
            }
            await startRealtimeSession(session);
            break;
          case 'audio_chunk':
            if (session.openaiWs && session.isConnected) {
              // Forward audio chunk to OpenAI
              session.openaiWs.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: message.audio
              }));
            }
            break;
          case 'commit_audio':
            if (session.openaiWs && session.isConnected) {
              // Commit the audio buffer for transcription
              session.openaiWs.send(JSON.stringify({
                type: 'input_audio_buffer.commit'
              }));
            }
            break;
          case 'end_session':
            await endRealtimeSession(session);
            break;
        }
      } catch (error) {
        console.error('Error handling realtime message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
      }
    });
    
    ws.on('close', () => {
      console.log(`Realtime session closed: ${sessionId}`);
      endRealtimeSession(session);
      sessions.delete(sessionId);
    });
    
    ws.on('error', (error) => {
      console.error(`Realtime session error: ${sessionId}`, error);
      endRealtimeSession(session);
      sessions.delete(sessionId);
    });
  });
  
  return wss;
}

async function startRealtimeSession(session: RealtimeSession) {
  try {
    console.log('Attempting to connect to OpenAI Realtime API...');
    
    // Check if API key exists
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not found');
    }
    
    // For now, send an error message indicating that the Realtime API requires special access
    session.ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'OpenAI Realtime API requires special access permissions. Using traditional recording method instead.' 
    }));
    
    return;
    
  } catch (error) {
    console.error('Error starting realtime session:', error);
    session.ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Failed to start realtime session' 
    }));
  }
}

async function endRealtimeSession(session: RealtimeSession) {
  // Clean up session state
  session.isConnected = false;
  
  // Close conversation and update database
  if (session.conversationId) {
    try {
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - session.sessionStartTime.getTime()) / 1000);
      
      await storage.updateConversation(session.conversationId, {
        endTime,
        duration,
        totalMessages: session.messageCount
      });
      
      console.log(`Closed conversation ${session.conversationId} - Duration: ${duration}s, Messages: ${session.messageCount}`);
    } catch (error) {
      console.error('Error updating conversation:', error);
    }
  }
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}