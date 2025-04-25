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
        transcribedText: text, // We use the input text as the "transcription"
        audioData: dummyAudio.toString('base64'),
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

  // Handle audio processing with OpenAI
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

    console.log(`Received audio file of size: ${req.file.size} bytes`);

    try {
      // Step 1: Transcribe audio using OpenAI's Whisper API
      const audioBuffer = req.file.buffer;
      
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
      
      console.log(`Processing audio file with MIME type: ${mimeType}`);
      const transcribedText = await transcribeAudio(audioBuffer, `recording-${Date.now()}.${fileExtension}`);
      
      // Step 2: Generate a response using OpenAI's GPT model
      const responseText = await generateResponse(transcribedText);
      
      console.log(`Transcribed text: ${transcribedText}`);
      console.log(`Response text: ${responseText}`);
      
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
