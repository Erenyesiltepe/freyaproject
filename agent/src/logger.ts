export interface LogLevel {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  meta?: Record<string, any>;
}

class Logger {
  private formatLog(level: LogLevel['level'], message: string, meta?: Record<string, any>): LogLevel {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(meta && { meta })
    };
  }

  private output(logEntry: LogLevel) {
    console.log(JSON.stringify(logEntry, null, 2));
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
    this.output(this.formatLog('debug', message, meta));
  }
}

export const logger = new Logger();