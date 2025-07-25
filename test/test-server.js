// Isolated WebSocket server test
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const httpServer = createServer();

const wss = new WebSocketServer({ 
  server: httpServer,
  path: '/test-ws'
});

wss.on('connection', (ws) => {
  console.log('✅ WebSocket connected successfully');
  ws.send(JSON.stringify({ message: 'Hello from test server!' }));
  
  ws.on('message', (data) => {
    console.log('📥 Received:', data.toString());
  });
});

httpServer.listen(5001, () => {
  console.log('🚀 Test server running on port 5001');
});

// Test client
import { WebSocket } from 'ws';

setTimeout(() => {
  console.log('\n🔌 Testing WebSocket connection...');
  const testWs = new WebSocket('ws://localhost:5001/test-ws');
  
  testWs.on('open', () => {
    console.log('✅ Test connection successful!');
    testWs.send('Hello from client');
    testWs.close();
    process.exit(0);
  });
  
  testWs.on('error', (error) => {
    console.error('❌ Test connection failed:', error.message);
    process.exit(1);
  });
}, 1000);