import { WebSocketServer } from 'ws';
import { createServer } from 'http';

console.log('Creating simple WebSocket test server...');

const server = createServer();
const wss = new WebSocketServer({ 
  server: server, 
  path: '/test-ws'
});

wss.on('connection', function connection(ws) {
  console.log('✅ Client connected');
  
  // Send greeting
  ws.send('Hello from server');
  
  ws.on('message', function message(data) {
    console.log('📨 Server received:', data.toString());
    
    // Echo back immediately
    ws.send(`Echo: ${data.toString()}`);
  });
  
  ws.on('close', function() {
    console.log('❌ Client disconnected');
  });
  
  ws.on('error', function(error) {
    console.log('🚨 Server WebSocket error:', error.message);
  });
});

server.listen(3001, function() {
  console.log('Simple WebSocket server listening on port 3001');
  
  // Test client
  setTimeout(() => {
    const { default: WebSocket } = await import('ws');
    const ws = new WebSocket('ws://localhost:3001/test-ws');
    
    ws.on('open', () => {
      console.log('✅ Client connected to test server');
      setTimeout(() => {
        console.log('📤 Client sending test message');
        ws.send('Test message from client');
      }, 100);
    });
    
    ws.on('message', (data) => {
      console.log('📥 Client received:', data.toString());
    });
    
    ws.on('error', (error) => {
      console.log('🚨 Client error:', error.message);
    });
    
    ws.on('close', () => {
      console.log('❌ Client connection closed');
      process.exit(0);
    });
    
    setTimeout(() => {
      ws.close();
    }, 2000);
  }, 1000);
});