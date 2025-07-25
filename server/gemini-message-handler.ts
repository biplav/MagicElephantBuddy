
import { WebSocket } from 'ws';
import { GeminiLiveSession, geminiSessionManager } from './gemini-session-manager';
import { createServiceLogger } from './logger';

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

      await this.processMessage(session, message);
      
    } catch (error: any) {
      messageLogger.error('Error processing WebSocket message', { 
        error: error.message, 
        conversationId: session.conversationId
      });
      if (session.ws.readyState === session.ws.OPEN) {
        session.ws.send(JSON.stringify({
          type: 'error',
          message: `Error processing message: ${error.message}`
        }));
      }
    }
  }

  private async processMessage(session: GeminiLiveSession, message: any): Promise<void> {
    switch (message.type) {
      case 'start_session':
        // Set child ID from message if provided
        if (message.childId) {
          const numericChildId = typeof message.childId === 'string' ? parseInt(message.childId, 10) : message.childId;
          if (isNaN(numericChildId)) {
            messageLogger.error('Invalid child ID received in start_session', { 
              originalChildId: message.childId,
              type: typeof message.childId 
            });
            session.ws.send(JSON.stringify({
              type: 'error',
              error: 'Invalid child ID provided'
            }));
            return;
          }
          
          session.childId = numericChildId;
          messageLogger.info('Gemini session child ID set', { 
            childId: session.childId,
            originalValue: message.childId,
            type: typeof session.childId
          });
        }
        await geminiSessionManager.startSession(session);
        break;

      case 'text_input':
        if (session.isConnected && message.text) {
          await geminiSessionManager.handleTextInput(session, message.text);
        }
        break;

      case 'end_session':
        await geminiSessionManager.endSession(session);
        break;

      default:
        messageLogger.warn('Unknown message type received', { messageType: message.type });
    }
  }
}

export const geminiMessageHandler = new GeminiMessageHandler();
