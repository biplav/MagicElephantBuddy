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
  geminiChat?: any; // Store the Gemini chat instance
}

// Helper functions for memory formation
function extractConcepts(content: string): string[] {
  const concepts = [];
  const lowerContent = content.toLowerCase();
  
  // Basic concept extraction
  const conceptWords = ['dinosaur', 'color', 'number', 'alphabet', 'animal', 'food', 'story', 'song', 'game'];
  for (const concept of conceptWords) {
    if (lowerContent.includes(concept)) {
      concepts.push(concept);
    }
  }
  
  return concepts;
}

function containsLearningContent(content: string): boolean {
  const learningIndicators = ['count', 'alphabet', 'color', 'shape', 'number', 'learn', 'teach'];
  return learningIndicators.some(indicator => content.toLowerCase().includes(indicator));
}

function detectEmotion(content: string): string | null {
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('happy') || lowerContent.includes('joy') || lowerContent.includes('excited')) return 'happy';
  if (lowerContent.includes('sad') || lowerContent.includes('cry')) return 'sad';
  if (lowerContent.includes('scared') || lowerContent.includes('afraid')) return 'scared';
  if (lowerContent.includes('angry') || lowerContent.includes('mad')) return 'angry';
  
  return null;
}

async function formMemoryFromContent(childId: number, content: string, role: 'user' | 'assistant', conversationId: number) {
  try {
    if (role === 'user') {
      // Child's message - analyze for interests, emotions, learning content
      const childMessage = content.toLowerCase();
      
      // Detect conversational memories
      if (childMessage.includes('love') || childMessage.includes('like') || childMessage.includes('favorite')) {
        await memoryService.createMemory(
          childId,
          `Child expressed interest: "${content}"`,
          'conversational',
          {
            conversationId,
            emotionalTone: 'positive',
            concepts: extractConcepts(content),
            importance_score: 0.7
          }
        );
      }
      
      // Detect learning content
      if (containsLearningContent(content)) {
        await memoryService.createMemory(
          childId,
          `Learning interaction: "${content}"`,
          'learning',
          {
            conversationId,
            concepts: extractConcepts(content),
            learning_outcome: 'engagement'
          }
        );
      }
      
      // Detect emotional expressions
      const emotion = detectEmotion(content);
      if (emotion) {
        await memoryService.createMemory(
          childId,
          `Child showed ${emotion} emotion: "${content}"`,
          'emotional',
          {
            conversationId,
            emotionalTone: emotion,
            concepts: [emotion]
          }
        );
      }
      
    } else {
      // Appu's response - track teaching moments and relationship building
      if (content.includes('great job') || content.includes('wonderful') || content.includes('proud')) {
        await memoryService.createMemory(
          childId,
          `Appu provided encouragement: "${content}"`,
          'conversational',
          {
            conversationId,
            emotionalTone: 'supportive',
            concepts: ['encouragement', 'learning'],
            importance_score: 0.6
          }
        );
      }
    }
  } catch (error: any) {
    geminiLogger.error('Error forming memory from content', { 
      error: error.message, 
      childId, 
      role,
      conversationId 
    });
  }
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

    // Create session object
    const session: GeminiLiveSession = {
      ws: ws,
      geminiWs: null,
      isConnected: false,
      conversationId: null,
      childId: 1, // Default child ID, will be updated from message
      sessionStartTime: new Date(),
      messageCount: 0
    };

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        geminiLogger.debug('Received Gemini Live message', { messageType: message.type });

        switch (message.type) {
          case 'start_session':
            // Set child ID from message if provided
            if (message.childId) {
              session.childId = message.childId;
              geminiLogger.info('Gemini session child ID set', { childId: session.childId });
            }
            await startGeminiLiveSession(session);
            break;

          case 'text_input':
            if (session.isConnected && message.text) {
              await handleGeminiTextInput(session, message.text);
            }
            break;

          case 'end_session':
            await endGeminiLiveSession(session);
            break;

          default:
            geminiLogger.warn('Unknown message type received', { messageType: message.type });
        }
      } catch (error: any) {
        geminiLogger.error('Error processing WebSocket message', { 
          error: error.message, 
          conversationId: session.conversationId 
        });
        ws.send(JSON.stringify({
          type: 'error',
          message: `Error processing message: ${error.message}`
        }));
      }
    });

    ws.on('close', async () => {
      geminiLogger.info('Gemini Live WebSocket connection closed', { 
        conversationId: session.conversationId 
      });
      await endGeminiLiveSession(session);
    });

    ws.on('error', (error: any) => {
      geminiLogger.error('Gemini Live WebSocket error', { 
        error: error.message, 
        conversationId: session.conversationId 
      });
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

async function startGeminiLiveSession(session: GeminiLiveSession) {
  try {
    geminiLogger.info('Starting Gemini Live session', { childId: session.childId });

    // Create or get conversation
    const conversation = await storage.createConversation({
      childId: session.childId,
      aiProvider: 'gemini-live',
      modelUsed: 'gemini-2.0-flash-exp'
    });
    
    session.conversationId = conversation.id;
    geminiLogger.info('Conversation created', { conversationId: session.conversationId });

    // Get child profile for enhanced prompt
    const child = await storage.getChildById(session.childId);
    if (!child) {
      throw new Error(`Child with ID ${session.childId} not found`);
    }

    // Generate enhanced system prompt with child's details and memories
    const timeContext = getCurrentTimeContext();
    const profile = child.profile || DEFAULT_PROFILE;
    
    // Get relevant memories for context
    const memories = await memoryService.searchMemories(session.childId, 'general conversation', { limit: 10 });
    const memoryContext = memories.length > 0 
      ? `\n\nRecent memories about ${child.name}:\n${memories.map(m => `- ${m.content}`).join('\n')}`
      : '';

    const enhancedSystemPrompt = `${APPU_SYSTEM_PROMPT}

Current time context: ${timeContext}

Child Profile:
- Name: ${child.name} (${profile.nick_name ? `nickname: ${profile.nick_name}` : ''})
- Age: ${child.age} years old
- Languages: ${profile.preferredLanguages?.join(', ') || 'Hindi, English'}
- Likes: ${profile.likes?.join(', ') || 'various things'}
- Dislikes: ${profile.dislikes?.join(', ') || 'some things'}
- Favorite things: ${JSON.stringify(profile.favoriteThings, null, 2)}
- Learning goals: ${profile.learningGoals?.join(', ') || 'general development'}
- Daily routine: Wake up at ${profile.dailyRoutine?.wakeUpTime || '7:00 AM'}, bed time at ${profile.dailyRoutine?.bedTime || '8:00 PM'}
${memoryContext}

Remember to use the child's name naturally in conversation and reference their interests and learning goals when appropriate.`;

    // Initialize Gemini model
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
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
    session.geminiChat = chat;
    session.isConnected = true;

    // Send session started confirmation
    session.ws.send(JSON.stringify({
      type: 'session_started',
      conversationId: session.conversationId
    }));

    geminiLogger.info('Gemini Live session started successfully', { 
      conversationId: session.conversationId, 
      childId: session.childId 
    });
  } catch (error: any) {
    geminiLogger.error('Error starting Gemini Live session', { 
      error: error.message, 
      childId: session.childId 
    });
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

    geminiLogger.info('Processing text input', { 
      textLength: text.length, 
      conversationId: session.conversationId,
      childId: session.childId 
    });
    
    // Store child's message
    await storage.createMessage({
      conversationId: session.conversationId,
      type: 'child_input',
      content: text,
      transcription: text
    });

    // Form memory from child's input
    await formMemoryFromContent(
      session.childId,
      text,
      'user',
      session.conversationId
    );

    // Generate response using Gemini
    const chat = session.geminiChat;
    const result = await chat.sendMessage(text);
    const responseText = result.response.text();

    geminiLogger.info('Generated Gemini response', { 
      responseLength: responseText.length, 
      conversationId: session.conversationId 
    });

    // Store Appu's response
    await storage.createMessage({
      conversationId: session.conversationId,
      type: 'appu_response',
      content: responseText
    });

    // Form memory from Appu's response
    await formMemoryFromContent(
      session.childId,
      responseText,
      'assistant',
      session.conversationId
    );

    // Send response to client
    session.ws.send(JSON.stringify({
      type: 'text_response',
      text: responseText,
      conversationId: session.conversationId
    }));

    session.messageCount++;
    geminiLogger.debug('Text response sent successfully', { 
      conversationId: session.conversationId,
      messageCount: session.messageCount 
    });

  } catch (error: any) {
    geminiLogger.error('Error handling text input', { 
      error: error.message, 
      conversationId: session.conversationId 
    });
    session.ws.send(JSON.stringify({
      type: 'error',
      error: 'Failed to process text input'
    }));
  }
}

async function endGeminiLiveSession(session: GeminiLiveSession) {
  try {
    if (session.conversationId) {
      // Update conversation end time and duration
      const duration = Math.floor((Date.now() - session.sessionStartTime.getTime()) / 1000);
      await storage.updateConversation(session.conversationId, {
        endedAt: new Date(),
        duration: duration
      });

      geminiLogger.info('Gemini Live session ended', { 
        conversationId: session.conversationId,
        duration: `${duration}s`,
        messageCount: session.messageCount
      });
    }

    // Reset session state
    session.isConnected = false;
    session.geminiChat = null;
    session.conversationId = null;
  } catch (error: any) {
    geminiLogger.error('Error ending Gemini Live session', { 
      error: error.message, 
      conversationId: session.conversationId 
    });
  }
}