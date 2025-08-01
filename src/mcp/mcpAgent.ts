/**
 * @fileoverview MCP Agent Implementation
 * 
 * This file extends BaseAgent to provide MCP (Model Context Protocol) integration,
 * allowing the agent to use tools from MCP servers alongside regular tools.
 */

import { BaseAgent } from '../baseAgent.js';
import {
  IAgentStatus,
  ITool,
  AllConfig,
} from '../interfaces.js';
import {
  MCPConfig,
  IMCPServerManager,
  MCPTool,
} from './interfaces.js';
import { MCPServerManager } from './mcpServerManager.js';
import { ILogger, createLogger, LogLevel } from '../logger.js';

/**
 * Extended configuration for MCP-enabled agents
 */
export interface MCPAgentConfig extends AllConfig {
  /** MCP-specific configuration */
  mcpConfig: MCPConfig;
}

/**
 * MCP-enabled agent that extends BaseAgent with MCP server management
 * 
 * This class provides seamless integration between MCP servers and the
 * MiniAgent framework, allowing agents to use tools from multiple MCP
 * servers alongside regular tools.
 */
export class MCPAgent extends BaseAgent {
  /** MCP server manager */
  private mcpManager: IMCPServerManager;
  
  /** MCP-specific logger */
  private mcpLogger: ILogger;
  
  /** MCP configuration */
  private mcpConfig: MCPConfig;
  
  /** Whether MCP tools are loaded */
  private mcpToolsLoaded = false;

  constructor(
    tools: ITool[],
    config: MCPAgentConfig
  ) {
    super(config.agentConfig, config.chatConfig as any, config.toolSchedulerConfig as any);
    
    this.mcpConfig = config.mcpConfig;
    this.mcpLogger = createLogger('MCPAgent', {
      level: this.mcpConfig.logLevel || LogLevel.INFO,
    });
    
    // Create MCP server manager
    this.mcpManager = new MCPServerManager(this.mcpConfig.logLevel);
    
    // Register initial tools
    tools.forEach(tool => this.registerTool(tool));
    
    this.mcpLogger.info('MCP Agent created', 'MCPAgent.constructor()');
  }

  /**
   * Initialize MCP integration
   * This should be called after creating the agent to set up MCP servers
   */
  async initialize(): Promise<void> {
    this.mcpLogger.info('Initializing MCP integration', 'MCPAgent.initialize()');
    
    try {
      // Initialize MCP server manager
      await this.mcpManager.initialize(this.mcpConfig);
      
      // Start enabled servers
      await this.startEnabledServers();
      
      // Load MCP tools
      await this.loadMCPTools();
      
      this.mcpLogger.info('MCP integration initialized successfully', 'MCPAgent.initialize()');
    } catch (error) {
      this.mcpLogger.error(
        `Failed to initialize MCP integration: ${error instanceof Error ? error.message : String(error)}`,
        'MCPAgent.initialize()'
      );
      throw error;
    }
  }

  /**
   * Load MCP tools from all running servers
   */
  async loadMCPTools(): Promise<void> {
    this.mcpLogger.info('Loading MCP tools', 'MCPAgent.loadMCPTools()');
    
    try {
      const mcpTools = await this.mcpManager.getAllTools();
      
      // Register MCP tools with the tool scheduler
      mcpTools.forEach(tool => {
        try {
          this.registerTool(tool);
          this.mcpLogger.debug(`Registered MCP tool: ${tool.name}`, 'MCPAgent.loadMCPTools()');
        } catch (error) {
          this.mcpLogger.warn(
            `Failed to register MCP tool ${tool.name}: ${error instanceof Error ? error.message : String(error)}`,
            'MCPAgent.loadMCPTools()'
          );
        }
      });
      
      this.mcpToolsLoaded = true;
      this.mcpLogger.info(`Loaded ${mcpTools.length} MCP tools`, 'MCPAgent.loadMCPTools()');
    } catch (error) {
      this.mcpLogger.error(
        `Failed to load MCP tools: ${error instanceof Error ? error.message : String(error)}`,
        'MCPAgent.loadMCPTools()'
      );
      throw error;
    }
  }

  /**
   * Refresh MCP tools (reload from servers)
   */
  async refreshMCPTools(): Promise<void> {
    this.mcpLogger.info('Refreshing MCP tools', 'MCPAgent.refreshMCPTools()');
    
    try {
      // Remove existing MCP tools
      const currentTools = this.getToolList();
      const mcpToolsToRemove = currentTools.filter(tool => this.isMCPTool(tool));
      
      mcpToolsToRemove.forEach(tool => {
        this.removeTool(tool.name);
        this.mcpLogger.debug(`Removed MCP tool: ${tool.name}`, 'MCPAgent.refreshMCPTools()');
      });
      
      // Reload MCP tools
      await this.loadMCPTools();
      
      this.mcpLogger.info('MCP tools refreshed successfully', 'MCPAgent.refreshMCPTools()');
    } catch (error) {
      this.mcpLogger.error(
        `Failed to refresh MCP tools: ${error instanceof Error ? error.message : String(error)}`,
        'MCPAgent.refreshMCPTools()'
      );
      throw error;
    }
  }

  /**
   * Start a specific MCP server
   */
  async startMCPServer(serverName: string): Promise<void> {
    this.mcpLogger.info(`Starting MCP server: ${serverName}`, 'MCPAgent.startMCPServer()');
    
    try {
      await this.mcpManager.startServer(serverName);
      
      // Load tools from the newly started server
      const serverTools = await this.mcpManager.getServerTools(serverName);
      serverTools.forEach(tool => {
        this.registerTool(tool);
        this.mcpLogger.debug(`Registered tool from server ${serverName}: ${tool.name}`, 'MCPAgent.startMCPServer()');
      });
      
      this.mcpLogger.info(`Started MCP server and loaded ${serverTools.length} tools: ${serverName}`, 'MCPAgent.startMCPServer()');
    } catch (error) {
      this.mcpLogger.error(
        `Failed to start MCP server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
        'MCPAgent.startMCPServer()'
      );
      throw error;
    }
  }

  /**
   * Stop a specific MCP server
   */
  async stopMCPServer(serverName: string): Promise<void> {
    this.mcpLogger.info(`Stopping MCP server: ${serverName}`, 'MCPAgent.stopMCPServer()');
    
    try {
      // Remove tools from this server
      const currentTools = this.getToolList();
      const serverTools = currentTools.filter(tool => 
        this.isMCPTool(tool) && (tool as MCPTool).serverName === serverName
      );
      
      serverTools.forEach(tool => {
        this.removeTool(tool.name);
        this.mcpLogger.debug(`Removed tool from server ${serverName}: ${tool.name}`, 'MCPAgent.stopMCPServer()');
      });
      
      // Stop the server
      await this.mcpManager.stopServer(serverName);
      
      this.mcpLogger.info(`Stopped MCP server and removed ${serverTools.length} tools: ${serverName}`, 'MCPAgent.stopMCPServer()');
    } catch (error) {
      this.mcpLogger.error(
        `Failed to stop MCP server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
        'MCPAgent.stopMCPServer()'
      );
      throw error;
    }
  }

  /**
   * Restart a specific MCP server
   */
  async restartMCPServer(serverName: string): Promise<void> {
    this.mcpLogger.info(`Restarting MCP server: ${serverName}`, 'MCPAgent.restartMCPServer()');
    
    try {
      await this.stopMCPServer(serverName);
      await this.startMCPServer(serverName);
      this.mcpLogger.info(`Restarted MCP server: ${serverName}`, 'MCPAgent.restartMCPServer()');
    } catch (error) {
      this.mcpLogger.error(
        `Failed to restart MCP server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
        'MCPAgent.restartMCPServer()'
      );
      throw error;
    }
  }

  /**
   * Get MCP server manager
   */
  getMCPManager(): IMCPServerManager {
    return this.mcpManager;
  }

  /**
   * Get MCP-specific status information
   */
  getMCPStatus(): {
    mcpEnabled: boolean;
    toolsLoaded: boolean;
    serverStatus: ReturnType<IMCPServerManager['getStatus']>;
    mcpTools: MCPTool[];
  } {
    const mcpTools = this.getToolList().filter(tool => this.isMCPTool(tool)) as MCPTool[];
    
    return {
      mcpEnabled: true,
      toolsLoaded: this.mcpToolsLoaded,
      serverStatus: this.mcpManager.getStatus(),
      mcpTools,
    };
  }

  /**
   * Override getStatus to include MCP information
   */
  override getStatus(): IAgentStatus & { mcpStatus?: ReturnType<MCPAgent['getMCPStatus']> } {
    const baseStatus = super.getStatus();
    const mcpStatus = this.getMCPStatus();
    
    return {
      ...baseStatus,
      mcpStatus,
    };
  }

  /**
   * Shutdown agent and clean up MCP resources
   */
  async shutdown(): Promise<void> {
    this.mcpLogger.info('Shutting down MCP Agent', 'MCPAgent.shutdown()');
    
    try {
      await this.mcpManager.shutdown();
      this.mcpLogger.info('MCP Agent shut down successfully', 'MCPAgent.shutdown()');
    } catch (error) {
      this.mcpLogger.error(
        `Error during MCP Agent shutdown: ${error instanceof Error ? error.message : String(error)}`,
        'MCPAgent.shutdown()'
      );
      throw error;
    }
  }

  /**
   * Start all enabled servers from configuration
   */
  private async startEnabledServers(): Promise<void> {
    const enabledServers = this.mcpConfig.servers.filter(server => !server.disabled);
    
    this.mcpLogger.info(`Starting ${enabledServers.length} enabled servers`, 'MCPAgent.startEnabledServers()');
    
    const startPromises = enabledServers.map(async (serverConfig) => {
      try {
        await this.mcpManager.startServer(serverConfig.name);
        this.mcpLogger.info(`Started server: ${serverConfig.name}`, 'MCPAgent.startEnabledServers()');
      } catch (error) {
        this.mcpLogger.error(
          `Failed to start server ${serverConfig.name}: ${error instanceof Error ? error.message : String(error)}`,
          'MCPAgent.startEnabledServers()'
        );
        // Continue with other servers
      }
    });

    await Promise.all(startPromises);
  }

  /**
   * Check if a tool is an MCP tool
   */
  private isMCPTool(tool: ITool): tool is MCPTool {
    return 'serverName' in tool && 'mcpToolName' in tool && 'mcpDefinition' in tool;
  }
}

/**
 * Factory function to create MCP-enabled agents
 */
export async function createMCPAgent(
  tools: ITool[],
  config: MCPAgentConfig
): Promise<MCPAgent> {
  const agent = new MCPAgent(tools, config);
  await agent.initialize();
  return agent;
}