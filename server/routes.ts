import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from 'ws';

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
  // Handle audio processing
  app.post('/api/process-audio', upload.single('audio'), (req: MulterRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log(`Received audio file of size: ${req.file.size} bytes`);

    // Simulate processing delay (1-2 seconds)
    setTimeout(() => {
      try {
        // Create a response object with both audio data and text
        const responseText = "Thank you for reaching out";
        
        // In a real implementation, we would generate proper audio
        // For now, we'll just return a dummy audio file
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
          audioData: dummyAudio.toString('base64'),
          contentType: 'audio/wav'
        });
      } catch (error) {
        console.error('Error processing audio:', error);
        res.status(500).json({ error: 'Failed to process audio' });
      }
    }, 1000 + Math.random() * 1000);
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
