/**
 * @fileoverview MCP Server Manager Implementation
 * 
 * This file implements the IMCPServerManager interface, providing centralized
 * management of multiple MCP servers, tool aggregation, and lifecycle management.
 */

import {
  IMCPServerManager,
  IMCPServer,
  MCPConfig,
  MCPServerConfig,
  MCPTool,
  MCPToolResponse,
  MCPError,
  MCPErrorType,
  MCPServerStatus,
  ConfigValidationResult,
  isMCPServerConfig,
} from './interfaces.js';
import { MCPServer } from './mcpServer.js';
import { MCPToolAdapter } from './mcpToolAdapter.js';
import { ILogger, createLogger, LogLevel } from '../logger.js';

/**
 * Implementation of IMCPServerManager interface
 * 
 * This class manages multiple MCP servers, handles their lifecycle,
 * aggregates tools from all servers, and provides a unified interface
 * for tool execution across all managed servers.
 */
export class MCPServerManager implements IMCPServerManager {
  /** Map of server name to server instance */
  private servers: Map<string, IMCPServer> = new Map();
  
  /** Manager configuration */
  private config: MCPConfig | null = null;
  
  /** Logger instance */
  private logger: ILogger;
  
  /** Whether manager is initialized */
  private initialized = false;
  
  /** Auto-restart enabled servers */
  private autoRestartServers = new Set<string>();
  
  /** Server restart timers */
  private restartTimers = new Map<string, NodeJS.Timeout>();

  constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logger = createLogger('MCPServerManager', {
      level: logLevel,
    });
    
    this.logger.debug('MCP Server Manager created', 'MCPServerManager.constructor()');
  }

  /**
   * Initialize the manager with configuration
   */
  async initialize(config: MCPConfig): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Manager already initialized', 'MCPServerManager.initialize()');
      return;
    }

    this.logger.info('Initializing MCP Server Manager', 'MCPServerManager.initialize()');

    // Validate configuration
    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      throw new MCPError(
        MCPErrorType.ConfigurationError,
        `Invalid configuration: ${validation.errors.join(', ')}`
      );
    }

    // Log warnings if any
    validation.warnings.forEach(warning => {
      this.logger.warn(warning, 'MCPServerManager.initialize()');
    });

    this.config = config;

    // Create and initialize servers
    const serverPromises = config.servers
      .filter(serverConfig => !serverConfig.disabled)
      .map(async (serverConfig) => {
        try {
          await this.createServer(serverConfig);
          this.logger.info(`Server created: ${serverConfig.name}`, 'MCPServerManager.initialize()');
        } catch (error) {
          this.logger.error(
            `Failed to create server ${serverConfig.name}: ${error instanceof Error ? error.message : String(error)}`,
            'MCPServerManager.initialize()'
          );
          // Continue with other servers
        }
      });

    await Promise.all(serverPromises);

    this.initialized = true;
    this.logger.info(`Manager initialized with ${this.servers.size} servers`, 'MCPServerManager.initialize()');
  }

  /**
   * Start a specific server
   */
  async startServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new MCPError(
        MCPErrorType.ConfigurationError,
        `Server not found: ${serverName}`,
        serverName
      );
    }

    this.logger.info(`Starting server: ${serverName}`, 'MCPServerManager.startServer()');

    try {
      await server.start();
      
      if (this.config?.autoRestart) {
        this.autoRestartServers.add(serverName);
        this.setupAutoRestart(serverName);
      }
      
      this.logger.info(`Server started: ${serverName}`, 'MCPServerManager.startServer()');
    } catch (error) {
      this.logger.error(
        `Failed to start server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
        'MCPServerManager.startServer()'
      );
      throw error;
    }
  }

  /**
   * Stop a specific server
   */
  async stopServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new MCPError(
        MCPErrorType.ConfigurationError,
        `Server not found: ${serverName}`,
        serverName
      );
    }

    this.logger.info(`Stopping server: ${serverName}`, 'MCPServerManager.stopServer()');

    try {
      // Remove from auto-restart
      this.autoRestartServers.delete(serverName);
      const timer = this.restartTimers.get(serverName);
      if (timer) {
        clearTimeout(timer);
        this.restartTimers.delete(serverName);
      }

      await server.stop();
      this.logger.info(`Server stopped: ${serverName}`, 'MCPServerManager.stopServer()');
    } catch (error) {
      this.logger.error(
        `Failed to stop server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
        'MCPServerManager.stopServer()'
      );
      throw error;
    }
  }

  /**
   * Restart a server
   */
  async restartServer(serverName: string): Promise<void> {
    this.logger.info(`Restarting server: ${serverName}`, 'MCPServerManager.restartServer()');

    try {
      await this.stopServer(serverName);
      // Brief delay before restart
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.startServer(serverName);
      this.logger.info(`Server restarted: ${serverName}`, 'MCPServerManager.restartServer()');
    } catch (error) {
      this.logger.error(
        `Failed to restart server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
        'MCPServerManager.restartServer()'
      );
      throw error;
    }
  }

  /**
   * Get all servers
   */
  getServers(): Map<string, IMCPServer> {
    return new Map(this.servers);
  }

  /**
   * Get a specific server
   */
  getServer(serverName: string): IMCPServer | undefined {
    return this.servers.get(serverName);
  }

  /**
   * Get all available tools from all servers
   */
  async getAllTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];

    const toolPromises = Array.from(this.servers.entries()).map(async ([serverName, server]) => {
      try {
        if (server.status === MCPServerStatus.Running) {
          const tools = await this.getServerTools(serverName);
          allTools.push(...tools);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to get tools from server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
          'MCPServerManager.getAllTools()'
        );
      }
    });

    await Promise.all(toolPromises);

    this.logger.debug(`Retrieved ${allTools.length} tools from all servers`, 'MCPServerManager.getAllTools()');
    return allTools;
  }

  /**
   * Get tools from a specific server
   */
  async getServerTools(serverName: string): Promise<MCPTool[]> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new MCPError(
        MCPErrorType.ConfigurationError,
        `Server not found: ${serverName}`,
        serverName
      );
    }

    if (server.status !== MCPServerStatus.Running) {
      this.logger.warn(`Server ${serverName} is not running`, 'MCPServerManager.getServerTools()');
      return [];
    }

    try {
      const mcpTools = await server.getTools();
      
      const tools: MCPTool[] = mcpTools.map(mcpTool => 
        new MCPToolAdapter(this, serverName, mcpTool)
      );

      this.logger.debug(`Retrieved ${tools.length} tools from server ${serverName}`, 'MCPServerManager.getServerTools()');
      return tools;
    } catch (error) {
      this.logger.error(
        `Failed to get tools from server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
        'MCPServerManager.getServerTools()'
      );
      throw error;
    }
  }

  /**
   * Execute a tool on a specific server
   */
  async executeServerTool(
    serverName: string,
    toolName: string,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<MCPToolResponse> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new MCPError(
        MCPErrorType.ConfigurationError,
        `Server not found: ${serverName}`,
        serverName,
        toolName
      );
    }

    if (server.status !== MCPServerStatus.Running) {
      throw new MCPError(
        MCPErrorType.ServerConnectionFailed,
        `Server ${serverName} is not running`,
        serverName,
        toolName
      );
    }

    this.logger.debug(`Executing tool ${toolName} on server ${serverName}`, 'MCPServerManager.executeServerTool()');

    try {
      const response = await server.executeTool({
        name: toolName,
        arguments: params,
      }, signal);

      this.logger.debug(`Tool execution completed: ${toolName}`, 'MCPServerManager.executeServerTool()');
      return response;
    } catch (error) {
      this.logger.error(
        `Tool execution failed: ${toolName} on ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
        'MCPServerManager.executeServerTool()'
      );
      throw error;
    }
  }

  /**
   * Shutdown all servers
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down all servers', 'MCPServerManager.shutdown()');

    // Clear all restart timers
    this.restartTimers.forEach(timer => clearTimeout(timer));
    this.restartTimers.clear();
    this.autoRestartServers.clear();

    // Stop all servers
    const shutdownPromises = Array.from(this.servers.entries()).map(async ([serverName, server]) => {
      try {
        await server.stop();
        this.logger.debug(`Server stopped: ${serverName}`, 'MCPServerManager.shutdown()');
      } catch (error) {
        this.logger.error(
          `Error stopping server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
          'MCPServerManager.shutdown()'
        );
      }
    });

    await Promise.all(shutdownPromises);

    this.servers.clear();
    this.initialized = false;
    this.logger.info('All servers shut down', 'MCPServerManager.shutdown()');
  }

  /**
   * Get manager status
   */
  getStatus(): {
    totalServers: number;
    runningServers: number;
    failedServers: number;
    totalTools: number;
  } {
    const servers = Array.from(this.servers.values());
    const runningServers = servers.filter(s => s.status === MCPServerStatus.Running).length;
    const failedServers = servers.filter(s => s.status === MCPServerStatus.Failed).length;
    
    // Count total tools from all running servers
    let totalTools = 0;
    servers.forEach(server => {
      if (server.status === MCPServerStatus.Running) {
        totalTools += server.getInfo().tools.length;
      }
    });

    return {
      totalServers: this.servers.size,
      runningServers,
      failedServers,
      totalTools,
    };
  }

  /**
   * Create a server instance
   */
  private async createServer(serverConfig: MCPServerConfig): Promise<void> {
    if (!this.config) {
      throw new MCPError(
        MCPErrorType.ConfigurationError,
        'Manager not initialized'
      );
    }

    const server = new MCPServer(
      serverConfig,
      this.config.timeout,
      this.config.retryAttempts,
      this.config.logLevel
    );

    this.servers.set(serverConfig.name, server);
  }

  /**
   * Set up auto-restart for a server
   */
  private setupAutoRestart(serverName: string): void {
    const server = this.servers.get(serverName);
    if (!server) return;

    // Monitor server status and restart if it fails
    const checkServer = async () => {
      if (!this.autoRestartServers.has(serverName)) {
        return; // Auto-restart disabled for this server
      }

      const serverInfo = server.getInfo();
      if (serverInfo.status === MCPServerStatus.Failed) {
        this.logger.warn(`Server ${serverName} failed, attempting auto-restart`, 'MCPServerManager.setupAutoRestart()');
        
        try {
          await this.restartServer(serverName);
        } catch (error) {
          this.logger.error(
            `Auto-restart failed for server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
            'MCPServerManager.setupAutoRestart()'
          );
        }
      }

      // Schedule next check
      if (this.autoRestartServers.has(serverName)) {
        const timer = setTimeout(checkServer, 10000); // Check every 10 seconds
        this.restartTimers.set(serverName, timer);
      }
    };

    // Start monitoring
    const timer = setTimeout(checkServer, 10000);
    this.restartTimers.set(serverName, timer);
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: MCPConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check basic structure
    if (!config.servers || !Array.isArray(config.servers)) {
      errors.push('servers must be an array');
      return { isValid: false, errors, warnings };
    }

    if (config.servers.length === 0) {
      warnings.push('No servers configured');
    }

    // Validate each server config
    const serverNames = new Set<string>();
    config.servers.forEach((serverConfig, index) => {
      if (!isMCPServerConfig(serverConfig)) {
        errors.push(`Server at index ${index} is invalid`);
        return;
      }

      // Check for duplicate names
      if (serverNames.has(serverConfig.name)) {
        errors.push(`Duplicate server name: ${serverConfig.name}`);
      }
      serverNames.add(serverConfig.name);

      // Validate name
      if (!serverConfig.name.trim()) {
        errors.push(`Server at index ${index} has empty name`);
      }

      // Validate command
      if (!serverConfig.command.trim()) {
        errors.push(`Server ${serverConfig.name} has empty command`);
      }

      // Check timeout values
      if (serverConfig.timeout !== undefined && serverConfig.timeout <= 0) {
        errors.push(`Server ${serverConfig.name} has invalid timeout`);
      }

      // Check retry attempts
      if (serverConfig.retryAttempts !== undefined && serverConfig.retryAttempts < 0) {
        errors.push(`Server ${serverConfig.name} has invalid retry attempts`);
      }
    });

    // Validate global settings
    if (config.timeout !== undefined && config.timeout <= 0) {
      errors.push('Global timeout must be positive');
    }

    if (config.retryAttempts !== undefined && config.retryAttempts < 0) {
      errors.push('Global retry attempts must be non-negative');
    }

    if (config.maxConcurrentTools !== undefined && config.maxConcurrentTools <= 0) {
      errors.push('Max concurrent tools must be positive');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}