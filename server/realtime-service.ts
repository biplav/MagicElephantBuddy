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
    // Connect to OpenAI Realtime API
    const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });
    
    session.openaiWs = openaiWs;
    
    openaiWs.on('open', () => {
      console.log('Connected to OpenAI Realtime API');
      session.isConnected = true;
      
      // Configure the session
      openaiWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: 'You are Appu, a magical, friendly elephant helper who talks to young children aged 3 to 5. Speak in Hindi or Hinglish with very short, simple sentences.',
          voice: 'alloy',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500
          }
        }
      }));
      
      session.ws.send(JSON.stringify({ type: 'session_started' }));
    });
    
    openaiWs.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'conversation.item.input_audio_transcription.completed':
            // Send transcription to client
            session.ws.send(JSON.stringify({
              type: 'transcription',
              text: message.transcript
            }));
            break;
          case 'response.audio.delta':
            // Forward audio response to client
            session.ws.send(JSON.stringify({
              type: 'audio_response',
              audio: message.delta
            }));
            break;
          case 'response.text.delta':
            // Forward text response to client
            session.ws.send(JSON.stringify({
              type: 'text_response',
              text: message.delta
            }));
            break;
          case 'response.done':
            session.ws.send(JSON.stringify({
              type: 'response_complete'
            }));
            break;
          case 'error':
            console.error('OpenAI Realtime API error:', message);
            session.ws.send(JSON.stringify({
              type: 'error',
              message: message.error?.message || 'Unknown error'
            }));
            break;
        }
      } catch (error) {
        console.error('Error processing OpenAI message:', error);
      }
    });
    
    openaiWs.on('close', () => {
      console.log('OpenAI Realtime API connection closed');
      session.isConnected = false;
      session.ws.send(JSON.stringify({ type: 'session_ended' }));
    });
    
    openaiWs.on('error', (error) => {
      console.error('OpenAI Realtime API error:', error);
      session.isConnected = false;
      session.ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Failed to connect to OpenAI Realtime API' 
      }));
    });
    
  } catch (error) {
    console.error('Error starting realtime session:', error);
    session.ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Failed to start realtime session' 
    }));
  }
}

async function endRealtimeSession(session: RealtimeSession) {
  if (session.openaiWs) {
    session.openaiWs.close();
    session.openaiWs = null;
  }
  session.isConnected = false;
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}