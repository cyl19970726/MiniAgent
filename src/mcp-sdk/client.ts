import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

// Configuration interfaces
export interface McpConfig {
  transport: 'stdio' | 'sse' | 'http';
  
  // stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  
  // HTTP-based transports (SSE, HTTP)
  url?: string;
  headers?: Record<string, string>;
  
  // Common options
  timeout?: number;
  clientInfo?: {
    name: string;
    version: string;
  };
  
  // Optional metadata
  description?: string;
  includeTools?: string[];
  excludeTools?: string[];
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: any;
}

export interface McpToolResult {
  content: any[];
}

export interface McpServerInfo {
  name: string;
  version: string;
  transport?: string;
  toolsFilter?: {
    include?: string[];
    exclude?: string[];
  };
}

/**
 * SimpleMcpClient - Comprehensive wrapper around official MCP SDK
 * Supports stdio, SSE, and HTTP (StreamableHTTP) transports
 */
export class SimpleMcpClient {
  private client: Client;
  private transport: Transport | null = null;
  private isConnected = false;
  private config?: McpConfig;

  constructor() {
    // Initialize official MCP SDK client
    this.client = new Client({
      name: 'miniagent-mcp-client',
      version: '1.0.0',
    }, {
      capabilities: { tools: {}, resources: {}, prompts: {} }
    });
  }

  // Connect to MCP server with specified transport
  async connect(config: McpConfig): Promise<void> {
    if (this.isConnected) throw new Error('Client is already connected');
    
    this.config = config;

    // Create transport using SDK implementations
    if (config.transport === 'stdio') {
      if (!config.command) throw new Error('command is required for stdio transport');
      const params: any = {
        command: config.command,
        args: config.args || [],
      };
      
      if (config.env !== undefined) {
        params.env = config.env;
      }
      
      if (config.cwd !== undefined) {
        params.cwd = config.cwd;
      }
      
      this.transport = new StdioClientTransport(params);
    } else if (config.transport === 'sse') {
      if (!config.url) throw new Error('url is required for sse transport');
      
      const options: any = {
        eventSourceInit: {},
      };
      
      // Add headers if provided
      if (config.headers) {
        options.eventSourceInit.headers = {
          ...config.headers,
        };
      }
      
      this.transport = new SSEClientTransport(new URL(config.url), options);
    } else if (config.transport === 'http') {
      if (!config.url) throw new Error('url is required for http transport');
      
      const options: any = {};
      
      // Add request init options including headers
      if (config.headers) {
        options.requestInit = {
          headers: {
            ...config.headers,
          },
        };
      }
      
      this.transport = new StreamableHTTPClientTransport(new URL(config.url), options) as Transport;
    } else {
      throw new Error(`Unsupported transport: ${config.transport}`);
    }

    // Apply timeout if specified
    if (config.timeout) {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Connection timeout after ${config.timeout}ms`)), config.timeout)
      );
      
      await Promise.race([
        this.client.connect(this.transport as Transport),
        timeoutPromise,
      ]);
    } else {
      await this.client.connect(this.transport as Transport);
    }
    
    this.isConnected = true;
  }

  // Disconnect from MCP server
  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    await this.client.close();
    this.transport = null;
    this.isConnected = false;
  }

  // List available tools from MCP server
  async listTools(): Promise<McpTool[]> {
    this.ensureConnected();
    const response = await this.client.listTools();
    
    let tools = response.tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema,
    }));
    
    // Apply tool filtering if configured
    if (this.config?.includeTools) {
      tools = tools.filter(tool => this.config!.includeTools!.includes(tool.name));
    }
    
    if (this.config?.excludeTools) {
      tools = tools.filter(tool => !this.config!.excludeTools!.includes(tool.name));
    }
    
    return tools;
  }

  // Execute tool on MCP server
  async callTool(name: string, args: Record<string, any> = {}): Promise<McpToolResult> {
    this.ensureConnected();
    const response = await this.client.callTool({ name, arguments: args });
    return { content: Array.isArray(response.content) ? response.content : [response.content] };
  }

  // Get server information including configuration metadata
  getServerInfo(): McpServerInfo {
    this.ensureConnected();
    return { 
      name: this.config?.description || 'MCP Server', 
      version: '1.0.0',
      transport: this.config?.transport || 'unknown',
      toolsFilter: {
        ...(this.config?.includeTools && { include: this.config.includeTools }),
        ...(this.config?.excludeTools && { exclude: this.config.excludeTools }),
      },
    };
  }

  // Check if client is connected
  get connected(): boolean {
    return this.isConnected;
  }

  // Ensure client is connected
  private ensureConnected(): void {
    if (!this.isConnected) throw new Error('Client is not connected. Call connect() first.');
  }
}