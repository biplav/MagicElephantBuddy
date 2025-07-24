// Quick WebSocket connection test
import { WebSocket } from 'ws';

const wsUrl = 'ws://localhost:5000/gemini-ws';
console.log('Testing WebSocket connection to:', wsUrl);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ WebSocket connection successful');
  console.log('Sending test message...');
  ws.send(JSON.stringify({ type: 'test', message: 'hello' }));
});

ws.on('message', (data) => {
  console.log('📥 Received message:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log('🔌 WebSocket closed:', code, reason.toString());
});

// Auto-close after 5 seconds
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  process.exit(0);
}, 5000);