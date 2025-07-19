# Agent Framework

A platform-agnostic agent framework for building autonomous AI agents with tool execution capabilities.

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

// Configure agent
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
  },
};

// Create agent with tools
const agent = new StandardAgent(
  [new WeatherTool(), new SubtractionTool()], 
  config
);

// Process user input with streaming
const userInput = 'Get weather for Beijing and Shanghai, then calculate the temperature difference';
const abortController = new AbortController();

for await (const event of agent.process(userInput, 'session-123', abortController.signal)) {
  switch (event.type) {
    case AgentEventType.Content:
      if (event.data.type === 'assistant_chunk') {
        process.stdout.write(event.data.content);
      }
      break;
    case AgentEventType.ToolCallRequest:
      console.log(`🔧 Tool: ${event.data.toolCall.name}`);
      break;
    case AgentEventType.TokenUsage:
      console.log(`📊 Tokens: ${event.data.usage.totalTokens}`);
      break;
  }
}
```

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
