import { GoogleGenerativeAI } from "@google/generative-ai";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { APPU_SYSTEM_PROMPT } from "@shared/appuPrompts";
import { getCurrentTimeContext, DEFAULT_PROFILE } from "@shared/childProfile";
import { memoryService } from './memory-service';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Audio processing helper function
async function handleAudioChunk(session: GeminiLiveSession, audioData: string) {
  try {
    // Convert base64 audio to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    // Create temporary file for audio processing
    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFile = path.join(tempDir, `audio_${Date.now()}.webm`);
    fs.writeFileSync(tempFile, audioBuffer);
    
    // Transcribe using OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: "whisper-1",
      language: "en" // or "hi" for Hindi
    });
    
    // Clean up temporary file
    fs.unlinkSync(tempFile);
    
    const text = transcription.text;
    console.log(`Transcribed audio: ${text}`);
    
    if (text.trim()) {
      // Send transcription to client
      session.ws.send(JSON.stringify({
        type: 'transcription',
        text: text,
        conversationId: session.conversationId
      }));
      
      // Process the transcribed text using Gemini
      await processAudioTranscription(session, text);
    }
    
  } catch (error) {
    console.error('Error handling audio chunk:', error);
    session.ws.send(JSON.stringify({
      type: 'error',
      error: 'Failed to process audio'
    }));
  }
}

// Process transcribed audio and generate audio response
async function processAudioTranscription(session: GeminiLiveSession, text: string) {
  try {
    // Store child's message
    await storage.createMessage({
      conversationId: session.conversationId!,
      type: 'child_input',
      content: text,
      transcription: text
    });

    // Form memory from child's input
    await formMemoryFromContent(
      session.childId,
      text,
      'user',
      session.conversationId!
    );

    // Check if the text contains a request for video capture
    const videoRequestTriggers = [
      'look at this', 'can you see', 'what do you see', 'dekho', 'see this',
      'show you', 'i spy', 'color', 'shape', 'what is this'
    ];
    
    const requestsVideo = videoRequestTriggers.some(trigger => 
      text.toLowerCase().includes(trigger.toLowerCase())
    );
    
    if (requestsVideo) {
      // Request video capture from client
      session.ws.send(JSON.stringify({
        type: 'video_capture_requested',
        call_id: `gemini_${Date.now()}`,
        reason: 'Child wants to show something'
      }));
    }

    // Generate response using Gemini
    const chat = (session as any).geminiChat;
    const result = await chat.sendMessage(text);
    const responseText = result.response.text();

    console.log(`Gemini Live response: ${responseText}`);

    // Store Appu's response
    await storage.createMessage({
      conversationId: session.conversationId!,
      type: 'appu_response',
      content: responseText
    });

    // Form memory from Appu's response
    await formMemoryFromContent(
      session.childId,
      responseText,
      'assistant',
      session.conversationId!
    );

    // Generate audio response using OpenAI TTS
    const speechResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova", // Child-friendly voice
      input: responseText
    });

    // Convert audio response to base64
    const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
    const audioBase64 = audioBuffer.toString('base64');

    // Update conversation message count
    session.messageCount += 2;
    await storage.updateConversation(session.conversationId!, {
      totalMessages: session.messageCount
    });

    // Send audio response back to client
    session.ws.send(JSON.stringify({
      type: 'audio_response',
      audioData: audioBase64,
      text: responseText,
      conversationId: session.conversationId
    }));

    console.log(`Processed audio conversation ${session.conversationId}`);
  } catch (error) {
    console.error('Error processing audio transcription:', error);
    session.ws.send(JSON.stringify({
      type: 'error',
      error: 'Failed to process audio transcription'
    }));
  }
}

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

// Analyze video frame with Gemini's vision capabilities (for on-demand capture)
async function analyzeGeminiVideoFrame(frameData: string): Promise<string> {
  try {
    console.log(`Gemini analyzing video frame: ${frameData.slice(0, 50)}...`);
    
    // Use Gemini's vision model to analyze the frame
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
    
    return visionResponse;

  } catch (error) {
    console.error('Error analyzing video frame:', error);
    return "I'm having trouble seeing what you're showing me right now. Can you try again?";
  }
}

async function startGeminiLiveSession(session: GeminiLiveSession) {
  try {
    console.log('Starting Gemini Live session');
    
    // Check if Google API key is available
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('Google API key not found');
    }
    
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
      error: `Failed to start session: ${error.message}`
    }));
    
    // Close the WebSocket connection on error
    session.ws.close();
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

    // Check if the text contains a request for video capture
    const videoRequestTriggers = [
      'look at this', 'can you see', 'what do you see', 'dekho', 'see this',
      'show you', 'i spy', 'color', 'shape', 'what is this'
    ];
    
    const requestsVideo = videoRequestTriggers.some(trigger => 
      text.toLowerCase().includes(trigger.toLowerCase())
    );
    
    if (requestsVideo) {
      // Request video capture from client
      session.ws.send(JSON.stringify({
        type: 'video_capture_requested',
        call_id: `gemini_${Date.now()}`,
        reason: 'Child wants to show something'
      }));
    }

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
  console.log('Setting up Gemini Live WebSocket server...');
  
  // Create WebSocket server with noServer option
  const wss = new WebSocketServer({ 
    noServer: true
  });

  console.log('Gemini Live WebSocket server initialized');

  // Handle upgrade event manually
  server.on('upgrade', (request: any, socket: any, head: any) => {
    console.log('Upgrade request received for:', request.url);
    console.log('Request headers:', request.headers);
    
    if (request.url === '/gemini-ws') {
      console.log('Handling WebSocket upgrade for /gemini-ws');
      
      try {
        wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          console.log('WebSocket connection established for /gemini-ws');
          wss.emit('connection', ws, request);
        });
      } catch (error) {
        console.error('Error handling WebSocket upgrade:', error);
        socket.destroy();
      }
    } else {
      console.log('Destroying socket for non-WebSocket request:', request.url);
      socket.destroy();
    }
  });

  wss.on('error', (error) => {
    console.error('WebSocket Server error:', error);
  });

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

    // Send immediate connection confirmation
    try {
      ws.send(JSON.stringify({
        type: 'connection_established',
        timestamp: new Date().toISOString()
      }));
      console.log('Sent connection_established message');
    } catch (error) {
      console.error('Error sending connection_established message:', error);
    }

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received Gemini Live message:', message.type);

        switch (message.type) {
          case 'start_session':
            console.log('Processing start_session message');
            await startGeminiLiveSession(session);
            break;
          
          case 'audio_chunk':
            if (session.isConnected && session.conversationId) {
              // Process audio chunk using OpenAI Whisper for transcription
              await handleAudioChunk(session, message.audioData);
            }
            break;
          
          case 'video_frame':
            // Video frames are now handled on-demand via function calls - ignore continuous frames
            console.log('Ignoring continuous video frame - using on-demand capture instead');
            break;
            
          case 'video_capture_response':
            // Handle video frame captured in response to AI request
            if (session.isConnected && session.conversationId && message.frameData && message.call_id) {
              try {
                console.log('Processing on-demand video capture for Gemini...');
                
                // Analyze the frame with Gemini's vision model
                const visionResponse = await analyzeGeminiVideoFrame(message.frameData);
                
                // Send function response back to client (Gemini Live doesn't have direct function call returns)
                session.ws.send(JSON.stringify({
                  type: 'vision_response',
                  text: visionResponse,
                  conversationId: session.conversationId,
                  call_id: message.call_id
                }));
                
                // Store vision analysis in database
                await storage.createMessage({
                  conversationId: session.conversationId,
                  type: 'vision_analysis',
                  content: `Vision: ${visionResponse}`
                });
                
              } catch (error) {
                console.error('Error processing video capture:', error);
                
                // Send error response to client
                session.ws.send(JSON.stringify({
                  type: 'vision_error',
                  error: 'Unable to process video capture',
                  call_id: message.call_id
                }));
              }
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
      // Send error details to client if connection is still open
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'WebSocket connection error'
        }));
      }
    });
  });

  return wss;
}