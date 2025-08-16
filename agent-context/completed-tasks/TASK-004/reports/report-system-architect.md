# MCP Integration Architecture Design Report

**Task**: TASK-004 - MCP Tool Integration  
**Agent**: System Architect  
**Date**: 2025-08-10  
**Status**: Architecture Design Complete  

## Executive Summary

This report presents a comprehensive architecture design for integrating Model Context Protocol (MCP) support into the MiniAgent framework. The design maintains MiniAgent's core principles of minimalism, type safety, and provider-agnostic architecture while adding powerful capabilities for connecting to external MCP servers and their tools.

The architecture introduces a clean adapter pattern that bridges MCP tools to MiniAgent's existing `ITool` interface, ensuring backward compatibility and zero impact on existing implementations. The design emphasizes optional integration, meaning teams can adopt MCP incrementally without disrupting current workflows.

## Architecture Overview

### 1. High-Level Design Principles

The MCP integration follows MiniAgent's core architectural principles:

- **Minimalism First**: Only essential components are added
- **Type Safety**: Full TypeScript support with no `any` types in public APIs  
- **Provider Agnostic**: Core never depends on specific MCP server implementations
- **Composability**: MCP tools work seamlessly with existing tools
- **Optional Integration**: MCP is an opt-in feature that doesn't affect non-MCP users

### 2. Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MiniAgent Core                             │
├─────────────────────────────────────────────────────────────────┤
│  IAgent  │  IToolScheduler  │  ITool  │  BaseTool              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ (existing interface)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  MCP Integration Layer                          │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   McpClient     │   McpToolAdapter │   McpConnectionManager     │
│                 │                 │                             │
│ • JSON-RPC      │ • ITool impl    │ • Server registry           │
│ • Transport     │ • Type bridge   │ • Connection pooling        │
│ • Session mgmt  │ • Error mapping │ • Health monitoring         │
└─────────────────┴─────────────────┴─────────────────────────────┘
                               │
                               │ (MCP protocol)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Servers                                  │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  File System    │   Database      │   External APIs             │
│  Server         │   Server        │   (GitHub, Slack, etc.)     │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

## Core Components Design

### 1. MCP Client (`McpClient`)

The `McpClient` is responsible for low-level MCP protocol communication:

```typescript
export interface IMcpClient {
  // Core protocol methods
  initialize(config: McpClientConfig): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  // Tool discovery and execution
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpResult>;
  
  // Resource access (future capability)
  listResources?(): Promise<McpResource[]>;
  getResource?(uri: string): Promise<McpResource>;
  
  // Event handling
  onError(handler: (error: McpError) => void): void;
  onDisconnect(handler: () => void): void;
}

export interface McpClientConfig {
  serverName: string;
  transport: McpTransport;
  capabilities?: McpClientCapabilities;
  timeout?: number;
  retryPolicy?: McpRetryPolicy;
}
```

**Key Design Decisions:**
- **Transport Abstraction**: Supports both STDIO and HTTP+SSE transports through a common interface
- **Session Management**: Handles connection lifecycle, reconnections, and error recovery
- **Capability Negotiation**: Discovers server capabilities during initialization
- **Type Safety**: All MCP messages are properly typed using discriminated unions

### 2. MCP Tool Adapter (`McpToolAdapter`)

The adapter bridges MCP tools to MiniAgent's `ITool` interface:

```typescript
export class McpToolAdapter extends BaseTool<unknown, McpToolResult> {
  constructor(
    private mcpClient: IMcpClient,
    private mcpTool: McpTool,
    private serverName: string
  ) {
    super(
      `${serverName}.${mcpTool.name}`,
      mcpTool.displayName || mcpTool.name,
      mcpTool.description,
      mcpTool.inputSchema,
      true, // MCP tools typically return markdown
      false  // Streaming not yet supported in MCP
    );
  }

  async execute(
    params: unknown,
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<DefaultToolResult<McpToolResult>> {
    // Implementation bridges MCP calls to MiniAgent patterns
    const result = await this.mcpClient.callTool(this.mcpTool.name, params);
    return new DefaultToolResult(this.convertMcpResult(result));
  }

  async shouldConfirmExecute(
    params: unknown,
    abortSignal: AbortSignal
  ): Promise<ToolCallConfirmationDetails | false> {
    // Leverage existing MCP confirmation interface
    return {
      type: 'mcp',
      title: `Execute ${this.mcpTool.displayName || this.mcpTool.name}`,
      serverName: this.serverName,
      toolName: this.mcpTool.name,
      toolDisplayName: this.mcpTool.displayName || this.mcpTool.name,
      onConfirm: this.createConfirmHandler()
    };
  }
}
```

**Key Design Decisions:**
- **Extends BaseTool**: Inherits all standard tool behaviors and patterns
- **Namespaced Tools**: Tool names include server prefix to avoid conflicts
- **Error Mapping**: Converts MCP errors to MiniAgent error patterns
- **Confirmation Integration**: Uses existing MCP confirmation interface from core

### 3. MCP Connection Manager (`McpConnectionManager`)

Manages multiple MCP server connections and tool registration:

```typescript
export interface IMcpConnectionManager {
  // Server management
  addServer(config: McpServerConfig): Promise<void>;
  removeServer(serverName: string): Promise<void>;
  getServerStatus(serverName: string): McpServerStatus;
  
  // Tool discovery
  discoverTools(): Promise<ITool[]>;
  refreshServer(serverName: string): Promise<void>;
  
  // Health monitoring
  healthCheck(): Promise<Map<string, boolean>>;
  onServerStatusChange(handler: McpServerStatusHandler): void;
}

export interface McpServerConfig {
  name: string;
  transport: McpTransportConfig;
  autoConnect?: boolean;
  healthCheckInterval?: number;
  capabilities?: string[];
}
```

**Key Design Decisions:**
- **Centralized Management**: Single point for managing all MCP server connections
- **Health Monitoring**: Automatic health checks with configurable intervals
- **Lazy Loading**: Servers connect only when needed
- **Tool Registry Integration**: Discovered tools are automatically registered with tool scheduler

## Transport Architecture

### 1. Transport Abstraction

```typescript
export interface IMcpTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: McpMessage): Promise<void>;
  onMessage(handler: (message: McpMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onDisconnect(handler: () => void): void;
}

export interface McpTransportConfig {
  type: 'stdio' | 'http';
  // Type-specific configurations
  stdio?: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
  http?: {
    url: string;
    headers?: Record<string, string>;
    auth?: McpAuthConfig;
  };
}
```

### 2. Supported Transports

**STDIO Transport** (Local servers):
- Spawns MCP server as child process
- Uses stdin/stdout for JSON-RPC communication
- Ideal for local integrations and development

**HTTP+SSE Transport** (Remote servers):
- HTTP for client-to-server requests
- Server-Sent Events for server-to-client messages
- Supports authentication and secure connections

## Type System Design

### 1. Core MCP Types

```typescript
// MCP Protocol Types
export interface McpTool {
  name: string;
  displayName?: string;
  description: string;
  inputSchema: Schema;
}

export interface McpResult {
  content: McpContent[];
  isError?: boolean;
}

export interface McpContent {
  type: 'text' | 'resource';
  text?: string;
  resource?: {
    uri: string;
    mimeType?: string;
  };
}

// Integration Types
export interface McpToolResult {
  content: McpContent[];
  serverName: string;
  toolName: string;
  executionTime: number;
}

export interface McpError extends Error {
  code: McpErrorCode;
  serverName?: string;
  toolName?: string;
}
```

### 2. Configuration Types

```typescript
export interface McpConfiguration {
  servers: McpServerConfig[];
  globalTimeout?: number;
  maxConnections?: number;
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
    maxBackoffMs: number;
  };
}
```

## Integration Patterns

### 1. Agent Configuration

MCP integration is configured through the existing agent configuration system:

```typescript
// Extend existing configuration
export interface IAgentConfig {
  // ... existing fields
  mcp?: {
    enabled: boolean;
    servers: McpServerConfig[];
    autoDiscoverTools?: boolean;
    connectionTimeout?: number;
  };
}
```

### 2. Tool Registration Flow

```typescript
// During agent initialization
if (config.mcp?.enabled) {
  const mcpManager = new McpConnectionManager(config.mcp);
  
  // Auto-discover and register MCP tools
  if (config.mcp.autoDiscoverTools) {
    const mcpTools = await mcpManager.discoverTools();
    mcpTools.forEach(tool => agent.registerTool(tool));
  }
}
```

### 3. Tool Execution Flow

1. **Tool Call Request**: LLM requests tool execution through standard MiniAgent flow
2. **Adapter Handling**: `McpToolAdapter` receives execution request
3. **MCP Protocol**: Adapter translates to MCP JSON-RPC call
4. **Server Processing**: MCP server executes tool and returns result
5. **Result Translation**: Adapter converts MCP result to `DefaultToolResult`
6. **Agent Integration**: Standard MiniAgent tool result handling

## Error Handling Strategy

### 1. Error Categories

- **Connection Errors**: Server unavailable, network issues
- **Protocol Errors**: Invalid JSON-RPC, capability mismatches
- **Tool Errors**: Tool execution failures, parameter validation
- **Timeout Errors**: Request timeouts, server unresponsive

### 2. Error Recovery

```typescript
export interface McpErrorRecovery {
  // Connection recovery
  reconnectOnFailure: boolean;
  maxReconnectAttempts: number;
  
  // Request retry
  retryOnTransientError: boolean;
  maxRetryAttempts: number;
  
  // Fallback handling
  fallbackBehavior: 'error' | 'skip' | 'notify';
}
```

### 3. Error Reporting

All MCP errors are mapped to MiniAgent's standard error patterns:
- Tool execution errors become `IToolCallResponseInfo` with error details
- Connection errors trigger agent event system notifications
- Protocol errors are logged with appropriate severity levels

## Configuration Architecture

### 1. Server Configuration

```typescript
// Example configuration
const mcpConfig: McpConfiguration = {
  servers: [
    {
      name: "filesystem",
      transport: {
        type: "stdio",
        stdio: {
          command: "npx",
          args: ["@modelcontextprotocol/server-filesystem", "/path/to/workspace"]
        }
      },
      autoConnect: true,
      healthCheckInterval: 30000
    },
    {
      name: "github",
      transport: {
        type: "http",
        http: {
          url: "https://api.github.com/mcp",
          auth: { type: "bearer", token: process.env.GITHUB_TOKEN }
        }
      },
      capabilities: ["tools", "resources"]
    }
  ],
  globalTimeout: 10000,
  maxConnections: 5
};
```

### 2. Dynamic Configuration

- **Runtime Server Addition**: Add new MCP servers without restarting
- **Configuration Validation**: Schema validation for all MCP configurations
- **Environment Integration**: Support for environment variable substitution

## Security Considerations

### 1. Sandbox Isolation

- MCP servers run in separate processes (STDIO transport)
- Network access controls for HTTP transport
- Resource access validation for file system operations

### 2. Authentication

- OAuth 2.1 support for HTTP transport
- API key management for authenticated servers
- Secure credential storage patterns

### 3. Validation

- Strict schema validation for all MCP messages
- Parameter validation before tool execution
- Result validation after tool execution

## Performance Architecture

### 1. Connection Management

- **Connection Pooling**: Reuse established connections
- **Lazy Loading**: Connect to servers only when needed
- **Health Monitoring**: Proactive connection health checks

### 2. Tool Discovery Optimization

- **Caching**: Cache tool schemas and capabilities
- **Incremental Updates**: Only refresh changed tools
- **Background Refresh**: Periodic tool discovery without blocking

### 3. Request Optimization

- **Request Batching**: Batch multiple tool calls when possible
- **Timeout Management**: Appropriate timeouts for different operation types
- **Resource Cleanup**: Proper cleanup of connections and resources

## Testing Strategy

### 1. Unit Tests

- MCP client protocol implementation
- Tool adapter functionality
- Connection manager behavior
- Error handling and recovery

### 2. Integration Tests

- End-to-end MCP server communication
- Tool execution workflows
- Configuration validation
- Error scenarios

### 3. Mock Framework

```typescript
export class MockMcpServer implements IMcpClient {
  // Mock implementation for testing
  private tools: Map<string, McpTool> = new Map();
  private responses: Map<string, McpResult> = new Map();
  
  // Test utilities
  addMockTool(tool: McpTool): void;
  setMockResponse(toolName: string, result: McpResult): void;
  simulateError(error: McpError): void;
}
```

## Migration Strategy

### 1. Backward Compatibility

- **Zero Impact**: Non-MCP users experience no changes
- **Opt-in Integration**: MCP features are explicitly enabled
- **Graceful Degradation**: System works without MCP servers

### 2. Incremental Adoption

1. **Phase 1**: Basic MCP client and tool adapter
2. **Phase 2**: Connection manager and health monitoring  
3. **Phase 3**: Advanced features (resources, streaming)
4. **Phase 4**: Performance optimizations

### 3. Documentation Strategy

- **Quick Start Guide**: Simple MCP integration example
- **Configuration Reference**: Complete configuration options
- **Best Practices**: Recommended patterns and practices
- **Troubleshooting**: Common issues and solutions

## Implementation Phases

### Phase 1: Core MCP Client (Week 1-2)
- Implement basic MCP client with JSON-RPC support
- STDIO and HTTP transport implementations
- Basic connection management
- Unit tests for core functionality

### Phase 2: Tool Integration (Week 2-3)
- Implement McpToolAdapter
- Extend tool registration system
- Integration with existing tool scheduler
- End-to-end testing

### Phase 3: Connection Management (Week 3-4)
- Implement McpConnectionManager
- Health monitoring and error recovery
- Configuration validation
- Performance optimizations

### Phase 4: Polish and Documentation (Week 4-5)
- Comprehensive testing
- Documentation and examples
- Performance tuning
- Security review

## Success Metrics

### 1. Functional Success
- [ ] MCP tools execute successfully through MiniAgent
- [ ] Full type safety maintained throughout integration
- [ ] Zero breaking changes to existing APIs
- [ ] Support for both STDIO and HTTP transports

### 2. Quality Metrics
- [ ] >90% test coverage for MCP components
- [ ] <100ms overhead for MCP tool execution
- [ ] Graceful handling of all error scenarios
- [ ] Memory usage within 5% of baseline

### 3. Developer Experience
- [ ] Simple configuration for common use cases
- [ ] Clear error messages and debugging information
- [ ] Comprehensive documentation and examples
- [ ] Smooth migration path for existing users

## Conclusion

This architecture design provides a robust, type-safe, and minimal integration of MCP capabilities into MiniAgent. The design emphasizes:

1. **Seamless Integration**: MCP tools work exactly like native tools
2. **Optional Adoption**: Teams can adopt MCP incrementally
3. **Architectural Consistency**: Follows MiniAgent's established patterns
4. **Future-Proof Design**: Supports planned MCP protocol enhancements

The implementation maintains MiniAgent's core philosophy while opening up a vast ecosystem of external tools and resources through the standardized MCP protocol. This positions MiniAgent as a powerful platform for building sophisticated AI agents that can interact with the broader tool ecosystem.

## Next Steps

1. **Implementation Planning**: Break down implementation into manageable sprint tasks
2. **Proof of Concept**: Build a minimal working example with file system MCP server
3. **API Review**: Validate interfaces with stakeholders and early adopters
4. **Resource Planning**: Allocate development resources across implementation phases

This architecture provides the foundation for a successful MCP integration that enhances MiniAgent's capabilities while preserving its elegant simplicity.