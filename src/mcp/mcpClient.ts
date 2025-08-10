/**
 * @fileoverview MCP Client Implementation
 * 
 * This module provides the core MCP client implementation with JSON-RPC 
 * communication, connection management, and protocol handling.
 */

import {
  IMcpClient,
  McpClientConfig,
  McpClientError,
  McpErrorCode,
  McpRequest,
  McpResponse,
  McpNotification,
  McpTool,
  McpToolResult,
  McpResource,
  McpResourceContent,
  McpServerCapabilities,
  IMcpTransport,
  MCP_VERSION,
  IToolSchemaManager,
} from './interfaces.js';
import { McpSchemaManager } from './schemaManager.js';

/**
 * Core MCP client implementation
 * 
 * Handles JSON-RPC communication with MCP servers, connection management,
 * and protocol-level operations like tool discovery and execution.
 */
export class McpClient implements IMcpClient {
  private transport?: IMcpTransport;
  private config?: McpClientConfig;
  private connected: boolean = false;
  private nextRequestId: number = 1;
  private pendingRequests: Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timeout?: NodeJS.Timeout;
  }> = new Map();
  private serverInfo?: {
    name: string;
    version: string;
    capabilities: McpServerCapabilities;
  };
  private errorHandlers: Array<(error: McpClientError) => void> = [];
  private disconnectHandlers: Array<() => void> = [];
  private toolsChangedHandlers: Array<() => void> = [];
  private schemaManager!: IToolSchemaManager;

  /**
   * Initialize the client with configuration
   */
  async initialize(config: McpClientConfig): Promise<void> {
    this.config = config;
    this.schemaManager = new McpSchemaManager();

    // Create transport based on configuration
    if (config.transport.type === 'stdio') {
      const { StdioTransport } = await import('./transports/stdioTransport.js');
      this.transport = new StdioTransport(config.transport);
    } else if (config.transport.type === 'http' || config.transport.type === 'streamable-http') {
      const { HttpTransport } = await import('./transports/httpTransport.js');
      // Convert legacy 'http' config to 'streamable-http' format if needed
      const httpConfig = config.transport.type === 'http' 
        ? { ...config.transport, type: 'streamable-http' as const, streaming: true }
        : config.transport;
      this.transport = new HttpTransport(httpConfig);
    } else {
      throw new McpClientError(
        `Unsupported transport type: ${(config.transport as any).type}`,
        McpErrorCode.InvalidRequest,
        config.serverName
      );
    }

    // Set up transport event handlers
    this.transport.onMessage(this.handleMessage.bind(this));
    this.transport.onError(this.handleTransportError.bind(this));
    this.transport.onDisconnect(this.handleTransportDisconnect.bind(this));
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (!this.transport || !this.config) {
      throw new McpClientError(
        'Client not initialized. Call initialize() first.',
        McpErrorCode.InvalidRequest,
        this.config?.serverName
      );
    }

    try {
      await this.transport.connect();
      this.connected = true;

      // Perform MCP handshake
      await this.performHandshake();
    } catch (error) {
      this.connected = false;
      throw new McpClientError(
        `Failed to connect to MCP server: ${error}`,
        McpErrorCode.ConnectionError,
        this.config.serverName,
        undefined,
        error
      );
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect();
    }
    this.connected = false;
    this.clearPendingRequests();
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected && (this.transport?.isConnected() ?? false);
  }

  /**
   * Get server information
   */
  async getServerInfo(): Promise<{
    name: string;
    version: string;
    capabilities: McpServerCapabilities;
  }> {
    if (!this.serverInfo) {
      throw new McpClientError(
        'Server information not available. Ensure client is connected.',
        McpErrorCode.InternalError,
        this.config?.serverName
      );
    }
    return this.serverInfo;
  }

  /**
   * List available tools from the server
   */
  async listTools<T = unknown>(cacheSchemas: boolean = true): Promise<McpTool<T>[]> {
    const response = await this.sendRequest('tools/list');
    
    if (!response || typeof response !== 'object' || !('tools' in response)) {
      throw new McpClientError(
        'Invalid response from tools/list',
        McpErrorCode.InvalidParams,
        this.config?.serverName
      );
    }

    const tools = (response as { tools: unknown }).tools;
    if (!Array.isArray(tools)) {
      throw new McpClientError(
        'Expected tools array in response',
        McpErrorCode.InvalidParams,
        this.config?.serverName
      );
    }

    const mcpTools = tools as McpTool<T>[];

    // Cache schemas for discovered tools if requested
    if (cacheSchemas && this.schemaManager) {
      for (const tool of mcpTools) {
        try {
          await this.schemaManager.cacheSchema(tool.name, tool.inputSchema);
        } catch (error) {
          console.warn(`Failed to cache schema for tool ${tool.name}:`, error);
          // Continue with other tools even if one fails to cache
        }
      }
    }

    return mcpTools;
  }

  /**
   * Call a specific tool with arguments
   */
  async callTool<TParams = unknown>(
    name: string, 
    args: TParams,
    options?: {
      /** Validate parameters before call */
      validate?: boolean;
      /** Request timeout override */
      timeout?: number;
    }
  ): Promise<McpToolResult> {
    // Validate parameters if requested and schema is cached
    if (options?.validate !== false && this.schemaManager) {
      try {
        const validationResult = await this.schemaManager.validateToolParams(name, args);
        if (!validationResult.success) {
          throw new McpClientError(
            `Parameter validation failed for tool ${name}: ${validationResult.errors?.join(', ')}`,
            McpErrorCode.InvalidParams,
            this.config?.serverName,
            name
          );
        }
      } catch (error) {
        // If schema not cached, just warn and continue
        if (error instanceof McpClientError && error.message.includes('No cached schema')) {
          console.warn(`No cached schema for tool ${name}, skipping validation`);
        } else {
          throw error;
        }
      }
    }

    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    }, options?.timeout);

    if (!response || typeof response !== 'object') {
      throw new McpClientError(
        'Invalid response from tools/call',
        McpErrorCode.InvalidParams,
        this.config?.serverName,
        name
      );
    }

    return response as McpToolResult;
  }

  /**
   * List available resources (future capability)
   */
  async listResources?(): Promise<McpResource[]> {
    const response = await this.sendRequest('resources/list');
    
    if (!response || typeof response !== 'object' || !('resources' in response)) {
      throw new McpClientError(
        'Invalid response from resources/list',
        McpErrorCode.InvalidParams,
        this.config?.serverName
      );
    }

    const resources = (response as { resources: unknown }).resources;
    if (!Array.isArray(resources)) {
      throw new McpClientError(
        'Expected resources array in response',
        McpErrorCode.InvalidParams,
        this.config?.serverName
      );
    }

    return resources as McpResource[];
  }

  /**
   * Get resource content (future capability)
   */
  async getResource?(uri: string): Promise<McpResourceContent> {
    const response = await this.sendRequest('resources/read', { uri });

    if (!response || typeof response !== 'object') {
      throw new McpClientError(
        'Invalid response from resources/read',
        McpErrorCode.InvalidParams,
        this.config?.serverName
      );
    }

    return response as McpResourceContent;
  }

  /**
   * Register error handler
   */
  onError(handler: (error: McpClientError) => void): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Register disconnect handler
   */
  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }

  /**
   * Register tool list change handler (future capability)
   */
  onToolsChanged?(handler: () => void): void {
    this.toolsChangedHandlers.push(handler);
  }

  /**
   * Get schema manager for tool validation
   */
  getSchemaManager(): IToolSchemaManager {
    return this.schemaManager;
  }

  /**
   * Perform MCP protocol handshake
   */
  private async performHandshake(): Promise<void> {
    try {
      const initResponse = await this.sendRequest('initialize', {
        protocolVersion: MCP_VERSION,
        capabilities: this.config!.capabilities || {},
        clientInfo: {
          name: 'miniagent-mcp-client',
          version: '1.0.0',
        },
      });

      if (!initResponse || typeof initResponse !== 'object') {
        throw new Error('Invalid initialize response');
      }

      const response = initResponse as {
        protocolVersion: string;
        capabilities: McpServerCapabilities;
        serverInfo: { name: string; version: string };
      };

      this.serverInfo = {
        name: response.serverInfo.name,
        version: response.serverInfo.version,
        capabilities: response.capabilities,
      };

      // Send initialized notification
      await this.sendNotification('notifications/initialized');
    } catch (error) {
      throw new McpClientError(
        `Handshake failed: ${error}`,
        McpErrorCode.ConnectionError,
        this.config?.serverName,
        undefined,
        error
      );
    }
  }

  /**
   * Send a JSON-RPC request to the server
   */
  private async sendRequest(method: string, params?: unknown, timeoutOverride?: number): Promise<unknown> {
    if (!this.transport || !this.isConnected()) {
      throw new McpClientError(
        'Client not connected',
        McpErrorCode.ConnectionError,
        this.config?.serverName
      );
    }

    const id = this.nextRequestId++;
    const request: McpRequest = {
      jsonrpc: '2.0',
      id,
      method,
    };

    if (params !== undefined) {
      request.params = params;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new McpClientError(
          'Request timeout',
          McpErrorCode.TimeoutError,
          this.config?.serverName
        ));
      }, timeoutOverride || this.config?.requestTimeout || 30000);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout,
      });

      this.transport!.send(request).catch((error) => {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(new McpClientError(
          `Failed to send request: ${error}`,
          McpErrorCode.ConnectionError,
          this.config?.serverName,
          undefined,
          error
        ));
      });
    });
  }

  /**
   * Send a JSON-RPC notification to the server
   */
  private async sendNotification(method: string, params?: unknown): Promise<void> {
    if (!this.transport || !this.isConnected()) {
      throw new McpClientError(
        'Client not connected',
        McpErrorCode.ConnectionError,
        this.config?.serverName
      );
    }

    const notification: McpNotification = {
      jsonrpc: '2.0',
      method,
    };

    if (params !== undefined) {
      notification.params = params;
    }

    await this.transport.send(notification);
  }

  /**
   * Handle incoming messages from transport
   */
  private handleMessage(message: McpResponse | McpNotification): void {
    if ('id' in message) {
      // Response message
      this.handleResponse(message as McpResponse);
    } else {
      // Notification message
      this.handleNotification(message as McpNotification);
    }
  }

  /**
   * Handle JSON-RPC response messages
   */
  private handleResponse(response: McpResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      // Unexpected response - ignore
      return;
    }

    this.pendingRequests.delete(response.id);
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    if (response.error) {
      const error = new McpClientError(
        response.error.message,
        response.error.code,
        this.config?.serverName
      );
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle JSON-RPC notification messages
   */
  private handleNotification(notification: McpNotification): void {
    switch (notification.method) {
      case 'notifications/tools/list_changed':
        // Clear cached schemas when tools change
        if (this.schemaManager) {
          this.schemaManager.clearCache()
            .then(() => console.log('Cleared schema cache due to tool list change'))
            .catch(error => console.warn('Failed to clear schema cache:', error));
        }
        
        this.toolsChangedHandlers.forEach(handler => {
          try {
            handler();
          } catch (error) {
            console.error('Error in tools changed handler:', error);
          }
        });
        break;
      
      default:
        // Unknown notification - ignore
        break;
    }
  }

  /**
   * Handle transport errors
   */
  private handleTransportError(error: Error): void {
    const mcpError = new McpClientError(
      `Transport error: ${error.message}`,
      McpErrorCode.ConnectionError,
      this.config?.serverName,
      undefined,
      error
    );

    this.errorHandlers.forEach(handler => {
      try {
        handler(mcpError);
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
      }
    });
  }

  /**
   * Handle transport disconnection
   */
  private handleTransportDisconnect(): void {
    this.connected = false;
    this.clearPendingRequests();

    this.disconnectHandlers.forEach(handler => {
      try {
        handler();
      } catch (error) {
        console.error('Error in disconnect handler:', error);
      }
    });
  }

  /**
   * Clear all pending requests with connection error
   */
  private clearPendingRequests(): void {
    const error = new McpClientError(
      'Connection lost',
      McpErrorCode.ConnectionError,
      this.config?.serverName
    );

    for (const [, pending] of this.pendingRequests) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(error);
    }

    this.pendingRequests.clear();
  }

  /**
   * Close client and cleanup resources
   */
  async close(): Promise<void> {
    await this.disconnect();
  }
}