
export interface SessionMessage {
  type: string;
  childId?: string;
  [key: string]: any;
}

export class WebSocketSessionManager {
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
  }

  sendSessionStart(ws: WebSocket, childId: string): void {
    if (ws.readyState !== WebSocket.OPEN) {
      this.logger.error('Cannot send session start - WebSocket not open', {
        readyState: ws.readyState,
        childId
      });
      return;
    }

    this.logger.info('📤 Sending session start message', { 
      childId,
      childIdType: typeof childId,
      sessionStartTime: new Date().toISOString(),
      wsReadyState: ws.readyState,
      wsReadyStateLabel: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState]
    });
    
    try {
      const sessionMessage: SessionMessage = {
        type: 'start_session',
        childId: childId
      };
      
      ws.send(JSON.stringify(sessionMessage));
      
      this.logger.debug('Session start message sent successfully', {
        messageType: sessionMessage.type,
        childId: sessionMessage.childId,
        messageSize: JSON.stringify(sessionMessage).length
      });
    } catch (error: any) {
      this.logger.error('Failed to send start_session message', { 
        error: error.message,
        errorType: error.constructor.name,
        wsReadyState: ws.readyState,
        childId
      });
    }
  }

  sendMessage(ws: WebSocket, message: SessionMessage): boolean {
    if (ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('Cannot send message - WebSocket not open', {
        readyState: ws.readyState,
        messageType: message.type
      });
      
    }

    try {
      ws.send(JSON.stringify(message));
      this.logger.debug('Message sent successfully', {
        messageType: message.type,
        messageSize: JSON.stringify(message).length
      });
      return true;
    } catch (error: any) {
      this.logger.error('Failed to send message', {
        error: error.message,
        messageType: message.type,
        wsReadyState: ws.readyState
      });
    }
    return false;
  }
}
