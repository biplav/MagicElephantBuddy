import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import express from 'express';

// Create a minimal HTTP server with WebSocket support
const app = express();
const httpServer = createServer(app);

// Set up a minimal WebSocket server
const wss = new WebSocketServer({ 
  server: httpServer, 
  path: '/test-ws'
});

console.log('Test WebSocket server initialized on /test-ws');

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.send(JSON.stringify({
    type: 'connection_confirmed',
    timestamp: new Date().toISOString()
  }));
  
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    ws.send(JSON.stringify({
      type: 'echo',
      data: message.toString()
    }));
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

httpServer.listen(5001, () => {
  console.log('Test server listening on port 5001');
});