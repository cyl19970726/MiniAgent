/**
 * @fileoverview Tests for McpManager
 * 
 * Tests the McpManager class with focus on the flattened configuration structure
 * and new configuration options: env, cwd, headers, timeout
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { McpManager, McpServerConfig } from '../manager.js';
import { SimpleMcpClient } from '../client.js';
import { McpToolAdapter } from '../tool-adapter.js';

// Mock the SimpleMcpClient
vi.mock('../client.js', () => ({
  SimpleMcpClient: vi.fn()
}));

// Mock the tool adapter functions
vi.mock('../tool-adapter.js', () => ({
  McpToolAdapter: vi.fn(),
  createMcpTools: vi.fn()
}));

describe('McpManager', () => {
  let manager: McpManager;
  let mockClient: any;
  let mockTools: McpToolAdapter[];
  let MockSimpleMcpClient: any;
  let mockCreateMcpTools: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import mocked modules
    const clientModule = await import('../client.js');
    const toolAdapterModule = await import('../tool-adapter.js');

    MockSimpleMcpClient = clientModule.SimpleMcpClient;
    mockCreateMcpTools = toolAdapterModule.createMcpTools;

    // Setup mock client
    mockClient = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      connected: false,
      listTools: vi.fn(),
      callTool: vi.fn()
    };

    // Setup mock tools
    mockTools = [
      { name: 'tool1', description: 'Tool 1' } as any,
      { name: 'tool2', description: 'Tool 2' } as any
    ];

    MockSimpleMcpClient.mockReturnValue(mockClient);
    mockCreateMcpTools.mockResolvedValue(mockTools);

    manager = new McpManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with empty state', () => {
      expect(manager.serverCount).toBe(0);
      expect(manager.totalToolCount).toBe(0);
      expect(manager.listServers()).toEqual([]);
    });
  });

  describe('addServer with flattened configuration', () => {
    it('should add stdio server with basic configuration', async () => {
      const config: McpServerConfig = {
        name: 'test-server',
        transport: 'stdio',
        command: 'test-command'
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      const tools = await manager.addServer(config);

      expect(MockSimpleMcpClient).toHaveBeenCalled();
      expect(mockClient.connect).toHaveBeenCalledWith({
        transport: 'stdio',
        command: 'test-command',
        description: 'MCP Server: test-server'
      });
      expect(mockCreateMcpTools).toHaveBeenCalledWith(mockClient);
      expect(tools).toBe(mockTools);
      expect(manager.serverCount).toBe(1);
      expect(manager.totalToolCount).toBe(2);
    });

    it('should add stdio server with env variables', async () => {
      const config: McpServerConfig = {
        name: 'env-server',
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: {
          NODE_ENV: 'production',
          API_KEY: 'secret-key',
          LOG_LEVEL: 'debug'
        }
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      await manager.addServer(config);

      expect(mockClient.connect).toHaveBeenCalledWith({
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: {
          NODE_ENV: 'production',
          API_KEY: 'secret-key',
          LOG_LEVEL: 'debug'
        },
        description: 'MCP Server: env-server'
      });
    });

    it('should add stdio server with working directory', async () => {
      const config: McpServerConfig = {
        name: 'cwd-server',
        transport: 'stdio',
        command: './start.sh',
        cwd: '/opt/mcp-server'
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      await manager.addServer(config);

      expect(mockClient.connect).toHaveBeenCalledWith({
        transport: 'stdio',
        command: './start.sh',
        cwd: '/opt/mcp-server',
        description: 'MCP Server: cwd-server'
      });
    });

    it('should add http server with headers', async () => {
      const config: McpServerConfig = {
        name: 'http-server',
        transport: 'http',
        url: 'https://api.example.com/mcp',
        headers: {
          'Authorization': 'Bearer token123',
          'Content-Type': 'application/json',
          'X-Client-Version': '1.0.0'
        }
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      await manager.addServer(config);

      expect(mockClient.connect).toHaveBeenCalledWith({
        transport: 'http',
        url: 'https://api.example.com/mcp',
        headers: {
          'Authorization': 'Bearer token123',
          'Content-Type': 'application/json',
          'X-Client-Version': '1.0.0'
        },
        description: 'MCP Server: http-server'
      });
    });

    it('should add sse server with headers', async () => {
      const config: McpServerConfig = {
        name: 'sse-server',
        transport: 'sse',
        url: 'https://stream.example.com/events',
        headers: {
          'Authorization': 'Api-Key abc123',
          'Accept': 'text/event-stream'
        }
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      await manager.addServer(config);

      expect(mockClient.connect).toHaveBeenCalledWith({
        transport: 'sse',
        url: 'https://stream.example.com/events',
        headers: {
          'Authorization': 'Api-Key abc123',
          'Accept': 'text/event-stream'
        },
        description: 'MCP Server: sse-server'
      });
    });

    it('should add server with timeout', async () => {
      const config: McpServerConfig = {
        name: 'timeout-server',
        transport: 'stdio',
        command: 'slow-server',
        timeout: 15000
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      await manager.addServer(config);

      expect(mockClient.connect).toHaveBeenCalledWith({
        transport: 'stdio',
        command: 'slow-server',
        timeout: 15000,
        description: 'MCP Server: timeout-server'
      });
    });

    it('should add server with complete configuration', async () => {
      const config: McpServerConfig = {
        name: 'complete-server',
        transport: 'stdio',
        command: 'python',
        args: ['-m', 'mcp_server', '--port', '8080'],
        env: {
          PYTHON_PATH: '/usr/local/bin/python',
          MCP_LOG_LEVEL: 'info'
        },
        cwd: '/app/mcp',
        timeout: 30000,
        description: 'Custom MCP Server Description',
        includeTools: ['tool1', 'tool3'],
        excludeTools: ['tool2'],
        clientInfo: {
          name: 'custom-client',
          version: '2.0.0'
        }
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      await manager.addServer(config);

      expect(mockClient.connect).toHaveBeenCalledWith({
        transport: 'stdio',
        command: 'python',
        args: ['-m', 'mcp_server', '--port', '8080'],
        env: {
          PYTHON_PATH: '/usr/local/bin/python',
          MCP_LOG_LEVEL: 'info'
        },
        cwd: '/app/mcp',
        timeout: 30000,
        description: 'Custom MCP Server Description',
        includeTools: ['tool1', 'tool3'],
        excludeTools: ['tool2'],
        clientInfo: {
          name: 'custom-client',
          version: '2.0.0'
        }
      });
    });

    it('should use provided description over default', async () => {
      const config: McpServerConfig = {
        name: 'custom-desc-server',
        transport: 'stdio',
        command: 'server',
        description: 'My Custom Server Description'
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      await manager.addServer(config);

      expect(mockClient.connect).toHaveBeenCalledWith({
        transport: 'stdio',
        command: 'server',
        description: 'My Custom Server Description'
      });
    });

    it('should support autoConnect=false', async () => {
      const config: McpServerConfig = {
        name: 'no-connect-server',
        transport: 'stdio',
        command: 'server',
        autoConnect: false
      };

      const tools = await manager.addServer(config);

      expect(mockClient.connect).not.toHaveBeenCalled();
      expect(mockCreateMcpTools).not.toHaveBeenCalled();
      expect(tools).toEqual([]);
      expect(manager.serverCount).toBe(1);
      expect(manager.totalToolCount).toBe(0);
    });

    it('should handle duplicate server names', async () => {
      const config: McpServerConfig = {
        name: 'duplicate-server',
        transport: 'stdio',
        command: 'server'
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      await manager.addServer(config);

      await expect(manager.addServer(config)).rejects.toThrow(
        "MCP server 'duplicate-server' already exists"
      );
    });

    it('should require transport type', async () => {
      const config = {
        name: 'no-transport-server'
        // missing transport
      } as McpServerConfig;

      await expect(manager.addServer(config)).rejects.toThrow(
        'Transport type is required'
      );
    });

    it('should handle connection errors', async () => {
      const config: McpServerConfig = {
        name: 'failing-server',
        transport: 'stdio',
        command: 'failing-server'
      };

      mockClient.connected = false;
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(manager.addServer(config)).rejects.toThrow(
        "Failed to add MCP server 'failing-server': Connection failed"
      );

      expect(manager.serverCount).toBe(0);
    });

    it('should handle tool creation errors', async () => {
      const config: McpServerConfig = {
        name: 'tool-error-server',
        transport: 'stdio',
        command: 'server'
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);
      mockCreateMcpTools.mockRejectedValue(new Error('Tool creation failed'));

      await expect(manager.addServer(config)).rejects.toThrow(
        "Failed to add MCP server 'tool-error-server': Tool creation failed"
      );
    });

    it('should clean up on failure', async () => {
      const config: McpServerConfig = {
        name: 'cleanup-server',
        transport: 'stdio',
        command: 'server'
      };

      mockClient.connected = true; // Simulate connected state
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.disconnect.mockResolvedValue(undefined);
      mockCreateMcpTools.mockRejectedValue(new Error('Failed after connect'));

      await expect(manager.addServer(config)).rejects.toThrow(
        "Failed to add MCP server 'cleanup-server': Failed after connect"
      );

      // Should have called disconnect during cleanup
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('server management', () => {
    beforeEach(async () => {
      const config: McpServerConfig = {
        name: 'test-server',
        transport: 'stdio',
        command: 'server'
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);
      await manager.addServer(config);
    });

    it('should remove server successfully', async () => {
      mockClient.connected = true;
      mockClient.disconnect.mockResolvedValue(undefined);

      await manager.removeServer('test-server');

      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(manager.serverCount).toBe(0);
      expect(manager.totalToolCount).toBe(0);
    });

    it('should handle disconnect errors during removal', async () => {
      mockClient.connected = true;
      mockClient.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      // Should not throw, but should log warning
      await expect(manager.removeServer('test-server')).resolves.not.toThrow();

      expect(manager.serverCount).toBe(0); // Should still clean up
    });

    it('should throw when removing non-existent server', async () => {
      await expect(manager.removeServer('non-existent')).rejects.toThrow(
        "MCP server 'non-existent' not found"
      );
    });

    it('should check server connection status', () => {
      mockClient.connected = true;
      expect(manager.isServerConnected('test-server')).toBe(true);

      mockClient.connected = false;
      expect(manager.isServerConnected('test-server')).toBe(false);

      expect(manager.isServerConnected('non-existent')).toBe(false);
    });

    it('should get server tools', () => {
      const tools = manager.getServerTools('test-server');
      expect(tools).toBe(mockTools);

      const emptyTools = manager.getServerTools('non-existent');
      expect(emptyTools).toEqual([]);
    });

    it('should get all tools from all servers', () => {
      const allTools = manager.getAllTools();
      expect(allTools).toEqual(mockTools);
    });

    it('should list all servers', () => {
      const serverNames = manager.listServers();
      expect(serverNames).toEqual(['test-server']);
    });

    it('should get servers info', () => {
      mockClient.connected = true;

      const serversInfo = manager.getServersInfo();
      expect(serversInfo).toEqual([{
        name: 'test-server',
        connected: true,
        toolCount: 2
      }]);
    });
  });

  describe('connect server', () => {
    beforeEach(async () => {
      const config: McpServerConfig = {
        name: 'delayed-server',
        transport: 'stdio',
        command: 'server',
        autoConnect: false
      };

      await manager.addServer(config);
    });

    it('should connect previously added server', async () => {
      const connectConfig = {
        transport: 'stdio' as const,
        command: 'server'
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);
      mockCreateMcpTools.mockResolvedValue(mockTools);

      const tools = await manager.connectServer('delayed-server', connectConfig);

      expect(mockClient.connect).toHaveBeenCalledWith(connectConfig);
      expect(tools).toBe(mockTools);
    });

    it('should return existing tools if already connected', async () => {
      mockClient.connected = true;

      const tools = await manager.connectServer('delayed-server');

      expect(mockClient.connect).not.toHaveBeenCalled();
      expect(tools).toEqual([]);
    });

    it('should throw for non-existent server', async () => {
      await expect(manager.connectServer('non-existent')).rejects.toThrow(
        "MCP server 'non-existent' not found"
      );
    });

    it('should require config for disconnected server', async () => {
      mockClient.connected = false;

      await expect(manager.connectServer('delayed-server')).rejects.toThrow(
        "Connection config required for server 'delayed-server'"
      );
    });
  });

  describe('disconnect all', () => {
    beforeEach(async () => {
      // Add multiple servers
      const configs: McpServerConfig[] = [
        { name: 'server1', transport: 'stdio', command: 'server1' },
        { name: 'server2', transport: 'stdio', command: 'server2' },
        { name: 'server3', transport: 'stdio', command: 'server3' }
      ];

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      for (const config of configs) {
        await manager.addServer(config);
      }
    });

    it('should disconnect all servers', async () => {
      // Set all as connected
      mockClient.connected = true;
      mockClient.disconnect.mockResolvedValue(undefined);

      await manager.disconnectAll();

      expect(mockClient.disconnect).toHaveBeenCalledTimes(3);
      expect(manager.serverCount).toBe(0);
      expect(manager.totalToolCount).toBe(0);
    });

    it('should handle disconnect errors gracefully', async () => {
      mockClient.connected = true;
      mockClient.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      // Should not throw
      await expect(manager.disconnectAll()).resolves.not.toThrow();

      expect(manager.serverCount).toBe(0); // Should still clean up
    });

    it('should handle mixed connection states', async () => {
      // Only disconnect connected servers
      const connectedServers = 2;
      let disconnectCallCount = 0;

      mockClient.connected = false;
      mockClient.disconnect.mockImplementation(() => {
        disconnectCallCount++;
        return Promise.resolve();
      });

      // Simulate some servers being connected
      Object.defineProperty(mockClient, 'connected', {
        get: () => disconnectCallCount < connectedServers
      });

      await manager.disconnectAll();

      expect(mockClient.disconnect).toHaveBeenCalledTimes(connectedServers);
      expect(manager.serverCount).toBe(0);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle servers with empty tool lists', async () => {
      const config: McpServerConfig = {
        name: 'empty-tools-server',
        transport: 'stdio',
        command: 'server'
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);
      mockCreateMcpTools.mockResolvedValue([]);

      const tools = await manager.addServer(config);

      expect(tools).toEqual([]);
      expect(manager.totalToolCount).toBe(0);
    });

    it('should handle non-Error exceptions', async () => {
      const config: McpServerConfig = {
        name: 'string-error-server',
        transport: 'stdio',
        command: 'server'
      };

      mockClient.connected = false;
      mockClient.connect.mockRejectedValue('String error');

      await expect(manager.addServer(config)).rejects.toThrow(
        "Failed to add MCP server 'string-error-server': String error"
      );
    });

    it('should handle large numbers of servers', async () => {
      const serverCount = 50;
      const configs: McpServerConfig[] = Array.from({ length: serverCount }, (_, i) => ({
        name: `server${i}`,
        transport: 'stdio' as const,
        command: `server${i}`
      }));

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      // Add all servers
      for (const config of configs) {
        await manager.addServer(config);
      }

      expect(manager.serverCount).toBe(serverCount);
      expect(manager.totalToolCount).toBe(serverCount * 2); // 2 tools per server
      expect(manager.listServers()).toHaveLength(serverCount);
    });

    it('should handle servers with special characters in names', async () => {
      const config: McpServerConfig = {
        name: 'special-server!@#$%^&*()_+',
        transport: 'stdio',
        command: 'server'
      };

      mockClient.connected = false;
      mockClient.connect.mockResolvedValue(undefined);

      await expect(manager.addServer(config)).resolves.not.toThrow();

      expect(manager.isServerConnected('special-server!@#$%^&*()_+')).toBe(false);
    });
  });

  describe('configuration validation', () => {
    it('should validate stdio transport requirements', async () => {
      const config = {
        name: 'stdio-no-command',
        transport: 'stdio'
        // missing command
      } as McpServerConfig;

      mockClient.connected = false;
      mockClient.connect.mockRejectedValue(new Error('command is required for stdio transport'));

      await expect(manager.addServer(config)).rejects.toThrow(
        "Failed to add MCP server 'stdio-no-command': command is required for stdio transport"
      );
    });

    it('should validate http transport requirements', async () => {
      const config = {
        name: 'http-no-url',
        transport: 'http'
        // missing url
      } as McpServerConfig;

      mockClient.connected = false;
      mockClient.connect.mockRejectedValue(new Error('url is required for http transport'));

      await expect(manager.addServer(config)).rejects.toThrow(
        "Failed to add MCP server 'http-no-url': url is required for http transport"
      );
    });

    it('should validate sse transport requirements', async () => {
      const config = {
        name: 'sse-no-url',
        transport: 'sse'
        // missing url
      } as McpServerConfig;

      mockClient.connected = false;
      mockClient.connect.mockRejectedValue(new Error('url is required for sse transport'));

      await expect(manager.addServer(config)).rejects.toThrow(
        "Failed to add MCP server 'sse-no-url': url is required for sse transport"
      );
    });
  });
});