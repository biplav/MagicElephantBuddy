import { GoogleGenerativeAI } from "@google/generative-ai";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { APPU_SYSTEM_PROMPT } from "@shared/appuPrompts";
import { getCurrentTimeContext, DEFAULT_PROFILE } from "@shared/childProfile";
import { memoryService } from './memory-service';

interface GeminiLiveSession {
  ws: WebSocket;
  geminiWs: WebSocket | null;
  isConnected: boolean;
  conversationId: number | null;
  childId: number;
  sessionStartTime: Date;
  messageCount: number;
}

// Memory formation helper functions (shared with realtime service)
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
          `Appu provided encouragement: "${content.slice(0, 100)}..."`,
          'relationship',
          {
            conversationId,
            emotionalTone: 'encouraging',
            importance_score: 0.6
          }
        );
      }
    }
  } catch (error) {
    console.error('Error forming memory from content:', error);
  }
}

function extractConcepts(text: string): string[] {
  const concepts: string[] = [];
  const lowerText = text.toLowerCase();
  
  // Educational concepts
  const educationalTerms = ['count', 'number', 'color', 'shape', 'letter', 'word', 'math', 'read'];
  educationalTerms.forEach(term => {
    if (lowerText.includes(term)) concepts.push(term);
  });
  
  // Interest topics
  const interests = ['dinosaur', 'animal', 'story', 'song', 'game', 'family', 'friend'];
  interests.forEach(interest => {
    if (lowerText.includes(interest)) concepts.push(interest);
  });
  
  return concepts;
}

function containsLearningContent(text: string): boolean {
  const learningIndicators = ['count', 'learn', 'teach', 'show', 'how', 'what', 'why', 'number', 'letter', 'color'];
  return learningIndicators.some(indicator => text.toLowerCase().includes(indicator));
}

function detectEmotion(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('happy') || lowerText.includes('excited') || lowerText.includes('fun')) return 'happy';
  if (lowerText.includes('sad') || lowerText.includes('cry')) return 'sad';
  if (lowerText.includes('angry') || lowerText.includes('mad')) return 'angry';
  if (lowerText.includes('scared') || lowerText.includes('afraid')) return 'scared';
  if (lowerText.includes('tired') || lowerText.includes('sleepy')) return 'tired';
  
  return null;
}

// Function to create enhanced system prompt with child profile and learning milestones for Gemini
async function createEnhancedGeminiPrompt(childId: number): Promise<string> {
  try {
    // Get child profile
    const child = await storage.getChild(childId);
    const childProfile = child?.profile || DEFAULT_PROFILE;
    
    // Get learning milestones for the child
    const milestones = await storage.getMilestonesByChild(childId);
    
    // Get recent memories and child context
    const childContext = await memoryService.getChildContext(childId);
    const recentMemories = await memoryService.retrieveMemories({
      query: '',
      childId,
      limit: 5,
      timeframe: 'week'
    });
    
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
      
      // Group milestones by type
      const types = Array.from(new Set(milestones.map(m => m.milestoneType)));
      
      types.forEach(type => {
        const typeMilestones = milestones.filter(m => m.milestoneType === type);
        result += `\n\n${type.toUpperCase()} MILESTONES:`;
        
        typeMilestones.forEach(milestone => {
          const progressText = milestone.isCompleted 
            ? '✅ COMPLETED' 
            : `📈 Progress: ${milestone.currentProgress}/${milestone.targetValue || 'target'}`;
          
          result += `\n- ${milestone.milestoneDescription}`;
          result += `\n  Status: ${progressText}`;
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
    
    // Generate memory context section
    const generateMemorySection = (): string => {
      if (!recentMemories || recentMemories.length === 0) {
        return '\n\nMEMORY CONTEXT:\n- No recent conversation memories available. Start building rapport with the child.\n';
      }
      
      let result = '\n\nMEMORY CONTEXT AND PERSONALIZATION:\n';
      result += 'Recent conversation memories to reference for personalized interactions:\n';
      
      recentMemories.forEach((memory, index) => {
        const typeIndicator = memory.type === 'conversational' ? '💬' : 
                             memory.type === 'learning' ? '📚' : 
                             memory.type === 'emotional' ? '😊' : 
                             memory.type === 'relationship' ? '🤝' : '💭';
        result += `- ${typeIndicator} ${memory.content}\n`;
      });
      
      result += '\nCHILD CONTEXT INSIGHTS:\n';
      result += `- Active interests: ${childContext.activeInterests.join(', ')}\n`;
      result += `- Communication style: ${childContext.personalityProfile.communication_style}\n`;
      result += `- Relationship level: ${childContext.relationshipLevel}/10\n`;
      if (childContext.emotionalState) {
        result += `- Current emotional state: ${childContext.emotionalState}\n`;
      }
      
      result += '\nMEMORY USAGE GUIDANCE:\n';
      result += '- Reference past conversations naturally to show you remember the child\n';
      result += '- Build on previous interests and topics the child has shown enthusiasm for\n';
      result += '- Acknowledge emotional states and continue building positive relationships\n';
      result += '- Use memories to make conversations feel continuous and personalized\n';
      
      return result;
    };
    
    const memoryInfo = generateMemorySection();

    return APPU_SYSTEM_PROMPT + dateTimeInfo + profileInfo + milestonesInfo + memoryInfo;
    
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

    // Form memory from child's input
    await formMemoryFromContent(
      session.childId,
      text,
      'user',
      session.conversationId
    );
    console.log(`Memory formed from child input: "${text.slice(0, 50)}..."`);

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

    // Form memory from Appu's response
    await formMemoryFromContent(
      session.childId,
      responseText,
      'assistant',
      session.conversationId
    );
    console.log(`Memory formed from Appu's response: "${responseText.slice(0, 50)}..."`);

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
    console.log('WebSocket state:', ws.readyState);
    
    // Send immediate confirmation that connection is established
    ws.send(JSON.stringify({
      type: 'connection_established',
      message: 'Gemini WebSocket connected successfully'
    }));
    
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
            // Set child ID from message if provided
            if (message.childId) {
              session.childId = message.childId;
              console.log(`Gemini session child ID set to: ${session.childId}`);
            }
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
            console.log(`📹 GEMINI: Received video frame from client - Size: ${message.frameData?.length || 0} bytes`);
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