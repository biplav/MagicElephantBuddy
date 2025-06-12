import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface RealtimeSession {
  ws: WebSocket;
  openaiWs: WebSocket | null;
  isConnected: boolean;
}

const sessions = new Map<string, RealtimeSession>();

export function setupRealtimeWebSocket(server: any) {
  const wss = new WebSocketServer({ server, path: '/ws/realtime' });
  
  wss.on('connection', (ws: WebSocket) => {
    const sessionId = generateSessionId();
    console.log(`Realtime session connected: ${sessionId}`);
    
    // Initialize session
    const session: RealtimeSession = {
      ws,
      openaiWs: null,
      isConnected: false
    };
    sessions.set(sessionId, session);
    
    // Handle messages from client
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'start_session':
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
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}