
interface LogLevel {
  ERROR: 'error';
  WARN: 'warn';
  INFO: 'info';
  DEBUG: 'debug';
  VERBOSE: 'verbose';
}

interface LogMeta {
  [key: string]: any;
}

class ClientLogger {
  private levels: LogLevel = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
    VERBOSE: 'verbose'
  };

  private isDevelopment = import.meta.env.DEV;

  private formatMessage(level: string, service: string, message: string, meta?: LogMeta): string {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const metaStr = meta && Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${service}] ${level.toUpperCase()}: ${message} ${metaStr}`;
  }

  private log(level: keyof LogLevel, service: string, message: string, meta?: LogMeta): void {
    if (!this.isDevelopment && level === 'DEBUG') return;

    const formattedMessage = this.formatMessage(level.toLowerCase(), service, message, meta);

    switch (level) {
      case 'ERROR':
        console.error(formattedMessage);
        break;
      case 'WARN':
        console.warn(formattedMessage);
        break;
      case 'INFO':
        console.info(formattedMessage);
        break;
      case 'DEBUG':
      case 'VERBOSE':
        console.log(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  error(service: string, message: string, meta?: LogMeta): void {
    this.log('ERROR', service, message, meta);
  }

  warn(service: string, message: string, meta?: LogMeta): void {
    this.log('WARN', service, message, meta);
  }

  info(service: string, message: string, meta?: LogMeta): void {
    this.log('INFO', service, message, meta);
  }

  debug(service: string, message: string, meta?: LogMeta): void {
    this.log('DEBUG', service, message, meta);
  }

  verbose(service: string, message: string, meta?: LogMeta): void {
    this.log('VERBOSE', service, message, meta);
  }

  // Create service-specific logger
  createServiceLogger(service: string) {
    return {
      error: (message: string, meta?: LogMeta) => this.error(service, message, meta),
      warn: (message: string, meta?: LogMeta) => this.warn(service, message, meta),
      info: (message: string, meta?: LogMeta) => this.info(service, message, meta),
      debug: (message: string, meta?: LogMeta) => this.debug(service, message, meta),
      verbose: (message: string, meta?: LogMeta) => this.verbose(service, message, meta),
    };
  }
}

export const logger = new ClientLogger();
export const createServiceLogger = (service: string) => logger.createServiceLogger(service);
