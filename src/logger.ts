/**
 * @fileoverview Logger System Implementation
 * 
 * This module provides a comprehensive logging system with automatic class/method detection,
 * multiple log levels, and flexible configuration options.
 */

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export interface ILoggerConfig {
  /** Global log level */
  level: LogLevel;
  /** Enable automatic class/method detection */
  autoDetectContext: boolean;
  /** Custom log formatter */
  formatter?: (level: LogLevel, message: string, context?: string, timestamp?: Date) => string;
  /** Custom log output handler */
  outputHandler?: (formattedMessage: string, level: LogLevel) => void;
  /** Enable timestamps */
  includeTimestamp: boolean;
  /** Enable colors in console output */
  enableColors: boolean;
}

export interface ILogger {
  debug(message: string, context?: string): void;
  info(message: string, context?: string): void;
  warn(message: string, context?: string): void;
  error(message: string, context?: string): void;
  log(level: LogLevel, message: string, context?: string): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  createChildLogger(context: string): ILogger;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: ILoggerConfig = {
  level: LogLevel.INFO,
  autoDetectContext: true,
  includeTimestamp: true,
  enableColors: true,
};

/**
 * ANSI color codes for console output
 */
const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * Logger implementation with automatic context detection
 */
export class Logger implements ILogger {
  private config: ILoggerConfig;
  private context?: string;

  constructor(config: Partial<ILoggerConfig> = {}, context?: string) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.context = context;
  }

  /**
   * Debug level logging
   */
  debug(message: string, context?: string): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Info level logging
   */
  info(message: string, context?: string): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: string): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Error level logging
   */
  error(message: string, context?: string): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Generic log method with level specification
   */
  log(level: LogLevel, message: string, context?: string): void {
    if (this.config.level < level) {
      return;
    }

    const finalContext = context || this.context || (this.config.autoDetectContext ? this.detectContext() : undefined);
    const timestamp = this.config.includeTimestamp ? new Date() : undefined;
    
    let formattedMessage: string;
    
    // Try custom formatter, fall back to default on error
    try {
      formattedMessage = this.config.formatter
        ? this.config.formatter(level, message, finalContext, timestamp)
        : this.defaultFormatter(level, message, finalContext, timestamp);
    } catch (error) {
      // Fall back to default formatter if custom formatter fails
      formattedMessage = this.defaultFormatter(level, message, finalContext, timestamp);
    }

    // Try custom output handler, fall back to default on error
    try {
      if (this.config.outputHandler) {
        this.config.outputHandler(formattedMessage, level);
      } else {
        this.defaultOutputHandler(formattedMessage, level);
      }
    } catch (error) {
      // Fall back to default output handler if custom handler fails
      this.defaultOutputHandler(formattedMessage, level);
    }
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Create a child logger with a specific context
   */
  createChildLogger(context: string): ILogger {
    return new Logger(this.config, context);
  }

  /**
   * Detect the calling context automatically using stack trace
   */
  private detectContext(): string | undefined {
    const stack = new Error().stack;
    if (!stack) return undefined;

    const lines = stack.split('\n');
    // Skip Error, this method, and the calling log method
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('Logger.') && !line.includes('at Object.')) {
        const match = line.match(/at\s+(?:(\w+)\.)?(\w+)\s*\(/);
        if (match) {
          const className = match[1];
          const methodName = match[2];
          if (className && methodName) {
            return `${className}.${methodName}()`;
          } else if (methodName) {
            return `${methodName}()`;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Default message formatter
   */
  private defaultFormatter(level: LogLevel, message: string, context?: string, timestamp?: Date): string {
    const parts: string[] = [];

    // Add timestamp
    if (timestamp) {
      const timeStr = timestamp.toISOString().split('T')[1].slice(0, 8);
      parts.push(`[${timeStr}]`);
    }

    // Add level
    const levelStr = this.getLevelString(level);
    if (this.config.enableColors) {
      parts.push(this.colorizeLevel(levelStr, level));
    } else {
      parts.push(`[${levelStr}]`);
    }

    // Add context
    if (context) {
      const contextStr = this.config.enableColors
        ? `${Colors.cyan}[${context}]${Colors.reset}`
        : `[${context}]`;
      parts.push(contextStr);
    }

    // Add message
    parts.push(message);

    return parts.join(' ');
  }

  /**
   * Default output handler
   */
  private defaultOutputHandler(message: string, level: LogLevel): void {
    switch (level) {
      case LogLevel.ERROR:
        console.error(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.DEBUG:
        console.debug(message);
        break;
    }
  }

  /**
   * Get string representation of log level
   */
  private getLevelString(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR:
        return 'ERROR';
      case LogLevel.WARN:
        return 'WARN';
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.DEBUG:
        return 'DEBUG';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Colorize log level based on severity
   */
  private colorizeLevel(levelStr: string, level: LogLevel): string {
    const coloredLevel = (() => {
      switch (level) {
        case LogLevel.ERROR:
          return `${Colors.red}${levelStr}${Colors.reset}`;
        case LogLevel.WARN:
          return `${Colors.yellow}${levelStr}${Colors.reset}`;
        case LogLevel.INFO:
          return `${Colors.green}${levelStr}${Colors.reset}`;
        case LogLevel.DEBUG:
          return `${Colors.blue}${levelStr}${Colors.reset}`;
        default:
          return levelStr;
      }
    })();
    return `[${coloredLevel}]`;
  }
}

/**
 * Global logger instance
 */
let globalLogger: ILogger = new Logger();

/**
 * Get the global logger instance
 */
export function getLogger(): ILogger {
  return globalLogger;
}

/**
 * Set the global logger instance
 */
export function setLogger(logger: ILogger): void {
  globalLogger = logger;
}

/**
 * Configure the global logger
 */
export function configureLogger(config: Partial<ILoggerConfig>): void {
  globalLogger = new Logger(config);
}

/**
 * Create a logger with specific context
 */
export function createLogger(context: string, config?: Partial<ILoggerConfig>): ILogger {
  return new Logger(config, context);
}

/**
 * Utility function to create a method logger decorator
 */
export function logMethod(level: LogLevel = LogLevel.DEBUG) {
  return function (target: any, propertyKey: string, descriptor?: PropertyDescriptor) {
    // Handle both traditional decorators and new decorator syntax
    if (descriptor && descriptor.value) {
      // Traditional decorator syntax
      const originalMethod = descriptor.value;

      descriptor.value = function (...args: any[]) {
        const logger = getLogger();
        const className = target.constructor.name;
        const context = `${className}.${propertyKey}()`;
        
        logger.log(level, `Method called with ${args.length} arguments`, context);
        
        try {
          const result = originalMethod.apply(this, args);
          
          // Handle async methods
          if (result && typeof result.then === 'function') {
            return result.then((asyncResult: any) => {
              logger.log(level, `Method completed successfully`, context);
              return asyncResult;
            }).catch((error: any) => {
              logger.error(`Method failed: ${error.message}`, context);
              throw error;
            });
          }
          
          logger.log(level, `Method completed successfully`, context);
          return result;
        } catch (error) {
          logger.error(`Method failed: ${error}`, context);
          throw error;
        }
      };

      return descriptor;
    } else {
      // New decorator syntax or property decorator
      return function (value: any, context: any) {
        if (typeof value === 'function') {
          return function (...args: any[]) {
            const logger = getLogger();
            const className = context.name || 'Unknown';
            const contextStr = `${className}.${propertyKey}()`;
            
            logger.log(level, `Method called with ${args.length} arguments`, contextStr);
            
            try {
              const result = value.apply(this, args);
              
              // Handle async methods
              if (result && typeof result.then === 'function') {
                return result.then((asyncResult: any) => {
                  logger.log(level, `Method completed successfully`, contextStr);
                  return asyncResult;
                }).catch((error: any) => {
                  logger.error(`Method failed: ${error.message}`, contextStr);
                  throw error;
                });
              }
              
              logger.log(level, `Method completed successfully`, contextStr);
              return result;
            } catch (error) {
              logger.error(`Method failed: ${error}`, contextStr);
              throw error;
            }
          };
        }
        return value;
      };
    }
  };
}