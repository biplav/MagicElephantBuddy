
export interface MessageHandlerCallbacks {
  onSessionStarted?: (conversationId: number) => void;
  onTextResponse?: (text: string) => void;
  onVisionResponse?: (text: string) => void;
  onError?: (error: string) => void;
}

export class WebSocketMessageHandler {
  private logger: any;
  private callbacks: MessageHandlerCallbacks;

  constructor(logger: any, callbacks: MessageHandlerCallbacks = {}) {
    this.logger = logger;
    this.callbacks = callbacks;
  }

  handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      
      this.logger.debug('Received WebSocket message', { 
        type: message.type,
        messageSize: event.data.length 
      });

      switch (message.type) {
        case 'session_started':
          this.handleSessionStarted(message);
          break;
        case 'text_response':
          this.handleTextResponse(message);
          break;
        case 'vision_response':
          this.handleVisionResponse(message);
          break;
        case 'error':
          this.handleError(message);
          break;
        default:
          this.handleUnknownMessage(message);
      }
    } catch (error: any) {
      this.logger.error('Error parsing WebSocket message', { 
        error: error.message,
        rawData: event.data?.substring(0, 200) + '...'
      });
    }
  }

  private handleSessionStarted(message: any): void {
    this.logger.info('Session started successfully', { 
      conversationId: message.conversationId 
    });
    this.callbacks.onSessionStarted?.(message.conversationId);
  }

  private handleTextResponse(message: any): void {
    this.logger.info('Text response received', { 
      textLength: message.text?.length,
      preview: message.text?.substring(0, 50) + '...'
    });
    this.callbacks.onTextResponse?.(message.text);
  }

  private handleVisionResponse(message: any): void {
    this.logger.info('Vision response received', { 
      textLength: message.text?.length,
      preview: message.text?.substring(0, 50) + '...'
    });
    this.callbacks.onVisionResponse?.(message.text);
  }

  private handleError(message: any): void {
    this.logger.error('Received error message', { 
      error: message.error,
      errorType: typeof message.error
    });
    this.callbacks.onError?.(message.error);
  }

  private handleUnknownMessage(message: any): void {
    this.logger.warn('Unknown message type received', { 
      type: message.type,
      message: message
    });
  }

  updateCallbacks(callbacks: MessageHandlerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
}
