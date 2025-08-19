# Agent Framework

A platform-agnostic agent framework for building autonomous AI agents with tool execution capabilities.

## Install 
pnpm install @continue-reasoning/mini-agent

## Features

### LLM Providers
- [x] Gemini
- [ ] Vercel
- [ ] OpenAI
- [ ] Anthropic

### Core Features
- [x] ChatHistory
- [x] eventStream
- [x] streaming
- [x] toolScheduler

### External Feature
- [ ] support mcp

## Key Design Principles

1. **Streaming-First**: We only support streaming because streaming can implement call functionality
2. **Interface-Driven**: Pre-defined interfaces with core implementation by BaseAgent
3. **Platform-Agnostic**: Clean abstractions that work with any LLM provider
4. **Event-Based**: Comprehensive event system for real-time monitoring

## Architecture

<img width="5048" height="4694" alt="image" src="https://github.com/user-attachments/assets/224fc7b5-994c-4a3b-8aa0-174518967e45" />

```
BaseAgent (Core Implementation)
├── IChat (LLM Interface)
│   └── GeminiChat (Gemini Provider Implementation)
├── IToolScheduler (Tool Execution)
│   └── CoreToolScheduler
├── ITokenTracker (Token Monitoring)
│   └── TokenTracker
└── AgentEvent (Event System)
```

### Core Components

- **BaseAgent**: Main orchestrator that connects all interfaces
- **IChat**: Streaming-first chat interface for LLM communication
- **IToolScheduler**: Manages tool execution with confirmation workflows
- **ITokenTracker**: Real-time token usage tracking
- **AgentEvent**: Event emission for monitoring agent behavior

## Usage Example

### Define Custom Tools

```typescript
import { BaseTool, ToolResult } from '@gemini-tool/agent';
import { Type } from '@google/genai';

// Define a weather tool
export class WeatherTool extends BaseTool<{ latitude: number; longitude: number }> {
  constructor() {
    super(
      'get_weather',                    // Tool name
      'Weather Tool',                   // Display name
      'Get current weather temperature', // Description
      {
        type: Type.OBJECT,
        properties: {
          latitude: {
            type: Type.NUMBER,
            description: 'Latitude coordinate'
          },
          longitude: {
            type: Type.NUMBER,
            description: 'Longitude coordinate'
          }
        },
        required: ['latitude', 'longitude']
      },
      false, // isOutputMarkdown
      true   // canUpdateOutput
    );
  }

  validateToolParams(params: { latitude: number; longitude: number }): string | null {
    if (params.latitude < -90 || params.latitude > 90) {
      return 'Latitude must be between -90 and 90';
    }
    return null;
  }

  async execute(
    params: { latitude: number; longitude: number },
    abortSignal: AbortSignal,
    outputUpdateHandler?: (output: string) => void
  ): Promise<ToolResult> {
    // Fetch weather data...
    const temperature = await this.fetchWeatherData(params.latitude, params.longitude);
    
    return this.createResult(
      `Weather: ${temperature}°C`,           // LLM content
      `🌤️ Temperature: ${temperature}°C`,    // Display content
      `Retrieved weather: ${temperature}°C`  // Summary
    );
  }
}
```

### Use Agent with Tools

```typescript
import { StandardAgent, AgentEventType, AllConfig } from '@gemini-tool/agent';

// Configure agent with tool execution callbacks
const config: AllConfig = {
  agentConfig: {
    model: 'gemini-2.0-flash',
    workingDirectory: process.cwd(),
    apiKey: process.env.GEMINI_API_KEY,
    sessionId: 'demo-session',
    maxHistoryTokens: 100000,
  },
  chatConfig: {
    apiKey: process.env.GEMINI_API_KEY,
    modelName: 'gemini-2.0-flash',
    tokenLimit: 100000,
    systemPrompt: 'You are a helpful assistant with weather and calculation tools.',
  },
  toolSchedulerConfig: {
    approvalMode: 'yolo', // Auto-approve for demo
    
    // Optional: Subscribe to tool execution events
    onToolCallsUpdate: (toolCalls) => {
      // Called whenever tool state changes
      toolCalls.forEach(call => {
        console.log(`[${call.request.name}] Status: ${call.status}`);
      });
    },
    
    outputUpdateHandler: (callId, output) => {
      // Called for real-time tool output
      console.log(`Tool output: ${output}`);
    },
    
    onAllToolCallsComplete: (completedCalls) => {
      // Called when all tools finish
      console.log(`Completed ${completedCalls.length} tool calls`);
    }
  },
};

// Create agent with tools
const agent = new StandardAgent(
  [new WeatherTool(), new SubtractionTool()], 
  config
);

// Process user input with streaming and event handling
const userInput = 'Get weather for Beijing and Shanghai, then calculate the temperature difference';
const sessionId = 'demo-session';
const abortController = new AbortController();

// Set a timeout for the operation
setTimeout(() => {
  console.log('⏰ Timeout reached, aborting...');
  abortController.abort();
}, 30000);

console.log(`👤 User: ${userInput}`);
console.log('🤖 Assistant: ');

for await (const event of agent.process(userInput, sessionId, abortController.signal)) {
  switch (event.type) {
    case AgentEventType.AssistantMessage:
      // Complete assistant response
      console.log('🤖 Assistant Response:', event.data);
      break;
      
    case AgentEventType.UserMessage:
      // User message processed
      console.log('👤 User message:', event.data);
      break;
      
    case AgentEventType.TurnComplete:
      // Conversation turn completed
      console.log('🔄 Turn complete:', event.data);
      break;
      
    case AgentEventType.ToolCallRequest:
      // Tool execution requested
      console.log(`🔧 Tool requested: ${event.data.toolCall.name}`);
      console.log(`   Args: ${JSON.stringify(event.data.toolCall.args)}`);
      break;
      
    case AgentEventType.ToolCallResponse:
      // Tool execution completed
      console.log(`🛠️ Tool response: ${event.data}`);
      break;
      
    case AgentEventType.TokenUsage:
      // Token usage update
      console.log(`📊 Token usage: ${event.data.usage.totalTokens} tokens`);
      break;
      
    case AgentEventType.Error:
      // Error occurred
      console.error(`❌ Error: ${event.data.message}`);
      break;
  }
}

// Get final status after processing
const status = agent.getStatus();
console.log('\n📊 Final Status:');
console.log(`   • Processing: ${status.isRunning ? 'Yes' : 'No'}`);
console.log(`   • Tokens used: ${status.tokenUsage.totalTokens}`);
console.log(`   • Usage: ${status.tokenUsage.usagePercentage.toFixed(2)}%`);

// Get detailed token usage
const tokenUsage = agent.getTokenUsage();
console.log('\n📈 Token Usage Summary:');
console.log(`   • Input tokens: ${tokenUsage.inputTokens}`);
console.log(`   • Output tokens: ${tokenUsage.outputTokens}`);
console.log(`   • Total tokens: ${tokenUsage.totalTokens}`);
```

## Event System

The agent emits various events during processing that you can handle:

### Event Types

| Event Type | Description | When Emitted |
|------------|-------------|--------------|
| `AssistantMessage` | Complete assistant response | When the assistant finishes responding |
| `UserMessage` | User message processed | When user input is processed |
| `TurnComplete` | Conversation turn finished | When a complete turn (user + assistant) is done |
| `ToolCallRequest` | Tool execution started | When a tool is requested for execution |
| `ToolCallResponse` | Tool execution finished | When a tool completes execution |
| `TokenUsage` | Token usage update | Periodically during processing |
| `Error` | Error occurred | When an error happens during processing |

### Event Handling Best Practices

1. **Handle all event types** to ensure robust error handling
2. **Use AbortController** for timeout and cancellation control
3. **Monitor token usage** to avoid hitting limits
4. **Check status after processing** for final statistics

### Complete Event Flow Example

```typescript
// Set up proper error handling and timeouts
const abortController = new AbortController();
setTimeout(() => abortController.abort(), 30000); // 30 second timeout

try {
  for await (const event of agent.process(userInput, sessionId, abortController.signal)) {
    switch (event.type) {
      case AgentEventType.UserMessage:
        // Log user input processing
        console.log('Processing:', event.data);
        break;
        
      case AgentEventType.ToolCallRequest:
        // Show tool being executed
        console.log(`Executing: ${event.data.toolCall.name}`);
        break;
        
      case AgentEventType.AssistantMessage:
        // Display final response
        console.log('Response:', event.data);
        break;
        
      case AgentEventType.TurnComplete:
        // Turn finished, ready for next input
        console.log('Turn completed');
        break;
        
      case AgentEventType.Error:
        console.error('Error:', event.data.message);
        break;
    }
  }
} catch (error) {
  if (abortController.signal.aborted) {
    console.log('Operation timed out');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Tool Execution Callbacks

The agent framework provides three callbacks to monitor tool execution:

### 1. `onToolCallsUpdate` - State Change Notifications
Called whenever any tool changes state (validating → scheduled → executing → success/error):

```typescript
onToolCallsUpdate: (toolCalls: IToolCall[]) => {
  toolCalls.forEach(call => {
    if (call.status === 'awaiting_approval') {
      // Handle tool confirmation UI
      showConfirmationDialog(call);
    }
  });
}
```

### 2. `outputUpdateHandler` - Real-time Output
Called during tool execution for streaming output:

```typescript
outputUpdateHandler: (callId: string, output: string) => {
  // Stream output to UI or logs
  appendToToolOutput(callId, output);
}
```

### 3. `onAllToolCallsComplete` - Completion Handler
Called once when all tools finish execution:

```typescript
onAllToolCallsComplete: (completedCalls: ICompletedToolCall[]) => {
  // Show execution summary
  const summary = completedCalls.map(tc => 
    `${tc.request.name}: ${tc.status} (${tc.durationMs}ms)`
  ).join('\n');
  console.log(summary);
}
```

### Handling Tool Confirmations

When `approvalMode` is not 'yolo', tools may require user confirmation:

```typescript
const config: AllConfig = {
  // ... other config
  toolSchedulerConfig: {
    approvalMode: 'default', // Requires confirmation for destructive operations
    
    onToolCallsUpdate: async (toolCalls) => {
      const waitingTools = toolCalls.filter(
        tc => tc.status === 'awaiting_approval'
      );
      
      for (const tool of waitingTools) {
        const approved = await showConfirmationUI(tool);
        
        // Respond to the agent
        agent.toolScheduler.handleConfirmationResponse(
          tool.request.callId,
          approved ? ToolConfirmationOutcome.ProceedOnce : ToolConfirmationOutcome.Cancel
        );
      }
    }
  }
};
```

### Complete Example with Tool Monitoring

```typescript
class ToolMonitor {
  private toolStates = new Map<string, string>();
  
  createConfig(): AllConfig {
    return {
      // ... agent and chat config
      toolSchedulerConfig: {
        onToolCallsUpdate: (toolCalls) => {
          toolCalls.forEach(call => {
            const prev = this.toolStates.get(call.request.callId);
            if (prev !== call.status) {
              console.log(`[${call.request.name}] ${prev || 'new'} → ${call.status}`);
              this.toolStates.set(call.request.callId, call.status);
            }
          });
        },
        
        outputUpdateHandler: (callId, output) => {
          console.log(`[Output] ${output}`);
        },
        
        onAllToolCallsComplete: (completed) => {
          console.log(`\nExecution Summary:`);
          completed.forEach(tc => {
            console.log(`- ${tc.request.name}: ${tc.status} (${tc.durationMs}ms)`);
          });
          this.toolStates.clear();
        }
      }
    };
  }
}

const monitor = new ToolMonitor();
const agent = new StandardAgent(tools, monitor.createConfig());
```

For more detailed documentation on tool callbacks, see [agent_subscribe_tools.md](./docs/agent_subscribe_tools.md).

## Directory Structure

```
src/
├── interfaces.ts         # Core interface definitions
├── baseAgent.ts          # Base agent implementation
├── geminiAgent.ts        # Gemini-specific agent
├── geminiChat.ts         # Gemini chat provider
├── tokenTracker.ts       # Token usage tracking
├── coreToolScheduler.ts  # Tool execution scheduler
├── logger.ts             # Logging system
├── index.ts              # Public API exports
├── tools/                # Built-in tools
│   └── calculator.ts     # Calculator tool example
└── test/                 # Test files
    ├── setup.ts          # Test configuration
    └── *.test.ts         # Unit tests
```
