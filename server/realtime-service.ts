import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import OpenAI from 'openai';
import { storage } from './storage';
import { DEFAULT_PROFILE } from '../shared/childProfile';
import { APPU_SYSTEM_PROMPT } from '../shared/appuPrompts';

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

// Function to create enhanced system prompt with child profile and learning milestones
async function createEnhancedRealtimePrompt(childId: number): Promise<string> {
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
    console.error('Error creating enhanced realtime prompt:', error);
    // Fallback to basic prompt if there's an error
    return APPU_SYSTEM_PROMPT;
  }
}

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
    
    // Create enhanced system prompt with milestone details
    const enhancedPrompt = await createEnhancedRealtimePrompt(session.childId);
    console.log('Enhanced Realtime Prompt with Milestones prepared for child:', session.childId);
    
    // Connect to OpenAI Realtime API with WebSocket
    const realtimeUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
    
    session.openaiWs = new WebSocket(realtimeUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    session.openaiWs.on('open', () => {
      console.log('Connected to OpenAI Realtime API');
      session.isConnected = true;
      
      // Send session configuration with enhanced prompt
      session.openaiWs!.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: enhancedPrompt,
          voice: 'nova',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200
          },
          tools: [],
          tool_choice: 'none',
          temperature: 0.8
        }
      }));

      // Notify client that session is ready
      session.ws.send(JSON.stringify({ 
        type: 'session_started',
        message: 'Connected to Realtime API with learning milestone context'
      }));
    });

    session.openaiWs.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle different message types from OpenAI
        switch (message.type) {
          case 'conversation.item.input_audio_transcription.completed':
            // Store transcribed input in database
            if (session.conversationId) {
              await storage.createMessage({
                conversationId: session.conversationId,
                type: 'child_input',
                content: message.transcript,
                transcription: message.transcript
              });
              session.messageCount++;
            }
            break;
            
          case 'response.audio_transcript.done':
            // Store AI response in database
            if (session.conversationId) {
              await storage.createMessage({
                conversationId: session.conversationId,
                type: 'appu_response',
                content: message.transcript,
                transcription: null
              });
              session.messageCount++;
            }
            break;
        }
        
        // Forward all messages from OpenAI to client
        session.ws.send(data.toString());
        
      } catch (error) {
        console.error('Error processing OpenAI message:', error);
      }
    });

    session.openaiWs.on('error', (error) => {
      console.error('OpenAI Realtime API error:', error);
      session.ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Realtime API connection error' 
      }));
    });

    session.openaiWs.on('close', () => {
      console.log('OpenAI Realtime API connection closed');
      session.isConnected = false;
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