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
          for (const [subKey, subValue] of Object.entries(value)) {
            const subDisplayKey = subKey.charAt(0).toUpperCase() + subKey.slice(1).replace(/([A-Z])/g, ' $1');
            if (Array.isArray(subValue)) {
              result += `  * ${subDisplayKey}: ${subValue.join(', ')}\n`;
            } else {
              result += `  * ${subDisplayKey}: ${subValue}\n`;
            }
          }
        } else {
          result += `- ${displayKey}: ${value}\n`;
        }
      }
      return result;
    };
    
    // Generate milestones information
    const generateMilestonesSection = (): string => {
      if (!milestones || milestones.length === 0) {
        return '\n\nLEARNING MILESTONES:\nNo specific milestones set for this child yet.';
      }
      
      let result = '\n\nLEARNING MILESTONES:';
      
      // Group milestones by category
      const categories = [...new Set(milestones.map(m => m.category))];
      
      categories.forEach(category => {
        const categoryMilestones = milestones.filter(m => m.category === category);
        result += `\n\n${category.toUpperCase()} MILESTONES:`;
        
        categoryMilestones.forEach(milestone => {
          const progressText = milestone.isCompleted 
            ? '✅ COMPLETED' 
            : `📈 Progress: ${milestone.currentProgress}/${milestone.targetValue}`;
          
          result += `\n- ${milestone.title}: ${milestone.description}`;
          result += `\n  Status: ${progressText}`;
          if (milestone.parentNotes) {
            result += `\n  Parent Notes: ${milestone.parentNotes}`;
          }
        });
      });
      
      result += '\n\nWhen chatting, naturally encourage progress on incomplete milestones and celebrate completed ones!';
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

// Video frame handler
async function handleGeminiVideoFrame(session: GeminiLiveSession, frameData: string) {
  try {
    if (!session.isConnected || !session.conversationId) {
      console.log('Video frame received but session not ready');
      return;
    }

    console.log(`Gemini Live processing video frame: ${frameData.slice(0, 50)}...`);
    
    // For now, we'll analyze the video frame with Gemini's vision capabilities
    // In a full Live API implementation, this would be handled differently
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Create a multimodal input with the video frame
    const prompt = "What do you see in this image? Please describe it briefly in a child-friendly way, as if you're Appu the elephant talking to a young child.";
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: frameData,
          mimeType: "image/jpeg"
        }
      }
    ]);

    const visionResponse = result.response.text();
    console.log(`Gemini vision response: ${visionResponse}`);

    // Send vision response back to client (this could be combined with other responses)
    session.ws.send(JSON.stringify({
      type: 'vision_response',
      text: visionResponse,
      conversationId: session.conversationId
    }));

    // Optional: Store vision analysis as a message
    await storage.createMessage({
      conversationId: session.conversationId,
      type: 'vision_analysis',
      content: `Vision: ${visionResponse}`
    });

  } catch (error) {
    console.error('Error handling Gemini video frame:', error);
    // Don't send error to client for vision processing - it's supplementary
  }
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
    session.conversationId = null;
    
    console.log('Gemini Live session ended');
  } catch (error) {
    console.error('Error ending Gemini Live session:', error);
  }
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
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
          
          case 'video_frame':
            await handleGeminiVideoFrame(session, message.frameData);
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