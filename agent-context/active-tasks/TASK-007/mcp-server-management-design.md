# MCP Server Management Design for MiniAgent

## Overview
Design for adding dynamic MCP server management capabilities to MiniAgent, allowing runtime addition and removal of MCP servers.

## Architecture Decision

### Where to Implement?
**Recommendation: StandardAgent** (not BaseAgent)

**Rationale:**
- BaseAgent focuses on core message processing and tool execution
- StandardAgent handles session management and state
- MCP servers are external connections that span sessions
- Keeps BaseAgent minimal and focused

### Alternative Approach: Composition Pattern
Create a new `McpEnabledAgent` class that wraps StandardAgent and adds MCP capabilities:
```typescript
class McpEnabledAgent extends StandardAgent {
  private mcpServers: Map<string, SimpleMcpClient>
  private mcpTools: Map<string, McpToolAdapter[]>
}
```

## Proposed API Design

### Option 1: Direct Integration in StandardAgent

```typescript
interface McpServerConfig {
  name: string;        // Unique identifier for the server
  transport: {
    type: 'stdio' | 'sse';
    command?: string;  // For stdio
    args?: string[];   // For stdio  
    url?: string;      // For SSE
  };
  autoConnect?: boolean;  // Connect immediately (default: true)
}

class StandardAgent {
  // Add MCP server and its tools to the agent
  async addMcpServer(config: McpServerConfig): Promise<void> {
    // 1. Create SimpleMcpClient
    // 2. Connect to server
    // 3. Discover tools
    // 4. Add tools to agent's tool scheduler
    // 5. Store reference for management
  }

  // Remove MCP server and its tools
  async removeMcpServer(serverName: string): Promise<void> {
    // 1. Remove tools from scheduler
    // 2. Disconnect client
    // 3. Clean up references
  }

  // List active MCP servers
  getMcpServers(): string[] {
    // Return list of server names
  }

  // Get tools from specific MCP server
  getMcpTools(serverName: string): string[] {
    // Return tool names from that server
  }
}
```

### Option 2: Separate MCP Manager (Recommended)

```typescript
/**
 * McpManager - Manages MCP server connections for an agent
 * 
 * This is a cleaner separation of concerns that can be used
 * with any agent implementation.
 */
export class McpManager {
  private servers: Map<string, SimpleMcpClient> = new Map();
  private serverTools: Map<string, McpToolAdapter[]> = new Map();

  /**
   * Add an MCP server
   */
  async addServer(config: McpServerConfig): Promise<McpToolAdapter[]> {
    if (this.servers.has(config.name)) {
      throw new Error(`Server ${config.name} already exists`);
    }

    // Create and connect client
    const client = new SimpleMcpClient();
    await client.connect(config);
    
    // Discover and create tool adapters
    const tools = await createMcpTools(client);
    
    // Store references
    this.servers.set(config.name, client);
    this.serverTools.set(config.name, tools);
    
    return tools;
  }

  /**
   * Remove an MCP server
   */
  async removeServer(name: string): Promise<void> {
    const client = this.servers.get(name);
    if (!client) {
      throw new Error(`Server ${name} not found`);
    }

    // Disconnect and clean up
    await client.disconnect();
    this.servers.delete(name);
    this.serverTools.delete(name);
  }

  /**
   * Get all tools from all servers
   */
  getAllTools(): McpToolAdapter[] {
    const allTools: McpToolAdapter[] = [];
    for (const tools of this.serverTools.values()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  /**
   * Get tools from specific server
   */
  getServerTools(name: string): McpToolAdapter[] {
    return this.serverTools.get(name) || [];
  }

  /**
   * List all server names
   */
  listServers(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll(): Promise<void> {
    for (const [name, client] of this.servers) {
      await client.disconnect();
    }
    this.servers.clear();
    this.serverTools.clear();
  }
}

// Usage with StandardAgent
const agent = new StandardAgent([], config);
const mcpManager = new McpManager();

// Add MCP server
const tools = await mcpManager.addServer({
  name: 'my-server',
  transport: { type: 'stdio', command: 'mcp-server' }
});

// Add tools to agent
agent.addTools(tools);

// Remove server later
await mcpManager.removeServer('my-server');
agent.removeTools(tools);
```

## Implementation Approach

### Phase 1: Create McpManager Class
1. Implement McpManager with server lifecycle management
2. Handle connection errors gracefully
3. Support multiple concurrent servers

### Phase 2: Agent Integration
1. Add helper methods to StandardAgent for convenience:
   ```typescript
   class StandardAgent {
     private mcpManager?: McpManager;
     
     enableMcp(): McpManager {
       if (!this.mcpManager) {
         this.mcpManager = new McpManager();
       }
       return this.mcpManager;
     }
   }
   ```

### Phase 3: Testing
1. Test server addition/removal
2. Test tool discovery and registration
3. Test error scenarios
4. Test multiple servers

## Benefits of McpManager Approach

1. **Separation of Concerns**: MCP logic separate from agent logic
2. **Reusability**: Can be used with any agent implementation
3. **Testability**: Easy to test in isolation
4. **Flexibility**: Users can choose to use it or not
5. **Minimal Impact**: No changes to BaseAgent or core logic

## Example Usage

```typescript
// Simple usage
const agent = new StandardAgent([], config);
const mcp = new McpManager();

// Add a server
const tools = await mcp.addServer({
  name: 'calculator',
  transport: { 
    type: 'stdio', 
    command: 'npx',
    args: ['calculator-mcp-server']
  }
});
agent.addTools(tools);

// In conversation
const response = await agent.processUserMessage(
  "What is 5 + 3?",
  sessionId
);
// Agent can now use calculator MCP tools

// Clean up
await mcp.removeServer('calculator');
```

## Error Handling

- Server connection failures should not crash the agent
- Tool discovery failures should log warnings
- Duplicate server names should be rejected
- Disconnection errors should be logged but not throw

## Future Enhancements

1. **Auto-reconnection**: Reconnect to servers on failure
2. **Tool filtering**: Only add specific tools from a server
3. **Tool aliasing**: Rename tools to avoid conflicts
4. **Server health monitoring**: Check server status periodically
5. **Persistent configuration**: Save/load server configs

## Conclusion

The McpManager approach provides a clean, minimal way to add dynamic MCP server management to MiniAgent without modifying core components. It maintains the framework's philosophy of simplicity while adding powerful capabilities for external tool integration.