
import { WebSocketErrorAnalyzer, WebSocketErrorContext, WebSocketErrorAnalysis } from './websocket-error-analyzer';

export class WebSocketErrorLogger {
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
  }

  logComprehensiveError(context: WebSocketErrorContext): WebSocketErrorAnalysis {
    const { error, ws, url } = context;
    const analysis = WebSocketErrorAnalyzer.analyzeError(context);

    // Log basic error information
    this.logger.error('WebSocket error occurred', {
      ...WebSocketErrorAnalyzer.extractBasicErrorInfo(error, ws, url),
      ...WebSocketErrorAnalyzer.extractEnvironmentInfo(),
      errorObject: WebSocketErrorAnalyzer.createErrorObject(error)
    });

    // Log specific error type details
    this.logSpecificErrorDetails(error);

    // Log additional error properties
    this.logAdditionalErrorProperties(error);

    // Log network analysis
    this.logNetworkAnalysis(url);

    // Log final categorization
    this.logger.error('Error categorization', {
      category: analysis.category,
      finalMessage: analysis.message,
      shouldRetry: analysis.shouldRetry,
      metadata: analysis.metadata
    });

    return analysis;
  }

  private logSpecificErrorDetails(error: Event) {
    if (error instanceof ErrorEvent) {
      this.logger.error('ErrorEvent specific details', 
        WebSocketErrorAnalyzer.extractErrorEventDetails(error)
      );
    } else if (error instanceof CloseEvent) {
      this.logger.error('CloseEvent details', 
        WebSocketErrorAnalyzer.extractCloseEventDetails(error)
      );
    } else if (error instanceof Event) {
      this.logger.error('Generic Event details', 
        WebSocketErrorAnalyzer.extractGenericEventDetails(error)
      );
    }
  }

  private logAdditionalErrorProperties(error: Event) {
    const additionalProps = WebSocketErrorAnalyzer.extractErrorProperties(error);
    if (Object.keys(additionalProps).length > 0) {
      this.logger.error('Additional error properties', additionalProps);
    }
  }

  private logNetworkAnalysis(url: string) {
    const urlAnalysis = WebSocketErrorAnalyzer.analyzeWebSocketUrl(url);
    if (urlAnalysis) {
      this.logger.error('WebSocket URL analysis', urlAnalysis);
    }
  }
}
