
import { WebSocket } from 'ws';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "./storage";
import { APPU_SYSTEM_PROMPT } from "@shared/appuPrompts";
import { getCurrentTimeContext } from "@shared/childProfile";
import { memoryFormationService } from './memory-formation-service';
import { createServiceLogger } from './logger';

const sessionLogger = createServiceLogger('gemini-session');

export interface GeminiLiveSession {
  ws: WebSocket;
  geminiWs: WebSocket | null;
  isConnected: boolean;
  conversationId: number | null;
  childId: number;
  sessionStartTime: Date;
  messageCount: number;
  geminiChat?: any;
}

export class GeminiSessionManager {
  
  async startSession(session: GeminiLiveSession): Promise<void> {
    try {
      sessionLogger.info('🚀 Starting FULL Gemini Live session with chat', { childId: session.childId });

      // Create or get conversation
      const conversation = await storage.createConversation({
        childId: session.childId
      });
      
      session.conversationId = conversation.id;
      sessionLogger.info('Conversation created for Gemini Live session', { 
        conversationId: session.conversationId,
        childId: session.childId 
      });

      // Get child profile for enhanced prompt
      const child = await storage.getChild(session.childId);
      if (!child) {
        throw new Error(`Child with ID ${session.childId} not found`);
      }

      // Generate enhanced system prompt with child's details
      const timeContext = getCurrentTimeContext();
      const profile = child.profile as any || {};
      
      const enhancedSystemPrompt = `${APPU_SYSTEM_PROMPT}

Current time context: ${timeContext}

Child Profile:
- Name: ${child.name} (${profile.nick_name ? `nickname: ${profile.nick_name}` : ''})
- Age: ${child.age} years old
- Languages: ${profile.preferredLanguages?.join(', ') || 'Hindi, English'}
- Likes: ${profile.likes?.join(', ') || 'various things'}
- Dislikes: ${profile.dislikes?.join(', ') || 'some things'}
- Learning goals: ${profile.learningGoals?.join(', ') || 'general development'}

Remember to use the child's name naturally in conversation and reference their interests when appropriate.`;

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
        conversationId: session.conversationId,
        message: 'Gemini Live session started successfully!'
      }));
      
      sessionLogger.info('✅ Gemini Live session with chat initialized', { 
        conversationId: session.conversationId,
        childId: session.childId,
        childName: child.name
      });

    } catch (error: any) {
      sessionLogger.error('Error starting Gemini Live session', { 
        error: error.message, 
        childId: session.childId 
      });
      session.ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to start session'
      }));
    }
  }

  async handleTextInput(session: GeminiLiveSession, text: string): Promise<void> {
    try {
      if (!session.isConnected || !session.conversationId) {
        throw new Error('Session not properly initialized');
      }

      sessionLogger.info('Processing text input', { 
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
      await memoryFormationService.formMemoryFromContent(
        session.childId,
        text,
        'user',
        session.conversationId
      );

      // Generate response using Gemini
      const chat = session.geminiChat;
      const result = await chat.sendMessage(text);
      const responseText = result.response.text();

      sessionLogger.info('Generated Gemini response', { 
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
      await memoryFormationService.formMemoryFromContent(
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
      sessionLogger.debug('Text response sent successfully', { 
        conversationId: session.conversationId,
        messageCount: session.messageCount 
      });

    } catch (error: any) {
      sessionLogger.error('Error handling text input', { 
        error: error.message, 
        conversationId: session.conversationId 
      });
      session.ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process text input'
      }));
    }
  }

  async endSession(session: GeminiLiveSession): Promise<void> {
    try {
      if (session.conversationId) {
        // Update conversation end time and duration
        const duration = Math.floor((Date.now() - session.sessionStartTime.getTime()) / 1000);
        await storage.updateConversation(session.conversationId, {
          endTime: new Date(),
          duration: duration
        });

        sessionLogger.info('Gemini Live session ended', { 
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
      sessionLogger.error('Error ending Gemini Live session', { 
        error: error.message, 
        conversationId: session.conversationId 
      });
    }
  }
}

export const geminiSessionManager = new GeminiSessionManager();
