/**
 * @fileoverview Comprehensive tests for MCP Connection Manager
 * Tests transport selection, connection lifecycle, health monitoring, and server management
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { McpConnectionManager } from '../McpConnectionManager.js';
import { 
  McpServerConfig, 
  McpServerStatus, 
  IMcpClient, 
  McpTool,
  McpClientError,
  McpErrorCode,
  McpServerCapabilities,
  IToolSchemaManager,
  McpTransportConfig
} from '../interfaces.js';

// Mock implementations
class MockMcpClient extends EventEmitter implements IMcpClient {
  private connected = false;
  private serverInfo = {
    name: 'test-server',
    version: '1.0.0',
    capabilities: { tools: { listChanged: false } }
  };
  private tools: McpTool[] = [];
  private errorHandlers: ((error: McpClientError) => void)[] = [];
  private disconnectHandlers: (() => void)[] = [];

  async initialize(config: any): Promise<void> {
    // Mock initialization
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 10));
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    this.connected = false;
    this.disconnectHandlers.forEach(handler => handler());
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getServerInfo() {
    if (!this.connected) {
      throw new McpClientError('Not connected', McpErrorCode.ConnectionError);
    }
    return this.serverInfo;
  }

  async listTools<T = unknown>(cacheSchemas?: boolean): Promise<McpTool<T>[]> {
    if (!this.connected) {
      throw new McpClientError('Not connected', McpErrorCode.ConnectionError);
    }
    return this.tools as McpTool<T>[];
  }

  async callTool<TParams = unknown>(name: string, args: TParams): Promise<any> {
    if (!this.connected) {
      throw new McpClientError('Not connected', McpErrorCode.ConnectionError);
    }
    return {
      content: [{ type: 'text', text: `Result from ${name}` }],
      isError: false
    };
  }

  getSchemaManager(): IToolSchemaManager {
    return {
      async cacheSchema() {},
      async getCachedSchema() { return undefined; },
      async validateToolParams() { 
        return { success: true, data: {} }; 
      },
      async clearCache() {},
      async getCacheStats() { 
        return { size: 0, hits: 0, misses: 0 }; 
      }
    };
  }

  onError(handler: (error: McpClientError) => void): void {
    this.errorHandlers.push(handler);
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }

  // Test helpers
  setTools(tools: McpTool[]): void {
    this.tools = tools;
  }

  simulateError(error: McpClientError): void {
    this.errorHandlers.forEach(handler => handler(error));
  }

  simulateDisconnect(): void {
    this.connected = false;
    this.disconnectHandlers.forEach(handler => handler());
  }

  forceConnectionState(connected: boolean): void {
    this.connected = connected;
  }
}

// Mock modules with factory functions - must be defined at the top level
vi.mock('../McpClient.js', () => {
  // Mock client constructor
  const mockConstructor = vi.fn();
  return { McpClient: mockConstructor };
});

vi.mock('../McpToolAdapter.js', () => ({
  McpToolAdapter: {
    create: vi.fn().mockResolvedValue({
      name: 'test-adapter',
      execute: vi.fn().mockResolvedValue({ success: true, data: 'mock result' })
    })
  },
  createMcpToolAdapters: vi.fn().mockResolvedValue([])
}));

describe('McpConnectionManager', () => {
  let manager: McpConnectionManager;
  let mockClients: Map<string, MockMcpClient>;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockClients = new Map();
    
    // Get the mocked constructor and set up implementation
    const { McpClient } = await vi.importMock('../McpClient.js') as { McpClient: any };
    McpClient.mockImplementation(() => {
      const client = new MockMcpClient();
      return client;
    });

    manager = new McpConnectionManager({
      connectionTimeout: 5000,
      requestTimeout: 3000,
      maxConnections: 5,
      healthCheck: {
        enabled: true,
        intervalMs: 30000,
        timeoutMs: 5000
      }
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await manager.cleanup();
  });

  describe('server configuration and transport validation', () => {
    it('should add server with STDIO transport', async () => {
      const config: McpServerConfig = {
        name: 'stdio-server',
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['server.js']
        },
        autoConnect: false
      };

      await manager.addServer(config);
      
      const status = manager.getServerStatus('stdio-server');
      expect(status).toBeDefined();
      expect(status!.status).toBe('disconnected');
      expect(status!.name).toBe('stdio-server');
    });

    it('should add server with Streamable HTTP transport', async () => {
      const config: McpServerConfig = {
        name: 'http-server',
        transport: {
          type: 'streamable-http',
          url: 'https://api.example.com/mcp',
          streaming: true,
          timeout: 10000
        },
        autoConnect: false
      };

      await manager.addServer(config);
      
      const status = manager.getServerStatus('http-server');
      expect(status).toBeDefined();
      expect(status!.status).toBe('disconnected');
    });

    it('should reject invalid STDIO transport config', async () => {
      const config: McpServerConfig = {
        name: 'invalid-stdio',
        transport: {
          type: 'stdio',
          command: '' // Invalid: empty command
        } as any
      };

      await expect(manager.addServer(config)).rejects.toThrow('STDIO transport requires command');
    });

    it('should reject invalid HTTP transport config', async () => {
      const config: McpServerConfig = {
        name: 'invalid-http',
        transport: {
          type: 'streamable-http',
          url: 'not-a-valid-url'
        }
      };

      await expect(manager.addServer(config)).rejects.toThrow('Invalid URL for Streamable HTTP transport');
    });

    it('should reject duplicate server names', async () => {
      const config: McpServerConfig = {
        name: 'duplicate-server',
        transport: {
          type: 'stdio',
          command: 'node'
        }
      };

      await manager.addServer(config);
      await expect(manager.addServer(config)).rejects.toThrow('Server duplicate-server already exists');
    });

    it('should respect maximum connection limit', async () => {
      // Add 5 servers (at the limit)
      for (let i = 0; i < 5; i++) {
        await manager.addServer({
          name: `server-${i}`,
          transport: { type: 'stdio', command: 'node' }
        });
      }

      // Adding 6th server should fail
      await expect(manager.addServer({
        name: 'server-6',
        transport: { type: 'stdio', command: 'node' }
      })).rejects.toThrow('Maximum connection limit (5) reached');
    });

    it('should handle auto-connect configuration', async () => {
      const config: McpServerConfig = {
        name: 'auto-connect-server',
        transport: { type: 'stdio', command: 'node' },
        autoConnect: true
      };

      await manager.addServer(config);
      
      // Allow time for auto-connect to attempt
      vi.advanceTimersByTime(100);
      
      // Should have attempted connection (even if it fails in test environment)
      const status = manager.getServerStatus('auto-connect-server');
      expect(status).toBeDefined();
    });
  });

  describe('connection lifecycle management', () => {
    beforeEach(async () => {
      await manager.addServer({
        name: 'test-server',
        transport: { type: 'stdio', command: 'node' },
        autoConnect: false
      });
    });

    it('should connect to server successfully', async () => {
      await manager.connectServer('test-server');
      
      const status = manager.getServerStatus('test-server');
      expect(status!.status).toBe('connected');
      expect(status!.lastConnected).toBeDefined();
      expect(status!.lastError).toBeUndefined();
    });

    it('should update server status during connection process', async () => {
      const statusUpdates: McpServerStatus[] = [];
      
      manager.on('statusChanged', (serverName: string, status: McpServerStatus) => {
        if (serverName === 'test-server') {
          statusUpdates.push(status);
        }
      });

      await manager.connectServer('test-server');
      
      expect(statusUpdates.length).toBeGreaterThan(0);
      expect(statusUpdates.some(s => s.status === 'connecting')).toBe(true);
      expect(statusUpdates.some(s => s.status === 'connected')).toBe(true);
    });

    it('should emit serverConnected event on successful connection', async () => {
      let connectedServer: string | undefined;
      
      manager.on('serverConnected', (serverName: string) => {
        connectedServer = serverName;
      });

      await manager.connectServer('test-server');
      
      expect(connectedServer).toBe('test-server');
    });

    it('should handle connection failures', async () => {
      // Get the mock client and make it fail
      await manager.connectServer('test-server');
      const client = manager.getClient('test-server') as MockMcpClient;
      client.forceConnectionState(false);
      
      // Mock getServerInfo to throw error
      vi.spyOn(client, 'getServerInfo').mockRejectedValue(new Error('Connection failed'));
      
      await manager.disconnectServer('test-server');
      
      // Try to connect again (should fail)
      await expect(manager.connectServer('test-server')).rejects.toThrow();
      
      const status = manager.getServerStatus('test-server');
      expect(status!.status).toBe('error');
      expect(status!.lastError).toContain('Connection failed');
    });

    it('should disconnect server cleanly', async () => {
      await manager.connectServer('test-server');
      await manager.disconnectServer('test-server');
      
      const status = manager.getServerStatus('test-server');
      expect(status!.status).toBe('disconnected');
      expect(status!.lastError).toBeUndefined();
    });

    it('should emit serverDisconnected event', async () => {
      await manager.connectServer('test-server');
      
      let disconnectedServer: string | undefined;
      manager.on('serverDisconnected', (serverName: string) => {
        disconnectedServer = serverName;
      });

      await manager.disconnectServer('test-server');
      
      expect(disconnectedServer).toBe('test-server');
    });

    it('should handle disconnect errors gracefully', async () => {
      await manager.connectServer('test-server');
      
      const client = manager.getClient('test-server') as MockMcpClient;
      vi.spyOn(client, 'disconnect').mockRejectedValue(new Error('Disconnect failed'));
      
      await expect(manager.disconnectServer('test-server')).rejects.toThrow('Disconnect failed');
      
      const status = manager.getServerStatus('test-server');
      expect(status!.status).toBe('error');
      expect(status!.lastError).toContain('Disconnect failed');
    });

    it('should throw error for non-existent server operations', async () => {
      await expect(manager.connectServer('nonexistent')).rejects.toThrow('Server nonexistent not found');
      await expect(manager.disconnectServer('nonexistent')).rejects.toThrow('Server nonexistent not found');
    });
  });

  describe('server management and removal', () => {
    it('should remove server and cleanup resources', async () => {
      await manager.addServer({
        name: 'removable-server',
        transport: { type: 'stdio', command: 'node' }
      });

      await manager.connectServer('removable-server');
      
      let removedServer: string | undefined;
      manager.on('serverRemoved', (serverName: string) => {
        removedServer = serverName;
      });

      await manager.removeServer('removable-server');
      
      expect(manager.getServerStatus('removable-server')).toBeUndefined();
      expect(manager.getClient('removable-server')).toBeUndefined();
      expect(removedServer).toBe('removable-server');
    });

    it('should handle removal of connected server', async () => {
      await manager.addServer({
        name: 'connected-server',
        transport: { type: 'stdio', command: 'node' }
      });

      await manager.connectServer('connected-server');
      
      // Should disconnect and remove without throwing
      await expect(manager.removeServer('connected-server')).resolves.not.toThrow();
    });

    it('should get all server statuses', async () => {
      await manager.addServer({
        name: 'server-1',
        transport: { type: 'stdio', command: 'node' }
      });
      await manager.addServer({
        name: 'server-2',
        transport: { type: 'stdio', command: 'node' }
      });

      const allStatuses = manager.getAllServerStatuses();
      
      expect(allStatuses.size).toBe(2);
      expect(allStatuses.has('server-1')).toBe(true);
      expect(allStatuses.has('server-2')).toBe(true);
    });
  });

  describe('tool discovery and management', () => {
    beforeEach(async () => {
      await manager.addServer({
        name: 'tool-server',
        transport: { type: 'stdio', command: 'node' }
      });
    });

    it('should discover tools from connected servers', async () => {
      await manager.connectServer('tool-server');
      
      const client = manager.getClient('tool-server') as MockMcpClient;
      client.setTools([
        {
          name: 'test-tool-1',
          description: 'Test tool 1',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'test-tool-2',
          description: 'Test tool 2',
          inputSchema: { type: 'object', properties: {} }
        }
      ]);

      const discovered = await manager.discoverTools();
      
      expect(discovered).toHaveLength(2);
      expect(discovered[0].serverName).toBe('tool-server');
      expect(discovered[0].tool.name).toBe('test-tool-1');
      expect(discovered[0].adapter).toBeDefined();
    });

    it('should skip disconnected servers during discovery', async () => {
      // Don't connect the server
      const discovered = await manager.discoverTools();
      
      expect(discovered).toHaveLength(0);
    });

    it('should handle discovery errors gracefully', async () => {
      await manager.connectServer('tool-server');
      
      const client = manager.getClient('tool-server') as MockMcpClient;
      vi.spyOn(client, 'listTools').mockRejectedValue(new Error('Discovery failed'));
      
      const discovered = await manager.discoverTools();
      
      expect(discovered).toHaveLength(0);
      
      const status = manager.getServerStatus('tool-server');
      expect(status!.status).toBe('error');
      expect(status!.lastError).toContain('Tool discovery failed');
    });

    it('should create MiniAgent-compatible tools', async () => {
      await manager.connectServer('tool-server');
      
      const client = manager.getClient('tool-server') as MockMcpClient;
      client.setTools([{
        name: 'compatible-tool',
        description: 'Compatible tool',
        inputSchema: { type: 'object', properties: {} }
      }]);

      const tools = await manager.discoverMiniAgentTools();
      
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-adapter'); // From mock
    });

    it('should update tool count in server status', async () => {
      await manager.connectServer('tool-server');
      
      const client = manager.getClient('tool-server') as MockMcpClient;
      client.setTools([
        { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } }
      ]);

      await manager.discoverTools();
      
      const status = manager.getServerStatus('tool-server');
      expect(status!.toolCount).toBe(2);
    });
  });

  describe('server refresh and cache management', () => {
    beforeEach(async () => {
      await manager.addServer({
        name: 'refresh-server',
        transport: { type: 'stdio', command: 'node' }
      });
      await manager.connectServer('refresh-server');
    });

    it('should refresh server tools and clear cache', async () => {
      const client = manager.getClient('refresh-server') as MockMcpClient;
      const schemaManager = client.getSchemaManager();
      const clearCacheSpy = vi.spyOn(schemaManager, 'clearCache');
      
      client.setTools([{
        name: 'refreshed-tool',
        description: 'Refreshed tool',
        inputSchema: { type: 'object' }
      }]);

      await manager.refreshServer('refresh-server');
      
      expect(clearCacheSpy).toHaveBeenCalled();
      
      const status = manager.getServerStatus('refresh-server');
      expect(status!.toolCount).toBe(1);
      expect(status!.lastError).toBeUndefined();
    });

    it('should emit serverToolsRefreshed event', async () => {
      let refreshedServer: string | undefined;
      let toolCount: number | undefined;
      
      manager.on('serverToolsRefreshed', (serverName: string, count: number) => {
        refreshedServer = serverName;
        toolCount = count;
      });

      const client = manager.getClient('refresh-server') as MockMcpClient;
      client.setTools([{ name: 'tool', description: 'Tool', inputSchema: { type: 'object' } }]);

      await manager.refreshServer('refresh-server');
      
      expect(refreshedServer).toBe('refresh-server');
      expect(toolCount).toBe(1);
    });

    it('should handle refresh errors', async () => {
      const client = manager.getClient('refresh-server') as MockMcpClient;
      vi.spyOn(client, 'listTools').mockRejectedValue(new Error('Refresh failed'));
      
      await expect(manager.refreshServer('refresh-server')).rejects.toThrow('Refresh failed');
      
      const status = manager.getServerStatus('refresh-server');
      expect(status!.status).toBe('error');
      expect(status!.lastError).toContain('Refresh failed');
    });

    it('should reject refresh for disconnected server', async () => {
      await manager.disconnectServer('refresh-server');
      
      await expect(manager.refreshServer('refresh-server')).rejects.toThrow('refresh-server is not connected');
    });
  });

  describe('health monitoring', () => {
    beforeEach(async () => {
      await manager.addServer({
        name: 'health-server',
        transport: { type: 'stdio', command: 'node' }
      });
    });

    it('should perform health check on connected servers', async () => {
      await manager.connectServer('health-server');
      
      const results = await manager.healthCheck();
      
      expect(results.has('health-server')).toBe(true);
      expect(results.get('health-server')).toBe(true);
    });

    it('should report unhealthy status for disconnected servers', async () => {
      // Server is added but not connected
      const results = await manager.healthCheck();
      
      expect(results.has('health-server')).toBe(true);
      expect(results.get('health-server')).toBe(false);
    });

    it('should handle health check errors', async () => {
      await manager.connectServer('health-server');
      
      const client = manager.getClient('health-server') as MockMcpClient;
      vi.spyOn(client, 'getServerInfo').mockRejectedValue(new Error('Health check failed'));
      
      const results = await manager.healthCheck();
      
      expect(results.get('health-server')).toBe(false);
      
      const status = manager.getServerStatus('health-server');
      expect(status!.status).toBe('error');
      expect(status!.lastError).toContain('Health check failed');
    });

    it('should run periodic health checks when enabled', async () => {
      await manager.connectServer('health-server');
      
      const client = manager.getClient('health-server') as MockMcpClient;
      const getServerInfoSpy = vi.spyOn(client, 'getServerInfo');
      
      // Fast-forward through one health check interval
      vi.advanceTimersByTime(30000);
      
      expect(getServerInfoSpy).toHaveBeenCalled();
    });
  });

  describe('event handling and client callbacks', () => {
    beforeEach(async () => {
      await manager.addServer({
        name: 'event-server',
        transport: { type: 'stdio', command: 'node' }
      });
      await manager.connectServer('event-server');
    });

    it('should handle client error events', async () => {
      const client = manager.getClient('event-server') as MockMcpClient;
      
      let errorEvent: { serverName: string; error: McpClientError } | undefined;
      manager.on('serverError', (serverName: string, error: McpClientError) => {
        errorEvent = { serverName, error };
      });

      const testError = new McpClientError('Test error', McpErrorCode.ServerError, 'event-server');
      client.simulateError(testError);
      
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.serverName).toBe('event-server');
      expect(errorEvent!.error.message).toBe('Test error');
      
      const status = manager.getServerStatus('event-server');
      expect(status!.status).toBe('error');
      expect(status!.lastError).toBe('Test error');
    });

    it('should handle client disconnect events', async () => {
      const client = manager.getClient('event-server') as MockMcpClient;
      
      let disconnectedServer: string | undefined;
      manager.on('serverDisconnected', (serverName: string) => {
        disconnectedServer = serverName;
      });

      client.simulateDisconnect();
      
      expect(disconnectedServer).toBe('event-server');
      
      const status = manager.getServerStatus('event-server');
      expect(status!.status).toBe('disconnected');
    });

    it('should register status change handlers', async () => {
      const statusChanges: McpServerStatus[] = [];
      
      manager.onServerStatusChange((status: McpServerStatus) => {
        statusChanges.push({ ...status });
      });

      await manager.disconnectServer('event-server');
      await manager.connectServer('event-server');
      
      expect(statusChanges.length).toBeGreaterThan(0);
      expect(statusChanges.some(s => s.status === 'disconnected')).toBe(true);
      expect(statusChanges.some(s => s.status === 'connected')).toBe(true);
    });

    it('should handle errors in status handlers gracefully', async () => {
      // Register a handler that throws
      manager.onServerStatusChange(() => {
        throw new Error('Handler error');
      });

      // Should not throw when status changes
      await expect(manager.disconnectServer('event-server')).resolves.not.toThrow();
    });
  });

  describe('statistics and monitoring', () => {
    beforeEach(async () => {
      await manager.addServer({
        name: 'stats-server-1',
        transport: { type: 'stdio', command: 'node' }
      });
      await manager.addServer({
        name: 'stats-server-2',
        transport: { type: 'streamable-http', url: 'https://api.test.com' }
      });
    });

    it('should provide accurate connection statistics', async () => {
      await manager.connectServer('stats-server-1');
      // Leave stats-server-2 disconnected
      
      // Set tool count for connected server
      const client = manager.getClient('stats-server-1') as MockMcpClient;
      client.setTools([
        { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } }
      ]);
      await manager.discoverTools();

      const stats = manager.getStatistics();
      
      expect(stats.totalServers).toBe(2);
      expect(stats.connectedServers).toBe(1);
      expect(stats.totalTools).toBe(2);
      expect(stats.errorServers).toBe(0);
      expect(stats.transportTypes['stdio']).toBe(1);
      expect(stats.transportTypes['streamable-http']).toBe(1);
    });

    it('should track error servers in statistics', async () => {
      await manager.connectServer('stats-server-1');
      
      const client = manager.getClient('stats-server-1') as MockMcpClient;
      client.simulateError(new McpClientError('Test error', McpErrorCode.ServerError));
      
      const stats = manager.getStatistics();
      
      expect(stats.errorServers).toBe(1);
      expect(stats.connectedServers).toBe(0);
    });

    it('should count transport types correctly', async () => {
      await manager.addServer({
        name: 'stdio-server-2',
        transport: { type: 'stdio', command: 'python' }
      });

      const stats = manager.getStatistics();
      
      expect(stats.transportTypes['stdio']).toBe(2);
      expect(stats.transportTypes['streamable-http']).toBe(1);
      expect(stats.totalServers).toBe(3);
    });
  });

  describe('cleanup and resource management', () => {
    it('should cleanup all resources on shutdown', async () => {
      await manager.addServer({
        name: 'cleanup-server-1',
        transport: { type: 'stdio', command: 'node' }
      });
      await manager.addServer({
        name: 'cleanup-server-2',
        transport: { type: 'stdio', command: 'node' }
      });

      await manager.connectServer('cleanup-server-1');
      await manager.connectServer('cleanup-server-2');
      
      await manager.cleanup();
      
      // All servers should be removed
      expect(manager.getAllServerStatuses().size).toBe(0);
      expect(manager.getClient('cleanup-server-1')).toBeUndefined();
      expect(manager.getClient('cleanup-server-2')).toBeUndefined();
      
      // Statistics should show no servers
      const stats = manager.getStatistics();
      expect(stats.totalServers).toBe(0);
      expect(stats.connectedServers).toBe(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      await manager.addServer({
        name: 'error-cleanup-server',
        transport: { type: 'stdio', command: 'node' }
      });
      await manager.connectServer('error-cleanup-server');
      
      const client = manager.getClient('error-cleanup-server') as MockMcpClient;
      vi.spyOn(client, 'disconnect').mockRejectedValue(new Error('Disconnect failed'));
      
      // Should complete cleanup despite errors
      await expect(manager.cleanup()).resolves.not.toThrow();
    });

    it('should stop health monitoring during cleanup', async () => {
      const healthManager = new McpConnectionManager({
        healthCheck: { enabled: true, intervalMs: 1000, timeoutMs: 5000 }
      });

      await healthManager.addServer({
        name: 'health-test',
        transport: { type: 'stdio', command: 'node' }
      });

      await healthManager.cleanup();
      
      // Advance timers - no health checks should run
      const healthCheckSpy = vi.spyOn(healthManager, 'healthCheck');
      vi.advanceTimersByTime(10000);
      
      expect(healthCheckSpy).not.toHaveBeenCalled();
    });

    it('should remove all event listeners on cleanup', async () => {
      const listenerCount = manager.listenerCount('serverConnected');
      
      await manager.cleanup();
      
      // All listeners should be removed
      expect(manager.listenerCount('serverConnected')).toBe(0);
      expect(manager.listenerCount('serverDisconnected')).toBe(0);
      expect(manager.listenerCount('serverError')).toBe(0);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent server additions', async () => {
      const promises: Promise<void>[] = [];
      
      for (let i = 0; i < 3; i++) {
        promises.push(manager.addServer({
          name: `concurrent-server-${i}`,
          transport: { type: 'stdio', command: 'node' }
        }));
      }

      await Promise.all(promises);
      
      const stats = manager.getStatistics();
      expect(stats.totalServers).toBe(3);
    });

    it('should handle concurrent connections', async () => {
      // Add servers first
      for (let i = 0; i < 3; i++) {
        await manager.addServer({
          name: `connect-server-${i}`,
          transport: { type: 'stdio', command: 'node' }
        });
      }

      // Connect concurrently
      const connectPromises = [
        manager.connectServer('connect-server-0'),
        manager.connectServer('connect-server-1'),
        manager.connectServer('connect-server-2')
      ];

      await Promise.all(connectPromises);
      
      const stats = manager.getStatistics();
      expect(stats.connectedServers).toBe(3);
    });

    it('should handle concurrent tool discovery', async () => {
      await manager.addServer({
        name: 'discovery-server',
        transport: { type: 'stdio', command: 'node' }
      });
      await manager.connectServer('discovery-server');
      
      const client = manager.getClient('discovery-server') as MockMcpClient;
      client.setTools([
        { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } }
      ]);

      // Run discovery concurrently
      const [result1, result2] = await Promise.all([
        manager.discoverTools(),
        manager.discoverTools()
      ]);

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
    });
  });
});