/**
 * @fileoverview Logger System Tests
 * 
 * Comprehensive test suite for the logger system including:
 * - Logger configuration and initialization
 * - Log level filtering
 * - Automatic context detection
 * - Custom formatters and output handlers
 * - Child logger creation
 * - Global logger management
 * - Method logging decorator
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Logger,
  LogLevel,
  ILogger,
  ILoggerConfig,
  getLogger,
  setLogger,
  configureLogger,
  createLogger,
  logMethod,
} from '../logger.js';

describe('Logger System', () => {
  let mockConsole: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Mock console methods
    mockConsole = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    
    // Replace console methods
    vi.spyOn(console, 'debug').mockImplementation(mockConsole.debug);
    vi.spyOn(console, 'info').mockImplementation(mockConsole.info);
    vi.spyOn(console, 'warn').mockImplementation(mockConsole.warn);
    vi.spyOn(console, 'error').mockImplementation(mockConsole.error);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Logger Configuration', () => {
    it('should initialize with default configuration', () => {
      const logger = new Logger();
      
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should initialize with custom configuration', () => {
      const config: Partial<ILoggerConfig> = {
        level: LogLevel.DEBUG,
        includeTimestamp: false,
        enableColors: false,
      };
      
      const logger = new Logger(config);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should initialize with custom context', () => {
      const logger = new Logger({}, 'TestContext');
      
      logger.info('Test message');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[TestContext]')
      );
    });
  });

  describe('Log Level Filtering', () => {
    it('should filter messages based on log level', () => {
      const logger = new Logger({ level: LogLevel.WARN });
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
      
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
    });

    it('should allow all messages at DEBUG level', () => {
      const logger = new Logger({ level: LogLevel.DEBUG });
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
      
      expect(mockConsole.debug).toHaveBeenCalledTimes(1);
      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
    });

    it('should block all messages at NONE level', () => {
      const logger = new Logger({ level: LogLevel.NONE });
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
      
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).not.toHaveBeenCalled();
      expect(mockConsole.error).not.toHaveBeenCalled();
    });

    it('should allow dynamic log level changes', () => {
      const logger = new Logger({ level: LogLevel.ERROR });
      
      logger.info('Should not appear');
      expect(mockConsole.info).not.toHaveBeenCalled();
      
      logger.setLevel(LogLevel.INFO);
      logger.info('Should appear');
      expect(mockConsole.info).toHaveBeenCalledTimes(1);
    });
  });

  describe('Context Detection', () => {
    it('should automatically detect context from call stack', () => {
      const logger = new Logger({ autoDetectContext: true });
      
      function testFunction() {
        logger.info('Test message');
      }
      
      testFunction();
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[testFunction()]')
      );
    });

    it('should use provided context over auto-detection', () => {
      const logger = new Logger({ autoDetectContext: true });
      
      logger.info('Test message', 'CustomContext');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[CustomContext]')
      );
    });

    it('should disable auto-detection when configured', () => {
      const logger = new Logger({ autoDetectContext: false });
      
      function testFunction() {
        logger.info('Test message');
      }
      
      testFunction();
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.not.stringContaining('[testFunction()]')
      );
    });
  });

  describe('Message Formatting', () => {
    it('should format messages with timestamp', () => {
      const logger = new Logger({ includeTimestamp: true, enableColors: false });
      
      logger.info('Test message');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{2}:\d{2}:\d{2}\].*Test message/)
      );
    });

    it('should format messages without timestamp', () => {
      const logger = new Logger({ includeTimestamp: false, enableColors: false });
      
      logger.info('Test message');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.not.stringMatching(/\[\d{2}:\d{2}:\d{2}\]/)
      );
    });

    it('should format messages with colors when enabled', () => {
      const logger = new Logger({ enableColors: true });
      
      logger.error('Error message');
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('\x1b[31m') // Red color code
      );
    });

    it('should format messages without colors when disabled', () => {
      const logger = new Logger({ enableColors: false });
      
      logger.error('Error message');
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.not.stringContaining('\x1b[31m') // Red color code
      );
    });
  });

  describe('Custom Formatters and Output Handlers', () => {
    it('should use custom formatter', () => {
      const customFormatter = vi.fn((level, message, context) => {
        return `CUSTOM: ${message}`;
      });
      
      const logger = new Logger({ formatter: customFormatter });
      
      logger.info('Test message');
      
      expect(customFormatter).toHaveBeenCalledWith(
        LogLevel.INFO,
        'Test message',
        expect.any(String),
        expect.any(Date)
      );
      expect(mockConsole.info).toHaveBeenCalledWith('CUSTOM: Test message');
    });

    it('should use custom output handler', () => {
      const customHandler = vi.fn();
      
      const logger = new Logger({ outputHandler: customHandler });
      
      logger.info('Test message');
      
      expect(customHandler).toHaveBeenCalledWith(
        expect.stringContaining('Test message'),
        LogLevel.INFO
      );
      expect(mockConsole.info).not.toHaveBeenCalled();
    });
  });

  describe('Child Logger Creation', () => {
    it('should create child logger with inherited configuration', () => {
      const parentLogger = new Logger({ level: LogLevel.DEBUG, enableColors: false });
      const childLogger = parentLogger.createChildLogger('ChildContext');
      
      childLogger.debug('Debug message');
      
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('[ChildContext]')
      );
    });

    it('should create child logger with specific context', () => {
      const parentLogger = new Logger();
      const childLogger = parentLogger.createChildLogger('SpecificContext');
      
      childLogger.info('Test message');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[SpecificContext]')
      );
    });
  });

  describe('Global Logger Management', () => {
    it('should get default global logger', () => {
      const logger = getLogger();
      expect(logger).toBeDefined();
    });

    it('should set custom global logger', () => {
      const customLogger = new Logger({ level: LogLevel.DEBUG });
      setLogger(customLogger);
      
      const retrievedLogger = getLogger();
      expect(retrievedLogger).toBe(customLogger);
    });

    it('should configure global logger', () => {
      configureLogger({ level: LogLevel.ERROR });
      
      const logger = getLogger();
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });

    it('should create logger with context', () => {
      const logger = createLogger('TestContext');
      
      logger.info('Test message');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[TestContext]')
      );
    });
  });

  describe('Generic Log Method', () => {
    it('should log with specific levels', () => {
      const logger = new Logger({ level: LogLevel.DEBUG });
      
      logger.log(LogLevel.DEBUG, 'Debug message');
      logger.log(LogLevel.INFO, 'Info message');
      logger.log(LogLevel.WARN, 'Warning message');
      logger.log(LogLevel.ERROR, 'Error message');
      
      expect(mockConsole.debug).toHaveBeenCalledTimes(1);
      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
    });

    it('should respect log level filtering with generic method', () => {
      const logger = new Logger({ level: LogLevel.WARN });
      
      logger.log(LogLevel.DEBUG, 'Debug message');
      logger.log(LogLevel.INFO, 'Info message');
      logger.log(LogLevel.WARN, 'Warning message');
      logger.log(LogLevel.ERROR, 'Error message');
      
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('Method Logging Decorator', () => {
    it('should provide logMethod decorator function', () => {
      expect(logMethod).toBeDefined();
      expect(typeof logMethod).toBe('function');
    });

    it('should create a decorator that returns a function', () => {
      const decorator = logMethod(LogLevel.DEBUG);
      expect(typeof decorator).toBe('function');
    });

    it('should work with manual method wrapping', () => {
      configureLogger({ level: LogLevel.DEBUG });
      
      class TestClass {
        testMethod(arg1: string, arg2: number) {
          return `${arg1}-${arg2}`;
        }
      }
      
      // Manually apply the decorator logic
      const originalMethod = TestClass.prototype.testMethod;
      const decorator = logMethod(LogLevel.DEBUG);
      const wrappedMethod = decorator(TestClass.prototype, 'testMethod', {
        value: originalMethod,
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      if (wrappedMethod && wrappedMethod.value) {
        TestClass.prototype.testMethod = wrappedMethod.value;
      }
      
      const instance = new TestClass();
      const result = instance.testMethod('hello', 42);
      
      expect(result).toBe('hello-42');
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Method called with 2 arguments')
      );
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Method completed successfully')
      );
    });

    it('should handle async methods with manual wrapping', async () => {
      configureLogger({ level: LogLevel.DEBUG });
      
      class TestClass {
        async asyncMethod(value: string): Promise<string> {
          return new Promise(resolve => {
            setTimeout(() => resolve(`async-${value}`), 10);
          });
        }
      }
      
      // Manually apply the decorator logic
      const originalMethod = TestClass.prototype.asyncMethod;
      const decorator = logMethod(LogLevel.DEBUG);
      const wrappedMethod = decorator(TestClass.prototype, 'asyncMethod', {
        value: originalMethod,
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      if (wrappedMethod && wrappedMethod.value) {
        TestClass.prototype.asyncMethod = wrappedMethod.value;
      }
      
      const instance = new TestClass();
      const result = await instance.asyncMethod('test');
      
      expect(result).toBe('async-test');
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Method called with 1 arguments')
      );
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Method completed successfully')
      );
    });

    it('should handle method errors with manual wrapping', () => {
      configureLogger({ level: LogLevel.DEBUG });
      
      class TestClass {
        errorMethod() {
          throw new Error('Test error');
        }
      }
      
      // Manually apply the decorator logic
      const originalMethod = TestClass.prototype.errorMethod;
      const decorator = logMethod(LogLevel.DEBUG);
      const wrappedMethod = decorator(TestClass.prototype, 'errorMethod', {
        value: originalMethod,
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      if (wrappedMethod && wrappedMethod.value) {
        TestClass.prototype.errorMethod = wrappedMethod.value;
      }
      
      const instance = new TestClass();
      
      expect(() => instance.errorMethod()).toThrow('Test error');
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Method called with 0 arguments')
      );
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Method failed: Error: Test error')
      );
    });

    it('should handle async method errors with manual wrapping', async () => {
      configureLogger({ level: LogLevel.DEBUG });
      
      class TestClass {
        async asyncErrorMethod(): Promise<string> {
          throw new Error('Async test error');
        }
      }
      
      // Manually apply the decorator logic
      const originalMethod = TestClass.prototype.asyncErrorMethod;
      const decorator = logMethod(LogLevel.DEBUG);
      const wrappedMethod = decorator(TestClass.prototype, 'asyncErrorMethod', {
        value: originalMethod,
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      if (wrappedMethod && wrappedMethod.value) {
        TestClass.prototype.asyncErrorMethod = wrappedMethod.value;
      }
      
      const instance = new TestClass();
      
      await expect(instance.asyncErrorMethod()).rejects.toThrow('Async test error');
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Method called with 0 arguments')
      );
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Method failed: Async test error')
      );
    });
  });

  describe('Integration with Agent Framework', () => {
    it('should work with BaseAgent configuration', () => {
      const logger = createLogger('BaseAgent', { level: LogLevel.INFO });
      
      logger.info('Agent initialized');
      logger.debug('Processing user input: Hello world');
      logger.warn('Agent is already processing a request');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[BaseAgent]')
      );
      expect(mockConsole.debug).not.toHaveBeenCalled(); // Below INFO level
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('[BaseAgent]')
      );
    });

    it('should work with GeminiChat configuration', () => {
      const logger = createLogger('GeminiChat', { level: LogLevel.DEBUG });
      
      logger.debug('Initializing GeminiChat with model: gemini-pro');
      logger.info('Sending message stream: Hello world');
      logger.error('Error in sendMessageStream: API error');
      
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('[GeminiChat]')
      );
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[GeminiChat]')
      );
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('[GeminiChat]')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle formatter errors gracefully', () => {
      const badFormatter = vi.fn(() => {
        throw new Error('Formatter error');
      });
      
      const logger = new Logger({ formatter: badFormatter });
      
      // Should not throw
      expect(() => logger.info('Test message')).not.toThrow();
      
      // Should fall back to default behavior
      expect(mockConsole.info).toHaveBeenCalled();
    });

    it('should handle output handler errors gracefully', () => {
      const badHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      
      const logger = new Logger({ outputHandler: badHandler });
      
      // Should not throw
      expect(() => logger.info('Test message')).not.toThrow();
      
      // Handler should still be called
      expect(badHandler).toHaveBeenCalled();
    });
  });
});