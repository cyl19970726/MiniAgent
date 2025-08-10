# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Build the TypeScript project
npm run build

# Development mode with auto-rebuild
npm run dev

# Run tests
npm test                    # Run all tests once
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage report
npm run test:tools         # Run specific tool tests

# Lint and type checking
npm run lint               # Type check without building (tsc --noEmit)

# Run examples
npm run example            # Basic example
npm run example:gemini     # Gemini provider example
npm run example:openai     # OpenAI provider example
npm run example:comparison # Provider comparison
npm run example:weather    # Weather tool example
npm run demo              # Demo example

# Clean build artifacts
npm run clean
```

## High-Level Architecture

MiniAgent is a platform-agnostic AI agent framework built on three core principles:

### 1. Interface-Driven Design
The framework uses TypeScript interfaces (`src/interfaces.ts`) to define contracts between components. Every major component (Agent, Chat, Tool, ToolScheduler) has an interface that implementations must satisfy. This allows for:
- Multiple provider implementations (Gemini, OpenAI)
- Easy testing through mocks
- Clear separation of concerns

### 2. Event-Driven Architecture
The agent operates through an event system (`src/agentEvent.ts`) that emits events during processing:
- User messages, assistant responses, tool calls
- Token usage updates
- Turn completion events
- Error events

The main processing loop in `BaseAgent.process()` is an async generator that yields events, allowing consumers to handle them in real-time.

### 3. Tool Execution Pipeline
Tools are executed through a sophisticated pipeline managed by `CoreToolScheduler`:
- **Validation**: Tools validate parameters before execution
- **Confirmation**: Optional user confirmation for destructive operations
- **Execution**: Async execution with abort signal support
- **Output Streaming**: Real-time output updates during execution
- **Result Handling**: Structured results returned to the LLM

### Key Components

**BaseAgent** (`src/baseAgent.ts`): 
- Core orchestrator implementing the agent loop
- Manages conversation history and token limits
- Coordinates between Chat provider and Tool scheduler
- Implements streaming response handling

**StandardAgent** (`src/standardAgent.ts`):
- Session management layer built on BaseAgent
- Handles multiple concurrent conversations
- Provides simplified API for common use cases

**Chat Providers** (`src/chat/`):
- GeminiChat: Google Gemini integration with native tool support
- OpenAIChat: OpenAI integration with response caching
- Both implement streaming and tool calling

**Tool System** (`src/baseTool.ts`):
- BaseTool: Abstract class for tool implementations
- SimpleTool: Functional tool creation helper
- Tools define schemas, validation, and async execution

**CoreToolScheduler** (`src/coreToolScheduler.ts`):
- Manages parallel tool execution
- Handles confirmation workflows
- Provides real-time status updates via callbacks

### Important Patterns

1. **Streaming-First**: All chat providers use streaming responses. Non-streaming is implemented by collecting stream chunks.

2. **Token Management**: TokenTracker monitors usage against limits, enabling automatic history truncation when approaching limits.

3. **Event Callbacks**: Three levels of monitoring:
   - Event stream from `agent.process()`
   - Tool scheduler callbacks (onToolCallsUpdate, outputUpdateHandler, onAllToolCallsComplete)
   - Individual tool output handlers

4. **Error Handling**: Errors are emitted as events rather than thrown, allowing graceful recovery and user notification.

5. **Provider Abstraction**: New LLM providers only need to implement the IChat interface to integrate with the framework.

## Testing Strategy

Tests use Vitest with the following patterns:
- Unit tests for individual components
- Integration tests for agent workflows
- Mock providers for testing without API calls
- Coverage thresholds set at 80% for all metrics

## Key Files to Understand

1. `src/interfaces.ts` - All TypeScript interfaces and types
2. `src/baseAgent.ts` - Core agent implementation and processing loop
3. `src/coreToolScheduler.ts` - Tool execution orchestration
4. `src/chat/geminiChat.ts` - Reference chat provider implementation
5. `examples/basicExample.ts` - Complete usage example

## GitHub Actions Integration

The repository uses Claude Code GitHub Actions for automated code review and issue handling. Claude is triggered by mentioning `@claude` in issues, PRs, or comments.