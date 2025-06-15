import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from 'ws';
import { transcribeAudio, generateResponse, generateSpeech, createAIService, AI_CONFIGS } from "./openai-service";
import { setupRealtimeWebSocket } from "./realtime-service";
import { setupGeminiLiveWebSocket } from "./gemini-live-service";
import bodyParser from "body-parser";
import { getErrorMessage } from "../shared/errorMessages";
import { APPU_SYSTEM_PROMPT } from "../shared/appuPrompts";
import { DEFAULT_PROFILE } from "../shared/childProfile";
import { seedDatabase } from "./seed";

// Define a custom interface for the request with file
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Configure multer for audio uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Function to create enhanced system prompt with child profile
function createEnhancedSystemPrompt(): string {
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
  
  // Dynamically generate profile information from DEFAULT_PROFILE keys
  const generateProfileSection = (obj: any, prefix = ''): string => {
    let result = '';
    
    for (const [key, value] of Object.entries(obj)) {
      const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
      
      if (Array.isArray(value)) {
        result += `- ${displayKey}: ${value.join(', ')}\n`;
      } else if (typeof value === 'object' && value !== null) {
        result += `- ${displayKey}:\n`;
        const subItems = generateProfileSection(value, '  ');
        result += subItems.split('\n').map(line => line ? `  ${line}` : '').join('\n') + '\n';
      } else {
        result += `- ${displayKey}: ${value}\n`;
      }
    }
    
    return result;
  };

  const dateTimeInfo = `

CURRENT DATE AND TIME INFORMATION:
- Current Date & Time: ${currentDateTime}
- Time of Day: ${timeOfDay}
- Use this information to provide contextually appropriate responses based on the time of day and current date.`;

  const profileInfo = `

CHILD PROFILE INFORMATION:
${generateProfileSection(DEFAULT_PROFILE)}
Use this information to personalize your responses and make them more engaging for ${DEFAULT_PROFILE.name}.`;
  console.log(APPU_SYSTEM_PROMPT + dateTimeInfo + profileInfo);
  return APPU_SYSTEM_PROMPT + dateTimeInfo + profileInfo;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure body parser
  app.use(bodyParser.json());
  
  // Store generated audio in memory for testing
  const audioCache = new Map<string, Buffer>();
  
  // Endpoint to generate and download audio directly
  app.post('/api/generate-audio', async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'No text provided' });
      }

      console.log(`Generating downloadable audio for: ${text}`);
      const speechAudio = await generateSpeech(text);
      
      // Store in cache for download
      const audioId = `audio-${Date.now()}`;
      audioCache.set(audioId, speechAudio);
      
      console.log(`Audio generated: ${speechAudio.length} bytes, ID: ${audioId}`);
      console.log(`Download URL: http://localhost:5000/api/download-audio/${audioId}`);
      
      res.json({ 
        audioId,
        downloadUrl: `/api/download-audio/${audioId}`,
        size: speechAudio.length
      });
    } catch (error) {
      console.error('Error generating audio:', error);
      res.status(500).json({ error: 'Failed to generate audio' });
    }
  });
  
  // Download endpoint for cached audio
  app.get('/api/download-audio/:audioId', (req: Request, res: Response) => {
    const { audioId } = req.params;
    const audioBuffer = audioCache.get(audioId);
    
    if (!audioBuffer) {
      return res.status(404).json({ error: 'Audio not found' });
    }
    
    res.set({
      'Content-Type': 'audio/wav',
      'Content-Disposition': `attachment; filename="appu-speech-${audioId}.wav"`,
      'Content-Length': audioBuffer.length
    });
    
    res.send(audioBuffer);
    console.log(`Audio downloaded: ${audioId}`);
  });

  // Simple test endpoint to generate and return download URL
  app.get('/api/test-audio', async (req: Request, res: Response) => {
    try {
      const testText = "Hello! Main Appu hoon, tumhara magical elephant dost! Namaste!";
      console.log('Generating test audio...');
      
      const speechAudio = await generateSpeech(testText);
      const audioId = `test-${Date.now()}`;
      audioCache.set(audioId, speechAudio);
      
      const downloadUrl = `http://localhost:5000/api/download-audio/${audioId}`;
      console.log(`Test audio ready: ${downloadUrl}`);
      
      res.json({ 
        success: true,
        text: testText,
        audioId,
        downloadUrl,
        size: speechAudio.length,
        message: 'Click the download URL to get the audio file'
      });
    } catch (error) {
      console.error('Test audio generation failed:', error);
      res.status(500).json({ error: 'Failed to generate test audio' });
    }
  });

  // Handle direct text input - skips audio transcription
  app.post('/api/process-text', async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'No text provided' });
      }
      
      console.log(`Received text: ${text}`);

      // Get or create conversation for the default child (demo child)
      const childId = 1; // Using the seeded child ID for demo
      let conversation = await storage.getCurrentConversation(childId);
      
      if (!conversation) {
        // Create new conversation if none exists
        conversation = await storage.createConversation({
          childId: childId
        });
        console.log(`Created new conversation ${conversation.id} for child ${childId}`);
      }
      
      // Generate a response using OpenAI's GPT model
      const responseText = await generateResponse(text);
      
      console.log(`Response text: ${responseText}`);

      // Store messages in database
      try {
        // Store child's input message
        await storage.createMessage({
          conversationId: conversation.id,
          type: 'child_input',
          content: text,
          transcription: text
        });

        // Store Appu's response message
        await storage.createMessage({
          conversationId: conversation.id,
          type: 'appu_response',
          content: responseText
        });

        // Update conversation message count
        const currentMessages = await storage.getMessagesByConversation(conversation.id);
        await storage.updateConversation(conversation.id, {
          totalMessages: currentMessages.length
        });

        console.log(`Stored messages for conversation ${conversation.id}`);
      } catch (error) {
        console.error('Error storing messages:', error);
      }
      
      // Generate speech audio using OpenAI's TTS API
      const speechAudio = await generateSpeech(responseText);
      
      console.log(`Generated speech audio: ${speechAudio.length} bytes`);
      
      // Save the audio file for download/testing
      const timestamp = Date.now();
      const audioFileName = `appu-speech-${timestamp}.wav`;
      const publicDir = path.join(process.cwd(), 'public');
      const audioFilePath = path.join(publicDir, audioFileName);
      
      // Ensure public directory exists
      try {
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
          console.log(`Created public directory: ${publicDir}`);
        }
        
        // Save the audio file
        fs.writeFileSync(audioFilePath, speechAudio);
        console.log(`Speech audio saved as: ${audioFileName} (${speechAudio.length} bytes)`);
        console.log(`Download URL: http://localhost:5000/public/${audioFileName}`);
        console.log(`Direct file path: ${audioFilePath}`);
      } catch (saveError) {
        console.error(`Error saving audio file: ${saveError}`);
      }
      
      // Return a JSON response with both the text and Base64 encoded audio
      res.json({
        text: responseText,
        transcribedText: text, // We use the input text as the "transcription"
        audioData: speechAudio.toString('base64'),
        contentType: 'audio/wav'
      });
    } catch (error: any) {
      console.error('Error processing text:', error);
      
      // Get the appropriate error type and message
      let errorType = 'generic';
      
      // Map the error message to an error type
      if (error.message === 'rateLimit') {
        errorType = 'rateLimit';
      } else if (error.message === 'auth') {
        errorType = 'auth';
      } else if (error.message === 'serviceUnavailable') {
        errorType = 'serviceUnavailable';
      } else if (error.message === 'network') {
        errorType = 'network';
      } else if (error.message === 'audioProcessingError') {
        errorType = 'audioProcessingError';
      } else if (error.message === 'textProcessingError') {
        errorType = 'textProcessingError';
      }
      
      const errorState = getErrorMessage(errorType);
      
      res.status(500).json({ 
        error: errorState.userMessage,
        errorType: errorType,
        debugMessage: errorState.debugMessage
      });
    }
  });

  // AI Configuration-based processing endpoint
  app.post('/api/process-with-config', async (req: Request, res: Response) => {
    try {
      const { text, aiConfig = 'standard', useCreative = false } = req.body;
      
      if (!text || text.trim() === '') {
        return res.status(400).json({ error: 'Text input is required' });
      }
      
      console.log(`Processing text with AI config: ${aiConfig}, creative: ${useCreative}`);
      
      // Create AI service based on configuration
      const aiService = createAIService(aiConfig as keyof typeof AI_CONFIGS);
      
      // Generate response using the configured AI service
      const responseText = await aiService.generateResponse(text);
      console.log(`Response text: ${responseText}`);
      
      // Generate speech with optional creative voice
      const speechConfig = useCreative ? { audioVoice: 'fable' as const } : undefined;
      const speechAudio = await aiService.generateSpeech(responseText, speechConfig);
      
      // Convert audio to base64 for response
      const audioBase64 = speechAudio.toString('base64');
      
      res.json({
        text: responseText,
        audioData: audioBase64,
        config: aiConfig,
        creative: useCreative
      });
      
    } catch (error: any) {
      console.error('Error in config-based processing:', error);
      res.status(500).json({ 
        error: 'Processing failed',
        details: error.message 
      });
    }
  });

  // Handle audio processing with OpenAI
  // Endpoint to create ephemeral token for OpenAI Realtime API
  // Parent Dashboard API Routes
  
  // Parent registration
  app.post('/api/parents/register', async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;
      
      // Check if parent already exists
      const existingParent = await storage.getParentByEmail(email);
      if (existingParent) {
        return res.status(400).json({ error: 'Parent already exists with this email' });
      }
      
      const parent = await storage.createParent({ email, password, name });
      res.json({ parent: { id: parent.id, email: parent.email, name: parent.name } });
    } catch (error) {
      console.error('Error registering parent:', error);
      res.status(500).json({ error: 'Failed to register parent' });
    }
  });
  
  // Parent login
  app.post('/api/parents/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      const parent = await storage.getParentByEmail(email);
      if (!parent || parent.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      res.json({ parent: { id: parent.id, email: parent.email, name: parent.name } });
    } catch (error) {
      console.error('Error logging in parent:', error);
      res.status(500).json({ error: 'Failed to login' });
    }
  });
  
  // Get parent dashboard data
  app.get('/api/parents/:parentId/dashboard', async (req: Request, res: Response) => {
    try {
      const parentId = parseInt(req.params.parentId);
      const dashboardData = await storage.getParentDashboardData(parentId);
      console.log('Dashboard data being returned:', JSON.stringify(dashboardData, null, 2));
      res.json(dashboardData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });
  
  // Create child profile
  app.post('/api/children', async (req: Request, res: Response) => {
    try {
      const { parentId, name, age, profile } = req.body;
      const child = await storage.createChild({ parentId, name, age, profile });
      res.json(child);
    } catch (error) {
      console.error('Error creating child:', error);
      res.status(500).json({ error: 'Failed to create child profile' });
    }
  });
  
  // Get conversations for a child
  app.get('/api/children/:childId/conversations', async (req: Request, res: Response) => {
    try {
      const childId = parseInt(req.params.childId);
      const limit = parseInt(req.query.limit as string) || 10;
      const conversations = await storage.getConversationsByChild(childId, limit);
      res.json(conversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });
  
  // Get messages for a conversation
  app.get('/api/conversations/:conversationId/messages', async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      const messages = await storage.getMessagesByConversation(conversationId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // Close current conversation
  app.post('/api/close-conversation', async (req: Request, res: Response) => {
    try {
      const childId = 1; // Using the seeded child ID for demo
      const conversation = await storage.getCurrentConversation(childId);
      
      if (conversation) {
        const endTime = new Date();
        const duration = Math.floor((endTime.getTime() - new Date(conversation.startTime).getTime()) / 1000);
        
        await storage.updateConversation(conversation.id, {
          endTime,
          duration,
          totalMessages: conversation.totalMessages
        });
        
        console.log(`Closed conversation ${conversation.id} - Duration: ${duration}s`);
        res.json({ 
          message: 'Conversation closed successfully',
          conversationId: conversation.id,
          duration: duration
        });
      } else {
        res.json({ message: 'No active conversation to close' });
      }
    } catch (error) {
      console.error('Error closing conversation:', error);
      res.status(500).json({ error: 'Failed to close conversation' });
    }
  });

  // Seed database with sample data for demo
  app.post('/api/seed-database', async (req: Request, res: Response) => {
    try {
      const result = await seedDatabase();
      res.json({ 
        message: 'Database seeded successfully', 
        demoCredentials: {
          email: 'demo@parent.com',
          password: 'demo123'
        },
        data: result 
      });
    } catch (error) {
      console.error('Error seeding database:', error);
      res.status(500).json({ error: 'Failed to seed database' });
    }
  });

  // Start realtime conversation endpoint
  app.post('/api/start-realtime-conversation', async (req: Request, res: Response) => {
    try {
      const { childId } = req.body;
      
      // Create a new conversation for the realtime session
      const conversation = await storage.createConversation({ childId });
      
      res.json({ success: true, conversationId: conversation.id });
    } catch (error) {
      console.error('Error starting realtime conversation:', error);
      res.status(500).json({ error: 'Failed to start conversation' });
    }
  });

  // Store realtime message endpoint
  app.post('/api/store-realtime-message', async (req: Request, res: Response) => {
    try {
      const { type, content, transcription } = req.body;
      
      // Get the current active conversation for child ID 1 (default child)
      const childId = 1;
      let conversation = await storage.getCurrentConversation(childId);
      
      // If no active conversation, create one
      if (!conversation) {
        conversation = await storage.createConversation({ childId });
      }
      
      // Store the message
      await storage.createMessage({
        conversationId: conversation.id,
        type,
        content,
        transcription
      });
      
      // Update conversation message count
      const currentMessages = await storage.getMessagesByConversation(conversation.id);
      await storage.updateConversation(conversation.id, {
        totalMessages: currentMessages.length
      });
      
      res.json({ success: true, conversationId: conversation.id });
    } catch (error) {
      console.error('Error storing realtime message:', error);
      res.status(500).json({ error: 'Failed to store message' });
    }
  });

  app.post('/api/session', async (req: Request, res: Response) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
      }

      const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-realtime-preview-2024-12-17',
          voice: 'alloy',
          instructions: createEnhancedSystemPrompt(),
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
          },
          modalities: ['text', 'audio']
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Failed to create session:', response.status, errorData);
        return res.status(response.status).json({ 
          error: 'Failed to create realtime session',
          details: errorData 
        });
      }

      const sessionData = await response.json();
      res.json({
        client_secret: sessionData.client_secret?.value || sessionData.client_secret,
        expires_at: sessionData.client_secret?.expires_at
      });
    } catch (error) {
      console.error('Error creating realtime session:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Learning milestones endpoints
  app.post('/api/milestones', async (req: Request, res: Response) => {
    try {
      const milestone = await storage.createLearningMilestone(req.body);
      res.json(milestone);
    } catch (error) {
      console.error('Error creating milestone:', error);
      res.status(500).json({ message: 'Failed to create milestone' });
    }
  });

  app.get('/api/children/:childId/milestones', async (req: Request, res: Response) => {
    try {
      const childId = parseInt(req.params.childId);
      const milestones = await storage.getMilestonesByChild(childId);
      res.json(milestones);
    } catch (error) {
      console.error('Error fetching milestones:', error);
      res.status(500).json({ message: 'Failed to fetch milestones' });
    }
  });

  app.patch('/api/milestones/:milestoneId/progress', async (req: Request, res: Response) => {
    try {
      const milestoneId = parseInt(req.params.milestoneId);
      const { progress } = req.body;
      const milestone = await storage.updateMilestoneProgress(milestoneId, progress);
      res.json(milestone);
    } catch (error) {
      console.error('Error updating milestone progress:', error);
      res.status(500).json({ message: 'Failed to update milestone progress' });
    }
  });

  app.patch('/api/milestones/:milestoneId/complete', async (req: Request, res: Response) => {
    try {
      const milestoneId = parseInt(req.params.milestoneId);
      const milestone = await storage.completeMilestone(milestoneId);
      
      // Create milestone achievement notification
      const child = await storage.getChild(milestone.childId);
      if (child) {
        await storage.createNotification({
          parentId: child.parentId,
          childId: milestone.childId,
          milestoneId: milestone.id,
          type: 'milestone_achieved',
          title: 'Milestone Achieved!',
          message: `${child.name} has completed: ${milestone.milestoneDescription}`,
          priority: 'high'
        });
      }
      
      res.json(milestone);
    } catch (error) {
      console.error('Error completing milestone:', error);
      res.status(500).json({ message: 'Failed to complete milestone' });
    }
  });

  // Notifications endpoints
  app.get('/api/parents/:parentId/notifications', async (req: Request, res: Response) => {
    try {
      const parentId = parseInt(req.params.parentId);
      const unreadOnly = req.query.unreadOnly === 'true';
      const notifications = await storage.getNotificationsByParent(parentId, unreadOnly);
      res.json(notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ message: 'Failed to fetch notifications' });
    }
  });

  app.post('/api/notifications', async (req: Request, res: Response) => {
    try {
      const notification = await storage.createNotification(req.body);
      res.json(notification);
    } catch (error) {
      console.error('Error creating notification:', error);
      res.status(500).json({ message: 'Failed to create notification' });
    }
  });

  app.patch('/api/notifications/:notificationId/read', async (req: Request, res: Response) => {
    try {
      const notificationId = parseInt(req.params.notificationId);
      const notification = await storage.markNotificationAsRead(notificationId);
      res.json(notification);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ message: 'Failed to mark notification as read' });
    }
  });

  app.patch('/api/parents/:parentId/notifications/read-all', async (req: Request, res: Response) => {
    try {
      const parentId = parseInt(req.params.parentId);
      await storage.markAllNotificationsAsRead(parentId);
      res.json({ message: 'All notifications marked as read' });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ message: 'Failed to mark all notifications as read' });
    }
  });

  // Notification preferences endpoints
  app.get('/api/parents/:parentId/notification-preferences', async (req: Request, res: Response) => {
    try {
      const parentId = parseInt(req.params.parentId);
      const preferences = await storage.getNotificationPreferences(parentId);
      res.json(preferences);
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
      res.status(500).json({ message: 'Failed to fetch notification preferences' });
    }
  });

  app.post('/api/notification-preferences', async (req: Request, res: Response) => {
    try {
      const preferences = await storage.createNotificationPreferences(req.body);
      res.json(preferences);
    } catch (error) {
      console.error('Error creating notification preferences:', error);
      res.status(500).json({ message: 'Failed to create notification preferences' });
    }
  });

  app.patch('/api/parents/:parentId/notification-preferences', async (req: Request, res: Response) => {
    try {
      const parentId = parseInt(req.params.parentId);
      const preferences = await storage.updateNotificationPreferences(parentId, req.body);
      res.json(preferences);
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      res.status(500).json({ message: 'Failed to update notification preferences' });
    }
  });

  app.post('/api/process-audio', upload.single('audio'), async (req: MulterRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No audio file provided',
        errorType: 'audioProcessingError',
        debugMessage: 'Missing audio file in the request'
      });
    }
    
    // Check if the audio file is empty
    if (req.file.size === 0) {
      return res.status(400).json({ 
        error: 'The audio file is empty',
        errorType: 'audioProcessingError',
        debugMessage: 'Received an empty audio file'
      });
    }

    console.log(`Received audio file of size: ${req.file.size} bytes with MIME type: ${req.file.mimetype}`);

    try {
      // Get or create conversation for the default child (demo child)
      const childId = 1; // Using the seeded child ID for demo
      let conversation = await storage.getCurrentConversation(childId);
      
      if (!conversation) {
        // Create new conversation if none exists
        conversation = await storage.createConversation({
          childId: childId
        });
        console.log(`Created new conversation ${conversation.id} for child ${childId}`);
      }

      // Step 1: Transcribe audio using OpenAI's Whisper API
      const audioBuffer = req.file.buffer;
      
      if (!audioBuffer || audioBuffer.length === 0) {
        console.error("Empty audio buffer received in request");
        return res.status(400).json({ 
          error: "The audio data is empty or corrupted",
          errorType: "audioProcessingError",
          debugMessage: "Received empty audio buffer"
        });
      }
      
      console.log(`Audio buffer received, size: ${audioBuffer.length} bytes`);
      
      // Create a short summary of the buffer content for debugging
      const bufferSummary = Buffer.from(audioBuffer.slice(0, 20)).toString('hex');
      console.log(`Audio buffer starts with: ${bufferSummary}...`);
      
      // Determine the file extension based on mime type
      let fileExtension = 'webm';
      const mimeType = req.file.mimetype;
      
      if (mimeType.includes('wav')) {
        fileExtension = 'wav';
      } else if (mimeType.includes('mp4')) {
        fileExtension = 'mp4';
      } else if (mimeType.includes('ogg')) {
        fileExtension = 'ogg';
      }
      
      console.log(`Processing audio file with MIME type: ${mimeType}, extension: ${fileExtension}`);
      const transcribedText = await transcribeAudio(audioBuffer, `recording-${Date.now()}.${fileExtension}`);
      
      // Step 2: Generate a response using OpenAI's GPT model
      const responseText = await generateResponse(transcribedText);
      
      console.log(`Transcribed text: ${transcribedText}`);
      console.log(`Response text: ${responseText}`);

      // Step 3: Store messages in database
      try {
        // Store child's input message
        await storage.createMessage({
          conversationId: conversation.id,
          type: 'child_input',
          content: transcribedText,
          transcription: transcribedText
        });

        // Store Appu's response message
        await storage.createMessage({
          conversationId: conversation.id,
          type: 'appu_response',
          content: responseText
        });

        // Update conversation message count
        const currentMessages = await storage.getMessagesByConversation(conversation.id);
        await storage.updateConversation(conversation.id, {
          totalMessages: currentMessages.length
        });

        console.log(`Stored messages for conversation ${conversation.id}`);
      } catch (error) {
        console.error('Error storing messages:', error);
      }
      
      // Generate a simple tone to make the elephant appear to be speaking
      // In a real implementation, we would use a proper TTS service
      // Create a WAV file with a short beep sound
      const sampleRate = 44100;
      const duration = 0.3; // seconds
      const frequency = 440; // Hz (A4 note)
      
      // Generate WAV header
      const numSamples = Math.floor(sampleRate * duration);
      const dataSize = numSamples * 2; // 16-bit samples = 2 bytes per sample
      const fileSize = 36 + dataSize;
      
      const header = Buffer.alloc(44);
      // "RIFF" chunk descriptor
      header.write('RIFF', 0);
      header.writeUInt32LE(fileSize - 8, 4);
      header.write('WAVE', 8);
      
      // "fmt " sub-chunk
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16); // fmt chunk size
      header.writeUInt16LE(1, 20); // audio format (1 = PCM)
      header.writeUInt16LE(1, 22); // num channels (1 = mono)
      header.writeUInt32LE(sampleRate, 24); // sample rate
      header.writeUInt32LE(sampleRate * 2, 28); // byte rate (sample rate * block align)
      header.writeUInt16LE(2, 32); // block align (channels * bits per sample / 8)
      header.writeUInt16LE(16, 34); // bits per sample
      
      // "data" sub-chunk
      header.write('data', 36);
      header.writeUInt32LE(dataSize, 40);
      
      // Generate audio data (simple sine wave)
      const audioData = Buffer.alloc(numSamples * 2);
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        // Create a fading sine wave
        const fadeInOut = Math.sin(Math.PI * t / duration);
        const sample = Math.sin(2 * Math.PI * frequency * t) * fadeInOut * 0.5;
        // Convert to 16-bit PCM
        const value = Math.floor(sample * 32767);
        audioData.writeInt16LE(value, i * 2);
      }
      
      // Combine header and audio data
      const dummyAudio = Buffer.concat([header, audioData]);
      
      // Return a JSON response with both the text and Base64 encoded audio
      res.json({
        text: responseText,
        transcribedText: transcribedText,
        audioData: dummyAudio.toString('base64'),
        contentType: 'audio/wav'
      });
    } catch (error: any) {
      console.error('Error processing audio:', error);
      
      // Get the appropriate error type and message
      let errorType = 'generic';
      
      // Map the error message to an error type
      if (error.message === 'rateLimit') {
        errorType = 'rateLimit';
      } else if (error.message === 'auth') {
        errorType = 'auth';
      } else if (error.message === 'serviceUnavailable') {
        errorType = 'serviceUnavailable';
      } else if (error.message === 'network') {
        errorType = 'network';
      } else if (error.message === 'audioProcessingError') {
        errorType = 'audioProcessingError';
      } else if (error.message === 'textProcessingError') {
        errorType = 'textProcessingError';
      }
      
      const errorState = getErrorMessage(errorType);
      
      res.status(500).json({ 
        error: errorState.userMessage,
        errorType: errorType,
        debugMessage: errorState.debugMessage
      });
    }
  });

  const httpServer = createServer(app);
  
  // Set up OpenAI Realtime API WebSocket service
  setupRealtimeWebSocket(httpServer);
  
  // Set up Gemini Live API WebSocket service
  setupGeminiLiveWebSocket(httpServer);
  
  // Set up WebSocket server for real-time communication (future use)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    
    ws.on('message', (message) => {
      console.log('Received message:', message);
      
      // Echo back for now
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ message: 'Received message' }));
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });

  return httpServer;
}
