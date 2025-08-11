# Agent Framework Examples

This directory contains examples demonstrating how to use the Agent framework with multiple chat providers and advanced features.

## Examples

### Core Examples
1. **basicExample.ts** - Core agent functionality with multiple chat providers
2. **sessionManagerExample.ts** - Advanced session management and conversation isolation
3. **providerComparison.ts** - Performance comparison between different chat providers
4. **tools.ts** - Reusable tool definitions for weather and calculation functions

### MCP Integration Examples
5. **mcp-simple.ts** - Simple, clean MCP client example showing basic connection and tool execution (< 50 lines)
6. **mcp-with-agent.ts** - Integration of MCP tools with StandardAgent using createMcpTools helper (< 80 lines)
7. **mcp-sdk-example.ts** - Advanced MCP SDK integration (deprecated, use mcp-simple.ts for basic usage)
8. **mcp-sdk-advanced.ts** - Advanced MCP patterns (deprecated, use mcp-with-agent.ts for agent integration)
9. **mcp-migration.ts** - Migration guide from old MCP implementation (deprecated)
10. **mcp-basic-example.ts** - Legacy MCP example (deprecated, use mcp-simple.ts instead)
11. **mcp-advanced-example.ts** - Legacy advanced MCP (deprecated, use mcp-with-agent.ts instead)
12. **mcpToolAdapterExample.ts** - Legacy tool adapter (deprecated, use createMcpTools() helper instead)

## Running basicExample.ts

The basic example demonstrates core agent functionality with support for multiple chat providers (Gemini, OpenAI, OpenAI Response API).

### Command Line Usage

```bash
# Show help
npx tsx examples/basicExample.ts --help

# Test specific providers
npm run example:gemini                    # Test Gemini only
npm run example:openai-basic             # Test OpenAI Chat Completions
npm run example:openai-response          # Test OpenAI Response API
npm run example:all                      # Test all providers

# Direct command line usage
npx tsx examples/basicExample.ts --gemini
npx tsx examples/basicExample.ts --openai --openairep
npx tsx examples/basicExample.ts --all
```

### API Keys Required

- `GEMINI_API_KEY`: Required for Gemini provider
- `OPENAI_API_KEY`: Required for OpenAI providers

Set your API keys:
```bash
export GEMINI_API_KEY="your-gemini-key-here"
export OPENAI_API_KEY="your-openai-key-here"
```

### Command Line Arguments

- `--help, -h`: Show help message
- `--gemini`: Test Gemini provider
- `--openai`: Test OpenAI Chat Completions
- `--openairep`: Test OpenAI Response API
- `--all`: Test all available providers

## Running sessionManagerExample.ts

The session manager example demonstrates advanced session management capabilities including:

- **Multi-Session Conversations**: Creating and managing multiple isolated conversation sessions
- **Session Switching**: Seamlessly switching between sessions while preserving context
- **Weather Comparisons**: Temperature comparisons across different city pairs in separate sessions:
  - Session 1: Beijing vs Shanghai temperature comparison
  - Session 2: Shanghai vs Guangzhou temperature comparison  
  - Back to Session 1: Guangzhou vs Shenzhen temperature comparison
- **Session State Management**: Automatic session history preservation and restoration

### Usage

```bash
# Run with Gemini (default)
npx tsx examples/sessionManagerExample.ts

# Run with OpenAI 
CHAT_PROVIDER=openai npx tsx examples/sessionManagerExample.ts

# With API key
GEMINI_API_KEY="your-key" npx tsx examples/sessionManagerExample.ts
OPENAI_API_KEY="your-key" CHAT_PROVIDER=openai npx tsx examples/sessionManagerExample.ts
```

### What You'll See

1. **Session Creation**: Two separate conversation sessions are created
2. **Weather Comparisons**: Each session handles different city temperature comparisons
3. **Session Switching**: Demonstrates switching back to the first session for additional queries
4. **History Preservation**: Each session maintains its own conversation history
5. **Session Status**: Final summary showing all sessions, their metadata, and conversation histories

### Key Features Demonstrated

- `createNewSession()`: Create new conversation sessions with custom titles
- `switchToSession()`: Switch between existing sessions
- `processWithSession()`: Process user input within a specific session context
- `getSessions()`: Retrieve all session metadata
- Session isolation: Each session maintains independent conversation history and context

## MCP Integration Examples

The Model Context Protocol (MCP) examples demonstrate how to connect MiniAgent with MCP servers for enhanced tool capabilities.

### mcp-simple.ts - Basic MCP Connection

Simple, clean example showing fundamental MCP usage (< 50 lines):

- **stdio Transport**: Connect to MCP test server via stdio
- **Tool Discovery**: List available tools from server
- **Tool Execution**: Execute MCP tools directly
- **Clean Disconnection**: Proper resource cleanup

```bash
# Run simple MCP example
npx tsx examples/mcp-simple.ts

# Using npm scripts
npm run example:mcp-simple
```

#### Available Test Tools

The test server provides these tools for testing:
- **add**: Add two numbers (a: number, b: number)
- **echo**: Echo a message (message: string)
- **test_search**: Search with optional limit (query: string, limit?: number)

### mcp-with-agent.ts - MCP + StandardAgent Integration

Shows how to integrate MCP tools with MiniAgent's StandardAgent (< 80 lines):

- **Tool Adapter**: Use `createMcpTools()` helper to adapt MCP tools
- **Agent Integration**: Add MCP tools to StandardAgent
- **Conversation Flow**: Natural conversation using MCP tools
- **Session Management**: Demonstrate session-based interaction

```bash
# Run MCP + Agent example (requires GEMINI_API_KEY)
GEMINI_API_KEY="your-key" npx tsx examples/mcp-with-agent.ts

# Using npm scripts
npm run example:mcp-agent
```

#### Key Features Demonstrated

- `SimpleMcpClient` - Basic MCP client for stdio/SSE connections
- `createMcpTools()` - Helper to create tool adapters from MCP server
- `StandardAgent` integration with MCP tools
- Real-time tool execution in conversation context

## Legacy MCP Examples (Deprecated)

⚠️ **The following examples are complex and should not be used for new projects. Use the simple examples above instead.**

### mcp-sdk-example.ts - Basic MCP SDK Integration

Demonstrates fundamental MCP SDK integration patterns:

- **Transport Types**: stdio, SSE, WebSocket, and Streamable HTTP
- **Enhanced Configuration**: timeouts, reconnection, health checks
- **Tool Discovery**: with filtering and metadata
- **SDK Features**: connection state monitoring, performance optimization

```bash
# Run basic SDK example
npx tsx examples/mcp-sdk-example.ts

# Run transport types demo
npx tsx examples/mcp-sdk-example.ts --transports

# Using npm scripts
npm run example:mcp-sdk        # Basic example
```

#### Key Features Demonstrated

- `McpSdkClientAdapter` - Enhanced client with SDK integration
- `createMcpSdkToolAdapters()` - Tool discovery with rich options
- `registerMcpToolsWithScheduler()` - Direct scheduler registration
- `checkMcpSdkSupport()` - Feature availability checking
- Connection health monitoring and automatic reconnection
- Performance optimization with schema caching

### mcp-sdk-advanced.ts - Advanced MCP Patterns

Demonstrates production-ready MCP integration:

- **Multi-Server Management**: Connection manager for multiple MCP servers
- **Advanced Error Handling**: Resilience and recovery patterns
- **Performance Optimization**: Connection pooling and caching
- **Health Monitoring**: Custom health checks and diagnostics
- **Resource Management**: Proper cleanup and lifecycle management

```bash
# Run advanced example
npx tsx examples/mcp-sdk-advanced.ts

# Run streaming demo
npx tsx examples/mcp-sdk-advanced.ts --streaming

# Using npm scripts
npm run example:mcp-advanced   # Advanced patterns
```

#### Key Features Demonstrated

- `McpSdkConnectionManager` - Multi-server management
- `batchRegisterMcpTools()` - Bulk tool registration
- `TransportHealthMonitor` - Health monitoring system
- `globalTransportPool` - Connection pooling
- Advanced error recovery and graceful degradation
- Performance monitoring and optimization

### mcp-migration.ts - Migration Guide

Comprehensive migration guide from legacy MCP to SDK:

- **Side-by-Side Comparison**: Old vs new implementation patterns
- **Configuration Migration**: Legacy config conversion helpers
- **Feature Parity**: Detailed feature comparison matrix
- **Performance Comparison**: Before/after performance metrics
- **Gradual Migration**: Strategies for production migration

```bash
# Run migration example
npx tsx examples/mcp-migration.ts

# Using npm scripts  
npm run example:mcp-migration  # Migration guide
```

#### Migration Benefits

- **Official SDK Compliance**: Future-proof integration
- **Enhanced Error Handling**: Better error information and recovery
- **Performance Improvements**: 20-60% faster operations with caching
- **Multiple Transports**: stdio, SSE, WebSocket, Streamable HTTP
- **Advanced Features**: Reconnection, health monitoring, connection pooling

### Legacy MCP Examples (Deprecated)

⚠️ **The following examples are deprecated and should not be used in new projects:**

- **mcp-basic-example.ts** - Use `mcp-sdk-example.ts` instead
- **mcp-advanced-example.ts** - Use `mcp-sdk-advanced.ts` instead  
- **mcpToolAdapterExample.ts** - Use SDK integration helpers instead

These examples remain for reference during migration but lack the enhanced features, reliability, and performance of the new SDK integration.

### MCP Server Requirements

The examples use a built-in test server at `examples/utils/server.ts`. To run examples:

1. **No external setup needed** - test server runs automatically
2. **API Key required** for agent examples: Set `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY`

For advanced use with external MCP servers, install common servers:

```bash
# File system server
npm install -g @modelcontextprotocol/server-filesystem

# Database server  
pip install mcp-server-sqlite

# Everything server (for testing)
npm install -g @modelcontextprotocol/server-everything
```

### Environment Variables

MCP examples require API keys for the AI providers:

```bash
export GOOGLE_AI_API_KEY="your-gemini-key"
export OPENAI_API_KEY="your-openai-key" 
```

### NPM Scripts for MCP Examples

Add these to your package.json scripts section:

```json
{
  "example:mcp-simple": "npx tsx examples/mcp-simple.ts",
  "example:mcp-agent": "npx tsx examples/mcp-with-agent.ts"
}
```