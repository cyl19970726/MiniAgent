/**
 * @fileoverview MCP Manager for dynamic server management
 * 
 * Provides a clean way to add and remove MCP servers at runtime
 * without modifying agent core logic.
 */

import { SimpleMcpClient, McpConfig } from './client.js';
import { McpToolAdapter, createMcpTools } from './tool-adapter.js';

/**
 * Configuration for adding an MCP server
 */
export interface McpServerConfig extends McpConfig {
  /** Unique name for the server */
  name: string;
  /** Connect immediately after adding (default: true) */
  autoConnect?: boolean;
}

/**
 * McpManager - Manages multiple MCP server connections
 * 
 * This class provides a clean way to dynamically add and remove MCP servers
 * and their associated tools. It can be used with any agent implementation.
 * 
 * @example
 * ```typescript
 * const manager = new McpManager();
 * const tools = await manager.addServer({
 *   name: 'my-server',
 *   transport: 'stdio',
 *   command: 'mcp-server'
 * });
 * agent.addTools(tools);
 * ```
 */
export class McpManager {
  private servers: Map<string, SimpleMcpClient> = new Map();
  private serverTools: Map<string, McpToolAdapter[]> = new Map();

  /**
   * Add an MCP server and discover its tools
   * 
   * @param config - Server configuration
   * @returns Array of tool adapters from the server
   * @throws Error if server name already exists or connection fails
   */
  async addServer(config: McpServerConfig): Promise<McpToolAdapter[]> {
    // Check for duplicate names
    if (this.servers.has(config.name)) {
      throw new Error(`MCP server '${config.name}' already exists`);
    }

    // Validate transport is specified
    if (!config.transport) {
      throw new Error('Transport type is required');
    }

    // Create McpConfig from McpServerConfig (exclude name and autoConnect)
    const { name, autoConnect, ...mcpConfig } = config;
    
    // Set description if not provided
    if (!mcpConfig.description) {
      mcpConfig.description = `MCP Server: ${name}`;
    }

    const client = new SimpleMcpClient();
    
    try {
      // Connect if autoConnect is true (default)
      if (autoConnect !== false) {
        await client.connect(mcpConfig);
        
        // Discover and create tool adapters
        const tools = await createMcpTools(client);
        
        // Store references
        this.servers.set(name, client);
        this.serverTools.set(name, tools);
        
        return tools;
      } else {
        // Store client without connecting
        this.servers.set(name, client);
        this.serverTools.set(name, []);
        return [];
      }
    } catch (error) {
      // Clean up on failure
      if (client.connected) {
        await client.disconnect().catch(() => {}); // Ignore disconnect errors
      }
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to add MCP server '${name}': ${errorMsg}`);
    }
  }

  /**
   * Remove an MCP server and disconnect
   * 
   * @param name - Name of the server to remove
   * @throws Error if server not found
   */
  async removeServer(name: string): Promise<void> {
    const client = this.servers.get(name);
    if (!client) {
      throw new Error(`MCP server '${name}' not found`);
    }

    try {
      // Disconnect if connected
      if (client.connected) {
        await client.disconnect();
      }
    } catch (error) {
      // Log but don't throw - we still want to clean up
      console.warn(`Error disconnecting from MCP server '${name}':`, error);
    } finally {
      // Always clean up references
      this.servers.delete(name);
      this.serverTools.delete(name);
    }
  }

  /**
   * Connect to a previously added server
   * 
   * @param name - Name of the server
   * @param config - Optional McpConfig to use for connection
   * @returns Tools discovered from the server
   */
  async connectServer(name: string, config?: McpConfig): Promise<McpToolAdapter[]> {
    const client = this.servers.get(name);
    if (!client) {
      throw new Error(`MCP server '${name}' not found`);
    }

    if (client.connected) {
      return this.serverTools.get(name) || [];
    }

    if (!config) {
      throw new Error(`Connection config required for server '${name}'`);
    }

    await client.connect(config);
    const tools = await createMcpTools(client);
    this.serverTools.set(name, tools);
    
    return tools;
  }

  /**
   * Get all tools from all connected servers
   * 
   * @returns Combined array of all tool adapters
   */
  getAllTools(): McpToolAdapter[] {
    const allTools: McpToolAdapter[] = [];
    this.serverTools.forEach((tools) => {
      allTools.push(...tools);
    });
    return allTools;
  }

  /**
   * Get tools from a specific server
   * 
   * @param name - Name of the server
   * @returns Array of tool adapters from that server
   */
  getServerTools(name: string): McpToolAdapter[] {
    return this.serverTools.get(name) || [];
  }

  /**
   * List all registered server names
   * 
   * @returns Array of server names
   */
  listServers(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Get connection status for a server
   * 
   * @param name - Name of the server
   * @returns Connection status
   */
  isServerConnected(name: string): boolean {
    const client = this.servers.get(name);
    return client ? client.connected : false;
  }

  /**
   * Get information about all servers
   * 
   * @returns Array of server info objects
   */
  getServersInfo(): Array<{
    name: string;
    connected: boolean;
    toolCount: number;
  }> {
    return this.listServers().map(name => ({
      name,
      connected: this.isServerConnected(name),
      toolCount: this.getServerTools(name).length
    }));
  }

  /**
   * Disconnect all servers and clean up
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];
    
    this.servers.forEach((client, name) => {
      if (client.connected) {
        disconnectPromises.push(
          client.disconnect().catch(error => {
            console.warn(`Error disconnecting from MCP server '${name}':`, error);
          })
        );
      }
    });
    
    await Promise.all(disconnectPromises);
    
    // Clear all references
    this.servers.clear();
    this.serverTools.clear();
  }

  /**
   * Get the number of registered servers
   */
  get serverCount(): number {
    return this.servers.size;
  }

  /**
   * Get the total number of tools from all servers
   */
  get totalToolCount(): number {
    let count = 0;
    this.serverTools.forEach((tools) => {
      count += tools.length;
    });
    return count;
  }
}