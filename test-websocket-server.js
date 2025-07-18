const { WebSocketServer } = require('ws');
const { createServer } = require('http');
const express = require('express');

const app = express();
const server = createServer(app);

// Create a simple WebSocket server
const wss = new WebSocketServer({ server, path: '/test-ws' });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.send(JSON.stringify({ type: 'connection_established' }));
  
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    ws.send(JSON.stringify({ type: 'echo', message: message.toString() }));
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

server.listen(3001, () => {
  console.log('Test WebSocket server running on port 3001');
});