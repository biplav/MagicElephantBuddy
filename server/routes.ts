import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from 'ws';
import { transcribeAudio, generateResponse, generateSpeech } from "./openai-service";
import { setupRealtimeWebSocket } from "./realtime-service";
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
      
      // Generate a response using OpenAI's GPT model
      const responseText = await generateResponse(text);
      
      console.log(`Response text: ${responseText}`);
      
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

  // Handle audio processing with OpenAI
  // Endpoint to create ephemeral token for OpenAI Realtime API
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
          instructions: 'You are Appu, a magical, friendly elephant helper who talks to young children aged 3 to 5. Speak in Hindi or Hinglish with very short, simple sentences.',
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
