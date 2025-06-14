import { GoogleGenerativeAI } from "@google/generative-ai";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { APPU_SYSTEM_PROMPT } from "@shared/appuPrompts";
import { getCurrentTimeContext } from "@shared/childProfile";

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
  const wss = new WebSocket.Server({ 
    server: server, 
    path: '/gemini-ws'
  });

  console.log('Gemini Live WebSocket server initialized on /gemini-ws');

  wss.on('connection', (ws: WebSocket) => {
    console.log('New Gemini Live WebSocket connection established');
    
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
      try {
        const message = JSON.parse(data.toString());
        console.log('Received Gemini Live message:', message.type);

        switch (message.type) {
          case 'start_session':
            await startGeminiLiveSession(session);
            break;
          
          case 'audio_chunk':
            if (session.geminiWs && session.isConnected) {
              // Forward audio to Gemini Live API
              session.geminiWs.send(JSON.stringify({
                type: 'audio',
                data: message.audioData
              }));
            }
            break;
          
          case 'text_input':
            await handleGeminiTextInput(session, message.text);
            break;
          
          case 'end_session':
            await endGeminiLiveSession(session);
            break;
        }
      } catch (error) {
        console.error('Error processing Gemini Live message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Failed to process message'
        }));
      }
    });

    ws.on('close', async () => {
      console.log('Gemini Live WebSocket connection closed');
      await endGeminiLiveSession(session);
    });

    ws.on('error', (error) => {
      console.error('Gemini Live WebSocket error:', error);
    });
  });

  return wss;
}

async function startGeminiLiveSession(session: GeminiLiveSession) {
  try {
    console.log('Starting Gemini Live session');
    
    // Create new conversation in database
    const conversation = await storage.createConversation({
      childId: session.childId,
      startTime: session.sessionStartTime,
      totalMessages: 0
    });
    
    session.conversationId = conversation.id;
    console.log(`Created conversation ${conversation.id} for Gemini Live session`);

    // Initialize Gemini client
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    
    // Get current time context for personalization
    const timeContext = getCurrentTimeContext();
    
    // Create enhanced system prompt
    const enhancedSystemPrompt = `${APPU_SYSTEM_PROMPT}

Current Context:
- Time: ${timeContext.currentTime}
- Time of day: ${timeContext.timeOfDay}
${timeContext.upcomingActivity ? `- Upcoming activity: ${timeContext.upcomingActivity}` : ''}
${timeContext.childMood ? `- Child's mood: ${timeContext.childMood}` : ''}

You are now in a live audio conversation. Keep responses very short (1-2 sentences) and speak naturally in simple Hinglish.`;

    // For now, we'll use text-based chat since Gemini Live API requires specific setup
    // In production, this would connect to the actual Live API WebSocket
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        maxOutputTokens: 100,
        temperature: 0.8
      }
    });

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: enhancedSystemPrompt }],
        },
        {
          role: "model",
          parts: [{ text: "Namaste! I'm Appu, ready for our fun conversation! 🐘" }],
        },
      ],
    });

    // Store chat instance for this session
    (session as any).geminiChat = chat;
    session.isConnected = true;

    // Send session started confirmation
    session.ws.send(JSON.stringify({
      type: 'session_started',
      conversationId: session.conversationId
    }));

    console.log('Gemini Live session started successfully');
  } catch (error) {
    console.error('Error starting Gemini Live session:', error);
    session.ws.send(JSON.stringify({
      type: 'error',
      error: 'Failed to start session'
    }));
  }
}

async function handleGeminiTextInput(session: GeminiLiveSession, text: string) {
  try {
    if (!session.isConnected || !session.conversationId) {
      throw new Error('Session not properly initialized');
    }

    console.log(`Gemini Live processing text: ${text}`);
    
    // Store child's message
    await storage.createMessage({
      conversationId: session.conversationId,
      type: 'child_input',
      content: text,
      transcription: text
    });

    // Generate response using Gemini
    const chat = (session as any).geminiChat;
    const result = await chat.sendMessage(text);
    const responseText = result.response.text();

    console.log(`Gemini Live response: ${responseText}`);

    // Store Appu's response
    await storage.createMessage({
      conversationId: session.conversationId,
      type: 'appu_response',
      content: responseText
    });

    // Update conversation message count
    session.messageCount += 2;
    await storage.updateConversation(session.conversationId, {
      totalMessages: session.messageCount
    });

    // Send response back to client
    session.ws.send(JSON.stringify({
      type: 'text_response',
      text: responseText,
      conversationId: session.conversationId
    }));

    console.log(`Stored messages for Gemini conversation ${session.conversationId}`);
  } catch (error) {
    console.error('Error handling Gemini text input:', error);
    session.ws.send(JSON.stringify({
      type: 'error',
      error: 'Failed to process text input'
    }));
  }
}

async function endGeminiLiveSession(session: GeminiLiveSession) {
  try {
    if (session.conversationId) {
      const endTime = new Date();
      const duration = Math.round((endTime.getTime() - session.sessionStartTime.getTime()) / 1000);
      
      await storage.updateConversation(session.conversationId, {
        endTime,
        duration
      });
      
      console.log(`Closed Gemini conversation ${session.conversationId} - Duration: ${duration}s`);
    }

    if (session.geminiWs) {
      session.geminiWs.close();
      session.geminiWs = null;
    }

    session.isConnected = false;
  } catch (error) {
    console.error('Error ending Gemini Live session:', error);
  }
}

function generateSessionId(): string {
  return `gemini_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}