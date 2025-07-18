import { WebSocket } from 'ws';

const ws = new WebSocket('ws://localhost:5001/test-ws');

ws.on('open', () => {
  console.log('WebSocket connected successfully');
  ws.send(JSON.stringify({type: 'test', message: 'hello'}));
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log('WebSocket closed with code:', code, 'reason:', reason.toString());
});

setTimeout(() => {
  ws.close();
  process.exit(0);
}, 3000);