/**
 * @fileoverview Mock MCP Server Implementations for Testing
 * 
 * This module provides mock MCP server implementations that can be used
 * to test MCP transports without requiring actual server processes or
 * network connections. Includes both STDIO and HTTP mock servers.
 */

import { EventEmitter } from 'events';
import { 
  McpRequest, 
  McpResponse, 
  McpNotification, 
  McpError, 
  McpErrorCode,
  McpTool 
} from '../../../interfaces.js';

/**
 * Mock server behavior configuration
 */
export interface MockServerConfig {
  /** Server name for identification */
  name: string;
  /** Whether server should respond to requests */
  autoRespond?: boolean;
  /** Response delay in milliseconds */
  responseDelay?: number;
  /** Whether to simulate random errors */
  simulateErrors?: boolean;
  /** Error probability (0-1) when simulateErrors is true */
  errorRate?: number;
  /** Available tools */
  tools?: McpTool[];
  /** Server capabilities */
  capabilities?: {
    tools?: { listChanged?: boolean };
    resources?: { subscribe?: boolean; listChanged?: boolean };
    prompts?: { listChanged?: boolean };
    logging?: Record<string, unknown>;
  };
}

/**
 * Base mock MCP server implementation
 */
export abstract class BaseMockMcpServer extends EventEmitter {
  protected config: Required<MockServerConfig>;
  protected isRunning: boolean = false;
  protected messageCount: number = 0;
  protected lastMessageId: string | number | null = null;
  
  constructor(config: MockServerConfig) {
    super();
    this.config = {
      autoRespond: true,
      responseDelay: 0,
      simulateErrors: false,
      errorRate: 0.1,
      tools: [],
      capabilities: {},
      ...config,
    };
  }
  
  /**
   * Start the mock server
   */
  abstract start(): Promise<void>;
  
  /**
   * Stop the mock server
   */
  abstract stop(): Promise<void>;
  
  /**
   * Send a message to connected clients
   */
  abstract sendMessage(message: McpResponse | McpNotification): Promise<void>;
  
  /**
   * Get server status
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }
  
  /**
   * Get message statistics
   */
  getStats() {
    return {
      messageCount: this.messageCount,
      lastMessageId: this.lastMessageId,
      isRunning: this.isRunning,
    };
  }
  
  /**
   * Handle incoming request from client
   */
  protected async handleRequest(request: McpRequest): Promise<void> {
    this.messageCount++;
    this.lastMessageId = request.id;
    
    this.emit('request', request);
    
    if (!this.config.autoRespond) {
      return;
    }
    
    // Simulate processing delay
    if (this.config.responseDelay > 0) {
      await this.delay(this.config.responseDelay);
    }
    
    // Simulate random errors
    if (this.config.simulateErrors && Math.random() < this.config.errorRate) {
      const error = this.createError(
        McpErrorCode.ServerError,
        'Simulated server error',
        { request: request.method }
      );
      await this.sendErrorResponse(request.id, error);
      return;
    }
    
    // Handle specific methods
    try {
      const response = await this.processRequest(request);
      await this.sendMessage(response);
    } catch (error) {
      const mcpError = this.createError(
        McpErrorCode.InternalError,
        error instanceof Error ? error.message : 'Unknown error'
      );
      await this.sendErrorResponse(request.id, mcpError);
    }
  }
  
  /**
   * Process specific request methods
   */
  protected async processRequest(request: McpRequest): Promise<McpResponse> {
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request);
      
      case 'tools/list':
        return this.handleToolsList(request);
      
      case 'tools/call':
        return this.handleToolsCall(request);
      
      case 'resources/list':
        return this.handleResourcesList(request);
      
      case 'prompts/list':
        return this.handlePromptsList(request);
      
      default:
        throw new Error(`Method not found: ${request.method}`);
    }
  }
  
  /**
   * Handle initialization request
   */
  protected handleInitialize(request: McpRequest): McpResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: this.config.capabilities,
        serverInfo: {
          name: this.config.name,
          version: '1.0.0-mock',
        },
      },
    };
  }
  
  /**
   * Handle tools list request
   */
  protected handleToolsList(request: McpRequest): McpResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: this.config.tools,
      },
    };
  }
  
  /**
   * Handle tool call request
   */
  protected handleToolsCall(request: McpRequest): McpResponse {
    const params = request.params as { name: string; arguments?: any };
    
    if (!params?.name) {
      throw new Error('Tool name is required');
    }
    
    const tool = this.config.tools.find(t => t.name === params.name);
    if (!tool) {
      throw new Error(`Tool not found: ${params.name}`);
    }
    
    // Simulate tool execution
    const result = {
      content: [
        {
          type: 'text' as const,
          text: `Mock execution of ${params.name} with arguments: ${JSON.stringify(params.arguments || {})}`,
        },
      ],
    };
    
    return {
      jsonrpc: '2.0',
      id: request.id,
      result,
    };
  }
  
  /**
   * Handle resources list request
   */
  protected handleResourcesList(request: McpRequest): McpResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        resources: [],
      },
    };
  }
  
  /**
   * Handle prompts list request
   */
  protected handlePromptsList(request: McpRequest): McpResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        prompts: [],
      },
    };
  }
  
  /**
   * Send error response
   */
  protected async sendErrorResponse(id: string | number, error: McpError): Promise<void> {
    const response: McpResponse = {
      jsonrpc: '2.0',
      id,
      error,
    };
    
    await this.sendMessage(response);
  }
  
  /**
   * Create MCP error
   */
  protected createError(code: McpErrorCode, message: string, data?: unknown): McpError {
    return { code, message, data };
  }
  
  /**
   * Utility delay function
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Send notification to clients
   */
  protected async sendNotification(method: string, params?: unknown): Promise<void> {
    const notification: McpNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    
    await this.sendMessage(notification);
  }
  
  /**
   * Simulate tools list change notification
   */
  async notifyToolsChanged(): Promise<void> {
    await this.sendNotification('notifications/tools/list_changed');
  }
  
  /**
   * Simulate resource list change notification
   */
  async notifyResourcesChanged(): Promise<void> {
    await this.sendNotification('notifications/resources/list_changed');
  }
  
  /**
   * Add a tool to the server
   */
  addTool(tool: McpTool): void {
    this.config.tools.push(tool);
    
    if (this.config.capabilities.tools?.listChanged) {
      this.notifyToolsChanged().catch(console.error);
    }
  }
  
  /**
   * Remove a tool from the server
   */
  removeTool(toolName: string): boolean {
    const initialLength = this.config.tools.length;
    this.config.tools = this.config.tools.filter(t => t.name !== toolName);
    
    const removed = this.config.tools.length < initialLength;
    if (removed && this.config.capabilities.tools?.listChanged) {
      this.notifyToolsChanged().catch(console.error);
    }
    
    return removed;
  }
  
  /**
   * Update server configuration
   */
  updateConfig(updates: Partial<MockServerConfig>): void {
    Object.assign(this.config, updates);
  }
  
  /**
   * Reset server state
   */
  reset(): void {
    this.messageCount = 0;
    this.lastMessageId = null;
    this.removeAllListeners();
  }
  
  /**
   * Simulate server crash
   */
  simulateCrash(): void {
    this.isRunning = false;
    this.emit('crash', new Error('Simulated server crash'));
  }
  
  /**
   * Simulate server hang (stops responding)
   */
  simulateHang(): void {
    this.config.autoRespond = false;
    this.emit('hang');
  }
  
  /**
   * Resume from hang
   */
  resumeFromHang(): void {
    this.config.autoRespond = true;
    this.emit('resume');
  }
}

/**
 * Mock STDIO MCP server that simulates a child process
 */
export class MockStdioMcpServer extends BaseMockMcpServer {
  private messageHandlers: Array<(message: McpResponse | McpNotification) => void> = [];
  
  async start(): Promise<void> {
    this.isRunning = true;
    this.emit('start');
  }
  
  async stop(): Promise<void> {
    this.isRunning = false;
    this.emit('stop');
  }
  
  async sendMessage(message: McpResponse | McpNotification): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Server is not running');
    }
    
    // Simulate sending message via stdout
    const messageStr = JSON.stringify(message);
    this.emit('stdout', messageStr);
    
    // Notify registered handlers
    this.messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        this.emit('error', error);
      }
    });
  }
  
  /**
   * Simulate receiving a message from stdin
   */
  async receiveMessage(messageStr: string): Promise<void> {
    try {
      const message = JSON.parse(messageStr) as McpRequest | McpNotification;
      
      if ('id' in message) {
        // It's a request
        await this.handleRequest(message as McpRequest);
      } else {
        // It's a notification
        this.emit('notification', message);
      }
    } catch (error) {
      this.emit('error', new Error(`Failed to parse message: ${error}`));
    }
  }
  
  /**
   * Register message handler
   */
  onMessage(handler: (message: McpResponse | McpNotification) => void): void {
    this.messageHandlers.push(handler);
  }
  
  /**
   * Remove message handler
   */
  offMessage(handler: (message: McpResponse | McpNotification) => void): void {
    const index = this.messageHandlers.indexOf(handler);
    if (index >= 0) {
      this.messageHandlers.splice(index, 1);
    }
  }
  
  /**
   * Simulate stderr output
   */
  simulateStderr(message: string): void {
    this.emit('stderr', message);
  }
  
  /**
   * Simulate process exit
   */
  simulateExit(code: number = 0, signal: string | null = null): void {
    this.isRunning = false;
    this.emit('exit', code, signal);
  }
  
  /**
   * Simulate process error
   */
  simulateError(error: Error): void {
    this.emit('error', error);
  }
}

/**
 * Mock HTTP MCP server that simulates HTTP/SSE endpoints
 */
export class MockHttpMcpServer extends BaseMockMcpServer {
  private connections: Array<{
    id: string;
    sessionId: string;
    messageHandler?: (message: McpResponse | McpNotification) => void;
  }> = [];
  
  private nextConnectionId: number = 1;
  
  async start(): Promise<void> {
    this.isRunning = true;
    this.emit('start');
  }
  
  async stop(): Promise<void> {
    this.isRunning = false;
    this.connections = [];
    this.emit('stop');
  }
  
  async sendMessage(message: McpResponse | McpNotification): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Server is not running');
    }
    
    // Send to all connected clients
    const messageStr = JSON.stringify(message);
    this.connections.forEach(conn => {
      this.emit('sse-message', {
        connectionId: conn.id,
        sessionId: conn.sessionId,
        message: messageStr,
      });
      
      // Notify handler if present
      conn.messageHandler?.(message);
    });
  }
  
  /**
   * Simulate SSE connection from client
   */
  simulateSSEConnection(sessionId: string): string {
    const connectionId = `conn-${this.nextConnectionId++}`;
    
    this.connections.push({
      id: connectionId,
      sessionId,
    });
    
    this.emit('sse-connect', { connectionId, sessionId });
    
    // Send initial connection event
    this.sendSSEEvent(connectionId, 'open', null);
    
    return connectionId;
  }
  
  /**
   * Simulate SSE disconnection
   */
  simulateSSEDisconnection(connectionId: string): void {
    const index = this.connections.findIndex(c => c.id === connectionId);
    if (index >= 0) {
      const connection = this.connections[index];
      this.connections.splice(index, 1);
      this.emit('sse-disconnect', { connectionId, sessionId: connection.sessionId });
    }
  }
  
  /**
   * Simulate HTTP POST request
   */
  async simulateHttpRequest(
    sessionId: string, 
    message: McpRequest | McpNotification
  ): Promise<{ status: number; body?: any; headers?: Record<string, string> }> {
    if (!this.isRunning) {
      return { status: 503, body: { error: 'Server unavailable' } };
    }
    
    try {
      if ('id' in message) {
        // It's a request - handle it
        await this.handleRequest(message as McpRequest);
        return { status: 200, body: { success: true } };
      } else {
        // It's a notification
        this.emit('notification', message);
        return { status: 200, body: { success: true } };
      }
    } catch (error) {
      return { 
        status: 500, 
        body: { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        } 
      };
    }
  }
  
  /**
   * Send SSE event to specific connection
   */
  sendSSEEvent(
    connectionId: string, 
    eventType: string, 
    data: any, 
    eventId?: string
  ): void {
    const connection = this.connections.find(c => c.id === connectionId);
    if (connection) {
      this.emit('sse-event', {
        connectionId,
        sessionId: connection.sessionId,
        eventType,
        data,
        eventId,
      });
    }
  }
  
  /**
   * Send custom server message
   */
  async sendServerMessage(connectionId: string, messageType: string, data: any): Promise<void> {
    const message = { type: messageType, ...data };
    const connection = this.connections.find(c => c.id === connectionId);
    
    if (connection) {
      this.sendSSEEvent(connectionId, 'message', message);
      connection.messageHandler?.(message as any);
    }
  }
  
  /**
   * Register message handler for specific connection
   */
  onConnectionMessage(
    connectionId: string, 
    handler: (message: McpResponse | McpNotification) => void
  ): void {
    const connection = this.connections.find(c => c.id === connectionId);
    if (connection) {
      connection.messageHandler = handler;
    }
  }
  
  /**
   * Get active connections
   */
  getConnections(): Array<{ id: string; sessionId: string }> {
    return this.connections.map(c => ({ id: c.id, sessionId: c.sessionId }));
  }
  
  /**
   * Simulate connection-specific error
   */
  simulateConnectionError(connectionId: string, error: Error): void {
    this.emit('sse-error', { connectionId, error });
  }
  
  /**
   * Simulate sending endpoint information
   */
  sendEndpointInfo(connectionId: string, messageEndpoint: string): void {
    this.sendSSEEvent(
      connectionId,
      'endpoint',
      { messageEndpoint }
    );
  }
  
  /**
   * Simulate sending session information
   */
  sendSessionInfo(connectionId: string, sessionId: string): void {
    this.sendSSEEvent(
      connectionId,
      'session',
      { sessionId }
    );
  }
}

/**
 * Factory for creating mock servers with common configurations
 */
export class MockServerFactory {
  static createStdioServer(name: string = 'mock-stdio-server'): MockStdioMcpServer {
    return new MockStdioMcpServer({
      name,
      tools: [
        {
          name: 'echo',
          description: 'Echo the input message',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Message to echo' }
            },
            required: ['message']
          }
        },
        {
          name: 'calculate',
          description: 'Perform basic calculations',
          inputSchema: {
            type: 'object',
            properties: {
              operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
              a: { type: 'number' },
              b: { type: 'number' }
            },
            required: ['operation', 'a', 'b']
          }
        }
      ],
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
      }
    });
  }
  
  static createHttpServer(name: string = 'mock-http-server'): MockHttpMcpServer {
    return new MockHttpMcpServer({
      name,
      tools: [
        {
          name: 'fetch',
          description: 'Fetch data from URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to fetch' }
            },
            required: ['url']
          }
        },
        {
          name: 'weather',
          description: 'Get weather information',
          inputSchema: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'Location for weather' }
            },
            required: ['location']
          }
        }
      ],
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
      }
    });
  }
  
  static createErrorProneServer(
    type: 'stdio' | 'http',
    errorRate: number = 0.3
  ): BaseMockMcpServer {
    const config = {
      name: 'error-prone-server',
      simulateErrors: true,
      errorRate,
      responseDelay: 100,
      tools: [
        {
          name: 'unreliable_tool',
          description: 'A tool that often fails',
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string' }
            }
          }
        }
      ]
    };
    
    return type === 'stdio' 
      ? new MockStdioMcpServer(config)
      : new MockHttpMcpServer(config);
  }
  
  static createSlowServer(
    type: 'stdio' | 'http',
    responseDelay: number = 1000
  ): BaseMockMcpServer {
    const config = {
      name: 'slow-server',
      responseDelay,
      tools: [
        {
          name: 'slow_operation',
          description: 'A slow operation',
          inputSchema: {
            type: 'object',
            properties: {
              duration: { type: 'number', description: 'Duration in ms' }
            }
          }
        }
      ]
    };
    
    return type === 'stdio' 
      ? new MockStdioMcpServer(config)
      : new MockHttpMcpServer(config);
  }
}

/**
 * Enhanced MockStdioMcpServer with error injection and latency simulation
 */
export class EnhancedMockStdioMcpServer extends MockStdioMcpServer {
  private errorInjectionConfig?: ErrorInjectionConfig;
  private latencyConfig?: {
    baseLatency: number;
    jitter: number; // percentage variation
    spikes: { probability: number; multiplier: number }; // occasional latency spikes
  };
  private requestCount: number = 0;
  private corruptionQueue: Array<{ messageId: string | number; corruptionType: string }> = [];

  constructor(config: MockServerConfig & {
    errorInjection?: ErrorInjectionConfig;
    latencySimulation?: {
      baseLatency?: number;
      jitter?: number;
      spikes?: { probability: number; multiplier: number };
    };
  }) {
    super(config);
    this.errorInjectionConfig = config.errorInjection;
    this.latencyConfig = config.latencySimulation ? {
      baseLatency: 0,
      jitter: 0.1, // 10% jitter by default
      spikes: { probability: 0.02, multiplier: 5 }, // 2% chance of 5x latency spike
      ...config.latencySimulation
    } : undefined;
  }

  protected async handleRequest(request: McpRequest): Promise<void> {
    this.requestCount++;
    
    // Apply latency simulation
    if (this.latencyConfig) {
      const latency = this.calculateLatency();
      if (latency > 0) {
        await this.delay(latency);
      }
    }
    
    // Apply error injection
    if (this.errorInjectionConfig && this.shouldInjectError(request)) {
      const error = this.generateError(request);
      await this.sendErrorResponse(request.id, error);
      return;
    }
    
    // Apply message corruption
    if (this.errorInjectionConfig?.corruptionErrors && this.shouldInjectCorruption()) {
      this.scheduleMessageCorruption(request.id);
    }
    
    await super.handleRequest(request);
  }
  
  private calculateLatency(): number {
    if (!this.latencyConfig) return 0;
    
    let latency = this.latencyConfig.baseLatency;
    
    // Add jitter
    const jitter = (Math.random() - 0.5) * 2 * this.latencyConfig.jitter;
    latency += latency * jitter;
    
    // Apply occasional spikes
    if (Math.random() < this.latencyConfig.spikes.probability) {
      latency *= this.latencyConfig.spikes.multiplier;
    }
    
    return Math.max(0, latency);
  }
  
  private shouldInjectError(request: McpRequest): boolean {
    if (!this.errorInjectionConfig) return false;
    
    // Check method-specific errors
    const methodError = this.errorInjectionConfig.methodErrors?.[request.method];
    if (methodError && Math.random() < methodError.probability) {
      return true;
    }
    
    // Check tool-specific errors
    if (request.method === 'tools/call' && request.params && 'name' in request.params) {
      const toolError = this.errorInjectionConfig.toolErrors?.[request.params.name as string];
      if (toolError && Math.random() < toolError.probability) {
        return true;
      }
    }
    
    return false;
  }
  
  private shouldInjectCorruption(): boolean {
    if (!this.errorInjectionConfig?.corruptionErrors) return false;
    return Math.random() < this.errorInjectionConfig.corruptionErrors.probability;
  }
  
  private scheduleMessageCorruption(messageId: string | number): void {
    const corruptionTypes = this.errorInjectionConfig?.corruptionErrors?.types || [];
    if (corruptionTypes.length === 0) return;
    
    const corruptionType = corruptionTypes[Math.floor(Math.random() * corruptionTypes.length)];
    this.corruptionQueue.push({ messageId, corruptionType });
  }
  
  private generateError(request: McpRequest): McpError {
    const methodError = this.errorInjectionConfig?.methodErrors?.[request.method];
    if (methodError) {
      return {
        code: methodError.errorCode,
        message: methodError.errorMessage,
        data: {
          injected: true,
          requestId: request.id,
          method: request.method,
          timestamp: Date.now()
        }
      };
    }
    
    if (request.method === 'tools/call' && request.params && 'name' in request.params) {
      const toolError = this.errorInjectionConfig?.toolErrors?.[request.params.name as string];
      if (toolError) {
        return {
          code: toolError.errorCode,
          message: toolError.errorMessage,
          data: {
            injected: true,
            requestId: request.id,
            toolName: request.params.name,
            timestamp: Date.now()
          }
        };
      }
    }
    
    return {
      code: -32000,
      message: 'Injected test error',
      data: { injected: true, requestId: request.id }
    };
  }
  
  async sendMessage(message: McpResponse | McpNotification): Promise<void> {
    let finalMessage = message;
    
    // Apply message corruption if scheduled
    const corruption = this.corruptionQueue.find(c => 
      'id' in message && message.id === c.messageId
    );
    
    if (corruption) {
      finalMessage = this.applyMessageCorruption(message, corruption.corruptionType);
      this.corruptionQueue = this.corruptionQueue.filter(c => c !== corruption);
    }
    
    await super.sendMessage(finalMessage);
  }
  
  private applyMessageCorruption(message: McpResponse | McpNotification, corruptionType: string): any {
    switch (corruptionType) {
      case 'truncated':
        const messageStr = JSON.stringify(message);
        const truncated = messageStr.substring(0, messageStr.length / 2);
        try {
          return JSON.parse(truncated + '}');
        } catch {
          return { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } };
        }
      
      case 'invalid_json':
        // Return malformed JSON as string
        return JSON.stringify(message).replace(/"/g, "'").replace(/,/g, ';;');
      
      case 'missing_fields':
        const corrupted = { ...message };
        if ('jsonrpc' in corrupted) delete (corrupted as any).jsonrpc;
        if ('id' in corrupted && Math.random() < 0.5) delete (corrupted as any).id;
        return corrupted;
      
      case 'wrong_format':
        return {
          version: '2.0', // wrong field name
          identifier: ('id' in message) ? message.id : undefined,
          data: ('result' in message) ? message.result : message
        };
      
      default:
        return message;
    }
  }
  
  /**
   * Get error injection statistics
   */
  getErrorStats(): {
    requestCount: number;
    corruptionQueueSize: number;
    errorInjectionEnabled: boolean;
    latencySimulationEnabled: boolean;
  } {
    return {
      requestCount: this.requestCount,
      corruptionQueueSize: this.corruptionQueue.length,
      errorInjectionEnabled: !!this.errorInjectionConfig,
      latencySimulationEnabled: !!this.latencyConfig
    };
  }
  
  /**
   * Simulate connection instability
   */
  simulateConnectionInstability(duration: number = 5000): void {
    const interval = setInterval(() => {
      if (Math.random() < 0.3) {
        this.emit('connection-unstable');
        
        // Randomly disconnect and reconnect
        if (Math.random() < 0.1) {
          const wasRunning = this.isRunning;
          this.isRunning = false;
          this.emit('disconnect');
          
          setTimeout(() => {
            this.isRunning = wasRunning;
            this.emit('reconnect');
          }, Math.random() * 2000 + 500);
        }
      }
    }, Math.random() * 1000 + 500);
    
    setTimeout(() => {
      clearInterval(interval);
      this.emit('connection-stable');
    }, duration);
  }
}