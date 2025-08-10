/**
 * @fileoverview Test Utilities for MCP Transport Testing
 * 
 * This module provides comprehensive test utilities for MCP transport testing,
 * including helper functions for creating test data, managing async operations,
 * and validating transport behavior.
 */

import { vi } from 'vitest';
import { EventEmitter } from 'events';
import { 
  McpRequest, 
  McpResponse, 
  McpNotification, 
  McpStdioTransportConfig,
  McpStreamableHttpTransportConfig,
  McpAuthConfig,
  McpTool,
  McpContent,
  McpToolResult 
} from '../../../interfaces.js';

/**
 * Enhanced test utilities for MCP transport testing
 */
export class TransportTestUtils {
  /**
   * Create a mock AbortController with enhanced functionality
   */
  static createMockAbortController(autoAbort?: number): {
    controller: AbortController;
    signal: AbortSignal;
    abort: ReturnType<typeof vi.fn>;
  } {
    const signal = {
      aborted: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onabort: null,
      reason: undefined,
      throwIfAborted: vi.fn(),
    } as AbortSignal;
    
    const abort = vi.fn(() => {
      signal.aborted = true;
      signal.onabort?.(new Event('abort'));
    });
    
    const controller = { signal, abort } as AbortController;
    
    // Auto-abort after specified time
    if (autoAbort) {
      setTimeout(() => abort(), autoAbort);
    }
    
    return { controller, signal, abort };
  }
  
  /**
   * Wait for a condition to be met with timeout
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    options: {
      timeout?: number;
      interval?: number;
      message?: string;
    } = {}
  ): Promise<void> {
    const { timeout = 5000, interval = 10, message = 'Condition not met' } = options;
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await condition();
      if (result) {
        return;
      }
      await this.delay(interval);
    }
    
    throw new Error(`${message} (timeout after ${timeout}ms)`);
  }
  
  /**
   * Wait for an event to be emitted
   */
  static async waitForEvent(
    emitter: EventEmitter,
    event: string,
    timeout: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Event '${event}' not emitted within ${timeout}ms`));
      }, timeout);
      
      emitter.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }
  
  /**
   * Create a delay promise
   */
  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Create a mock fetch implementation
   */
  static createMockFetch(responses: Array<{
    url?: string | RegExp;
    method?: string;
    status?: number;
    body?: any;
    headers?: Record<string, string>;
    delay?: number;
    error?: Error;
  }> = []): typeof fetch {
    return vi.fn(async (url, options) => {
      const method = options?.method || 'GET';
      const urlString = url.toString();
      
      // Find matching response
      const response = responses.find(r => {
        if (r.url instanceof RegExp) {
          return r.url.test(urlString);
        } else if (r.url) {
          return urlString.includes(r.url);
        }
        return !r.method || r.method === method;
      });
      
      if (!response) {
        throw new Error(`No mock response configured for ${method} ${urlString}`);
      }
      
      // Simulate delay
      if (response.delay) {
        await this.delay(response.delay);
      }
      
      // Simulate error
      if (response.error) {
        throw response.error;
      }
      
      // Create mock response
      const mockResponse = {
        ok: (response.status || 200) >= 200 && (response.status || 200) < 300,
        status: response.status || 200,
        statusText: response.status === 404 ? 'Not Found' : 'OK',
        headers: new Headers(response.headers || {}),
        json: async () => response.body,
        text: async () => typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
      };
      
      return mockResponse as Response;
    }) as typeof fetch;
  }
  
  /**
   * Create a mock EventSource
   */
  static createMockEventSource(): {
    EventSource: typeof EventSource;
    instances: Array<MockEventSourceInstance>;
  } {
    const instances: Array<MockEventSourceInstance> = [];
    
    class MockEventSourceInstance extends EventEmitter {
      public url: string;
      public readyState: number = 0;
      public onopen?: ((event: Event) => void) | null = null;
      public onmessage?: ((event: MessageEvent) => void) | null = null;
      public onerror?: ((event: Event) => void) | null = null;
      
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 2;
      
      constructor(url: string) {
        super();
        this.url = url;
        this.readyState = MockEventSourceInstance.CONNECTING;
        instances.push(this);
        
        // Auto-open after next tick
        setTimeout(() => {
          this.readyState = MockEventSourceInstance.OPEN;
          this.onopen?.(new Event('open'));
          this.emit('open');
        }, 0);
      }
      
      close() {
        this.readyState = MockEventSourceInstance.CLOSED;
        this.emit('close');
      }
      
      simulateMessage(data: string, eventType?: string, lastEventId?: string) {
        const event = new MessageEvent(eventType || 'message', {
          data,
          lastEventId: lastEventId || '',
        });
        
        if (eventType) {
          this.emit(eventType, event);
        } else {
          this.onmessage?.(event);
          this.emit('message', event);
        }
      }
      
      simulateError() {
        const errorEvent = new Event('error');
        this.readyState = MockEventSourceInstance.CLOSED;
        this.onerror?.(errorEvent);
        this.emit('error', errorEvent);
      }
    }
    
    return {
      EventSource: MockEventSourceInstance as any,
      instances,
    };
  }
  
  /**
   * Validate JSON-RPC message format
   */
  static validateJsonRpcMessage(
    message: any,
    type: 'request' | 'response' | 'notification'
  ): boolean {
    if (!message || typeof message !== 'object') {
      return false;
    }
    
    if (message.jsonrpc !== '2.0') {
      return false;
    }
    
    switch (type) {
      case 'request':
        return 'id' in message && 'method' in message;
      case 'response':
        return 'id' in message && ('result' in message || 'error' in message);
      case 'notification':
        return 'method' in message && !('id' in message);
      default:
        return false;
    }
  }
  
  /**
   * Create a timeout promise that rejects after specified time
   */
  static timeout(ms: number, message?: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(message || `Operation timed out after ${ms}ms`));
      }, ms);
    });
  }
  
  /**
   * Race a promise against a timeout
   */
  static async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message?: string
  ): Promise<T> {
    return Promise.race([
      promise,
      this.timeout(timeoutMs, message),
    ]);
  }
  
  /**
   * Collect events from an EventEmitter for a specified duration
   */
  static async collectEvents(
    emitter: EventEmitter,
    event: string,
    duration: number
  ): Promise<any[]> {
    const events: any[] = [];
    
    const handler = (data: any) => {
      events.push(data);
    };
    
    emitter.on(event, handler);
    
    await this.delay(duration);
    
    emitter.off(event, handler);
    
    return events;
  }
  
  /**
   * Create a spy for console methods
   */
  static spyOnConsole(): {
    restore: () => void;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  } {
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };
    
    const spies = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    
    console.log = spies.log;
    console.warn = spies.warn;
    console.error = spies.error;
    
    return {
      ...spies,
      restore: () => {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
      },
    };
  }
}

/**
 * Mock EventSource instance interface
 */
export interface MockEventSourceInstance extends EventEmitter {
  url: string;
  readyState: number;
  close(): void;
  simulateMessage(data: string, eventType?: string, lastEventId?: string): void;
  simulateError(): void;
}

/**
 * Data factory for creating test data with realistic values
 */
export class McpTestDataFactory {
  private static requestIdCounter = 1;
  
  /**
   * Create a mock STDIO transport configuration
   */
  static createStdioConfig(overrides?: Partial<McpStdioTransportConfig>): McpStdioTransportConfig {
    return {
      type: 'stdio',
      command: 'node',
      args: ['./mock-server.js'],
      env: { NODE_ENV: 'test', MCP_LOG_LEVEL: 'debug' },
      cwd: '/tmp/mcp-test',
      ...overrides,
    };
  }
  
  /**
   * Create a mock HTTP transport configuration
   */
  static createHttpConfig(overrides?: Partial<McpStreamableHttpTransportConfig>): McpStreamableHttpTransportConfig {
    return {
      type: 'streamable-http',
      url: 'http://localhost:3000/mcp',
      headers: {
        'User-Agent': 'MiniAgent-Test/1.0',
        'Accept': 'application/json, text/event-stream',
      },
      streaming: true,
      timeout: 30000,
      keepAlive: true,
      ...overrides,
    };
  }
  
  /**
   * Create authentication configurations
   */
  static createAuthConfig(type: 'bearer' | 'basic' | 'oauth2'): McpAuthConfig {
    const configs = {
      bearer: {
        type: 'bearer' as const,
        token: 'test-bearer-token-' + Math.random().toString(36).substr(2, 8),
      },
      basic: {
        type: 'basic' as const,
        username: 'testuser',
        password: 'testpass123',
      },
      oauth2: {
        type: 'oauth2' as const,
        token: 'oauth2-access-token-' + Math.random().toString(36).substr(2, 8),
        oauth2: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          tokenUrl: 'https://auth.example.com/oauth2/token',
          scope: 'mcp:read mcp:write mcp:tools',
        },
      },
    };
    
    return configs[type];
  }
  
  /**
   * Create a mock MCP request
   */
  static createRequest(overrides?: Partial<McpRequest>): McpRequest {
    return {
      jsonrpc: '2.0',
      id: `req-${this.requestIdCounter++}-${Date.now()}`,
      method: 'tools/call',
      params: {
        name: 'test_tool',
        arguments: {
          input: 'test input data',
          options: { verbose: true },
        },
      },
      ...overrides,
    };
  }
  
  /**
   * Create a mock MCP response
   */
  static createResponse(requestId?: string | number, overrides?: Partial<McpResponse>): McpResponse {
    return {
      jsonrpc: '2.0',
      id: requestId || `req-${this.requestIdCounter}`,
      result: {
        content: [
          {
            type: 'text',
            text: 'Operation completed successfully',
          },
        ] as McpContent[],
        isError: false,
        executionTime: Math.floor(Math.random() * 1000),
      } as McpToolResult,
      ...overrides,
    };
  }
  
  /**
   * Create a mock MCP notification
   */
  static createNotification(overrides?: Partial<McpNotification>): McpNotification {
    return {
      jsonrpc: '2.0',
      method: 'notifications/tools/list_changed',
      params: {
        timestamp: Date.now(),
        changeType: 'added',
        affectedTools: ['new_tool'],
      },
      ...overrides,
    };
  }
  
  /**
   * Create a mock MCP error response
   */
  static createErrorResponse(requestId: string | number, code: number = -32000, message: string = 'Test error'): McpResponse {
    return {
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code,
        message,
        data: {
          timestamp: Date.now(),
          context: 'test',
        },
      },
    };
  }
  
  /**
   * Create a mock MCP tool definition
   */
  static createTool(overrides?: Partial<McpTool>): McpTool {
    const toolId = Math.random().toString(36).substr(2, 8);
    
    return {
      name: `test_tool_${toolId}`,
      displayName: `Test Tool ${toolId}`,
      description: 'A tool for testing purposes',
      inputSchema: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Input text to process',
          },
          options: {
            type: 'object',
            properties: {
              verbose: {
                type: 'boolean',
                description: 'Enable verbose output',
                default: false,
              },
              format: {
                type: 'string',
                enum: ['json', 'text', 'xml'],
                description: 'Output format',
                default: 'text',
              },
            },
            required: [],
          },
        },
        required: ['input'],
      },
      capabilities: {
        streaming: false,
        requiresConfirmation: false,
        destructive: false,
      },
      ...overrides,
    };
  }
  
  /**
   * Create mock content blocks
   */
  static createContent(type: 'text' | 'image' | 'resource' = 'text'): McpContent {
    const contentTypes = {
      text: {
        type: 'text' as const,
        text: 'This is test content for validation',
      },
      image: {
        type: 'image' as const,
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9/xI',
        mimeType: 'image/png',
      },
      resource: {
        type: 'resource' as const,
        resource: {
          uri: 'file:///tmp/test-resource.txt',
          mimeType: 'text/plain',
          text: 'Resource content goes here',
        },
      },
    };
    
    return contentTypes[type];
  }
  
  /**
   * Create a sequence of related requests and responses
   */
  static createConversation(length: number = 3): Array<{
    request: McpRequest;
    response: McpResponse;
  }> {
    const conversation: Array<{ request: McpRequest; response: McpResponse }> = [];
    
    for (let i = 0; i < length; i++) {
      const request = this.createRequest({
        id: `conv-${i + 1}`,
        method: i === 0 ? 'initialize' : 'tools/call',
        params: i === 0 
          ? {
              protocolVersion: '2024-11-05',
              capabilities: { tools: { listChanged: true } },
              clientInfo: { name: 'TestClient', version: '1.0.0' },
            }
          : {
              name: `tool_${i}`,
              arguments: { step: i, data: `test data ${i}` },
            },
      });
      
      const response = this.createResponse(request.id, {
        result: i === 0
          ? {
              protocolVersion: '2024-11-05',
              capabilities: { tools: { listChanged: true } },
              serverInfo: { name: 'TestServer', version: '1.0.0' },
            }
          : {
              content: [this.createContent('text')],
              executionTime: Math.floor(Math.random() * 500),
            },
      });
      
      conversation.push({ request, response });
    }
    
    return conversation;
  }
  
  /**
   * Create batch of messages for stress testing
   */
  static createMessageBatch(count: number, type: 'request' | 'response' | 'notification' = 'request'): any[] {
    const messages: any[] = [];
    
    for (let i = 0; i < count; i++) {
      switch (type) {
        case 'request':
          messages.push(this.createRequest({ id: `batch-${i}` }));
          break;
        case 'response':
          messages.push(this.createResponse(`batch-${i}`));
          break;
        case 'notification':
          messages.push(this.createNotification({
            params: { batchIndex: i, timestamp: Date.now() },
          }));
          break;
      }
    }
    
    return messages;
  }
  
  /**
   * Create messages of varying sizes for testing serialization limits
   */
  static createVariableSizeMessages(): Array<{ size: string; message: McpRequest }> {
    const sizes = [
      { size: 'tiny', dataSize: 10 },
      { size: 'small', dataSize: 1000 },
      { size: 'medium', dataSize: 10000 },
      { size: 'large', dataSize: 100000 },
      { size: 'extra-large', dataSize: 1000000 },
    ];
    
    return sizes.map(({ size, dataSize }) => ({
      size,
      message: this.createRequest({
        params: {
          name: 'data_processor',
          arguments: {
            data: 'x'.repeat(dataSize),
            metadata: {
              size: dataSize,
              type: 'test-data',
              timestamp: Date.now(),
            },
          },
        },
      }),
    }));
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTestUtils {
  /**
   * Measure execution time of an async operation
   */
  static async measureTime<T>(operation: () => Promise<T>): Promise<{
    result: T;
    duration: number;
  }> {
    const startTime = performance.now();
    const result = await operation();
    const duration = performance.now() - startTime;
    
    return { result, duration };
  }
  
  /**
   * Run performance benchmarks
   */
  static async benchmark<T>(
    operation: () => Promise<T>,
    runs: number = 10
  ): Promise<{
    runs: number;
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
    results: T[];
  }> {
    const times: number[] = [];
    const results: T[] = [];
    
    for (let i = 0; i < runs; i++) {
      const { result, duration } = await this.measureTime(operation);
      times.push(duration);
      results.push(result);
    }
    
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / runs;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    return {
      runs,
      totalTime,
      averageTime,
      minTime,
      maxTime,
      results,
    };
  }
  
  /**
   * Test memory usage during operation
   */
  static async measureMemory<T>(operation: () => Promise<T>): Promise<{
    result: T;
    memoryBefore: NodeJS.MemoryUsage;
    memoryAfter: NodeJS.MemoryUsage;
    memoryDiff: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      arrayBuffers: number;
    };
  }> {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const memoryBefore = process.memoryUsage();
    const result = await operation();
    const memoryAfter = process.memoryUsage();
    
    const memoryDiff = {
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
      external: memoryAfter.external - memoryBefore.external,
      arrayBuffers: memoryAfter.arrayBuffers - memoryBefore.arrayBuffers,
    };
    
    return {
      result,
      memoryBefore,
      memoryAfter,
      memoryDiff,
    };
  }
}

/**
 * Assertion helpers for transport testing
 */
export class TransportAssertions {
  /**
   * Assert that a message is a valid JSON-RPC request
   */
  static assertValidRequest(message: any): asserts message is McpRequest {
    if (!TransportTestUtils.validateJsonRpcMessage(message, 'request')) {
      throw new Error('Invalid JSON-RPC request format');
    }
  }
  
  /**
   * Assert that a message is a valid JSON-RPC response
   */
  static assertValidResponse(message: any): asserts message is McpResponse {
    if (!TransportTestUtils.validateJsonRpcMessage(message, 'response')) {
      throw new Error('Invalid JSON-RPC response format');
    }
  }
  
  /**
   * Assert that a message is a valid JSON-RPC notification
   */
  static assertValidNotification(message: any): asserts message is McpNotification {
    if (!TransportTestUtils.validateJsonRpcMessage(message, 'notification')) {
      throw new Error('Invalid JSON-RPC notification format');
    }
  }
  
  /**
   * Assert that a response matches a request
   */
  static assertResponseMatchesRequest(request: McpRequest, response: McpResponse): void {
    if (request.id !== response.id) {
      throw new Error(`Response ID ${response.id} does not match request ID ${request.id}`);
    }
  }
  
  /**
   * Assert that an error has expected properties
   */
  static assertErrorHasCode(error: any, expectedCode: number): void {
    if (!error || typeof error !== 'object' || error.code !== expectedCode) {
      throw new Error(`Expected error with code ${expectedCode}, got ${error?.code}`);
    }
  }
}