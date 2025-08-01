# MCP Integration Guide

MCP (Model Context Protocol) integration allows MiniAgent to use tools from external MCP servers, greatly expanding the available functionality beyond built-in tools.

## Overview

The MCP integration provides:

- **Type-safe integration**: Full TypeScript support with proper error handling
- **Multi-server support**: Connect to multiple MCP servers simultaneously  
- **Automatic tool discovery**: Tools are automatically loaded from running servers
- **Seamless tool usage**: MCP tools work exactly like regular tools in conversations
- **Configuration flexibility**: Support for environment variables, file-based config, and programmatic setup
- **Error resilience**: Robust error handling with retry logic and graceful fallbacks

## Quick Start

### 1. Installation

The MCP SDK is already included as a dependency:

```bash
npm install @continue-reasoning/mini-agent
```

### 2. Basic Usage

```typescript
import { 
  createMCPAgent, 
  MCPConfigHelpers,
  AgentEventType 
} from '@continue-reasoning/mini-agent';

// Create MCP configuration
const config = {
  agentConfig: {
    model: 'gemini-2.0-flash',
    workingDirectory: process.cwd(),
    apiKey: process.env.GEMINI_API_KEY,
  },
  chatConfig: {
    apiKey: process.env.GEMINI_API_KEY!,
    modelName: 'gemini-2.0-flash',
    systemPrompt: 'You are a helpful assistant with filesystem and git tools.',
  },
  toolSchedulerConfig: {
    approvalMode: 'yolo', // Auto-approve tools for demo
  },
  mcpConfig: {
    servers: [
      // Filesystem operations
      MCPConfigHelpers.createFilesystemServer('fs', process.cwd()),
      // Git operations  
      MCPConfigHelpers.createGitServer('git', process.cwd()),
    ],
  },
};

// Create and initialize agent
const agent = await createMCPAgent([], config);

// Use the agent
for await (const event of agent.process([{
  role: 'user',
  content: { type: 'text', text: 'List files and show git status' },
  metadata: { sessionId: 'demo' }
}], 'demo', new AbortController().signal)) {
  if (event.type === AgentEventType.ResponseChunkTextDelta) {
    process.stdout.write((event.data as any).content.text);
  }
}
```

## Configuration

### Server Configuration

MCP servers are configured using `MCPServerConfig`:

```typescript
interface MCPServerConfig {
  name: string;           // Unique server identifier
  command: string;        // Command to start the server
  args?: string[];        // Command arguments
  env?: Record<string, string>; // Environment variables
  cwd?: string;          // Working directory
  disabled?: boolean;     // Whether to skip this server
  timeout?: number;       // Custom timeout (ms)
  retryAttempts?: number; // Custom retry attempts
}
```

### Built-in Server Helpers

The `MCPConfigHelpers` class provides convenient methods for common servers:

#### Filesystem Server
```typescript
MCPConfigHelpers.createFilesystemServer('fs', '/allowed/path')
```

#### Git Server
```typescript  
MCPConfigHelpers.createGitServer('git', '/repo/path')
```

#### Web Search Server
```typescript
MCPConfigHelpers.createWebSearchServer('search', 'api-key')
```

#### Database Server
```typescript
MCPConfigHelpers.createDatabaseServer('db', 'connection-string')
```

### Environment Variables

Configure servers using environment variables:

```bash
# Global MCP settings
MCP_TIMEOUT=30000
MCP_RETRY_ATTEMPTS=3
MCP_LOG_LEVEL=INFO
MCP_AUTO_RESTART=true

# Server configuration
MCP_SERVER_FILESYSTEM_COMMAND=npx
MCP_SERVER_FILESYSTEM_ARGS=@modelcontextprotocol/server-filesystem,/path
MCP_SERVER_GIT_COMMAND=mcp-server-git
MCP_SERVER_GIT_CWD=/repo/path
```

### Configuration Files

Load configuration from JSON files:

```typescript
import { MCPConfigLoader } from '@continue-reasoning/mini-agent';

const config = MCPConfigLoader.loadFromFile('./mcp-config.json');
```

Example `mcp-config.json`:
```json
{
  "servers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/workspace"],
      "disabled": false
    },
    {
      "name": "git", 
      "command": "mcp-server-git",
      "cwd": "/workspace",
      "timeout": 45000
    }
  ],
  "timeout": 30000,
  "retryAttempts": 3,
  "autoRestart": true
}
```

## Advanced Usage

### Custom Tool Integration

Mix MCP tools with custom tools:

```typescript
import { BaseTool, createMCPAgent } from '@continue-reasoning/mini-agent';

class CustomTool extends BaseTool {
  // ... your custom tool implementation
}

const agent = await createMCPAgent([
  new CustomTool(),
  // MCP tools will be automatically added
], config);
```

### Server Management

Control MCP servers at runtime:

```typescript
// Start/stop servers
await agent.startMCPServer('filesystem');
await agent.stopMCPServer('git');
await agent.restartMCPServer('search');

// Get server status
const status = agent.getMCPStatus();
console.log(`Running servers: ${status.serverStatus.runningServers}`);
console.log(`Available tools: ${status.mcpTools.length}`);

// Refresh tools from all servers
await agent.refreshMCPTools();
```

### Error Handling

```typescript
import { MCPError, MCPErrorType } from '@continue-reasoning/mini-agent';

try {
  await agent.startMCPServer('problematic-server');
} catch (error) {
  if (error instanceof MCPError) {
    switch (error.type) {
      case MCPErrorType.ServerStartupFailed:
        console.log('Server failed to start:', error.message);
        break;
      case MCPErrorType.ToolExecutionFailed:
        console.log('Tool execution failed:', error.toolName, error.message);
        break;
    }
  }
}
```

## Available MCP Servers

### Official Servers

- **@modelcontextprotocol/server-filesystem**: File system operations
- **@modelcontextprotocol/server-git**: Git repository operations  
- **@modelcontextprotocol/server-postgres**: PostgreSQL database operations
- **@modelcontextprotocol/server-sqlite**: SQLite database operations

### Community Servers

- **mcp-server-web-search**: Web search capabilities
- **mcp-server-docker**: Docker container management
- **mcp-server-aws**: AWS services integration
- **mcp-server-github**: GitHub API integration

## Best Practices

### Security

1. **Restrict filesystem access**: Only allow access to specific directories
2. **Validate server commands**: Ensure server executables are trusted
3. **Use confirmation mode**: Set `approvalMode: 'default'` for destructive operations
4. **Environment isolation**: Run servers in isolated environments when possible

### Performance

1. **Configure timeouts**: Set appropriate timeouts for your use case
2. **Limit concurrent tools**: Use `maxConcurrentTools` to prevent resource exhaustion
3. **Monitor server health**: Implement health checks for critical servers
4. **Use auto-restart**: Enable `autoRestart` for production deployments

### Debugging

1. **Enable debug logging**: Set `logLevel: LogLevel.DEBUG` in MCP config
2. **Monitor tool execution**: Use tool execution callbacks to track performance
3. **Check server logs**: Most MCP servers provide detailed logging
4. **Validate configurations**: Use `MCPConfigLoader.validate()` to check config

## Troubleshooting

### Common Issues

#### Server Won't Start
```
Error: Server startup failed after 3 attempts
```

**Solutions:**
- Check that the server command is in PATH
- Verify server dependencies are installed
- Check server logs for specific error messages
- Increase timeout and retry attempts

#### Tool Execution Timeout
```
Error: Tool execution timeout after 30000ms
```

**Solutions:**
- Increase timeout in server config
- Check server responsiveness with `ping()`
- Monitor server resource usage
- Consider using streaming tools for long operations

#### Permission Denied
```
Error: EACCES: permission denied
```

**Solutions:**
- Check file/directory permissions
- Verify server process user has required access
- Use absolute paths in configuration
- Consider running with appropriate privileges

### Getting Help

1. **Check server documentation**: Each MCP server has specific requirements
2. **Enable verbose logging**: Use debug mode to see detailed execution flow
3. **Test servers independently**: Verify servers work outside of MiniAgent
4. **Review configuration**: Use validation to catch config errors early

## Examples

See the complete working example in `examples/mcpExample.ts` for a full demonstration of MCP integration with filesystem and git tools.

## Contributing

When adding new MCP server support:

1. Follow the existing helper pattern in `MCPConfigHelpers`
2. Add comprehensive tests for new functionality  
3. Update documentation with usage examples
4. Consider security implications of new server types