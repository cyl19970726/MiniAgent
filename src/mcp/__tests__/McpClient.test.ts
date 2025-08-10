/**
 * @fileoverview Core functionality tests for MCP Client
 * 
 * These tests verify the core MCP Client functionality including:
 * - Protocol initialization and handshake
 * - Tool discovery and caching mechanisms  
 * - Connection management and state transitions
 * - Event emission and error handling
 * - Schema validation during discovery
 * - Transport abstraction layer
 * 
 * Part of Phase 3 parallel testing strategy (test-dev-3)
 * Focus on ~50 unit tests covering core client functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpClient } from '../McpClient.js';
import { McpSchemaManager } from '../SchemaManager.js';
import {
  McpClientConfig,
  McpClientError,
  McpErrorCode,
  McpServerCapabilities,
  McpTool,
  McpToolResult,
  McpRequest,
  McpResponse,
  McpNotification,
  IMcpTransport,
  MCP_VERSION,
} from '../interfaces.js';
import { Type, Schema } from '@google/genai';

// ============================================================================
// Mock Transport Implementation
// ============================================================================

class MockTransport implements IMcpTransport {
  private connected = false;
  private messageHandler?: (message: McpResponse | McpNotification) => void;
  private errorHandler?: (error: Error) => void;
  private disconnectHandler?: () => void;
  private sendDelay = 0;
  private shouldError = false;
  private errorOnConnect = false;
  private initResponse?: any;
  private toolsList?: McpTool[];
  private resources?: any[];

  // Configuration
  setSendDelay(ms: number): void {
    this.sendDelay = ms;
  }

  setShouldError(shouldError: boolean): void {
    this.shouldError = shouldError;
  }

  setErrorOnConnect(shouldError: boolean): void {
    this.errorOnConnect = shouldError;
  }

  setInitResponse(response: any): void {
    this.initResponse = response;
  }

  setToolsList(tools: McpTool[]): void {
    this.toolsList = tools;
  }

  setResourcesList(resources: any[]): void {
    this.resources = resources;
  }

  // Transport interface implementation
  async connect(): Promise<void> {
    if (this.errorOnConnect) {
      throw new Error('Mock transport connection error');
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.disconnectHandler) {
      this.disconnectHandler();
    }
  }

  async send(message: McpRequest | McpNotification): Promise<void> {
    if (this.shouldError) {
      throw new Error('Mock transport send error');
    }

    if (this.sendDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.sendDelay));
    }

    // Simulate responses for different request types
    if ('id' in message) {
      const request = message as McpRequest;
      let response: McpResponse;

      switch (request.method) {
        case 'initialize':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: this.initResponse || {
              protocolVersion: MCP_VERSION,
              capabilities: {
                tools: { listChanged: true },
                resources: { subscribe: false },
              },
              serverInfo: {
                name: 'mock-server',
                version: '1.0.0',
              },
            },
          };
          break;

        case 'tools/list':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: this.toolsList || [],
            },
          };
          break;

        case 'tools/call':
          const toolCall = request.params as { name: string; arguments: unknown };
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [{
                type: 'text',
                text: `Mock result for tool: ${toolCall.name}`,
              }],
              isError: false,
              serverName: 'mock-server',
              toolName: toolCall.name,
              executionTime: 100,
            },
          };
          break;

        case 'resources/list':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              resources: this.resources || [],
            },
          };
          break;

        case 'resources/read':
          const resourceRead = request.params as { uri: string };
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              uri: resourceRead.uri,
              mimeType: 'text/plain',
              text: 'Mock resource content',
            },
          };
          break;

        default:
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: McpErrorCode.MethodNotFound,
              message: `Method not found: ${request.method}`,
            },
          };
      }

      // Simulate immediate response instead of delayed
      if (this.messageHandler) {
        // Use setImmediate to ensure proper async execution
        setImmediate(() => {
          if (this.messageHandler) {
            this.messageHandler(response);
          }
        });
      }
    }
  }

  onMessage(handler: (message: McpResponse | McpNotification) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandler = handler;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Test utilities
  simulateError(error: Error): void {
    if (this.errorHandler) {
      this.errorHandler(error);
    }
  }

  simulateNotification(notification: McpNotification): void {
    if (this.messageHandler) {
      this.messageHandler(notification);
    }
  }

  simulateUnexpectedResponse(response: McpResponse): void {
    if (this.messageHandler) {
      this.messageHandler(response);
    }
  }
}

// ============================================================================
// Test Setup and Utilities
// ============================================================================

const createTestConfig = (overrides?: Partial<McpClientConfig>): McpClientConfig => ({
  serverName: 'test-server',
  transport: {
    type: 'stdio',
    command: 'test-command',
  },
  capabilities: {
    notifications: {
      tools: { listChanged: true },
    },
  },
  timeout: 5000,
  requestTimeout: 3000,
  maxRetries: 3,
  retryDelay: 1000,
  ...overrides,
});

const createTestTool = (name: string = 'test_tool', overrides?: Partial<McpTool>): McpTool => ({
  name,
  description: `Test tool: ${name}`,
  inputSchema: {
    type: Type.OBJECT,
    properties: {
      message: {
        type: Type.STRING,
        description: 'Test message',
      },
    },
    required: ['message'],
  } as Schema,
  capabilities: {
    streaming: false,
    requiresConfirmation: false,
    destructive: false,
  },
  ...overrides,
});

// Helper function to setup connected client with mock transport
const setupConnectedClient = (client: McpClient, mockTransport: MockTransport): void => {
  const config = createTestConfig();
  client['config'] = config;
  client['schemaManager'] = new McpSchemaManager();
  client['transport'] = mockTransport;
  client['connected'] = true;
  client['serverInfo'] = {
    name: 'mock-server',
    version: '1.0.0',
    capabilities: { tools: { listChanged: true } },
  };
  
  // Make sure mock transport reports as connected
  mockTransport['connected'] = true;
  
  // Setup transport event handlers
  mockTransport.onMessage(client['handleMessage'].bind(client));
  mockTransport.onError(client['handleTransportError'].bind(client));
  mockTransport.onDisconnect(client['handleTransportDisconnect'].bind(client));
};

// ============================================================================
// Test Suite
// ============================================================================

describe('McpClient - Core Functionality', () => {
  let client: McpClient;
  let mockTransport: MockTransport;

  beforeEach(() => {
    client = new McpClient();
    mockTransport = new MockTransport();

    // Mock dynamic imports to return our mock transport class
    vi.doMock('../transports/StdioTransport.js', () => ({
      StdioTransport: class MockStdioTransport extends MockTransport {}
    }));
    
    vi.doMock('../transports/HttpTransport.js', () => ({
      HttpTransport: class MockHttpTransport extends MockTransport {}
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('../transports/StdioTransport.js');
    vi.doUnmock('../transports/HttpTransport.js');
  });

  // ========================================================================
  // Client Initialization Tests
  // ========================================================================

  describe('Client Initialization', () => {
    it('should initialize with STDIO transport configuration', async () => {
      const config = createTestConfig({
        transport: {
          type: 'stdio',
          command: 'test-server',
          args: ['--port', '8080'],
          env: { NODE_ENV: 'test' },
          cwd: '/tmp',
        },
      });

      await expect(client.initialize(config)).resolves.not.toThrow();
    });

    it('should initialize with HTTP transport configuration', async () => {
      const config = createTestConfig({
        transport: {
          type: 'streamable-http',
          url: 'http://localhost:3000',
          headers: { 'Authorization': 'Bearer test-token' },
          streaming: true,
          timeout: 5000,
        },
      });

      await expect(client.initialize(config)).resolves.not.toThrow();
    });

    it('should initialize with legacy HTTP transport configuration', async () => {
      const config = createTestConfig({
        transport: {
          type: 'http',
          url: 'http://localhost:3000',
          headers: { 'Content-Type': 'application/json' },
        },
      });

      await expect(client.initialize(config)).resolves.not.toThrow();
    });

    it('should throw error for unsupported transport type', async () => {
      const config = createTestConfig({
        transport: {
          type: 'websocket' as any,
          url: 'ws://localhost:3000',
        },
      });

      await expect(client.initialize(config)).rejects.toThrow(McpClientError);
    });

    it('should initialize schema manager during setup', async () => {
      const config = createTestConfig();
      await client.initialize(config);

      const schemaManager = client.getSchemaManager();
      expect(schemaManager).toBeInstanceOf(McpSchemaManager);
    });

    it('should configure transport event handlers', async () => {
      const config = createTestConfig();
      await client.initialize(config);

      // Verify transport is set up (indirectly through successful initialization)
      expect(client.isConnected()).toBe(false);
    });
  });

  // ========================================================================
  // Protocol Handshake Tests
  // ========================================================================

  describe('Protocol Version Negotiation and Handshake', () => {
    beforeEach(async () => {
      const config = createTestConfig();
      
      // Create a new instance and inject our mock transport directly
      client = new McpClient();
      client['config'] = config;
      client['schemaManager'] = new McpSchemaManager();
      client['transport'] = mockTransport;
      
      // Setup transport event handlers
      mockTransport.onMessage(client['handleMessage'].bind(client));
      mockTransport.onError(client['handleTransportError'].bind(client));
      mockTransport.onDisconnect(client['handleTransportDisconnect'].bind(client));
    });

    it('should perform successful handshake with compatible server', async () => {
      mockTransport.setInitResponse({
        protocolVersion: MCP_VERSION,
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: false },
        },
        serverInfo: {
          name: 'compatible-server',
          version: '2.0.0',
        },
      });

      await expect(client.connect()).resolves.not.toThrow();
      expect(client.isConnected()).toBe(true);

      const serverInfo = await client.getServerInfo();
      expect(serverInfo.name).toBe('compatible-server');
      expect(serverInfo.version).toBe('2.0.0');
      expect(serverInfo.capabilities.tools?.listChanged).toBe(true);
    });

    it('should handle handshake with minimal server capabilities', async () => {
      mockTransport.setInitResponse({
        protocolVersion: MCP_VERSION,
        capabilities: {},
        serverInfo: {
          name: 'minimal-server',
          version: '1.0.0',
        },
      });

      await expect(client.connect()).resolves.not.toThrow();

      const serverInfo = await client.getServerInfo();
      expect(serverInfo.capabilities).toEqual({});
    });

    it('should send correct client capabilities during handshake', async () => {
      const sendSpy = vi.spyOn(mockTransport, 'send');

      await client.connect();

      // Find the initialize request
      const initCall = sendSpy.mock.calls.find(call => 
        call[0] && 'method' in call[0] && call[0].method === 'initialize'
      );

      expect(initCall).toBeTruthy();
      const initRequest = initCall![0] as McpRequest;
      expect(initRequest.params).toHaveProperty('clientInfo');
      expect((initRequest.params as any).clientInfo.name).toBe('miniagent-mcp-client');
      expect((initRequest.params as any).protocolVersion).toBe(MCP_VERSION);
    });

    it('should send initialized notification after successful handshake', async () => {
      const sendSpy = vi.spyOn(mockTransport, 'send');

      await client.connect();

      // Find the initialized notification
      const notificationCall = sendSpy.mock.calls.find(call => 
        call[0] && 'method' in call[0] && call[0].method === 'notifications/initialized'
      );

      expect(notificationCall).toBeTruthy();
    });

    it('should handle handshake failure gracefully', async () => {
      // Mock the send method to not respond to simulate handshake failure
      vi.spyOn(mockTransport, 'send').mockImplementation(async () => {
        // Don't call the message handler to simulate no response
      });

      await expect(client.connect()).rejects.toThrow(McpClientError);
      expect(client.isConnected()).toBe(false);
    });

    it('should handle transport connection failure', async () => {
      mockTransport.setErrorOnConnect(true);

      await expect(client.connect()).rejects.toThrow(McpClientError);
      expect(client.isConnected()).toBe(false);
    });

    it('should not allow connect without initialization', async () => {
      const uninitializedClient = new McpClient();

      await expect(uninitializedClient.connect()).rejects.toThrow(McpClientError);
    });
  });

  // ========================================================================
  // Tool Discovery and Caching Tests  
  // ========================================================================

  describe('Tool Discovery and Caching', () => {
    beforeEach(() => {
      setupConnectedClient(client, mockTransport);
    });

    it('should discover tools from server', async () => {
      const testTools = [
        createTestTool('tool1'),
        createTestTool('tool2'),
        createTestTool('tool3'),
      ];
      mockTransport.setToolsList(testTools);

      const tools = await client.listTools();

      expect(tools).toHaveLength(3);
      expect(tools[0].name).toBe('tool1');
      expect(tools[1].name).toBe('tool2');
      expect(tools[2].name).toBe('tool3');
    });

    it('should cache tool schemas during discovery', async () => {
      const testTool = createTestTool('cacheable_tool');
      mockTransport.setToolsList([testTool]);

      const schemaManager = client.getSchemaManager();
      const cacheSchemasSpy = vi.spyOn(schemaManager, 'cacheSchema');

      await client.listTools(true); // Enable schema caching

      expect(cacheSchemasSpy).toHaveBeenCalledWith('cacheable_tool', testTool.inputSchema);
    });

    it('should skip schema caching when disabled', async () => {
      const testTool = createTestTool('no_cache_tool');
      mockTransport.setToolsList([testTool]);

      const schemaManager = client.getSchemaManager();
      const cacheSchemasSpy = vi.spyOn(schemaManager, 'cacheSchema');

      await client.listTools(false); // Disable schema caching

      expect(cacheSchemasSpy).not.toHaveBeenCalled();
    });

    it('should handle empty tools list', async () => {
      mockTransport.setToolsList([]);

      const tools = await client.listTools();

      expect(tools).toHaveLength(0);
    });

    it('should handle invalid tools list response', async () => {
      // Mock the send method to return invalid response
      vi.spyOn(mockTransport, 'send').mockImplementation(async (message) => {
        if ('id' in message && message.method === 'tools/list') {
          setImmediate(() => {
            if (mockTransport['messageHandler']) {
              mockTransport['messageHandler']({
                jsonrpc: '2.0',
                id: message.id,
                result: { invalid: 'response' }, // Invalid - missing tools array
              });
            }
          });
        }
      });

      await expect(client.listTools()).rejects.toThrow(McpClientError);
    });

    it('should continue discovering tools even if schema caching fails', async () => {
      const testTools = [
        createTestTool('tool1'),
        createTestTool('tool2'),
      ];
      mockTransport.setToolsList(testTools);

      const schemaManager = client.getSchemaManager();
      const cacheSchemasSpy = vi.spyOn(schemaManager, 'cacheSchema')
        .mockRejectedValueOnce(new Error('Cache failed'))
        .mockResolvedValueOnce(undefined);

      // Should not throw despite caching failure
      const tools = await client.listTools(true);

      expect(tools).toHaveLength(2);
      expect(cacheSchemasSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle tools with complex input schemas', async () => {
      const complexTool = createTestTool('complex_tool', {
        inputSchema: {
          type: Type.OBJECT,
          properties: {
            config: {
              type: Type.OBJECT,
              properties: {
                timeout: { type: Type.NUMBER },
                retries: { type: Type.NUMBER },
                enabled: { type: Type.BOOLEAN },
              },
              required: ['timeout'],
            },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  value: { type: Type.STRING },
                },
                required: ['id'],
              },
            },
          },
          required: ['config'],
        } as Schema,
      });

      mockTransport.setToolsList([complexTool]);

      const tools = await client.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].inputSchema.properties).toHaveProperty('config');
      expect(tools[0].inputSchema.properties).toHaveProperty('items');
    });
  });

  // ========================================================================
  // Tool Execution Tests
  // ========================================================================

  describe('Tool Execution', () => {
    beforeEach(async () => {
      setupConnectedClient(client, mockTransport);

      // Setup a test tool with cached schema
      const testTool = createTestTool('exec_tool');
      mockTransport.setToolsList([testTool]);
      await client.listTools(true); // Cache schemas
    });

    it('should execute tool with valid parameters', async () => {
      const result = await client.callTool('exec_tool', { message: 'test' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Mock result for tool: exec_tool');
      expect(result.serverName).toBe('mock-server');
      expect(result.toolName).toBe('exec_tool');
    });

    it('should validate parameters before execution when enabled', async () => {
      const schemaManager = client.getSchemaManager();
      const validateSpy = vi.spyOn(schemaManager, 'validateToolParams')
        .mockResolvedValue({ success: true, data: { message: 'test' } });

      await client.callTool('exec_tool', { message: 'test' }, { validate: true });

      expect(validateSpy).toHaveBeenCalledWith('exec_tool', { message: 'test' });
    });

    it('should skip validation when disabled', async () => {
      const schemaManager = client.getSchemaManager();
      const validateSpy = vi.spyOn(schemaManager, 'validateToolParams');

      await client.callTool('exec_tool', { message: 'test' }, { validate: false });

      expect(validateSpy).not.toHaveBeenCalled();
    });

    it('should throw validation error for invalid parameters', async () => {
      const schemaManager = client.getSchemaManager();
      vi.spyOn(schemaManager, 'validateToolParams')
        .mockResolvedValue({ 
          success: false, 
          errors: ['message: Required field missing'] 
        });

      await expect(
        client.callTool('exec_tool', {}, { validate: true })
      ).rejects.toThrow(McpClientError);
    });

    it('should handle missing schema during validation gracefully', async () => {
      const schemaManager = client.getSchemaManager();
      vi.spyOn(schemaManager, 'validateToolParams')
        .mockRejectedValue(new McpClientError('No cached schema', McpErrorCode.InvalidParams));

      // Should not throw, just log warning and continue
      const result = await client.callTool('uncached_tool', { message: 'test' });
      expect(result).toBeDefined();
    });

    it('should handle custom timeout for tool calls', async () => {
      mockTransport.setSendDelay(1000); // 1 second delay

      const startTime = Date.now();
      await client.callTool('exec_tool', { message: 'test' }, { timeout: 2000 });
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should handle invalid tool call response', async () => {
      // Mock transport to return invalid response
      vi.spyOn(mockTransport, 'send').mockImplementation(async (message) => {
        if ('id' in message && message.method === 'tools/call') {
          setTimeout(() => {
            if (mockTransport['messageHandler']) {
              mockTransport['messageHandler']({
                jsonrpc: '2.0',
                id: message.id,
                result: 'invalid response format',
              });
            }
          }, 10);
        }
      });

      await expect(
        client.callTool('exec_tool', { message: 'test' })
      ).rejects.toThrow(McpClientError);
    });
  });

  // ========================================================================
  // Connection Management Tests
  // ========================================================================

  describe('Connection Management', () => {
    beforeEach(() => {
      // For connection management tests, we need unconnected client
      const config = createTestConfig();
      client['config'] = config;
      client['schemaManager'] = new McpSchemaManager();
      client['transport'] = mockTransport;
      
      // Setup transport event handlers
      mockTransport.onMessage(client['handleMessage'].bind(client));
      mockTransport.onError(client['handleTransportError'].bind(client));
      mockTransport.onDisconnect(client['handleTransportDisconnect'].bind(client));
    });

    it('should track connection state correctly', async () => {
      expect(client.isConnected()).toBe(false);

      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle disconnect cleanup', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('should close client resources properly', async () => {
      await client.connect();
      
      const disconnectSpy = vi.spyOn(client, 'disconnect');
      await client.close();

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('should reject operations when not connected', async () => {
      await expect(client.listTools()).rejects.toThrow(McpClientError);
      await expect(client.callTool('test', {})).rejects.toThrow(McpClientError);
      await expect(client.getServerInfo()).rejects.toThrow(McpClientError);
    });

    it('should handle transport disconnection events', async () => {
      await client.connect();
      
      const disconnectHandler = vi.fn();
      client.onDisconnect(disconnectHandler);

      // Simulate transport disconnect
      mockTransport.disconnect();

      // Allow event handlers to run
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(disconnectHandler).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });
  });

  // ========================================================================
  // Error Handling and Event Tests
  // ========================================================================

  describe('Error Handling and Events', () => {
    beforeEach(() => {
      setupConnectedClient(client, mockTransport);
    });

    it('should handle transport errors through error handler', async () => {
      const errorHandler = vi.fn();
      client.onError(errorHandler);

      const testError = new Error('Transport failure');
      mockTransport.simulateError(testError);

      // Allow event handlers to run
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(McpClientError)
      );
    });

    it('should handle multiple error handlers', async () => {
      const errorHandler1 = vi.fn();
      const errorHandler2 = vi.fn();
      
      client.onError(errorHandler1);
      client.onError(errorHandler2);

      const testError = new Error('Test error');
      mockTransport.simulateError(testError);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(errorHandler1).toHaveBeenCalled();
      expect(errorHandler2).toHaveBeenCalled();
    });

    it('should handle errors in error handlers gracefully', async () => {
      const faultyHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const goodHandler = vi.fn();

      client.onError(faultyHandler);
      client.onError(goodHandler);

      const testError = new Error('Transport error');
      mockTransport.simulateError(testError);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(faultyHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });

    it('should handle request timeout errors', async () => {
      const config = createTestConfig({ requestTimeout: 100 });
      const timeoutClient = new McpClient();
      
      setupConnectedClient(timeoutClient, mockTransport);
      timeoutClient['config'] = config; // Override with timeout config

      // Configure transport to not respond
      vi.spyOn(mockTransport, 'send').mockImplementation(async () => {
        // Don't send any response to trigger timeout
      });

      await expect(
        timeoutClient.callTool('timeout_tool', {})
      ).rejects.toThrow(McpClientError);
    });

    it('should handle pending requests on disconnection', async () => {
      // Start a request
      const requestPromise = client.callTool('pending_tool', {});

      // Simulate disconnect before response
      await client.disconnect();

      await expect(requestPromise).rejects.toThrow(McpClientError);
    });
  });

  // ========================================================================
  // Notification Handling Tests
  // ========================================================================

  describe('Notification Handling', () => {
    beforeEach(() => {
      setupConnectedClient(client, mockTransport);
    });

    it('should handle tools list changed notification', async () => {
      const toolsChangedHandler = vi.fn();
      client.onToolsChanged?.(toolsChangedHandler);

      const schemaManager = client.getSchemaManager();
      const clearCacheSpy = vi.spyOn(schemaManager, 'clearCache').mockResolvedValue();

      // Simulate notification
      mockTransport.simulateNotification({
        jsonrpc: '2.0',
        method: 'notifications/tools/list_changed',
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(clearCacheSpy).toHaveBeenCalled();
      expect(toolsChangedHandler).toHaveBeenCalled();
    });

    it('should handle unknown notifications gracefully', async () => {
      // Should not throw for unknown notifications
      mockTransport.simulateNotification({
        jsonrpc: '2.0',
        method: 'notifications/unknown',
      });

      await new Promise(resolve => setTimeout(resolve, 20));
      // Test passes if no error is thrown
    });

    it('should handle errors in tools changed handlers', async () => {
      const faultyHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const goodHandler = vi.fn();

      client.onToolsChanged?.(faultyHandler);
      client.onToolsChanged?.(goodHandler);

      mockTransport.simulateNotification({
        jsonrpc: '2.0',
        method: 'notifications/tools/list_changed',
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(faultyHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Resource Operations Tests (Future Capability)
  // ========================================================================

  describe('Resource Operations', () => {
    beforeEach(() => {
      setupConnectedClient(client, mockTransport);
    });

    it('should list available resources', async () => {
      const testResources = [
        { uri: 'file:///test.txt', name: 'Test File', mimeType: 'text/plain' },
        { uri: 'http://example.com', name: 'Web Resource', mimeType: 'text/html' },
      ];
      mockTransport.setResourcesList(testResources);

      const resources = await client.listResources?.();

      expect(resources).toHaveLength(2);
      expect(resources![0].uri).toBe('file:///test.txt');
      expect(resources![1].uri).toBe('http://example.com');
    });

    it('should get resource content', async () => {
      const content = await client.getResource?.('file:///test.txt');

      expect(content).toBeDefined();
      expect(content!.uri).toBe('file:///test.txt');
      expect(content!.text).toBe('Mock resource content');
    });

    it('should handle empty resources list', async () => {
      mockTransport.setResourcesList([]);

      const resources = await client.listResources?.();

      expect(resources).toHaveLength(0);
    });
  });

  // ========================================================================
  // Schema Manager Integration Tests
  // ========================================================================

  describe('Schema Manager Integration', () => {
    beforeEach(() => {
      setupConnectedClient(client, mockTransport);
    });

    it('should provide access to schema manager', () => {
      const schemaManager = client.getSchemaManager();

      expect(schemaManager).toBeDefined();
      expect(schemaManager).toBeInstanceOf(McpSchemaManager);
    });

    it('should use schema manager for tool validation', async () => {
      const testTool = createTestTool('validated_tool');
      mockTransport.setToolsList([testTool]);
      await client.listTools(true);

      const schemaManager = client.getSchemaManager();
      const validateSpy = vi.spyOn(schemaManager, 'validateToolParams')
        .mockResolvedValue({ success: true, data: { message: 'test' } });

      await client.callTool('validated_tool', { message: 'test' });

      expect(validateSpy).toHaveBeenCalledWith('validated_tool', { message: 'test' });
    });

    it('should clear schema cache on tools list change', async () => {
      const schemaManager = client.getSchemaManager();
      const clearCacheSpy = vi.spyOn(schemaManager, 'clearCache').mockResolvedValue();

      mockTransport.simulateNotification({
        jsonrpc: '2.0',
        method: 'notifications/tools/list_changed',
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(clearCacheSpy).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Edge Cases and Error Recovery
  // ========================================================================

  describe('Edge Cases and Error Recovery', () => {
    it('should handle unexpected response IDs', async () => {
      setupConnectedClient(client, mockTransport);

      // Simulate unexpected response
      mockTransport.simulateUnexpectedResponse({
        jsonrpc: '2.0',
        id: 'unexpected-id',
        result: 'unexpected result',
      });

      // Should not cause any issues
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    it('should handle malformed JSON-RPC responses', async () => {
      setupConnectedClient(client, mockTransport);

      // Simulate malformed response
      mockTransport.simulateUnexpectedResponse({
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: McpErrorCode.ParseError,
          message: 'Parse error',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 20));
    });

    it('should maintain request ID uniqueness', async () => {
      setupConnectedClient(client, mockTransport);

      const sendSpy = vi.spyOn(mockTransport, 'send');

      // Make multiple concurrent requests
      const promises = [
        client.listTools(),
        client.listTools(),
        client.listTools(),
      ];

      await Promise.all(promises);

      // Check that all request IDs are unique
      const requestIds = sendSpy.mock.calls
        .map(call => call[0])
        .filter(msg => 'id' in msg)
        .map(msg => (msg as McpRequest).id);

      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(requestIds.length);
    });

    it('should handle empty server info gracefully', async () => {
      setupConnectedClient(client, mockTransport);

      // Clear server info after connection
      (client as any).serverInfo = undefined;

      await expect(client.getServerInfo()).rejects.toThrow(McpClientError);
    });
  });
});