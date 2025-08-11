# MCP Integration Architecture for StandardAgent

## Overview

This document outlines the architectural design for integrating Model Context Protocol (MCP) support into MiniAgent's StandardAgent. The design focuses on clean, minimal integration that follows MiniAgent's core principles while providing powerful MCP functionality.

## Design Principles

1. **Backward Compatibility**: Existing StandardAgent usage continues to work unchanged
2. **Minimalism**: Add only essential interfaces and methods
3. **Clean Separation**: MCP logic remains isolated from core agent functionality
4. **Provider Agnostic**: MCP integration doesn't depend on specific chat providers
5. **Type Safety**: Full TypeScript support with proper type definitions

## 1. IAgentConfig MCP Extensions

### Current MCP Configuration in IAgentConfig

The existing `IAgentConfig` interface already includes MCP configuration:

```typescript
export interface IAgentConfig {
  // ... existing fields ...
  
  /** MCP (Model Context Protocol) configuration */
  mcp?: {
    /** Whether MCP integration is enabled */
    enabled: boolean;
    /** List of MCP servers to connect to */
    servers: Array<{
      name: string;
      transport: {
        type: 'stdio' | 'http';
        command?: string;
        args?: string[];
        url?: string;
        auth?: {
          type: 'bearer' | 'basic';
          token?: string;
          username?: string;
          password?: string;
        };
      };
      autoConnect?: boolean;
    }>;
    /** Whether to auto-discover and register tools on startup */
    autoDiscoverTools?: boolean;
    /** Global connection timeout in milliseconds */
    connectionTimeout?: number;
  };
}
```

### Enhancement: Flattened McpServerConfig Integration

To align with the existing MCP SDK structure, we need to support the new flattened configuration format:

```typescript
export interface IAgentConfig {
  // ... existing fields ...
  
  /** MCP (Model Context Protocol) configuration */
  mcp?: {
    /** Whether MCP integration is enabled */
    enabled: boolean;
    /** List of MCP servers to connect to */
    servers: McpServerConfig[];
    /** Whether to auto-discover and register tools on startup */
    autoDiscoverTools?: boolean;
    /** Global connection timeout in milliseconds */
    connectionTimeout?: number;
    /** Tool naming strategy for conflicts */
    toolNamingStrategy?: 'prefix' | 'suffix' | 'error';
    /** Prefix/suffix for tool names when conflicts occur */
    toolNamePrefix?: string;
    toolNameSuffix?: string;
  };
}
```

Where `McpServerConfig` comes directly from the MCP SDK:

```typescript
// From src/mcp-sdk/manager.ts
export interface McpServerConfig extends McpConfig {
  name: string;
  autoConnect?: boolean;
}
```

## 2. StandardAgent MCP Management API

### Core MCP Management Methods

Add these methods to the `IStandardAgent` interface:

```typescript
export interface IStandardAgent extends IAgent {
  // ... existing methods ...
  
  // MCP Server Management
  addMcpServer(config: McpServerConfig): Promise<ITool[]>;
  removeMcpServer(name: string): Promise<boolean>;
  listMcpServers(): string[];
  getMcpServerStatus(name: string): { connected: boolean; toolCount: number } | null;
  
  // MCP Tool Management
  getMcpTools(serverName?: string): ITool[];
  refreshMcpTools(serverName?: string): Promise<ITool[]>;
}
```

### Implementation Strategy

The StandardAgent implementation will use composition with McpManager:

```typescript
export class StandardAgent extends BaseAgent implements IStandardAgent {
  private mcpManager?: McpManager;
  private mcpEnabled: boolean = false;
  
  constructor(tools: ITool[], config: AllConfig & { chatProvider?: 'gemini' | 'openai' }) {
    // ... existing constructor logic ...
    
    // Initialize MCP if configured
    if (config.agentConfig.mcp?.enabled) {
      this.mcpEnabled = true;
      this.mcpManager = new McpManager();
      
      // Auto-connect servers if configured
      if (config.agentConfig.mcp.autoDiscoverTools) {
        this.initializeMcpServers(config.agentConfig.mcp.servers || []);
      }
    }
  }
  
  // MCP Management Methods
  async addMcpServer(config: McpServerConfig): Promise<ITool[]> {
    if (!this.mcpManager) {
      throw new Error('MCP is not enabled. Set agentConfig.mcp.enabled = true');
    }
    
    const mcpTools = await this.mcpManager.addServer(config);
    const tools = this.convertMcpToolsToITools(mcpTools, config.name);
    
    // Register tools with the agent
    tools.forEach(tool => this.registerTool(tool));
    
    return tools;
  }
  
  async removeMcpServer(name: string): Promise<boolean> {
    if (!this.mcpManager) return false;
    
    try {
      // Remove tools from agent first
      const mcpTools = this.mcpManager.getServerTools(name);
      mcpTools.forEach(mcpTool => {
        const toolName = this.generateToolName(mcpTool.name, name);
        this.removeTool(toolName);
      });
      
      // Remove server
      await this.mcpManager.removeServer(name);
      return true;
    } catch (error) {
      console.warn(`Failed to remove MCP server '${name}':`, error);
      return false;
    }
  }
  
  listMcpServers(): string[] {
    return this.mcpManager?.listServers() || [];
  }
  
  getMcpServerStatus(name: string): { connected: boolean; toolCount: number } | null {
    if (!this.mcpManager) return null;
    
    const serverInfo = this.mcpManager.getServersInfo().find(info => info.name === name);
    return serverInfo ? { connected: serverInfo.connected, toolCount: serverInfo.toolCount } : null;
  }
  
  getMcpTools(serverName?: string): ITool[] {
    if (!this.mcpManager) return [];
    
    const mcpTools = serverName 
      ? this.mcpManager.getServerTools(serverName)
      : this.mcpManager.getAllTools();
    
    return mcpTools
      .map(mcpTool => this.getTool(this.generateToolName(mcpTool.name, mcpTool.serverName)))
      .filter((tool): tool is ITool => tool !== undefined);
  }
  
  async refreshMcpTools(serverName?: string): Promise<ITool[]> {
    if (!this.mcpManager) return [];
    
    if (serverName) {
      // Refresh single server
      const mcpTools = await this.mcpManager.connectServer(serverName);
      return this.convertMcpToolsToITools(mcpTools, serverName);
    } else {
      // Refresh all servers
      const allTools: ITool[] = [];
      for (const name of this.mcpManager.listServers()) {
        try {
          const mcpTools = await this.mcpManager.connectServer(name);
          allTools.push(...this.convertMcpToolsToITools(mcpTools, name));
        } catch (error) {
          console.warn(`Failed to refresh MCP server '${name}':`, error);
        }
      }
      return allTools;
    }
  }
}
```

## 3. Tool Registration and Conflict Resolution

### Tool Naming Strategy

To prevent conflicts between MCP tools and native tools, or between tools from different MCP servers:

```typescript
class StandardAgent {
  private generateToolName(toolName: string, serverName: string): string {
    const config = this.config.agentConfig.mcp;
    const strategy = config?.toolNamingStrategy || 'prefix';
    
    switch (strategy) {
      case 'prefix':
        const prefix = config?.toolNamePrefix || serverName;
        return `${prefix}_${toolName}`;
      
      case 'suffix':
        const suffix = config?.toolNameSuffix || serverName;
        return `${toolName}_${suffix}`;
      
      case 'error':
        // Check for conflicts and throw error
        if (this.getTool(toolName)) {
          throw new Error(`Tool name conflict: '${toolName}' already exists`);
        }
        return toolName;
      
      default:
        return `${serverName}_${toolName}`;
    }
  }
  
  private convertMcpToolsToITools(mcpTools: McpToolAdapter[], serverName: string): ITool[] {
    return mcpTools.map(mcpTool => {
      // McpToolAdapter already implements ITool, but we need to handle naming
      const originalName = mcpTool.name;
      const toolName = this.generateToolName(originalName, serverName);
      
      // Create a wrapper that updates the name
      return {
        ...mcpTool,
        name: toolName,
        description: `[${serverName}] ${mcpTool.description}`,
        // Store original name for reference
        metadata: {
          ...mcpTool.metadata,
          originalName,
          serverName,
          isMcpTool: true
        }
      } as ITool;
    });
  }
}
```

### Tool Registry Management

```typescript
class StandardAgent {
  private mcpToolRegistry: Map<string, { serverName: string; originalName: string }> = new Map();
  
  registerTool(tool: ITool): void {
    // Track MCP tools in separate registry
    if (tool.metadata?.isMcpTool) {
      this.mcpToolRegistry.set(tool.name, {
        serverName: tool.metadata.serverName,
        originalName: tool.metadata.originalName
      });
    }
    
    // Register with base agent
    super.registerTool(tool);
  }
  
  removeTool(toolName: string): boolean {
    // Remove from MCP registry if present
    this.mcpToolRegistry.delete(toolName);
    
    // Remove from base agent
    return super.removeTool(toolName);
  }
  
  // Enhanced tool info for debugging/management
  getToolInfo(toolName: string): {
    tool: ITool;
    isMcpTool: boolean;
    serverName?: string;
    originalName?: string;
  } | null {
    const tool = this.getTool(toolName);
    if (!tool) return null;
    
    const mcpInfo = this.mcpToolRegistry.get(toolName);
    return {
      tool,
      isMcpTool: !!mcpInfo,
      serverName: mcpInfo?.serverName,
      originalName: mcpInfo?.originalName
    };
  }
}
```

## 4. Session Management Strategy

### Connection Scope Decision

**Recommendation: Global MCP Connections**

MCP connections should be global (per StandardAgent instance) rather than per-session because:

1. **Resource Efficiency**: Avoid duplicate connections for the same server
2. **Tool Consistency**: Same tools available across all sessions
3. **Connection Management**: Simpler lifecycle management
4. **MCP Server Design**: MCP servers are typically stateless tool providers

### Session-Aware Tool Access

```typescript
class StandardAgent {
  // Enhanced tool management with session context
  getToolsForSession(sessionId?: string): ITool[] {
    // For now, all tools (including MCP) are available to all sessions
    // This could be enhanced later for session-specific tool filtering
    return this.getToolList();
  }
  
  // Session-aware status includes MCP information
  getSessionStatus(sessionId?: string): IAgentStatus & { 
    sessionInfo?: AgentSession | undefined;
    mcpInfo?: {
      enabled: boolean;
      serverCount: number;
      toolCount: number;
      servers: Array<{
        name: string;
        connected: boolean;
        toolCount: number;
      }>;
    };
  } {
    const baseStatus = super.getSessionStatus(sessionId);
    
    if (this.mcpManager) {
      const mcpInfo = {
        enabled: this.mcpEnabled,
        serverCount: this.mcpManager.serverCount,
        toolCount: this.mcpManager.totalToolCount,
        servers: this.mcpManager.getServersInfo()
      };
      
      return { ...baseStatus, mcpInfo };
    }
    
    return baseStatus;
  }
}
```

### Disconnection Handling

```typescript
class StandardAgent {
  // Enhanced cleanup includes MCP disconnection
  async cleanup(): Promise<void> {
    if (this.mcpManager) {
      await this.mcpManager.disconnectAll();
    }
    // Other cleanup...
  }
  
  // Handle MCP server disconnections gracefully
  private async handleMcpDisconnection(serverName: string): Promise<void> {
    console.warn(`MCP server '${serverName}' disconnected`);
    
    // Remove tools from agent (but keep them in registry for reconnection)
    const mcpTools = this.mcpManager?.getServerTools(serverName) || [];
    mcpTools.forEach(mcpTool => {
      const toolName = this.generateToolName(mcpTool.name, serverName);
      this.removeTool(toolName);
    });
    
    // Emit event for monitoring
    this.emit('mcpServerDisconnected', { serverName, affectedTools: mcpTools.length });
  }
}
```

## 5. Migration Strategy

### Backward Compatibility

1. **Existing Code**: No changes needed for existing StandardAgent usage
2. **Optional MCP**: MCP features are only active when `mcp.enabled = true`
3. **Gradual Migration**: Users can add MCP functionality incrementally

### Migration Path

```typescript
// Before (existing code works unchanged)
const agent = new StandardAgent(tools, config);

// After (MCP can be added optionally)
const configWithMcp: AllConfig = {
  ...config,
  agentConfig: {
    ...config.agentConfig,
    mcp: {
      enabled: true,
      servers: [
        {
          name: 'my-server',
          transport: 'stdio',
          command: 'mcp-server',
          args: ['--config', 'config.json'],
          autoConnect: true
        }
      ],
      autoDiscoverTools: true,
      toolNamingStrategy: 'prefix',
      toolNamePrefix: 'mcp'
    }
  }
};

const agent = new StandardAgent(tools, configWithMcp);
```

### Interface Updates

Only extend existing interfaces, never modify them:

```typescript
// Add MCP methods to IStandardAgent (already shown above)
// Import McpServerConfig from MCP SDK
// Use composition pattern to avoid breaking changes
```

## 6. Error Handling and Resilience

### Connection Failure Handling

```typescript
class StandardAgent {
  private async initializeMcpServers(servers: McpServerConfig[]): Promise<void> {
    const results = await Promise.allSettled(
      servers.map(async (serverConfig) => {
        try {
          await this.addMcpServer(serverConfig);
          console.log(`✅ Connected to MCP server: ${serverConfig.name}`);
        } catch (error) {
          console.warn(`⚠️  Failed to connect to MCP server '${serverConfig.name}':`, error);
          // Continue with other servers
        }
      })
    );
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    if (failed > 0) {
      console.warn(`MCP initialization: ${successful} successful, ${failed} failed`);
    }
  }
}
```

### Tool Execution Error Handling

```typescript
// McpToolAdapter already handles errors properly
// StandardAgent inherits this error handling through composition
```

## 7. Future Extensions

### Potential Enhancements

1. **Session-Specific Tools**: Allow different MCP tools per session
2. **Dynamic Tool Loading**: Hot-reload tools when MCP servers update
3. **Tool Permissions**: Fine-grained access control for MCP tools
4. **Connection Pooling**: Optimize connections for high-throughput scenarios
5. **Tool Caching**: Cache tool results for performance

### API Evolution

The proposed API is designed to be extensible:

```typescript
// Future: Session-specific MCP servers
agent.addMcpServerToSession(sessionId, config);

// Future: Tool permissions
agent.setMcpToolPermissions(serverName, toolName, permissions);

// Future: Connection health monitoring
agent.onMcpServerHealthChange((serverName, health) => { ... });
```

## Summary

This architecture provides:

1. ✅ **Clean Integration**: MCP functionality is cleanly separated and optional
2. ✅ **Backward Compatibility**: Existing code continues to work unchanged  
3. ✅ **Type Safety**: Full TypeScript support with proper interfaces
4. ✅ **Minimal API**: Only essential methods are added to StandardAgent
5. ✅ **Flexible Configuration**: Support for multiple servers and naming strategies
6. ✅ **Error Resilience**: Graceful handling of connection failures
7. ✅ **Easy Migration**: Simple path to add MCP functionality

The design follows MiniAgent's core principles while providing powerful MCP integration capabilities.