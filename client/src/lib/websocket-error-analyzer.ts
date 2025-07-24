
export interface WebSocketErrorAnalysis {
  category: 'error_event' | 'close_event' | 'generic_event' | 'unknown';
  message: string;
  shouldRetry: boolean;
  metadata: {
    errorType: string;
    readyState: number;
    readyStateLabel: string;
    timestamp: string;
  };
}

export interface WebSocketErrorContext {
  url: string;
  ws: WebSocket;
  error: Event;
}

export class WebSocketErrorAnalyzer {
  private static getReadyStateLabel(readyState: number): string {
    const labels = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
    return labels[readyState] || 'UNKNOWN';
  }

  static getCloseCodeDescription(code: number): string {
    const descriptions: { [key: number]: string } = {
      1000: 'Normal Closure',
      1001: 'Going Away',
      1002: 'Protocol Error',
      1003: 'Unsupported Data',
      1004: 'Reserved',
      1005: 'No Status Received',
      1006: 'Abnormal Closure',
      1007: 'Invalid frame payload data',
      1008: 'Policy Violation',
      1009: 'Message too big',
      1010: 'Missing Extension',
      1011: 'Internal Error',
      1012: 'Service Restart',
      1013: 'Try Again Later',
      1014: 'Bad Gateway',
      1015: 'TLS Handshake'
    };
    return descriptions[code] || `Unknown code: ${code}`;
  }

  static analyzeError(context: WebSocketErrorContext): WebSocketErrorAnalysis {
    const { error, ws } = context;
    
    const baseMetadata = {
      errorType: error.type,
      readyState: ws.readyState,
      readyStateLabel: this.getReadyStateLabel(ws.readyState),
      timestamp: new Date().toISOString(),
    };

    if (error instanceof ErrorEvent) {
      return {
        category: 'error_event',
        message: error.message || 'WebSocket connection failed',
        shouldRetry: ws.readyState === WebSocket.CONNECTING,
        metadata: {
          ...baseMetadata,
          errorType: 'ErrorEvent'
        }
      };
    }

    if (error instanceof CloseEvent) {
      return {
        category: 'close_event',
        message: `Connection closed: ${error.reason || 'Unknown reason'} (Code: ${error.code})`,
        shouldRetry: !error.wasClean && error.code !== 1000,
        metadata: {
          ...baseMetadata,
          errorType: 'CloseEvent'
        }
      };
    }

    if (error instanceof Event) {
      return {
        category: 'generic_event',
        message: `WebSocket ${error.type} event occurred`,
        shouldRetry: ws.readyState === WebSocket.CONNECTING,
        metadata: {
          ...baseMetadata,
          errorType: 'Event'
        }
      };
    }

    return {
      category: 'unknown',
      message: 'WebSocket connection failed',
      shouldRetry: false,
      metadata: {
        ...baseMetadata,
        errorType: 'Unknown'
      }
    };
  }

  static extractBasicErrorInfo(error: Event, ws: WebSocket, url: string) {
    return {
      errorType: error.type,
      errorConstructor: error.constructor.name,
      errorToString: error.toString(),
      url,
      readyState: ws.readyState,
      readyStateLabel: this.getReadyStateLabel(ws.readyState),
      protocol: ws.protocol,
      extensions: ws.extensions,
    };
  }

  static extractEnvironmentInfo() {
    return {
      currentLocation: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      isOnline: navigator.onLine,
      connectionType: (navigator as any).connection?.effectiveType || 'unknown',
    };
  }

  static extractErrorEventDetails(error: ErrorEvent) {
    return {
      message: error.message || 'No message provided',
      filename: error.filename || 'No filename',
      lineno: error.lineno || 'No line number',
      colno: error.colno || 'No column number',
      error: error.error ? {
        name: error.error.name,
        message: error.error.message,
        stack: error.error.stack
      } : 'No error object'
    };
  }

  static extractCloseEventDetails(error: CloseEvent) {
    return {
      code: error.code,
      reason: error.reason || 'No reason provided',
      wasClean: error.wasClean,
      codeDescription: this.getCloseCodeDescription(error.code)
    };
  }

  static extractGenericEventDetails(error: Event) {
    return {
      type: error.type,
      bubbles: error.bubbles,
      cancelable: error.cancelable,
      timestamp: error.timeStamp
    };
  }

  static extractErrorProperties(error: Event) {
    const errorKeys = Object.getOwnPropertyNames(error);
    const additionalProps: { [key: string]: any } = {};
    
    errorKeys.forEach(key => {
      try {
        additionalProps[key] = error[key as keyof Event];
      } catch (e) {
        additionalProps[key] = `[Error accessing property: ${e instanceof Error ? e.message : 'Unknown error'}]`;
      }
    });
    
    return additionalProps;
  }

  static analyzeWebSocketUrl(url: string) {
    try {
      if (url.includes('wss://') || url.includes('ws://')) {
        const urlObject = new URL(url);
        return {
          protocol: urlObject.protocol,
          host: urlObject.host,
          hostname: urlObject.hostname,
          port: urlObject.port,
          pathname: urlObject.pathname,
          isCrossOrigin: urlObject.host !== window.location.host
        };
      }
    } catch (urlError) {
      return {
        error: urlError instanceof Error ? urlError.message : 'Unknown URL analysis error',
        url
      };
    }
    return null;
  }

  static createErrorObject(error: Event) {
    return {
      bubbles: error.bubbles,
      cancelable: error.cancelable,
      composed: (error as any).composed,
      currentTarget: error.currentTarget?.constructor?.name || 'unknown',
      defaultPrevented: error.defaultPrevented,
      eventPhase: error.eventPhase,
      isTrusted: error.isTrusted,
      target: error.target?.constructor?.name || 'unknown',
      timeStamp: error.timeStamp,
      type: error.type
    };
  }
}
