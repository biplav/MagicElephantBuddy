
export interface ConnectionTiming {
  startTime: number;
  timestamp: string;
}

export interface ConnectionMetrics {
  duration: string;
  success: boolean;
  closeReason: string;
  retryRecommended: boolean;
}

export class WebSocketConnectionTracker {
  private connectionStartTime: number = 0;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
  }

  startTracking(): ConnectionTiming {
    this.connectionStartTime = Date.now();
    return {
      startTime: this.connectionStartTime,
      timestamp: new Date().toISOString()
    };
  }

  setupTimeout(ws: WebSocket, wsUrl: string, timeoutMs: number = 10000): void {
    this.connectionTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        this.logger.error('WebSocket connection timeout', {
          timeoutDuration: Date.now() - this.connectionStartTime,
          url: wsUrl,
          finalReadyState: ws.readyState
        });
        ws.close();
      }
    }, timeoutMs);
  }

  clearTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  getConnectionMetrics(event?: CloseEvent): ConnectionMetrics {
    const duration = Date.now() - this.connectionStartTime;
    
    return {
      duration: `${duration}ms`,
      success: event ? event.wasClean && event.code === 1000 : false,
      closeReason: event 
        ? (event.code === 1000 ? 'Normal closure' : 'Abnormal closure')
        : 'Unknown',
      retryRecommended: event ? !event.wasClean && event.code !== 1000 : true
    };
  }

  logConnectionSuccess(wsUrl: string, ws: WebSocket): void {
    const metrics = this.getConnectionMetrics();
    
    this.logger.info('WebSocket connection established successfully', {
      url: wsUrl,
      connectionDuration: metrics.duration,
      finalReadyState: ws.readyState,
      protocol: ws.protocol,
      extensions: ws.extensions
    });
  }

  logConnectionClose(event: CloseEvent, wsUrl: string): void {
    const metrics = this.getConnectionMetrics(event);
    
    this.logger.info('WebSocket connection closed', {
      code: event.code,
      reason: event.reason || 'No reason provided',
      wasClean: event.wasClean,
      url: wsUrl,
      connectionDuration: metrics.duration,
      timing: {
        connectionStart: this.connectionStartTime,
        closeTime: Date.now(),
        totalDuration: Date.now() - this.connectionStartTime
      }
    });

    this.logger.info('Connection lifecycle summary', {
      url: wsUrl,
      success: metrics.success,
      duration: metrics.duration,
      closeReason: metrics.closeReason,
      retryRecommended: metrics.retryRecommended
    });
  }
}
