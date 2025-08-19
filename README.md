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
- [x] **MCP Support** - Model Context Protocol integration (in development)
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
| `ResponseChunkThinkingDelta` | Thinking process streaming | `{ content: { thinking_delta: string } }` |
| `ResponseChunkThinkingDone` | Thinking process complete | `{ content: { thinking: string } }` |
| `ResponseChunkFunctionCallDelta` | Function call parameters streaming | `{ content: { functionCall: { name: string, args: string } } }` |
| `ResponseChunkFunctionCallDone` | Function call parameters complete | `{ content: { functionCall: { id: string, call_id: string, name: string, args: string } } }` |
| `ResponseComplete` | Response finished | `{ response_id: string, usage: TokenUsage }` |
| **Tool Execution Events** |
| `ToolExecutionStart` | Tool begins execution | `{ toolName: string, callId: string, args: Record<string, unknown>, sessionId: string, turn: number }` |
| `ToolExecutionDone` | Tool completes | `{ toolName: string, callId: string, result?: unknown, error?: string, duration?: number, sessionId: string, turn: number }` |
| **Session Events** |
| `UserMessage` | User input processed | `{ type: string, content: string, sessionId: string, turn: number, metadata?: any }` |
| `TurnComplete` | Conversation turn done | `{ type: string, sessionId: string, turn: number, hasToolCalls: boolean }` |
| **Error Events** |
| `Error` | General errors | `{ message: string, timestamp: number, turn: number }` |
| `ResponseFailed` | LLM response failed | `{ response_id: string, error: { code?: string, message?: string } }` |
| `ResponseIncomplete` | Response not complete | `{ response_id: string, incomplete_details: { reason: string } }` |

### Event Handling Best Practices

1. **Choose between Delta and Done events** - Don't handle both `*Delta` and `*Done` events for the same content type
   - **Delta events** (`ResponseChunkTextDelta`, `ResponseChunkThinkingDelta`, `ResponseChunkFunctionCallDelta`) - Use only when real-time streaming UX is critical
   - **Done events** (`ResponseChunkTextDone`, `ResponseChunkThinkingDone`, `ResponseChunkFunctionCallDone`) - **Recommended for most cases** - contains complete content
   - Done events contain the full aggregated content from all corresponding delta events

2. **Recommended event handling pattern**:
   ```typescript
   // ✅ Good - Handle complete content
   case AgentEventType.ResponseChunkTextDone:
     console.log('Complete response:', event.data.content.text);
     break;
   
   // ❌ Avoid - Don't handle both delta and done
   case AgentEventType.ResponseChunkTextDelta:
     // Only use when real-time streaming is essential
   case AgentEventType.ResponseChunkTextDone:
     // Don't handle both - creates duplicate content
   ```

3. **Tool execution monitoring** - **Recommended**: Use `ToolExecutionStart/Done` events for tool tracking
   - `ToolExecutionStart/Done` - **Best practice** - High-level tool execution lifecycle
   - `ResponseChunkFunctionCallDelta/Done` - **Only when needed** - Low-level function call parameter streaming
   - Function call events show LLM preparing tool calls, execution events show actual tool running

4. **Use AbortController** - Implement timeout and cancellation control  
5. **Error handling** - Listen for `Error` and `ResponseFailed` events
6. **Token monitoring** - Track usage with `ResponseComplete` event data

### Complete Event Flow Examples

#### Recommended Pattern (Using Done Events)

```typescript
import { AgentEventType } from '@continue-reasoning/mini-agent';

// ✅ Recommended - Handle complete content with Done events
const abortController = new AbortController();
setTimeout(() => abortController.abort(), 30000);

try {
  for await (const event of agent.processWithSession(userInput, sessionId, abortController.signal)) {
    switch (event.type) {
      case AgentEventType.UserMessage:
        // ✅ Type-safe access to user message data
        const userMsgData = event.data as { 
          content: string; 
          sessionId: string; 
          turn: number; 
          type: string; 
        };
        console.log(`👤 Processing user input (Turn ${userMsgData.turn}): ${userMsgData.content}`);
        break;
        
      case AgentEventType.ResponseChunkTextDone:
        // ✅ Get complete text content - recommended approach
        const textData = event.data as { content: { text: string } };
        console.log('🤖 Assistant:', textData.content.text);
        break;
        
      case AgentEventType.ResponseChunkThinkingDone:
        // ✅ Get complete thinking process if needed
        const thinkingData = event.data as { content: { thinking: string } };
        console.log('🧠 Reasoning:', thinkingData.content.thinking);
        break;
        
      case AgentEventType.ResponseChunkFunctionCallDone:
        // ✅ Get complete function call parameters - useful for debugging
        const funcCallData = event.data as { 
          content: { 
            functionCall: { 
              id: string; 
              call_id: string; 
              name: string; 
              args: string; 
            } 
          } 
        };
        const funcCall = funcCallData.content.functionCall;
        console.log(`🔧 LLM prepared tool: ${funcCall.name} with args: ${funcCall.args}`);
        break;
        
      case AgentEventType.ToolExecutionStart:
        // ✅ Recommended - Track actual tool execution with full context
        const toolStartData = event.data as {
          toolName: string;
          callId: string;
          args: Record<string, unknown>;
          sessionId: string;
          turn: number;
        };
        console.log(`⚙️ Tool executing: ${toolStartData.toolName} (Turn ${toolStartData.turn})`);
        console.log(`   Args:`, toolStartData.args);
        break;
        
      case AgentEventType.ToolExecutionDone:
        // ✅ Recommended - Track tool completion with full context
        const toolDoneData = event.data as {
          toolName: string;
          callId: string;
          result?: unknown;
          error?: string;
          duration?: number;
          sessionId: string;
          turn: number;
        };
        if (toolDoneData.error) {
          console.log(`❌ Tool failed: ${toolDoneData.toolName} - ${toolDoneData.error}`);
        } else {
          console.log(`✅ Tool completed: ${toolDoneData.toolName} (${toolDoneData.duration}ms)`);
        }
        break;
        
      case AgentEventType.ResponseComplete:
        // ✅ Access complete response with token usage
        const completeData = event.data as { 
          response_id: string; 
          usage?: { 
            inputTokens: number; 
            outputTokens: number; 
            totalTokens: number; 
          } 
        };
        console.log(`📊 Response complete - Tokens: ${completeData.usage?.totalTokens || 0}`);
        break;
        
      case AgentEventType.TurnComplete:
        // ✅ Turn completion with context
        const turnData = event.data as { 
          type: string; 
          sessionId: string; 
          turn: number; 
          hasToolCalls: boolean; 
        };
        console.log(`🔄 Turn ${turnData.turn} completed ${turnData.hasToolCalls ? 'with' : 'without'} tool calls`);
        break;
        
      case AgentEventType.Error:
        // ✅ Structured error handling
        const errorData = event.data as { 
          message: string; 
          timestamp: number; 
          turn: number; 
        };
        console.error(`❌ Error (Turn ${errorData.turn}): ${errorData.message}`);
        break;
        
      case AgentEventType.ResponseFailed:
        // ✅ Handle response failures
        const failedData = event.data as { 
          response_id: string; 
          error: { code?: string; message?: string }; 
        };
        console.error(`❌ Response failed: ${failedData.error.message || 'Unknown error'}`);
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

#### Real-Time Streaming Pattern (When UX is Critical)

```typescript
import { AgentEventType } from '@continue-reasoning/mini-agent';

// 🎯 Only use when real-time streaming UX is essential
let assistantResponse = '';

for await (const event of agent.processWithSession(userInput)) {
  switch (event.type) {
    case AgentEventType.ResponseChunkTextDelta:
      // ⚡ Real-time character-by-character streaming
      const deltaData = event.data as { content: { text_delta: string } };
      const delta = deltaData.content.text_delta;
      process.stdout.write(delta);
      assistantResponse += delta;
      break;
      
    case AgentEventType.ResponseChunkFunctionCallDelta:
      // 🎯 Real-time function call parameter streaming (if needed for UX)
      const funcDeltaData = event.data as { 
        content: { functionCall: { name: string; args: string } } 
      };
      const funcDelta = funcDeltaData.content.functionCall;
      console.log(`\n🔧 LLM preparing: ${funcDelta.name}...`);
      break;
      
    // ❌ Don't handle corresponding Done events when using Delta events
    // case AgentEventType.ResponseChunkTextDone:
    // case AgentEventType.ResponseChunkFunctionCallDone:
    //   // These would duplicate content from delta events
    
    case AgentEventType.ToolExecutionStart:
      // ✅ Type-safe tool execution tracking
      const toolStartData = event.data as {
        toolName: string;
        callId: string;
        args: Record<string, unknown>;
        sessionId: string;
        turn: number;
      };
      console.log(`\n⚙️ Tool executing: ${toolStartData.toolName} (Turn ${toolStartData.turn})`);
      break;
      
    case AgentEventType.ToolExecutionDone:
      // ✅ Type-safe tool completion tracking
      const toolDoneData = event.data as {
        toolName: string;
        callId: string;
        result?: unknown;
        error?: string;
        duration?: number;
        sessionId: string;
        turn: number;
      };
      const status = toolDoneData.error ? '❌ Failed' : '✅ Completed';
      console.log(`\n${status}: ${toolDoneData.toolName} (${toolDoneData.duration || 0}ms)`);
      break;
      
    case AgentEventType.ResponseComplete:
      // ✅ Final response with token usage
      const completeData = event.data as { 
        response_id: string; 
        usage?: { totalTokens: number } 
      };
      console.log(`\n📊 Final response complete (${completeData.usage?.totalTokens || 0} tokens)`);
      console.log(`Full response: ${assistantResponse}`);
      break;
      
    case AgentEventType.Error:
      // ✅ Handle streaming errors
      const errorData = event.data as { 
        message: string; 
        timestamp: number; 
        turn: number; 
      };
      console.error(`\n❌ Streaming error (Turn ${errorData.turn}): ${errorData.message}`);
      break;
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
