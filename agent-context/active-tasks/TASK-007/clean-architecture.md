# Clean MCP Integration Architecture

## Overview
This document defines a minimal, clean MCP integration using ONLY the official `@modelcontextprotocol/sdk` with no custom implementations or abstractions.

## Design Principles

### 1. Absolute Minimalism
- Direct use of SDK classes - no wrappers unless absolutely essential
- Total implementation < 500 lines of code
- No backward compatibility requirements
- Remove all custom MCP protocol implementations

### 2. SDK-First Approach
- Use SDK Client class directly
- Leverage built-in transport mechanisms
- No custom error handling beyond what's necessary
- No reconnection logic or health checks

### 3. Essential Functionality Only
- Connect to MCP server
- List tools from server
- Execute tools through server
- Convert MCP results to MiniAgent format

## Architecture

### Class Diagram
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SimpleMcp     │───▶│ SDK Client      │───▶│ MCP Server      │
│   Manager       │    │ (from SDK)      │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐
│   McpTool       │
│   Adapter       │
└─────────────────┘
```

### Core Classes

#### 1. SimpleMcpManager (~200 lines)
**Purpose**: Minimal wrapper for SDK Client with essential functionality only

```typescript
class SimpleMcpManager {
  private client: Client;
  private transport: Transport;
  
  async connect(config: SimpleConfig): Promise<void>
  async listTools(): Promise<Tool[]>
  async callTool(name: string, args: any): Promise<any>
  async disconnect(): Promise<void>
}
```

**Features**:
- Direct SDK Client usage
- Basic transport creation (stdio/http only)
- No reconnection logic
- No health checks
- No event emission
- No error wrapping (use SDK errors directly)

#### 2. McpToolAdapter (~150 lines)
**Purpose**: Convert MCP tools to MiniAgent BaseTool interface

```typescript
class McpToolAdapter extends BaseTool {
  constructor(mcpTool: Tool, manager: SimpleMcpManager)
  async execute(params: any): Promise<ToolResult>
  private convertMcpResult(result: any): ToolResult
}
```

**Features**:
- Simple parameter validation using tool schema
- Direct result conversion
- No caching or optimization
- No metadata tracking

#### 3. TransportFactory (~100 lines)
**Purpose**: Create SDK transport instances

```typescript
class TransportFactory {
  static createStdio(config: StdioConfig): StdioTransport
  static createHttp(config: HttpConfig): HttpTransport
}
```

**Features**:
- Only stdio and HTTP transports
- No WebSocket support (complex)
- No custom transport implementations

## Integration Flow

### 1. Simple Connection
```typescript
const manager = new SimpleMcpManager();
await manager.connect({
  type: 'stdio',
  command: 'mcp-server',
  args: ['--config', 'config.json']
});
```

### 2. Tool Discovery
```typescript
const tools = await manager.listTools();
const adapters = tools.map(tool => new McpToolAdapter(tool, manager));
```

### 3. Tool Execution
```typescript
const result = await adapter.execute({ query: "test" });
// Result automatically converted to MiniAgent format
```

## What to DELETE

### Remove Entire Directories
- `src/mcp/transports/` - Custom transport implementations
- `src/mcp/sdk/` - Custom SDK wrapper
- `src/mcp/__tests__/` - All existing tests (will rewrite minimal ones)

### Remove Files
- `src/mcp/interfaces.ts` - 750+ lines of custom interfaces
- `src/mcp/mcpClient.ts` - Custom client implementation
- `src/mcp/mcpConnectionManager.ts` - Connection management
- `src/mcp/mcpToolAdapter.ts` - Current complex adapter
- `src/mcp/schemaManager.ts` - Schema caching system
- `src/mcp/mcpSdkTypes.ts` - Custom type definitions
- All existing examples with complex configurations

### Total Deletion: ~3000+ lines of code

## What to KEEP

### Keep and Simplify
- Basic MCP integration concept
- Tool adapter pattern (simplified)
- Integration with MiniAgent's tool system

### Keep from SDK
- `@modelcontextprotocol/sdk` package
- SDK's Client class
- SDK's transport implementations
- SDK's type definitions
- SDK's error handling

## File Structure (New)
```
src/mcp/
├── index.ts              # ~50 lines  - Public API
├── SimpleMcpManager.ts   # ~200 lines - Core functionality
├── McpToolAdapter.ts     # ~150 lines - Tool conversion
├── TransportFactory.ts   # ~100 lines - Transport creation
└── types.ts             # ~50 lines  - Minimal types
```

**Total: ~550 lines** (target: <500 lines)

## Implementation Strategy

### Phase 1: Delete Everything
1. Remove all existing MCP implementation files
2. Remove complex examples
3. Update package exports

### Phase 2: Minimal Implementation
1. Create SimpleMcpManager with direct SDK usage
2. Create minimal McpToolAdapter
3. Create basic TransportFactory
4. Add simple types file

### Phase 3: Integration
1. Update main exports
2. Create one basic example
3. Write minimal tests

## Success Criteria

### Quantitative
- [ ] Total implementation < 500 lines
- [ ] Only 4-5 files in src/mcp/
- [ ] Direct SDK usage throughout
- [ ] No custom protocol implementation

### Qualitative
- [ ] Code is self-explanatory
- [ ] No unnecessary abstractions
- [ ] Follows MiniAgent patterns
- [ ] Minimal API surface

### Functional
- [ ] Can connect to MCP servers
- [ ] Can list and execute tools
- [ ] Results integrate with MiniAgent
- [ ] Basic error handling works

## Migration Path

### For Users
No backward compatibility - this is a breaking change by design.

Users must:
1. Update to simplified configuration format
2. Remove complex MCP configurations
3. Use direct SDK patterns

### Configuration Simplification
**Before** (complex):
```typescript
const config = {
  enabled: true,
  servers: [{
    name: 'server',
    transport: { /* complex config */ },
    autoConnect: true,
    healthCheckInterval: 5000,
    capabilities: { /* complex */ },
    retry: { /* complex */ }
  }]
};
```

**After** (minimal):
```typescript
const config = {
  type: 'stdio',
  command: 'mcp-server',
  args: ['--config', 'config.json']
};
```

## Implementation Notes

### Direct SDK Usage Patterns
```typescript
// Use SDK Client directly - no wrapper
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'mini-agent', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'mcp-server',
  args: []
});

await client.connect(transport);
```

### Minimal Error Handling
```typescript
// Use SDK errors directly - no custom wrapping
try {
  const result = await client.callTool({ name: 'tool', arguments: {} });
  return result;
} catch (error) {
  // Let SDK errors bubble up - minimal handling only
  throw error;
}
```

### Simple Result Conversion
```typescript
// Basic conversion - no complex transformations
private convertResult(mcpResult: any): ToolResult {
  const textContent = mcpResult.content
    ?.filter(item => item.type === 'text')
    ?.map(item => item.text)
    ?.join('\n') || '';
    
  return new DefaultToolResult({
    success: true,
    data: textContent
  });
}
```

This architecture achieves maximum simplicity by:
1. Removing all custom MCP implementations (3000+ lines deleted)
2. Using SDK directly with minimal wrappers
3. Focusing only on core functionality: connect, list, execute
4. Eliminating all complex features like reconnection, health checks, caching
5. Providing clean integration with MiniAgent's existing tool system