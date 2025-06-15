import { GoogleGenerativeAI } from "@google/generative-ai";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { APPU_SYSTEM_PROMPT } from "@shared/appuPrompts";
import { getCurrentTimeContext, DEFAULT_PROFILE } from "@shared/childProfile";

interface GeminiLiveSession {
  ws: WebSocket;
  geminiWs: WebSocket | null;
  isConnected: boolean;
  conversationId: number | null;
  childId: number;
  sessionStartTime: Date;
  messageCount: number;
}

// Function to create enhanced system prompt with child profile and learning milestones for Gemini
async function createEnhancedGeminiPrompt(childId: number): Promise<string> {
  try {
    // Get child profile
    const child = await storage.getChild(childId);
    const childProfile = child?.profile || DEFAULT_PROFILE;
    
    // Get learning milestones for the child
    const milestones = await storage.getMilestonesByChild(childId);
    
    // Generate current date and time information
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    };
    const currentDateTime = now.toLocaleDateString('en-US', options);
    const timeOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : now.getHours() < 20 ? 'evening' : 'night';
    
    // Generate profile information
    const generateProfileSection = (obj: any): string => {
      let result = '';
      for (const [key, value] of Object.entries(obj)) {
        const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
        
        if (Array.isArray(value)) {
          result += `- ${displayKey}: ${value.join(', ')}\n`;
        } else if (typeof value === 'object' && value !== null) {
          result += `- ${displayKey}:\n`;
          const subItems = generateProfileSection(value);
          result += subItems.split('\n').map(line => line ? `  ${line}` : '').join('\n') + '\n';
        } else {
          result += `- ${displayKey}: ${value}\n`;
        }
      }
      return result;
    };

    // Generate learning milestones section
    const generateMilestonesSection = (): string => {
      if (!milestones || milestones.length === 0) {
        return '\nLEARNING MILESTONES:\n- No specific milestones tracked yet. Focus on general age-appropriate learning activities.\n';
      }

      let result = '\nLEARNING MILESTONES AND PROGRESS:\n';
      
      const activeMilestones = milestones.filter((m: any) => !m.isCompleted);
      const completedMilestones = milestones.filter((m: any) => m.isCompleted);
      
      if (activeMilestones.length > 0) {
        result += '\nCurrent Learning Goals:\n';
        activeMilestones.forEach((milestone: any) => {
          const progressPercent = milestone.targetValue ? Math.round((milestone.currentProgress / milestone.targetValue) * 100) : 0;
          result += `- ${milestone.milestoneDescription} (${progressPercent}% complete - ${milestone.currentProgress}/${milestone.targetValue})\n`;
        });
      }
      
      if (completedMilestones.length > 0) {
        result += '\nCompleted Achievements:\n';
        completedMilestones.forEach((milestone: any) => {
          const completedDate = milestone.completedAt ? new Date(milestone.completedAt).toLocaleDateString() : 'Recently';
          result += `- ✅ ${milestone.milestoneDescription} (Completed: ${completedDate})\n`;
        });
      }
      
      result += '\nMILESTONE GUIDANCE:\n';
      result += '- Reference these milestones during conversations to encourage progress\n';
      result += '- Celebrate achievements and progress made\n';
      result += '- Incorporate learning activities that support current goals\n';
      result += '- Use age-appropriate language to discuss progress\n';
      
      return result;
    };

    const dateTimeInfo = `

CURRENT DATE AND TIME INFORMATION:
- Current Date & Time: ${currentDateTime}
- Time of Day: ${timeOfDay}
- Use this information to provide contextually appropriate responses based on the time of day and current date.`;

    const profileInfo = `

CHILD PROFILE INFORMATION:
${generateProfileSection(childProfile)}
Use this information to personalize your responses and make them more engaging for ${(childProfile as any).name || 'the child'}.`;

    const milestonesInfo = generateMilestonesSection();

    return APPU_SYSTEM_PROMPT + dateTimeInfo + profileInfo + milestonesInfo;
    
  } catch (error) {
    console.error('Error creating enhanced Gemini prompt:', error);
    // Fallback to basic prompt if there's an error
    return APPU_SYSTEM_PROMPT;
  }
}

export function setupGeminiLiveWebSocket(server: any) {
  const wss = new WebSocketServer({ 
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
      totalMessages: 0
    });
    
    session.conversationId = conversation.id;
    console.log(`Created conversation ${conversation.id} for Gemini Live session`);

    // Initialize Gemini client
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    
    // Create enhanced system prompt with milestone details
    const enhancedSystemPrompt = await createEnhancedGeminiPrompt(session.childId);
    
    const liveConversationGuidance = `

LIVE CONVERSATION GUIDANCE:
- Keep responses very short (1-2 sentences) for live audio
- Speak naturally in simple Hinglish
- Reference learning milestones naturally during conversation
- Encourage progress on current learning goals when appropriate`;
    
    const finalPrompt = enhancedSystemPrompt + liveConversationGuidance;

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