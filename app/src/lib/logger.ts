type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  meta?: Record<string, any>;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private formatLog(level: LogLevel, message: string, meta?: Record<string, any>): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      meta
    };
  }

  private output(logEntry: LogEntry) {
    if (this.isDevelopment) {
      console.log(JSON.stringify(logEntry, null, 2));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }

  info(message: string, meta?: Record<string, any>) {
    this.output(this.formatLog('info', message, meta));
  }

  warn(message: string, meta?: Record<string, any>) {
    this.output(this.formatLog('warn', message, meta));
  }

  error(message: string, meta?: Record<string, any>) {
    this.output(this.formatLog('error', message, meta));
  }

  debug(message: string, meta?: Record<string, any>) {
    if (this.isDevelopment) {
      this.output(this.formatLog('debug', message, meta));
    }
  }
}

export const logger = new Logger();