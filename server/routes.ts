import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from 'ws';
import { transcribeAudio, generateResponse } from "./openai-service";
import bodyParser from "body-parser";
import { getErrorMessage } from "../shared/errorMessages";

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

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure body parser
  app.use(bodyParser.json());

  // Handle direct text input - skips audio transcription
  app.post('/api/process-text', async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'No text provided' });
      }
      
      console.log(`Received text: ${text}`);
      
      // Generate a response using OpenAI's GPT model
      const responseText = await generateResponse(text);
      
      console.log(`Response text: ${responseText}`);
      
      // For now, we don't have text-to-speech, so we'll return a dummy audio file
      const dummyAudio = Buffer.from([
        // Simple WAV file header (44 bytes) followed by silence
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 
        0x57, 0x41, 0x56, 0x45, 0x66, 0x6D, 0x74, 0x20, 
        0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 
        0x44, 0xAC, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 
        0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 
        0x00, 0x00, 0x00, 0x00
      ]);
      
      // Return a JSON response with both the text and Base64 encoded audio
      res.json({
        text: responseText,
        transcribedText: text, // We use the input text as the "transcription"
        audioData: dummyAudio.toString('base64'),
        contentType: 'audio/wav'
      });
    } catch (error: any) {
      console.error('Error processing text:', error);
      
      // Get the appropriate error type and message
      const errorType = error.message || 'generic';
      const errorState = getErrorMessage(errorType);
      
      res.status(500).json({ 
        error: 'Failed to process text', 
        message: error.message || 'Unknown error',
        errorType: errorType,
        userMessage: errorState.userMessage,
        debugMessage: errorState.debugMessage
      });
    }
  });

  // Handle audio processing with OpenAI
  app.post('/api/process-audio', upload.single('audio'), async (req: MulterRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log(`Received audio file of size: ${req.file.size} bytes`);

    try {
      // Step 1: Transcribe audio using OpenAI's Whisper API
      const audioBuffer = req.file.buffer;
      const transcribedText = await transcribeAudio(audioBuffer, `recording-${Date.now()}.webm`);
      
      // Step 2: Generate a response using OpenAI's GPT model
      const responseText = await generateResponse(transcribedText);
      
      console.log(`Transcribed text: ${transcribedText}`);
      console.log(`Response text: ${responseText}`);
      
      // For now, we don't have text-to-speech, so we'll return a dummy audio file
      // In a real implementation, we would convert the response text to audio
      const dummyAudio = Buffer.from([
        // Simple WAV file header (44 bytes) followed by silence
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 
        0x57, 0x41, 0x56, 0x45, 0x66, 0x6D, 0x74, 0x20, 
        0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 
        0x44, 0xAC, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 
        0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 
        0x00, 0x00, 0x00, 0x00
      ]);
      
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
      const errorType = error.message || 'generic';
      const errorState = getErrorMessage(errorType);
      
      res.status(500).json({ 
        error: 'Failed to process audio', 
        message: error.message || 'Unknown error',
        errorType: errorType,
        userMessage: errorState.userMessage,
        debugMessage: errorState.debugMessage
      });
    }
  });

  const httpServer = createServer(app);
  
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
