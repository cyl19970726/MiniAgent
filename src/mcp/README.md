# MCP Integration for MiniAgent

This document provides comprehensive guidance for integrating MCP (Model Context Protocol) servers with MiniAgent, enabling seamless access to external tools and resources.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start Guide](#quick-start-guide)
4. [Configuration](#configuration)
5. [Transport Selection](#transport-selection)
6. [Tool Adapter Usage](#tool-adapter-usage)
7. [Error Handling](#error-handling)
8. [Performance Optimization](#performance-optimization)
9. [Best Practices](#best-practices)
10. [Examples](#examples)
11. [Troubleshooting](#troubleshooting)
12. [API Reference](#api-reference)

## Overview

MCP (Model Context Protocol) is an open standard for connecting AI assistants to external tools and data sources. MiniAgent's MCP integration provides:

- **Seamless Tool Integration**: Connect to any MCP-compatible server
- **Type Safety**: Full TypeScript support with runtime validation
- **Multiple Transports**: Support for STDIO, HTTP, and custom transports
- **Performance Optimization**: Connection pooling, caching, and batching
- **Error Resilience**: Comprehensive error handling and recovery
- **Streaming Support**: Real-time tool execution with progress updates

### Key Benefits

- **Extensibility**: Access thousands of MCP tools without custom integrations
- **Standardization**: Use the same protocol across different AI frameworks
- **Type Safety**: Zod-based schema validation with TypeScript support
- **Performance**: Optimized for production use with caching and pooling
- **Developer Experience**: Simple APIs with comprehensive examples

## Architecture

The MCP integration follows a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    MiniAgent Layer                          │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  StandardAgent  │    │ CoreToolScheduler│                │
│  └─────────────────┘    └─────────────────┘                │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                   MCP Adapter Layer                         │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ McpToolAdapter  │    │ McpConnectionMgr│                │
│  └─────────────────┘    └─────────────────┘                │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                   MCP Protocol Layer                        │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   McpClient     │    │  SchemaManager  │                │
│  └─────────────────┘    └─────────────────┘                │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                   Transport Layer                           │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ StdioTransport  │    │  HttpTransport  │                │
│  └─────────────────┘    └─────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

- **McpClient**: Main interface for MCP server communication
- **McpConnectionManager**: Manages multiple MCP server connections
- **McpToolAdapter**: Bridges MCP tools with MiniAgent's BaseTool system
- **SchemaManager**: Handles JSON Schema to Zod conversion and caching
- **Transports**: Handle actual communication (STDIO, HTTP, custom)

## Quick Start Guide

### 1. Basic STDIO Connection

```typescript
import { McpClient, createMcpToolAdapters } from 'miniagent/mcp';

// Create and connect MCP client
const client = new McpClient();
await client.initialize({
  serverName: 'my-server',
  transport: {
    type: 'stdio',
    command: 'my-mcp-server',
    args: ['--config', 'config.json']
  }
});

await client.connect();

// Discover and create tool adapters
const adapters = await createMcpToolAdapters(client, 'my-server', {
  cacheSchemas: true,
  enableDynamicTyping: false
});

console.log(`Connected to ${adapters.length} tools`);
```

### 2. Integration with MiniAgent

```typescript
import { StandardAgent } from 'miniagent';
import { McpConnectionManager, registerMcpTools } from 'miniagent/mcp';

// Set up MiniAgent components
const agent = new StandardAgent({
  chat: new GeminiChat({ apiKey: 'your-key' }),
  toolScheduler: new CoreToolScheduler()
});

// Add MCP server
const connectionManager = new McpConnectionManager();
await connectionManager.addServer({
  name: 'productivity-server',
  transport: {
    type: 'stdio',
    command: 'productivity-mcp-server'
  },
  autoConnect: true
});

// Register MCP tools with agent
const discoveredTools = await connectionManager.discoverTools();
for (const { serverName, tool } of discoveredTools) {
  const client = connectionManager.getClient(serverName);
  if (client) {
    await registerMcpTools(agent.toolScheduler, client, serverName);
  }
}

// Use the enhanced agent
const responses = agent.process('session-1', 'Help me organize my tasks');
for await (const event of responses) {
  console.log(event);
}
```

### 3. Type-Safe Tool Usage

```typescript
import { z } from 'zod';
import { createTypedMcpToolAdapter } from 'miniagent/mcp';

// Define parameter interface
interface WeatherParams {
  location: string;
  units?: 'celsius' | 'fahrenheit';
}

const WeatherSchema = z.object({
  location: z.string().min(1),
  units: z.enum(['celsius', 'fahrenheit']).optional()
});

// Create typed adapter
const weatherTool = await createTypedMcpToolAdapter<WeatherParams>(
  client,
  'get_weather',
  'weather-server',
  WeatherSchema
);

// Execute with full type safety
const result = await weatherTool.execute({
  location: 'San Francisco',
  units: 'fahrenheit'
});
```

## Configuration

### MCP Server Configuration

```typescript
interface McpServerConfig {
  name: string;                    // Unique server identifier
  transport: McpTransportConfig;   // Transport configuration
  autoConnect?: boolean;           // Auto-connect on startup
  healthCheckInterval?: number;    // Health check interval (ms)
  capabilities?: McpClientCapabilities;
  timeout?: number;               // Connection timeout (ms)
  requestTimeout?: number;        // Request timeout (ms)
  retry?: {                       // Retry configuration
    maxAttempts: number;
    delayMs: number;
    maxDelayMs: number;
  };
}
```

### Global MCP Configuration

```typescript
interface McpConfiguration {
  enabled: boolean;               // Enable MCP integration
  servers: McpServerConfig[];     // List of MCP servers
  autoDiscoverTools?: boolean;    // Auto-discover tools on startup
  connectionTimeout?: number;     // Global connection timeout
  requestTimeout?: number;        // Global request timeout
  maxConnections?: number;        // Max concurrent connections
  retryPolicy?: {                // Global retry policy
    maxAttempts: number;
    backoffMs: number;
    maxBackoffMs: number;
  };
  healthCheck?: {                // Health check configuration
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
  };
}
```

## Transport Selection

MiniAgent supports multiple transport mechanisms for MCP communication.

### STDIO Transport (Recommended for Local Servers)

Best for local development and subprocess-based MCP servers.

```typescript
const stdioConfig: McpStdioTransportConfig = {
  type: 'stdio',
  command: 'python',
  args: ['-m', 'my_mcp_server'],
  env: {
    ...process.env,
    MCP_DEBUG: 'true'
  },
  cwd: '/path/to/server'
};
```

**Pros:**
- Automatic process lifecycle management
- Direct communication with minimal overhead
- Built-in error detection
- Supports environment customization

**Cons:**
- Limited to local processes
- Platform-dependent command execution

### HTTP Transport (Recommended for Remote Servers)

Best for production deployments and remote MCP servers.

```typescript
const httpConfig: McpStreamableHttpTransportConfig = {
  type: 'streamable-http',
  url: 'https://api.example.com/mcp',
  headers: {
    'Authorization': 'Bearer your-token',
    'User-Agent': 'MiniAgent/1.0'
  },
  streaming: true,
  timeout: 30000,
  keepAlive: true,
  auth: {
    type: 'bearer',
    token: 'your-auth-token'
  }
};
```

**Pros:**
- Works across network boundaries
- Supports authentication and headers
- Scalable for production use
- Streaming response support

**Cons:**
- Network latency considerations
- Requires MCP server with HTTP support
- More complex error scenarios

### Custom Transports

For specialized communication needs:

```typescript
class CustomTransport implements IMcpTransport {
  async connect(): Promise<void> {
    // Custom connection logic
  }
  
  async send(message: McpRequest): Promise<void> {
    // Custom message sending
  }
  
  onMessage(handler: (message: McpResponse) => void): void {
    // Register message handler
  }
  
  // ... implement other methods
}
```

## Tool Adapter Usage

### Basic Adapter Creation

```typescript
// Create adapter for a specific tool
const adapter = await McpToolAdapter.create(
  client,
  toolDefinition,
  serverName,
  { cacheSchema: true }
);

// Create adapters for all tools from a server
const adapters = await createMcpToolAdapters(
  client,
  serverName,
  {
    toolFilter: (tool) => !tool.capabilities?.destructive,
    cacheSchemas: true,
    enableDynamicTyping: true
  }
);
```

### Type-Safe Adapters

```typescript
// Define parameter types
interface FileOperationParams {
  path: string;
  operation: 'read' | 'write' | 'delete';
  content?: string;
}

const FileOperationSchema = z.object({
  path: z.string().min(1, 'Path required'),
  operation: z.enum(['read', 'write', 'delete']),
  content: z.string().optional()
});

// Create typed adapter
const fileAdapter = await createTypedMcpToolAdapter<FileOperationParams>(
  client,
  'file_operation',
  'filesystem-server',
  FileOperationSchema,
  { cacheSchema: true }
);

// Execute with full type checking
const result = await fileAdapter.execute({
  path: '/tmp/test.txt',
  operation: 'read'
});
```

### Dynamic Adapters

For tools with unknown schemas:

```typescript
const dynamicAdapter = McpToolAdapter.createDynamic(
  client,
  toolDefinition,
  serverName,
  {
    cacheSchema: false,
    validateAtRuntime: true
  }
);
```

### Batch Registration

Register multiple tools at once:

```typescript
const registeredAdapters = await registerMcpTools(
  toolScheduler,
  client,
  serverName,
  {
    cacheSchemas: true,
    enableDynamicTyping: false,
    toolFilter: (tool) => tool.name.startsWith('safe_')
  }
);
```

## Error Handling

### Client-Level Error Handling

```typescript
const client = new McpClient();

client.onError((error: McpClientError) => {
  console.error('MCP Error:', {
    message: error.message,
    code: error.code,
    server: error.serverName,
    tool: error.toolName
  });
  
  // Implement recovery logic
  if (error.code === McpErrorCode.ConnectionError) {
    // Attempt reconnection
    setTimeout(() => client.connect(), 5000);
  }
});

client.onDisconnect(() => {
  console.log('MCP server disconnected');
  // Implement reconnection logic
});
```

### Tool-Level Error Handling

```typescript
try {
  const result = await mcpTool.execute(params);
  if (!result.success) {
    console.error('Tool execution failed:', result.error);
    // Handle tool-specific errors
  }
} catch (error) {
  if (isMcpClientError(error)) {
    // Handle MCP-specific errors
    console.error('MCP Error:', error.message);
  } else {
    // Handle general errors
    console.error('Unexpected error:', error);
  }
}
```

### Resilient Connection Patterns

```typescript
class ResilientMcpClient {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  async connectWithRetry(): Promise<void> {
    try {
      await this.client.connect();
      this.reconnectAttempts = 0;
    } catch (error) {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.pow(2, this.reconnectAttempts) * 1000;
        
        console.log(`Retrying connection in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.connectWithRetry();
      }
      throw new Error(`Failed to connect after ${this.maxReconnectAttempts} attempts`);
    }
  }
}
```

## Performance Optimization

### Connection Pooling

```typescript
class McpConnectionPool {
  private connections = new Map<string, McpClient>();
  private maxConnections = 10;
  
  async getConnection(serverName: string): Promise<McpClient> {
    if (this.connections.has(serverName)) {
      const client = this.connections.get(serverName)!;
      if (client.isConnected()) {
        return client;
      }
    }
    
    if (this.connections.size >= this.maxConnections) {
      // Implement connection eviction strategy
      this.evictOldestConnection();
    }
    
    const client = new McpClient();
    await client.initialize(getServerConfig(serverName));
    await client.connect();
    
    this.connections.set(serverName, client);
    return client;
  }
}
```

### Schema Caching

```typescript
// Enable schema caching for better performance
const adapters = await createMcpToolAdapters(
  client,
  serverName,
  {
    cacheSchemas: true,  // Cache JSON Schema to Zod conversions
    enableDynamicTyping: false  // Use static typing for better performance
  }
);

// Check cache stats
const schemaManager = client.getSchemaManager();
const stats = await schemaManager.getCacheStats();
console.log(`Schema cache: ${stats.hits}/${stats.hits + stats.misses} hit rate`);
```

### Result Caching

```typescript
class CachedMcpTool extends McpToolAdapter {
  private resultCache = new Map<string, { result: any; timestamp: number }>();
  private cacheTTL = 300000; // 5 minutes
  
  async execute(params: any, signal?: AbortSignal): Promise<IToolResult> {
    const cacheKey = JSON.stringify(params);
    const cached = this.resultCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return { success: true, data: cached.result };
    }
    
    const result = await super.execute(params, signal);
    
    if (result.success) {
      this.resultCache.set(cacheKey, {
        result: result.data,
        timestamp: Date.now()
      });
    }
    
    return result;
  }
}
```

### Batch Operations

```typescript
async function batchExecuteTools(
  requests: Array<{ client: McpClient; tool: string; params: any }>
): Promise<Array<{ success: boolean; result?: any; error?: string }>> {
  // Group by server for optimal batching
  const byServer = requests.reduce((acc, req) => {
    const serverName = req.client.serverName;
    if (!acc[serverName]) acc[serverName] = [];
    acc[serverName].push(req);
    return acc;
  }, {} as Record<string, typeof requests>);
  
  // Execute in parallel by server
  const serverResults = await Promise.all(
    Object.values(byServer).map(serverRequests =>
      Promise.allSettled(
        serverRequests.map(req =>
          req.client.callTool(req.tool, req.params)
        )
      )
    )
  );
  
  // Flatten results
  return serverResults.flat().map(result => ({
    success: result.status === 'fulfilled',
    result: result.status === 'fulfilled' ? result.value : undefined,
    error: result.status === 'rejected' ? result.reason.message : undefined
  }));
}
```

## Best Practices

### 1. Connection Management

```typescript
// ✅ Good: Use connection manager for multiple servers
const connectionManager = new McpConnectionManager();
await connectionManager.addServer(serverConfig);

// ❌ Avoid: Managing connections manually
const client1 = new McpClient();
const client2 = new McpClient();
// ... manual connection handling
```

### 2. Error Handling

```typescript
// ✅ Good: Comprehensive error handling
try {
  const result = await tool.execute(params);
} catch (error) {
  if (isMcpClientError(error)) {
    // Handle MCP-specific errors
    handleMcpError(error);
  } else {
    // Handle general errors
    handleGenericError(error);
  }
}

// ❌ Avoid: Generic error handling only
try {
  const result = await tool.execute(params);
} catch (error) {
  console.log('Something went wrong');
}
```

### 3. Type Safety

```typescript
// ✅ Good: Use typed adapters
interface ToolParams {
  input: string;
  options: { format: 'json' | 'xml' };
}

const typedTool = await createTypedMcpToolAdapter<ToolParams>(
  client, 'my_tool', 'server', schema
);

// ❌ Avoid: Untyped parameters
const result = await client.callTool('my_tool', { 
  input: 'data', 
  options: 'invalid'  // No type checking
});
```

### 4. Performance

```typescript
// ✅ Good: Enable caching and optimization
const adapters = await createMcpToolAdapters(client, 'server', {
  cacheSchemas: true,
  enableDynamicTyping: false,
  toolFilter: (tool) => tool.capabilities?.safe !== false
});

// ❌ Avoid: No optimization
const adapters = await createMcpToolAdapters(client, 'server');
```

### 5. Resource Cleanup

```typescript
// ✅ Good: Proper cleanup
class McpService {
  private connectionManager = new McpConnectionManager();
  
  async cleanup(): Promise<void> {
    await this.connectionManager.cleanup();
  }
}

// Use try/finally or event handlers for cleanup
process.on('SIGINT', async () => {
  await service.cleanup();
  process.exit(0);
});
```

## Examples

The `examples/` directory contains comprehensive examples:

1. **[mcp-basic-example.ts](../../examples/mcp-basic-example.ts)**: Basic MCP usage patterns
   - STDIO and HTTP connections
   - Tool discovery and execution
   - Error handling basics
   - MiniAgent integration

2. **[mcp-advanced-example.ts](../../examples/mcp-advanced-example.ts)**: Advanced patterns
   - Custom transports
   - Concurrent tool execution
   - Advanced schema validation
   - Performance optimization
   - Tool composition

3. **[mcpToolAdapterExample.ts](../../examples/mcpToolAdapterExample.ts)**: Tool adapter patterns
   - Generic typing
   - Dynamic tool discovery
   - Flexible tool creation

### Running Examples

```bash
# Run basic examples
npm run example:mcp-basic

# Run advanced examples
npm run example:mcp-advanced

# Run specific examples
npx ts-node examples/mcp-basic-example.ts stdio
npx ts-node examples/mcp-advanced-example.ts concurrent
```

## Troubleshooting

### Common Issues

#### 1. Connection Failures

**Symptoms:** `ConnectionError`, timeout errors, or immediate disconnections.

**Solutions:**
- Verify MCP server is running and accessible
- Check transport configuration (command path, URL, ports)
- Increase timeout values
- Check network connectivity (for HTTP transport)
- Verify authentication credentials

```typescript
// Debug connection issues
client.onError((error) => {
  console.log('Connection debug info:', {
    error: error.message,
    code: error.code,
    server: error.serverName,
    transport: client.transport?.constructor.name
  });
});
```

#### 2. Schema Validation Errors

**Symptoms:** Parameter validation failures, type mismatches.

**Solutions:**
- Check tool parameter schemas
- Use schema manager validation
- Enable dynamic typing for flexible schemas
- Update parameter types to match schema

```typescript
// Debug schema issues
const schemaManager = client.getSchemaManager();
const validation = await schemaManager.validateToolParams('tool_name', params);
if (!validation.success) {
  console.log('Validation errors:', validation.errors);
}
```

#### 3. Tool Discovery Issues

**Symptoms:** No tools discovered, empty tool lists.

**Solutions:**
- Check server capabilities
- Verify server supports tools
- Check tool filtering configuration
- Enable debug logging

```typescript
// Debug tool discovery
const serverInfo = await client.getServerInfo();
console.log('Server capabilities:', serverInfo.capabilities);

const tools = await client.listTools(true);
console.log(`Discovered ${tools.length} tools:`, tools.map(t => t.name));
```

#### 4. Performance Issues

**Symptoms:** Slow tool execution, high memory usage.

**Solutions:**
- Enable schema caching
- Use connection pooling
- Implement result caching
- Batch tool executions
- Monitor connection counts

```typescript
// Performance monitoring
const stats = await schemaManager.getCacheStats();
console.log('Performance stats:', {
  schemaCacheHitRate: stats.hits / (stats.hits + stats.misses),
  connectionCount: connectionManager.getAllServerStatuses().size
});
```

### Debug Mode

Enable debug mode for detailed logging:

```typescript
// Environment variable
process.env.MCP_DEBUG = 'true';

// Or programmatically
const client = new McpClient({ debug: true });
```

### Health Monitoring

Monitor MCP server health:

```typescript
const connectionManager = new McpConnectionManager();

// Enable health checks
await connectionManager.addServer({
  name: 'my-server',
  transport: config,
  healthCheckInterval: 30000  // Check every 30 seconds
});

// Manual health check
const healthResults = await connectionManager.healthCheck();
healthResults.forEach((isHealthy, serverName) => {
  console.log(`${serverName}: ${isHealthy ? 'Healthy' : 'Unhealthy'}`);
});
```

## API Reference

### Core Classes

#### McpClient

Main interface for MCP server communication.

```typescript
class McpClient implements IMcpClient {
  async initialize(config: McpClientConfig): Promise<void>
  async connect(): Promise<void>
  async disconnect(): Promise<void>
  isConnected(): boolean
  async getServerInfo(): Promise<ServerInfo>
  async listTools<T>(cacheSchemas?: boolean): Promise<McpTool<T>[]>
  async callTool<T>(name: string, args: T): Promise<McpToolResult>
  getSchemaManager(): IToolSchemaManager
  onError(handler: (error: McpClientError) => void): void
  onDisconnect(handler: () => void): void
}
```

#### McpConnectionManager

Manages multiple MCP server connections.

```typescript
class McpConnectionManager implements IMcpConnectionManager {
  async addServer(config: McpServerConfig): Promise<void>
  async removeServer(serverName: string): Promise<void>
  getServerStatus(serverName: string): McpServerStatus | undefined
  getAllServerStatuses(): Map<string, McpServerStatus>
  async connectServer(serverName: string): Promise<void>
  async disconnectServer(serverName: string): Promise<void>
  async discoverTools(): Promise<Array<{serverName: string; tool: McpTool}>>
  async refreshServer(serverName: string): Promise<void>
  async healthCheck(): Promise<Map<string, boolean>>
  getClient(serverName: string): IMcpClient | undefined
  onServerStatusChange(handler: McpServerStatusHandler): void
  async cleanup(): Promise<void>
}
```

#### McpToolAdapter

Bridges MCP tools with MiniAgent's BaseTool system.

```typescript
class McpToolAdapter extends BaseTool {
  static async create(
    client: IMcpClient,
    tool: McpTool,
    serverName: string,
    options?: McpToolAdapterOptions
  ): Promise<McpToolAdapter>
  
  static createDynamic(
    client: IMcpClient,
    tool: McpTool,
    serverName: string,
    options?: McpToolAdapterOptions
  ): McpToolAdapter
  
  async execute(
    params: any,
    signal?: AbortSignal,
    onUpdate?: (output: string) => void
  ): Promise<IToolResult>
  
  getMcpMetadata(): McpToolMetadata
}
```

### Utility Functions

```typescript
// Create multiple adapters for a server
async function createMcpToolAdapters(
  client: IMcpClient,
  serverName: string,
  options?: CreateMcpToolAdaptersOptions
): Promise<McpToolAdapter[]>

// Create typed adapter
async function createTypedMcpToolAdapter<T>(
  client: IMcpClient,
  toolName: string,
  serverName: string,
  schema: ZodSchema<T>,
  options?: McpToolAdapterOptions
): Promise<McpToolAdapter | null>

// Register tools with scheduler
async function registerMcpTools(
  scheduler: IToolScheduler,
  client: IMcpClient,
  serverName: string,
  options?: RegisterMcpToolsOptions
): Promise<McpToolAdapter[]>
```

### Type Guards

```typescript
function isMcpStdioTransport(config: McpTransportConfig): config is McpStdioTransportConfig
function isMcpHttpTransport(config: McpTransportConfig): config is McpHttpTransportConfig  
function isMcpStreamableHttpTransport(config: McpTransportConfig): config is McpStreamableHttpTransportConfig
function isMcpClientError(error: unknown): error is McpClientError
function isMcpToolResult(result: unknown): result is McpToolResult
```

---

For more examples and advanced usage patterns, see the [examples directory](../../examples/) and the comprehensive test suite in [__tests__](./__tests__/).

## Contributing

MCP integration is actively developed. Contributions are welcome:

1. **Bug Reports**: Use GitHub issues with detailed reproduction steps
2. **Feature Requests**: Describe use cases and proposed API changes
3. **Pull Requests**: Include tests and documentation updates
4. **Examples**: Share your MCP integration patterns

## License

MCP integration follows the same license as MiniAgent. See the main project LICENSE file for details.