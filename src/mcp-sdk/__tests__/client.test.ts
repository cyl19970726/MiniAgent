/**
 * @fileoverview Tests for SimpleMcpClient
 * 
 * Tests the SimpleMcpClient class with focus on the updated flattened configuration structure
 * including new options: env, cwd, headers, timeout
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SimpleMcpClient, McpConfig } from '../client.js';

// Mock the MCP SDK modules
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    close: vi.fn(),
    listTools: vi.fn(),
    callTool: vi.fn()
  }))
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn()
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn()
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn()
}));

describe('SimpleMcpClient', () => {
  let client: SimpleMcpClient;
  let mockClient: any;
  let mockStdioTransport: any;
  let mockSSETransport: any;
  let mockHTTPTransport: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Import mocked modules
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

    // Setup mocks
    mockClient = {
      connect: vi.fn(),
      close: vi.fn(),
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: 'test_tool', description: 'Test tool', inputSchema: { type: 'object' } }
        ]
      }),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mock result' }]
      })
    };

    mockStdioTransport = {};
    mockSSETransport = {};
    mockHTTPTransport = {};

    (Client as any).mockReturnValue(mockClient);
    (StdioClientTransport as any).mockReturnValue(mockStdioTransport);
    (SSEClientTransport as any).mockReturnValue(mockSSETransport);
    (StreamableHTTPClientTransport as any).mockReturnValue(mockHTTPTransport);

    client = new SimpleMcpClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default configuration', () => {
      expect(client.connected).toBe(false);
    });

    it('should initialize MCP SDK client with correct parameters', async () => {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      
      expect(Client).toHaveBeenCalledWith(
        {
          name: 'miniagent-mcp-client',
          version: '1.0.0',
        },
        {
          capabilities: { tools: {}, resources: {}, prompts: {} }
        }
      );
    });
  });

  describe('stdio transport configuration', () => {
    it('should require command for stdio transport', async () => {
      const config: McpConfig = {
        transport: 'stdio'
        // missing command
      };

      await expect(client.connect(config)).rejects.toThrow('command is required for stdio transport');
    });

    it('should create stdio transport with basic configuration', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server'
      };

      await client.connect(config);

      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'test-server',
        args: []
      });
    });

    it('should pass args to stdio transport', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        args: ['--port', '8080', '--verbose']
      };

      await client.connect(config);

      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'test-server',
        args: ['--port', '8080', '--verbose']
      });
    });

    it('should pass environment variables to stdio transport', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        env: {
          NODE_ENV: 'test',
          API_KEY: 'secret',
          PORT: '3000'
        }
      };

      await client.connect(config);

      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'test-server',
        args: [],
        env: {
          NODE_ENV: 'test',
          API_KEY: 'secret',
          PORT: '3000'
        }
      });
    });

    it('should pass current working directory to stdio transport', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        cwd: '/app/server'
      };

      await client.connect(config);

      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'test-server',
        args: [],
        cwd: '/app/server'
      });
    });

    it('should handle complex stdio configuration', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'node',
        args: ['server.js', '--config', 'production.json'],
        env: {
          NODE_ENV: 'production',
          DEBUG: 'mcp:*'
        },
        cwd: '/opt/mcp-server',
        timeout: 10000
      };

      await client.connect(config);

      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'node',
        args: ['server.js', '--config', 'production.json'],
        env: {
          NODE_ENV: 'production',
          DEBUG: 'mcp:*'
        },
        cwd: '/opt/mcp-server'
      });
    });

    it('should not pass undefined env to transport', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        env: undefined
      };

      await client.connect(config);

      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'test-server',
        args: []
        // no env property
      });
    });

    it('should not pass undefined cwd to transport', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        cwd: undefined
      };

      await client.connect(config);

      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'test-server',
        args: []
        // no cwd property
      });
    });
  });

  describe('sse transport configuration', () => {
    it('should require url for sse transport', async () => {
      const config: McpConfig = {
        transport: 'sse'
        // missing url
      };

      await expect(client.connect(config)).rejects.toThrow('url is required for sse transport');
    });

    it('should create sse transport with basic configuration', async () => {
      const config: McpConfig = {
        transport: 'sse',
        url: 'http://localhost:8080/sse'
      };

      await client.connect(config);

      const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
      expect(SSEClientTransport).toHaveBeenCalledWith(
        new URL('http://localhost:8080/sse'),
        {
          eventSourceInit: {}
        }
      );
    });

    it('should pass headers to sse transport', async () => {
      const config: McpConfig = {
        transport: 'sse',
        url: 'https://api.example.com/mcp/sse',
        headers: {
          'Authorization': 'Bearer token123',
          'X-API-Version': '2024-01'
        }
      };

      await client.connect(config);

      const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
      expect(SSEClientTransport).toHaveBeenCalledWith(
        new URL('https://api.example.com/mcp/sse'),
        {
          eventSourceInit: {
            headers: {
              'Authorization': 'Bearer token123',
              'X-API-Version': '2024-01'
            }
          }
        }
      );
    });

    it('should handle complex sse configuration', async () => {
      const config: McpConfig = {
        transport: 'sse',
        url: 'wss://secure.example.com/mcp',
        headers: {
          'Authorization': 'Bearer jwt-token',
          'User-Agent': 'MiniAgent/1.0',
          'Accept': 'text/event-stream'
        },
        timeout: 30000
      };

      await client.connect(config);

      const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
      expect(SSEClientTransport).toHaveBeenCalledWith(
        new URL('wss://secure.example.com/mcp'),
        {
          eventSourceInit: {
            headers: {
              'Authorization': 'Bearer jwt-token',
              'User-Agent': 'MiniAgent/1.0',
              'Accept': 'text/event-stream'
            }
          }
        }
      );
    });
  });

  describe('http transport configuration', () => {
    it('should require url for http transport', async () => {
      const config: McpConfig = {
        transport: 'http'
        // missing url
      };

      await expect(client.connect(config)).rejects.toThrow('url is required for http transport');
    });

    it('should create http transport with basic configuration', async () => {
      const config: McpConfig = {
        transport: 'http',
        url: 'http://localhost:8080/mcp'
      };

      await client.connect(config);

      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://localhost:8080/mcp'),
        {}
      );
    });

    it('should pass headers to http transport', async () => {
      const config: McpConfig = {
        transport: 'http',
        url: 'https://api.example.com/mcp',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token456'
        }
      };

      await client.connect(config);

      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('https://api.example.com/mcp'),
        {
          requestInit: {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer token456'
            }
          }
        }
      );
    });

    it('should handle complex http configuration', async () => {
      const config: McpConfig = {
        transport: 'http',
        url: 'https://enterprise.example.com/mcp/v2',
        headers: {
          'Authorization': 'Bearer enterprise-token',
          'X-Client-ID': 'miniagent',
          'X-Request-ID': '12345'
        },
        timeout: 60000
      };

      await client.connect(config);

      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('https://enterprise.example.com/mcp/v2'),
        {
          requestInit: {
            headers: {
              'Authorization': 'Bearer enterprise-token',
              'X-Client-ID': 'miniagent',
              'X-Request-ID': '12345'
            }
          }
        }
      );
    });
  });

  describe('timeout handling', () => {
    it('should handle connection timeout', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        timeout: 1000
      };

      // Make connect take longer than timeout
      mockClient.connect.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );

      await expect(client.connect(config)).rejects.toThrow('Connection timeout after 1000ms');
    });

    it('should connect successfully within timeout', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        timeout: 2000
      };

      // Make connect resolve quickly
      mockClient.connect.mockResolvedValue(undefined);

      await expect(client.connect(config)).resolves.not.toThrow();
      expect(client.connected).toBe(true);
    });

    it('should connect without timeout when not specified', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server'
        // no timeout
      };

      mockClient.connect.mockResolvedValue(undefined);

      await client.connect(config);
      expect(client.connected).toBe(true);
      expect(mockClient.connect).toHaveBeenCalledWith(mockStdioTransport);
    });
  });

  describe('connection management', () => {
    it('should prevent double connection', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server'
      };

      mockClient.connect.mockResolvedValue(undefined);

      await client.connect(config);
      expect(client.connected).toBe(true);

      await expect(client.connect(config)).rejects.toThrow('Client is already connected');
    });

    it('should handle connection errors gracefully', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server'
      };

      mockClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(client.connect(config)).rejects.toThrow('Connection failed');
      expect(client.connected).toBe(false);
    });

    it('should disconnect cleanly', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server'
      };

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.close.mockResolvedValue(undefined);

      await client.connect(config);
      expect(client.connected).toBe(true);

      await client.disconnect();
      expect(client.connected).toBe(false);
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', async () => {
      expect(client.connected).toBe(false);
      
      await expect(client.disconnect()).resolves.not.toThrow();
      expect(mockClient.close).not.toHaveBeenCalled();
    });
  });

  describe('unsupported transport', () => {
    it('should throw error for unsupported transport type', async () => {
      const config = {
        transport: 'websocket' // unsupported
      } as McpConfig;

      await expect(client.connect(config)).rejects.toThrow('Unsupported transport: websocket');
    });
  });

  describe('tool operations', () => {
    beforeEach(async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server'
      };
      mockClient.connect.mockResolvedValue(undefined);
      await client.connect(config);
    });

    it('should list tools when connected', async () => {
      const tools = await client.listTools();

      expect(mockClient.listTools).toHaveBeenCalled();
      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: { type: 'object' }
      });
    });

    it('should call tool when connected', async () => {
      const result = await client.callTool('test_tool', { param: 'value' });

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'test_tool',
        arguments: { param: 'value' }
      });
      expect(result.content).toEqual([{ type: 'text', text: 'Mock result' }]);
    });

    it('should throw when calling listTools without connection', async () => {
      await client.disconnect();

      await expect(client.listTools()).rejects.toThrow('Client is not connected. Call connect() first.');
    });

    it('should throw when calling callTool without connection', async () => {
      await client.disconnect();

      await expect(client.callTool('test_tool')).rejects.toThrow('Client is not connected. Call connect() first.');
    });
  });

  describe('tool filtering', () => {
    beforeEach(async () => {
      mockClient.listTools.mockResolvedValue({
        tools: [
          { name: 'tool_a', description: 'Tool A', inputSchema: {} },
          { name: 'tool_b', description: 'Tool B', inputSchema: {} },
          { name: 'tool_c', description: 'Tool C', inputSchema: {} }
        ]
      });

      mockClient.connect.mockResolvedValue(undefined);
    });

    it('should filter tools using includeTools', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        includeTools: ['tool_a', 'tool_c']
      };

      await client.connect(config);
      const tools = await client.listTools();

      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name)).toEqual(['tool_a', 'tool_c']);
    });

    it('should filter tools using excludeTools', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        excludeTools: ['tool_b']
      };

      await client.connect(config);
      const tools = await client.listTools();

      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name)).toEqual(['tool_a', 'tool_c']);
    });

    it('should apply both include and exclude filters', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        includeTools: ['tool_a', 'tool_b', 'tool_c'],
        excludeTools: ['tool_b']
      };

      await client.connect(config);
      const tools = await client.listTools();

      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name)).toEqual(['tool_a', 'tool_c']);
    });
  });

  describe('server info', () => {
    it('should require connection for getServerInfo', () => {
      expect(() => client.getServerInfo()).toThrow('Client is not connected. Call connect() first.');
    });

    it('should return server info when connected', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        description: 'Test Server'
      };

      mockClient.connect.mockResolvedValue(undefined);
      await client.connect(config);

      const info = client.getServerInfo();
      expect(info).toEqual({
        name: 'Test Server',
        version: '1.0.0',
        transport: 'stdio',
        toolsFilter: {}
      });
    });

    it('should include tool filters in server info', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        includeTools: ['tool1', 'tool2'],
        excludeTools: ['tool3']
      };

      mockClient.connect.mockResolvedValue(undefined);
      await client.connect(config);

      const info = client.getServerInfo();
      expect(info.toolsFilter).toEqual({
        include: ['tool1', 'tool2'],
        exclude: ['tool3']
      });
    });

    it('should use default description when not provided', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server'
      };

      mockClient.connect.mockResolvedValue(undefined);
      await client.connect(config);

      const info = client.getServerInfo();
      expect(info.name).toBe('MCP Server');
    });
  });

  describe('edge cases', () => {
    it('should handle empty args array', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        args: []
      };

      await client.connect(config);

      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'test-server',
        args: []
      });
    });

    it('should handle empty headers object', async () => {
      const config: McpConfig = {
        transport: 'http',
        url: 'http://localhost:8080',
        headers: {}
      };

      await client.connect(config);

      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://localhost:8080'),
        {
          requestInit: {
            headers: {}
          }
        }
      );
    });

    it('should handle empty env object', async () => {
      const config: McpConfig = {
        transport: 'stdio',
        command: 'test-server',
        env: {}
      };

      await client.connect(config);

      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'test-server',
        args: [],
        env: {}
      });
    });
  });
});