# MiniAgent Framework

A TypeScript-first, streaming-only AI agent framework for building autonomous agents with sophisticated tool execution capabilities.

## Install 
```bash
pnpm install @continue-reasoning/mini-agent
```

## Features

### LLM Providers
- [x] **Gemini** - Google Gemini 2.0 Flash with native tool calling
- [x] **OpenAI** - GPT-4o with function calling and response caching
- [ ] Anthropic Claude (coming soon)
- [ ] Vercel AI SDK integration (planned)

### Core Features
- [x] **Session Management** - Multi-session conversation handling with isolation
- [x] **Event Stream** - Comprehensive real-time event system (20+ event types)
- [x] **Streaming-Only** - All responses are streamed for optimal UX
- [x] **Tool Scheduler** - Sophisticated tool execution with approval workflows
- [x] **Token Tracking** - Real-time usage monitoring with automatic history management
- [x] **BaseTool System** - Extensible tool creation with built-in validation and lifecycle
- [x] **Type Safety** - Full TypeScript support with comprehensive interfaces

### Advanced Features
- [x] **Tool Confirmation** - User approval workflows for destructive operations
- [x] **Parallel Execution** - Concurrent tool execution with state management
- [x] **Abort Control** - Comprehensive cancellation and timeout support
- [x] **Error Recovery** - Graceful error handling with detailed error events
- [x] **History Management** - Automatic context window management
- [x] **Output Streaming** - Real-time tool output updates during execution

### External Integrations
- [ ] **MCP Support** - Model Context Protocol integration (in development)
- [ ] **Plugin System** - External tool discovery and loading

## Key Design Principles

1. **Streaming-First**: All responses are streamed by default - non-streaming is implemented by collecting stream chunks
2. **Interface-Driven**: Clean TypeScript interfaces with flexible implementations (BaseAgent, StandardAgent)
3. **Platform-Agnostic**: Provider-agnostic design that works with any LLM (Gemini, OpenAI, etc.)
4. **Event-Based**: Rich event system with 20+ event types for comprehensive monitoring
5. **Type-Safe**: Full TypeScript support with generics for tools and comprehensive interface definitions
6. **Session-Aware**: Built-in multi-session management with isolated conversation contexts

## Architecture

<img width="5048" height="4694" alt="image" src="https://github.com/user-attachments/assets/224fc7b5-994c-4a3b-8aa0-174518967e45" />

```
StandardAgent (Session-Aware Agent)
├── BaseAgent (Core Implementation)
│   ├── IChat (LLM Interface)
│   │   ├── GeminiChat (Google Gemini Implementation)
│   │   └── OpenAIChat (OpenAI GPT Implementation)
│   ├── IToolScheduler (Tool Execution)
│   │   └── CoreToolScheduler (Parallel execution with approval workflows)
│   └── ITokenTracker (Token Monitoring)
│       └── TokenTracker (Real-time usage tracking)
├── SessionManager (Multi-session Management)
└── AgentEvent (Event System - 20+ event types)
```

### Core Components

- **StandardAgent**: Session-aware agent with multi-conversation management
- **BaseAgent**: Core orchestrator implementing the main agent processing loop
- **IChat**: Streaming-first chat interface supporting multiple LLM providers
- **IToolScheduler**: Advanced tool execution with parallel processing and user confirmation
- **ITokenTracker**: Real-time token usage monitoring with automatic history management
- **SessionManager**: Isolated conversation contexts with persistence support
- **AgentEvent**: Comprehensive event system for real-time monitoring and integration

## Usage Example

### Quick Start

```typescript
import { StandardAgent, AgentEventType, AllConfig } from '@continue-reasoning/mini-agent';
import { BaseTool, DefaultToolResult, Type } from '@continue-reasoning/mini-agent';

// 1. Create a custom tool using BaseTool
export class WeatherTool extends BaseTool<
  { latitude: number; longitude: number }, 
  { temperature: number; location: string }
> {
  constructor() {
    super(
      'get_weather',                          // Tool name
      'Weather Tool',                         // Display name
      'Get current weather temperature',      // Description
      {
        type: Type.OBJECT,
        properties: {
          latitude: { type: Type.NUMBER, description: 'Latitude coordinate' },
          longitude: { type: Type.NUMBER, description: 'Longitude coordinate' }
        },
        required: ['latitude', 'longitude']
      },
      true,  // isOutputMarkdown
      true   // canUpdateOutput for real-time updates
    );
  }

  override validateToolParams(params: { latitude: number; longitude: number }): string | null {
    if (params.latitude < -90 || params.latitude > 90) {
      return 'Latitude must be between -90 and 90';
    }
    if (params.longitude < -180 || params.longitude > 180) {
      return 'Longitude must be between -180 and 180';
    }
    return null;
  }

  async execute(
    params: { latitude: number; longitude: number },
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<DefaultToolResult<{ temperature: number; location: string }>> {
    try {
      // Check for cancellation
      this.checkAbortSignal(signal, 'Weather fetch');
      
      // Update progress in real-time
      if (updateOutput) {
        updateOutput(this.formatProgress('Fetching weather', 'Connecting to API...', '🌤️'));
      }
      
      // Simulate API call
      const temperature = Math.round(Math.random() * 35 + 5); // 5-40°C
      
      if (updateOutput) {
        updateOutput(this.formatProgress('Weather retrieved', `${temperature}°C`, '✅'));
      }
      
      const result = { temperature, location: `${params.latitude},${params.longitude}` };
      
      return new DefaultToolResult(this.createResult(
        `Weather: ${temperature}°C at coordinates ${params.latitude}, ${params.longitude}`,
        `🌤️ Temperature: **${temperature}°C**`,
        `Retrieved weather: ${temperature}°C`
      ));
      
    } catch (error) {
      return new DefaultToolResult(this.createErrorResult(error, 'Weather fetch'));
    }
  }
}

// 2. Configure and create the agent
const config: AllConfig = {
  agentConfig: {
    model: 'gpt-4o',                          // or 'gemini-2.0-flash'
    workingDirectory: process.cwd(),
    apiKey: process.env.OPENAI_API_KEY,       // or GEMINI_API_KEY
    maxHistoryTokens: 100000,
  },
  chatConfig: {
    apiKey: process.env.OPENAI_API_KEY,       // or GEMINI_API_KEY
    modelName: 'gpt-4o',                      // or 'gemini-2.0-flash'
    tokenLimit: 128000,
    systemPrompt: 'You are a helpful assistant with weather capabilities.',
  },
  toolSchedulerConfig: {
    approvalMode: 'yolo',                     // Auto-approve for demo
  },
};

// 3. Create agent with tools
const agent = new StandardAgent([new WeatherTool()], config);

// 4. Process user input with streaming
const userInput = 'What is the weather like in Tokyo (latitude: 35.6762, longitude: 139.6503)?';

for await (const event of agent.processWithSession(userInput)) {
  switch (event.type) {
    case AgentEventType.ResponseChunkTextDelta:
      // Real-time text streaming
      process.stdout.write(event.data.content.text_delta);
      break;
      
    case AgentEventType.ToolExecutionStart:
      console.log(`🔧 Executing: ${event.data.toolName}`);
      break;
      
    case AgentEventType.ToolExecutionDone:
      console.log(`✅ Completed: ${event.data.toolName}`);
      break;
      
    case AgentEventType.ResponseComplete:
      console.log('\n✨ Response complete');
      break;
  }
}
```

### Multi-Session Management

```typescript
import { StandardAgent } from '@continue-reasoning/mini-agent';

// Create agent with session management
const agent = new StandardAgent(tools, config);

// Create multiple conversation sessions
const session1 = agent.createNewSession('Weather Analysis');
const session2 = agent.createNewSession('Math Calculations');

// Use different sessions for different conversations
for await (const event of agent.processWithSession('What is the weather in Tokyo?', session1)) {
  // Handle weather conversation in session1
}

for await (const event of agent.processWithSession('Calculate 15 + 27', session2)) {
  // Handle math conversation in session2 
}

// Switch between sessions
agent.switchToSession(session1);
for await (const event of agent.processWithSession('How about the weather in London?', session1)) {
  // Continue weather conversation in session1
}

// Get session information
const sessions = agent.getSessions();
sessions.forEach(session => {
  console.log(`Session: ${session.title}`);
  console.log(`Messages: ${session.messageHistory.length}`);
  console.log(`Tokens: ${session.tokenUsage.totalTokens}`);
});
```

## Event System

MiniAgent provides a comprehensive event system with 20+ event types for real-time monitoring:

### Core Event Types

| Event Type | Description | Data Structure |
|------------|-------------|----------------|
| **LLM Response Events** |
| `ResponseChunkTextDelta` | Real-time text streaming | `{ content: { text_delta: string } }` |
| `ResponseChunkTextDone` | Text complete | `{ content: { text: string } }` |
| `ResponseChunkThinkingDelta` | Thinking process | `{ content: { thinking_delta: string } }` |
| `ResponseComplete` | Response finished | `{ response_id: string, usage: TokenUsage }` |
| **Tool Execution Events** |
| `ToolExecutionStart` | Tool begins execution | `{ toolName: string, callId: string, args: any }` |
| `ToolExecutionDone` | Tool completes | `{ toolName: string, result?: any, error?: string }` |
| **Session Events** |
| `UserMessage` | User input processed | `{ content: string, sessionId: string, turn: number }` |
| `TurnComplete` | Conversation turn done | `{ sessionId: string, turn: number, hasToolCalls: boolean }` |
| **Error Events** |
| `Error` | General errors | `{ message: string, timestamp: number }` |
| `ResponseFailed` | LLM response failed | `{ response_id: string, error: ErrorDetails }` |

### Event Handling Best Practices

1. **Handle streaming events** - Use `ResponseChunkTextDelta` for real-time UI updates
2. **Monitor tool execution** - Track tool progress with `ToolExecutionStart/Done` events
3. **Use AbortController** - Implement timeout and cancellation control
4. **Error handling** - Listen for `Error` and `ResponseFailed` events
5. **Token monitoring** - Track usage with `ResponseComplete` event data

### Complete Event Flow Example

```typescript
// Set up proper error handling and timeouts
const abortController = new AbortController();
setTimeout(() => abortController.abort(), 30000); // 30 second timeout

let assistantResponse = '';

try {
  for await (const event of agent.processWithSession(userInput, sessionId, abortController.signal)) {
    switch (event.type) {
      case AgentEventType.UserMessage:
        console.log('👤 Processing user input...');
        break;
        
      case AgentEventType.ResponseChunkTextDelta:
        // Real-time text streaming
        const delta = event.data.content.text_delta;
        process.stdout.write(delta);
        assistantResponse += delta;
        break;
        
      case AgentEventType.ResponseChunkTextDone:
        console.log('\n✅ Text response complete');
        break;
        
      case AgentEventType.ToolExecutionStart:
        console.log(`🔧 Executing tool: ${event.data.toolName}`);
        break;
        
      case AgentEventType.ToolExecutionDone:
        if (event.data.error) {
          console.log(`❌ Tool failed: ${event.data.toolName}`);
        } else {
          console.log(`✅ Tool completed: ${event.data.toolName}`);
        }
        break;
        
      case AgentEventType.ResponseComplete:
        console.log(`📊 Tokens used: ${event.data.usage?.totalTokens || 0}`);
        break;
        
      case AgentEventType.TurnComplete:
        console.log('🔄 Conversation turn completed');
        break;
        
      case AgentEventType.Error:
        console.error('❌ Error:', event.data.message);
        break;
    }
  }
} catch (error) {
  if (abortController.signal.aborted) {
    console.log('⏰ Operation timed out');
  } else {
    console.error('💥 Unexpected error:', error);
  }
}
```

## Tool Execution System

The framework provides sophisticated tool execution with approval workflows and real-time monitoring:

### Tool Scheduler Callbacks

Configure callbacks to monitor tool execution lifecycle:

```typescript
const config: AllConfig = {
  toolSchedulerConfig: {
    approvalMode: 'default', // 'yolo' | 'always' | 'default'
    
    // 1. Real-time tool output streaming
    outputUpdateHandler: (callId: string, output: string) => {
      console.log(`[${callId}] ${output}`);
      // Stream to UI in real-time
    },
    
    // 2. Tool state change notifications  
    onToolCallsUpdate: (toolCalls: IToolCall[]) => {
      toolCalls.forEach(call => {
        console.log(`Tool ${call.request.name}: ${call.status}`);
        
        if (call.status === 'awaiting_approval') {
          // Handle confirmation UI
          handleToolConfirmation(call);
        }
      });
    },
    
    // 3. Batch completion handler
    onAllToolCallsComplete: (completed: ICompletedToolCall[]) => {
      const successful = completed.filter(tc => tc.status === 'success').length;
      const failed = completed.filter(tc => tc.status === 'error').length;
      console.log(`Batch complete: ${successful} successful, ${failed} failed`);
    }
  }
};
```

### Tool Approval Modes

```typescript
// Auto-approve all tools (good for demos)
approvalMode: 'yolo'

// Always require user confirmation  
approvalMode: 'always'

// Let each tool decide (based on tool.shouldConfirmExecute)
approvalMode: 'default'
```

### Tool Confirmation Workflow

```typescript
import { ToolConfirmationOutcome } from '@continue-reasoning/mini-agent';

async function handleToolConfirmation(toolCall: IWaitingToolCall) {
  const { confirmationDetails } = toolCall;
  
  // Show confirmation UI based on tool type
  const userChoice = await showConfirmationDialog({
    title: confirmationDetails.title,
    message: confirmationDetails.prompt,
    toolName: toolCall.request.name,
    args: toolCall.request.args
  });
  
  // Send response back to scheduler
  await agent.getToolScheduler().handleConfirmationResponse(
    toolCall.request.callId,
    userChoice ? ToolConfirmationOutcome.ProceedOnce : ToolConfirmationOutcome.Cancel
  );
}
```

## Getting Started

### Installation

```bash
# Install MiniAgent
pnpm install @continue-reasoning/mini-agent

# Set up environment variables
echo "OPENAI_API_KEY=your_openai_key" >> .env
echo "GEMINI_API_KEY=your_gemini_key" >> .env
```

### Basic Example

```typescript
import { StandardAgent, BaseTool, AllConfig } from '@continue-reasoning/mini-agent';

// 1. Create a simple tool
class GreetingTool extends BaseTool<{ name: string }, { greeting: string }> {
  constructor() {
    super('greet', 'Greeting Tool', 'Generate a personalized greeting', {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name to greet' } },
      required: ['name']
    });
  }

  async execute(params, signal) {
    return new DefaultToolResult(this.createResult(
      `Hello, ${params.name}! Nice to meet you.`,
      `👋 Hello, **${params.name}**!`,
      `Greeted ${params.name}`
    ));
  }
}

// 2. Configure agent
const config: AllConfig = {
  agentConfig: {
    model: 'gpt-4o',
    workingDirectory: process.cwd(),
    apiKey: process.env.OPENAI_API_KEY
  },
  chatConfig: {
    apiKey: process.env.OPENAI_API_KEY,
    modelName: 'gpt-4o',
    tokenLimit: 128000,
    systemPrompt: 'You are a helpful assistant with greeting capabilities.'
  },
  toolSchedulerConfig: { approvalMode: 'yolo' }
};

// 3. Create and use agent
const agent = new StandardAgent([new GreetingTool()], config);

for await (const event of agent.processWithSession('Please greet Alice')) {
  if (event.type === 'response.chunk.text.delta') {
    process.stdout.write(event.data.content.text_delta);
  }
}
```

### Examples

- **[Basic Example](./examples/basicExample.ts)** - Simple agent setup with weather tools
- **[Session Management](./examples/sessionManagerExample.ts)** - Multi-session conversation handling  
- **[Tool Creation](./examples/tools.ts)** - Custom tool implementation examples
- **[Provider Comparison](./examples/comparison.ts)** - OpenAI vs Gemini comparison

## Documentation

- **[Integration Guide](./docs/prompts/integration-dev.md)** - Complete integration guide for coding agents
- **[API Reference](./docs/api-reference.md)** - Detailed API documentation  
- **[Tool Development](./docs/tool-development.md)** - Guide for creating custom tools
- **[Architecture Overview](./docs/architecture.md)** - Framework design and principles

## Contributing

```bash
# Clone and setup
git clone https://github.com/your-org/miniagent.git
cd miniagent
pnpm install

# Build and test
pnpm build
pnpm test
pnpm lint

# Run examples
pnpm example:basic
pnpm example:session
```

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Framework Structure

```
src/
├── interfaces.ts         # Core TypeScript interfaces
├── baseAgent.ts          # Core agent implementation  
├── standardAgent.ts      # Session-aware agent
├── sessionManager.ts     # Multi-session management
├── chat/
│   ├── geminiChat.ts     # Google Gemini provider
│   └── openaiChat.ts     # OpenAI provider
├── coreToolScheduler.ts  # Tool execution engine
├── baseTool.ts           # Tool base class
├── tokenTracker.ts       # Token usage monitoring
├── agentEvent.ts         # Event system
└── examples/             # Working examples
    ├── basicExample.ts   # Simple agent usage
    ├── sessionManagerExample.ts  # Multi-session demo
    └── tools.ts          # Tool implementation examples
```
