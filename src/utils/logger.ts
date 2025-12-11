import { formatDateTime } from './date.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private level: LogLevel;
  private module: string;

  constructor(module: string, level: LogLevel = LogLevel.INFO) {
    this.module = module;
    this.level = level;
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = formatDateTime(new Date());
    const prefix = `[${timestamp}] [${level}] [${this.module}]`;
    return `${prefix} ${message}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message, ...args), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message, ...args), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message, ...args), ...args);
    }
  }

  error(message: string, error?: Error | any, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      const errorMsg = error instanceof Error 
        ? `${message}: ${error.message}\n${error.stack}`
        : error 
        ? `${message}: ${JSON.stringify(error)}`
        : message;
      console.error(this.formatMessage('ERROR', errorMsg, ...args), ...args);
    }
  }

  // 记录方法调用开始
  start(method: string, params?: Record<string, any>): void {
    this.debug(`→ ${method}`, params ? `params: ${JSON.stringify(params)}` : '');
  }

  // 记录方法调用结束
  end(method: string, result?: any, duration?: number): void {
    const durationMsg = duration ? ` (${duration}ms)` : '';
    this.debug(`← ${method}${durationMsg}`, result ? `result: ${JSON.stringify(result)}` : '');
  }
}

export function createLogger(module: string, level?: LogLevel): Logger {
  const logLevel = level ?? (process.env.LOG_LEVEL 
    ? LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel] ?? LogLevel.INFO
    : LogLevel.INFO);
  return new Logger(module, logLevel);
}

