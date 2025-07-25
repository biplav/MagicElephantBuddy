
import { GeminiLiveSession, geminiSessionManager } from './gemini-session-manager';
import { createServiceLogger } from '../logger';

const messageLogger = createServiceLogger('gemini-message');

export class GeminiMessageHandler {
  
  async handleMessage(session: GeminiLiveSession, data: any): Promise<void> {
    try {
      // Handle both Buffer and String data types
      let messageStr;
      if (Buffer.isBuffer(data)) {
        messageStr = data.toString();
      } else {
        messageStr = data.toString();
      }
      
      messageLogger.info('📨 Message received from client', { 
        messageStr,
        dataType: typeof data,
        isBuffer: Buffer.isBuffer(data)
      });
      
      // Handle ping/pong for connection testing
      if (messageStr === 'ping') {
        session.ws.send('pong');
        return;
      }
      
      // Try to parse as JSON
      let message;
      try {
        message = JSON.parse(messageStr);
      } catch (jsonError) {
        messageLogger.warn('Received non-JSON message', { messageStr });
        return;
      }
      
      messageLogger.info('📨 Parsed Gemini Live message', { 
        messageType: message.type,
        sessionConnected: session.isConnected
      });

      // Route message based on type
      switch (message.type) {
        case 'start_session':
          await geminiSessionManager.startSession(session, message);
          break;
        case 'text_input':
          await geminiSessionManager.handleTextInput(session, message);
          break;
        case 'end_session':
          await geminiSessionManager.endSession(session);
          break;
        default:
          messageLogger.warn('Unknown message type', { messageType: message.type });
      }
      
    } catch (error: any) {
      messageLogger.error('Error handling Gemini message', { 
        error: error.message, 
        conversationId: session.conversationId 
      });
      
      // Send error response to client
      try {
        session.ws.send(JSON.stringify({
          type: 'error',
          error: 'Failed to process message'
        }));
      } catch (sendError: any) {
        messageLogger.error('Error sending error response', { error: sendError.message });
      }
    }
  }
}

export const geminiMessageHandler = new GeminiMessageHandler();
