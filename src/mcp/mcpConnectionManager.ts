/**
 * @fileoverview MCP Connection Manager - Enhanced with New Transport Patterns
 * 
 * This connection manager implements the refined MCP architecture with:
 * - Streamable HTTP transport support (replaces deprecated SSE)
 * - Schema caching mechanism for tool discovery
 * - Generic type support for flexible tool parameters
 * - Enhanced connection management with monitoring
 */

import { EventEmitter } from 'events';
import { 
  IMcpConnectionManager,
  McpServerConfig,
  McpServerStatus,
  McpServerStatusHandler,
  IMcpClient,
  McpTool,
  IToolSchemaManager,
  McpTransportConfig,
  McpStreamableHttpTransportConfig,
  isMcpStdioTransport,
  McpClientError
} from './interfaces.js';
import { McpClient } from './mcpClient.js';
import { McpToolAdapter, createMcpToolAdapters } from './mcpToolAdapter.js';
import { ITool } from '../interfaces.js';

/**
 * Enhanced MCP Connection Manager supporting new transport patterns
 */
export class McpConnectionManager extends EventEmitter implements IMcpConnectionManager {
  private readonly clients = new Map<string, IMcpClient>();
  private readonly serverConfigs = new Map<string, McpServerConfig>();
  private readonly serverStatuses = new Map<string, McpServerStatus>();
  private readonly statusHandlers: McpServerStatusHandler[] = [];
  private readonly healthCheckInterval = 30000; // 30 seconds
  private healthCheckTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(
    private readonly globalConfig?: {
      /** Global connection timeout */
      connectionTimeout?: number;
      /** Global request timeout */
      requestTimeout?: number;
      /** Maximum concurrent connections */
      maxConnections?: number;
      /** Health check configuration */
      healthCheck?: {
        enabled: boolean;
        intervalMs: number;
        timeoutMs: number;
      };
    }
  ) {
    super();
    this.startHealthMonitoring();
  }

  /**
   * Add a new MCP server with enhanced transport support
   */
  async addServer(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.name)) {
      throw new Error(`Server ${config.name} already exists`);
    }

    // Validate transport configuration
    this.validateTransportConfig(config.transport);

    // Check connection limits
    if (this.globalConfig?.maxConnections && 
        this.clients.size >= this.globalConfig.maxConnections) {
      throw new Error(`Maximum connection limit (${this.globalConfig.maxConnections}) reached`);
    }

    // Store configuration
    this.serverConfigs.set(config.name, config);

    // Initialize server status
    this.updateServerStatus(config.name, {
      name: config.name,
      status: 'disconnected',
      lastConnected: undefined,
      lastError: undefined,
      capabilities: undefined,
      toolCount: 0
    });

    // Create MCP client with enhanced configuration
    const client = new McpClient();
    await client.initialize({
      serverName: config.name,
      transport: config.transport,
      capabilities: config.capabilities,
      timeout: config.timeout || this.globalConfig?.connectionTimeout,
      requestTimeout: config.requestTimeout || this.globalConfig?.requestTimeout,
      maxRetries: config.retry?.maxAttempts || 3,
      retryDelay: config.retry?.delayMs || 1000
    });

    // Register client event handlers
    this.setupClientEventHandlers(client, config.name);

    // Store client
    this.clients.set(config.name, client);

    // Auto-connect if configured
    if (config.autoConnect) {
      try {
        await this.connectServer(config.name);
      } catch (error) {
        console.warn(`Failed to auto-connect to server ${config.name}:`, error);
      }
    }
  }

  /**
   * Remove an MCP server and cleanup its resources
   */
  async removeServer(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      try {
        await client.disconnect();
      } catch (error) {
        console.warn(`Error disconnecting from server ${serverName}:`, error);
      }
    }

    this.clients.delete(serverName);
    this.serverConfigs.delete(serverName);
    this.serverStatuses.delete(serverName);

    this.emit('serverRemoved', serverName);
  }

  /**
   * Get server status with enhanced information
   */
  getServerStatus(serverName: string): McpServerStatus | undefined {
    return this.serverStatuses.get(serverName);
  }

  /**
   * Get all server statuses
   */
  getAllServerStatuses(): Map<string, McpServerStatus> {
    return new Map(this.serverStatuses);
  }

  /**
   * Connect to a specific server with enhanced error handling
   */
  async connectServer(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Server ${serverName} not found`);
    }

    try {
      this.updateServerStatus(serverName, { status: 'connecting' });

      await client.connect();

      // Get server capabilities and tool count
      const serverInfo = await client.getServerInfo();
      const tools = await client.listTools(true); // Cache schemas during discovery

      this.updateServerStatus(serverName, {
        status: 'connected',
        lastConnected: new Date(),
        lastError: undefined,
        capabilities: serverInfo.capabilities,
        toolCount: tools.length
      });

      this.emit('serverConnected', serverName);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateServerStatus(serverName, {
        status: 'error',
        lastError: errorMessage
      });

      this.emit('serverConnectionFailed', serverName, error);
      throw error;
    }
  }

  /**
   * Disconnect from a specific server
   */
  async disconnectServer(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Server ${serverName} not found`);
    }

    try {
      await client.disconnect();
      this.updateServerStatus(serverName, {
        status: 'disconnected',
        lastError: undefined
      });

      this.emit('serverDisconnected', serverName);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateServerStatus(serverName, {
        status: 'error',
        lastError: errorMessage
      });
      throw error;
    }
  }

  /**
   * Discover and return all available tools with enhanced metadata
   */
  async discoverTools(): Promise<Array<{ serverName: string; tool: McpTool; adapter: McpToolAdapter }>> {
    const results: Array<{ serverName: string; tool: McpTool; adapter: McpToolAdapter }> = [];

    for (const [serverName, client] of this.clients) {
      try {
        if (!client.isConnected()) {
          continue;
        }

        // Get tools with schema caching
        const tools = await client.listTools(true);
        
        // Create adapters for each tool
        for (const tool of tools) {
          const adapter = await McpToolAdapter.create(client, tool, serverName, {
            cacheSchema: true
          });

          results.push({
            serverName,
            tool,
            adapter
          });
        }

        // Update tool count in status
        this.updateServerStatus(serverName, { toolCount: tools.length });

      } catch (error) {
        console.warn(`Failed to discover tools from server ${serverName}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.updateServerStatus(serverName, {
          status: 'error',
          lastError: `Tool discovery failed: ${errorMessage}`
        });
      }
    }

    return results;
  }

  /**
   * Create MiniAgent-compatible tools from discovered MCP tools
   */
  async discoverMiniAgentTools(): Promise<ITool[]> {
    const discovered = await this.discoverTools();
    return discovered.map(item => item.adapter);
  }

  /**
   * Refresh tools from a specific server
   */
  async refreshServer(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client || !client.isConnected()) {
      throw new Error(`Server ${serverName} is not connected`);
    }

    try {
      // Clear schema cache and re-discover tools
      const schemaManager = client.getSchemaManager();
      await schemaManager.clearCache();

      const tools = await client.listTools(true); // Re-cache schemas
      
      this.updateServerStatus(serverName, { 
        toolCount: tools.length,
        lastError: undefined 
      });

      this.emit('serverToolsRefreshed', serverName, tools.length);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateServerStatus(serverName, {
        status: 'error',
        lastError: `Refresh failed: ${errorMessage}`
      });
      throw error;
    }
  }

  /**
   * Perform health check on all servers
   */
  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [serverName, client] of this.clients) {
      try {
        if (client.isConnected()) {
          // Try a simple server info call to check health
          await client.getServerInfo();
          results.set(serverName, true);
        } else {
          results.set(serverName, false);
        }
      } catch (error) {
        results.set(serverName, false);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.updateServerStatus(serverName, {
          status: 'error',
          lastError: `Health check failed: ${errorMessage}`
        });
      }
    }

    return results;
  }

  /**
   * Get MCP client for a server
   */
  getClient(serverName: string): IMcpClient | undefined {
    return this.clients.get(serverName);
  }

  /**
   * Register server status change handler
   */
  onServerStatusChange(handler: McpServerStatusHandler): void {
    this.statusHandlers.push(handler);
  }

  /**
   * Cleanup all connections and resources
   */
  async cleanup(): Promise<void> {
    this.isShuttingDown = true;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Disconnect all clients
    const disconnectPromises = Array.from(this.clients.keys()).map(serverName => 
      this.disconnectServer(serverName).catch(error => 
        console.warn(`Error disconnecting from ${serverName}:`, error)
      )
    );

    await Promise.allSettled(disconnectPromises);

    // Clear all data structures
    this.clients.clear();
    this.serverConfigs.clear();
    this.serverStatuses.clear();
    this.statusHandlers.length = 0;

    this.removeAllListeners();
  }

  /**
   * Get connection manager statistics
   */
  getStatistics(): {
    totalServers: number;
    connectedServers: number;
    totalTools: number;
    errorServers: number;
    transportTypes: Record<string, number>;
  } {
    const stats = {
      totalServers: this.serverConfigs.size,
      connectedServers: 0,
      totalTools: 0,
      errorServers: 0,
      transportTypes: {} as Record<string, number>
    };

    for (const status of this.serverStatuses.values()) {
      if (status.status === 'connected') {
        stats.connectedServers++;
        stats.totalTools += status.toolCount || 0;
      } else if (status.status === 'error') {
        stats.errorServers++;
      }
    }

    for (const config of this.serverConfigs.values()) {
      const transportType = config.transport.type;
      stats.transportTypes[transportType] = (stats.transportTypes[transportType] || 0) + 1;
    }

    return stats;
  }

  // Private helper methods

  private validateTransportConfig(transport: McpTransportConfig): void {
    if (transport.type === 'streamable-http') {
      const httpConfig = transport as McpStreamableHttpTransportConfig;
      if (!httpConfig.url) {
        throw new Error('Streamable HTTP transport requires URL');
      }
      try {
        new URL(httpConfig.url);
      } catch {
        throw new Error('Invalid URL for Streamable HTTP transport');
      }
    } else if (transport.type === 'stdio') {
      if (!isMcpStdioTransport(transport) || !transport.command) {
        throw new Error('STDIO transport requires command');
      }
    }
  }

  private setupClientEventHandlers(client: IMcpClient, serverName: string): void {
    client.onError((error: McpClientError) => {
      this.updateServerStatus(serverName, {
        status: 'error',
        lastError: error.message
      });
      this.emit('serverError', serverName, error);
    });

    client.onDisconnect(() => {
      this.updateServerStatus(serverName, {
        status: 'disconnected'
      });
      this.emit('serverDisconnected', serverName);
    });

    if (client.onToolsChanged) {
      client.onToolsChanged(() => {
        this.emit('serverToolsChanged', serverName);
      });
    }
  }

  private updateServerStatus(serverName: string, updates: Partial<McpServerStatus>): void {
    const currentStatus = this.serverStatuses.get(serverName) || {
      name: serverName,
      status: 'disconnected',
      toolCount: 0
    };

    const newStatus = { ...currentStatus, ...updates };
    this.serverStatuses.set(serverName, newStatus);

    // Notify handlers
    for (const handler of this.statusHandlers) {
      try {
        handler(newStatus);
      } catch (error) {
        console.warn('Error in status handler:', error);
      }
    }

    this.emit('statusChanged', serverName, newStatus);
  }

  private startHealthMonitoring(): void {
    if (!this.globalConfig?.healthCheck?.enabled) {
      return;
    }

    const interval = this.globalConfig.healthCheck.intervalMs || this.healthCheckInterval;
    
    this.healthCheckTimer = setInterval(async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        await this.healthCheck();
      } catch (error) {
        console.warn('Health check error:', error);
      }
    }, interval);
  }
}