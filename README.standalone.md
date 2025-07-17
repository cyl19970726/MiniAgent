# Universal AI Agent Framework

A powerful, platform-agnostic agent framework that provides a foundation for building autonomous AI agents with tool execution capabilities. This framework is designed to work with multiple LLM providers while maintaining clean abstractions and extensibility.

## Features

- **Platform Agnostic**: Works with any LLM provider (Gemini, OpenAI, etc.)
- **Tool Execution**: Comprehensive tool scheduling and execution system
- **Event-Driven**: Real-time event emission for monitoring and integration
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Extensible**: Abstract base classes for easy customization
- **Independent**: Can be extracted as a standalone package

## Architecture

The framework consists of several key components:

### Core Interfaces

- **IAgent**: Main agent interface with conversation processing
- **IChat**: Platform-agnostic chat management
- **IToolScheduler**: Tool execution coordination
- **ITool**: Tool definition and execution
- **ITurn**: Individual conversation turn management

### Base Classes

- **BaseAgent**: Abstract base class implementing core agent logic
- **ToolSchedulerAdapter**: Adapter for integrating existing tool schedulers

### Event System

Real-time events for monitoring agent activities:
- Content generation
- Tool call requests/responses
- Token usage tracking
- Error handling
- Model fallback events

## Quick Start

### Basic Usage

```typescript
import { BaseAgent, IAgentConfig, AgentEvent } from '@gemini-tool/agent';

// Extend BaseAgent for your specific LLM provider
class MyAgent extends BaseAgent {
  // Implement required abstract methods
  getChat() { /* return your chat implementation */ }
  getToolScheduler() { /* return your tool scheduler */ }
  
  async* process(userInput: string, sessionId: string, signal: AbortSignal) {
    // Implement conversation processing
    for await (const event of this.processConversation(userInput)) {
      yield event;
    }
  }
}

// Create and use the agent
const config: IAgentConfig = {
  model: 'gemini-pro',
  workingDirectory: process.cwd(),
  sessionId: 'my-session',
};

const agent = new MyAgent(config);

// Process user input
for await (const event of agent.process('Hello!', 'session-1', signal)) {
  console.log('Agent event:', event);
}
```

### With Tool Scheduler Integration

```typescript
import { 
  BaseAgent, 
  ToolSchedulerAdapter, 
  IToolScheduler,
  IToolCallRequestInfo 
} from '@gemini-tool/agent';

class MyAgentWithTools extends BaseAgent {
  private toolScheduler: IToolScheduler;
  
  constructor(config: IAgentConfig, coreScheduler: any) {
    super(config);
    this.toolScheduler = new ToolSchedulerAdapter(coreScheduler, {
      approvalMode: 'default',
      onAllToolCallsComplete: (calls) => this.handleToolsComplete(calls),
    });
  }
  
  getToolScheduler() {
    return this.toolScheduler;
  }
  
  private async handleToolsComplete(calls: ICompletedToolCall[]) {
    // Handle completed tool executions
    await this.handleToolCallsComplete(calls, new AbortController().signal);
  }
}
```

## Configuration

### Agent Configuration

```typescript
interface IAgentConfig {
  model: string;                    // AI model to use
  workingDirectory: string;         // Working directory for file operations
  apiKey?: string;                  // API key for authentication
  sessionId?: string;               // Session identifier
  maxHistorySize?: number;          // Max history records
  maxHistoryTokens?: number;        // Max tokens in history
  debugMode?: boolean;              // Enable debug mode
  toolSchedulerConfig?: IToolSchedulerConfig;
  providerConfig?: Record<string, unknown>;
}
```

### Tool Scheduler Configuration

```typescript
interface IToolSchedulerConfig {
  toolRegistry: Promise<unknown>;
  outputUpdateHandler?: IOutputUpdateHandler;
  onAllToolCallsComplete?: IAllToolCallsCompleteHandler;
  onToolCallsUpdate?: IToolCallsUpdateHandler;
  approvalMode?: 'default' | 'yolo' | 'always';
  getPreferredEditor?: () => string | undefined;
  config?: unknown;
}
```

## Event Handling

The framework provides comprehensive event emission for monitoring:

```typescript
agent.onEvent('monitor', (event: AgentEvent) => {
  switch (event.type) {
    case AgentEventType.Content:
      console.log('Generated content:', event.data);
      break;
    case AgentEventType.ToolCallRequest:
      console.log('Tool requested:', event.data);
      break;
    case AgentEventType.ToolCallResponse:
      console.log('Tool completed:', event.data);
      break;
    case AgentEventType.TokenUsage:
      console.log('Token usage:', event.data);
      break;
    case AgentEventType.Error:
      console.error('Agent error:', event.data);
      break;
  }
});
```

## Tool Development

Define tools using the ITool interface:

```typescript
import { ITool, ToolResult, ToolDeclaration } from '@gemini-tool/agent';

class MyTool implements ITool {
  name = 'my-tool';
  description = 'A sample tool';
  schema: ToolDeclaration = {
    name: 'my-tool',
    description: 'A sample tool',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input text' }
      },
      required: ['input']
    }
  };
  isOutputMarkdown = false;
  canUpdateOutput = false;
  
  validateToolParams(params: any): string | null {
    if (!params.input) return 'Input is required';
    return null;
  }
  
  getDescription(params: any): string {
    return `Process input: ${params.input}`;
  }
  
  async shouldConfirmExecute(params: any, signal: AbortSignal) {
    // Return confirmation details if needed, or false to execute immediately
    return false;
  }
  
  async execute(params: any, signal: AbortSignal): Promise<ToolResult> {
    // Implement tool logic
    return {
      summary: `Processed: ${params.input}`,
      llmContent: `Result: ${params.input.toUpperCase()}`,
      returnDisplay: `✓ Processed "${params.input}"`
    };
  }
}
```

## Building Standalone

The package can be built independently using ESNext:

```bash
# Build with standalone configuration
npm run build:standalone

# Watch mode for development
npm run dev:standalone
```

The standalone build uses `tsconfig.standalone.json` with ESNext target and modern module resolution.

## Integration Examples

### Gemini Integration

```typescript
import { GeminiAgent, createGeminiAgent } from '@gemini-tool/agent';

const agent = await createGeminiAgent({
  model: 'gemini-pro',
  workingDirectory: process.cwd(),
  geminiClient: myGeminiClient,
  toolRegistry: myToolRegistry,
  coreConfig: myCoreConfig,
});

for await (const event of agent.process('Build a web app', 'session-1', signal)) {
  // Handle agent events
}
```

### Custom Provider Integration

```typescript
class OpenAIAgent extends BaseAgent {
  private openaiClient: OpenAI;
  
  constructor(config: IAgentConfig, client: OpenAI) {
    super(config);
    this.openaiClient = client;
  }
  
  getChat(): IChat {
    return new OpenAIChatWrapper(this.openaiClient);
  }
  
  getToolScheduler(): IToolScheduler {
    return new OpenAIToolScheduler(this.openaiClient);
  }
  
  // Implement process method...
}
```

## TypeScript Support

The framework provides comprehensive TypeScript definitions:

- Full type safety for all interfaces
- Generic type parameters for extensibility
- Type guards for runtime type checking
- Detailed JSDoc documentation

## Best Practices

1. **Error Handling**: Always emit error events for failures
2. **Token Management**: Monitor token usage and emit usage events
3. **Abort Signals**: Respect abort signals for cancellation
4. **Event Emission**: Emit relevant events for monitoring
5. **Tool Validation**: Always validate tool parameters
6. **History Management**: Properly manage conversation history

## Contributing

This framework is designed to be:
- **Modular**: Each component can be used independently
- **Extensible**: Easy to add new providers and capabilities
- **Maintainable**: Clean abstractions and clear interfaces
- **Testable**: Comprehensive interfaces enable easy mocking

## License

Apache 2.0 - See LICENSE file for details.