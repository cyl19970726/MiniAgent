# Agent Framework

A platform-agnostic agent framework for building autonomous AI agents with tool execution capabilities.

## Current Status

### ✅ Completed
- **Core Interface Design**: Comprehensive interfaces in `interfaces.ts` with clear documentation
- **BaseAgent Implementation**: Complete agent class that connects all interfaces with detailed comments
- **Testing Framework**: Vitest configuration with test utilities
- **Documentation**: Framework architecture and implementation plan
- **Project Structure**: Clean, focused directory structure

### 🔄 In Progress
- **GeminiChat Implementation**: Basic structure exists, needs completion based on core package
- **Interface Documentation**: All interfaces have English comments and clear descriptions

### 📋 Next Steps
- Implement `TokenTracker` class for real-time token tracking
- Implement `AgentEvent` system for event emission and handling
- Complete `GeminiChat` implementation with proper streaming support
- Create comprehensive test suite for all components
- Implement `CoreToolScheduler` for tool execution

## Key Design Principles

1. **Reference, Not Depend**: We reference core package implementations but create our own versions
2. **Interface-First**: All implementations strictly follow defined interfaces
3. **Test-Driven**: Every implementation file has corresponding test file
4. **English Comments**: All code uses English with comprehensive documentation
5. **Streaming-First**: Real-time responses with comprehensive event emission

## Architecture

```
BaseAgent (connects all interfaces)
├── IChat (GeminiChat) - conversation management
├── IToolScheduler (CoreToolScheduler) - tool execution
├── ITokenTracker (TokenTracker) - token monitoring
└── AgentEvent - event system
```

## Usage Example

```typescript
import { BaseAgent, GeminiChat, CoreToolScheduler } from '@gemini-tool/agent';

// Create agent with all required components
const agent = new BaseAgent(config, chat, toolScheduler);

// Set up event monitoring
agent.onEvent('logger', (event) => {
  console.log(`[${event.type}] ${event.data}`);
});

// Process user input with streaming
const abortController = new AbortController();
for await (const event of agent.process('Hello', 'session-1', abortController.signal)) {
  // Handle real-time events
  if (event.type === AgentEventType.Content) {
    console.log(event.data);
  }
}
```

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

## Directory Structure

```
src/
├── interfaces.ts         # Core interfaces (complete)
├── baseAgent.ts          # Main agent implementation (complete)
├── geminiChat.ts         # Chat implementation (in progress)
├── tokenTracker.ts       # Token tracking (planned)
├── agentEvent.ts         # Event system (planned)
├── coreToolScheduler.ts  # Tool scheduler (planned)
├── index.ts             # Main exports
└── test/
    ├── setup.ts         # Test configuration
    └── *.test.ts        # Test files
```

## Implementation Plan

See [plan.md](plan.md) for detailed implementation roadmap and [framework.md](framework.md) for architecture documentation.

## Contributing

1. All implementations must follow the defined interfaces
2. Every implementation needs corresponding test file
3. Use English comments throughout
4. Reference core package patterns but create independent implementations
5. Maintain comprehensive documentation