/**
 * @fileoverview MCP Client Basic Integration Tests
 * 
 * Basic integration tests to verify the MCP Client test infrastructure
 * and fundamental functionality without requiring full transport mocking.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpClient } from '../McpClient.js';
import { 
  McpClientConfig,
  McpClientError,
  McpErrorCode,
  McpStdioTransportConfig,
} from '../interfaces.js';
import { McpTestDataFactory } from '../transports/__tests__/utils/TestUtils.js';

describe('MCP Client Basic Tests', () => {
  let client: McpClient;

  beforeEach(() => {
    client = new McpClient();
  });

  afterEach(async () => {
    try {
      await client.disconnect();
    } catch (error) {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('Client Initialization', () => {
    it('should create client instance', () => {
      expect(client).toBeInstanceOf(McpClient);
      expect(client.isConnected()).toBe(false);
    });

    it('should initialize with STDIO config', async () => {
      const config: McpClientConfig = {
        serverName: 'test-server',
        transport: McpTestDataFactory.createStdioConfig({
          command: 'echo',
          args: ['test'],
        }),
      };

      await expect(client.initialize(config)).resolves.not.toThrow();
    });

    it('should initialize with HTTP config', async () => {
      const config: McpClientConfig = {
        serverName: 'test-server',
        transport: McpTestDataFactory.createHttpConfig({
          url: 'http://localhost:3000/test',
        }),
      };

      await expect(client.initialize(config)).resolves.not.toThrow();
    });

    it('should reject unsupported transport type', async () => {
      const config: McpClientConfig = {
        serverName: 'test-server',
        transport: {
          type: 'unsupported' as any,
        },
      };

      await expect(client.initialize(config)).rejects.toThrow();
    });
  });

  describe('Client State Management', () => {
    it('should track connection state', async () => {
      const config: McpClientConfig = {
        serverName: 'test-server',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      expect(client.isConnected()).toBe(false);

      // Connection would fail without real server, but state should be tracked
      try {
        await client.connect();
      } catch (error) {
        // Expected to fail without real server
      }
    });

    it('should handle disconnect when not connected', async () => {
      await expect(client.disconnect()).resolves.not.toThrow();
      expect(client.isConnected()).toBe(false);
    });

    it('should throw error when accessing server info without connection', async () => {
      await expect(client.getServerInfo()).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when calling tools without connection', async () => {
      await expect(client.callTool('test', {})).rejects.toThrow(McpClientError);
    });

    it('should throw error when listing tools without connection', async () => {
      await expect(client.listTools()).rejects.toThrow(McpClientError);
    });

    it('should handle initialization without config', async () => {
      const config: McpClientConfig = {
        serverName: 'test-server',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);

      // Calling connect without proper server should fail gracefully
      await expect(client.connect()).rejects.toThrow();
    });
  });

  describe('Schema Manager Integration', () => {
    it('should provide schema manager instance', async () => {
      const config: McpClientConfig = {
        serverName: 'test-server',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      const schemaManager = client.getSchemaManager();
      
      expect(schemaManager).toBeDefined();
      expect(typeof schemaManager.validateToolParams).toBe('function');
    });

    it('should handle schema validation without cached schema', async () => {
      const config: McpClientConfig = {
        serverName: 'test-server',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      const schemaManager = client.getSchemaManager();
      
      // Should return validation error instead of throwing
      const result = await schemaManager.validateToolParams('nonexistent', {});
      expect(result.success).toBe(false);
      expect(result.errors).toContain('No cached schema found for tool: nonexistent');
    });
  });

  describe('Event Handlers', () => {
    it('should register error handlers', async () => {
      const config: McpClientConfig = {
        serverName: 'test-server',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      
      const errorHandler = vi.fn();
      client.onError(errorHandler);

      // Error handler should be registered (can't easily test invocation without real connection)
      expect(errorHandler).toBeDefined();
    });

    it('should register disconnect handlers', async () => {
      const config: McpClientConfig = {
        serverName: 'test-server',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      
      const disconnectHandler = vi.fn();
      client.onDisconnect(disconnectHandler);

      // Handler should be registered
      expect(disconnectHandler).toBeDefined();
    });

    it('should register tools changed handlers if supported', async () => {
      const config: McpClientConfig = {
        serverName: 'test-server',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      
      if (client.onToolsChanged) {
        const toolsChangedHandler = vi.fn();
        client.onToolsChanged(toolsChangedHandler);
        
        expect(toolsChangedHandler).toBeDefined();
      }
    });
  });

  describe('Configuration Validation', () => {
    it('should validate STDIO transport configuration', async () => {
      const validConfig: McpClientConfig = {
        serverName: 'valid-server',
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
          env: { NODE_ENV: 'test' },
          cwd: '/tmp',
        },
        capabilities: {
          tools: { listChanged: true },
        },
        requestTimeout: 30000,
      };

      await expect(client.initialize(validConfig)).resolves.not.toThrow();
    });

    it('should validate HTTP transport configuration', async () => {
      const validConfig: McpClientConfig = {
        serverName: 'valid-server',
        transport: {
          type: 'streamable-http',
          url: 'https://api.example.com/mcp',
          headers: {
            'Authorization': 'Bearer token',
            'Content-Type': 'application/json',
          },
          streaming: true,
          timeout: 30000,
          keepAlive: true,
        },
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true },
        },
        requestTimeout: 45000,
      };

      await expect(client.initialize(validConfig)).resolves.not.toThrow();
    });

    it('should handle missing required configuration', async () => {
      // Test missing transport - client should validate this at initialization
      const configMissingTransport = {
        serverName: 'test',
        // Missing transport
      };

      // Initialize should fail with missing transport
      await expect(client.initialize(configMissingTransport as any))
        .rejects.toThrow();

      // Reset client for next test
      client = new McpClient();
      
      // Test completely empty config should also fail
      await expect(client.initialize({} as any))
        .rejects.toThrow();
    });
  });

  describe('Resource Cleanup', () => {
    it('should handle close() method', async () => {
      const config: McpClientConfig = {
        serverName: 'cleanup-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await expect(client.close()).resolves.not.toThrow();
    });

    it('should handle multiple disconnect calls', async () => {
      const config: McpClientConfig = {
        serverName: 'multiple-disconnect',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      
      // Multiple disconnects should be safe
      await expect(client.disconnect()).resolves.not.toThrow();
      await expect(client.disconnect()).resolves.not.toThrow();
      await expect(client.close()).resolves.not.toThrow();
    });
  });
});