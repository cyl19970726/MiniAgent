# Agent Framework Documentation

## Overview

The Agent framework provides a platform-agnostic foundation for building autonomous AI agents with tool execution capabilities. It builds upon the existing Gemini CLI core infrastructure while maintaining clean abstractions for extensibility.

## Directory Structure

```
packages/agent/
├── src/
│   ├── interfaces.ts          # Platform-agnostic interfaces
│   ├── geminiChat.ts          # Gemini-specific chat implementation
│   └── index.ts               # Main exports
├── examples/
│   ├── calculateTool.ts       # Tool implementation example
│   └── weatherTool.ts         # Tool implementation example
├── framework.md               # This documentation
├── plan.md                    # Implementation plan
├── package.json               # Package configuration
├── tsconfig.json              # TypeScript configuration
├── tsconfig.standalone.json   # Standalone build configuration
└── README.standalone.md       # Standalone package documentation
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Framework                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   IAgent        │  │   IChat         │  │ IToolScheduler  │  │
│  │  (Core Logic)   │  │ (Conversation)  │  │ (Tool Execution)│  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   GeminiChat    │  │  ToolScheduler  │  │   TokenTracker  │  │
│  │ (Implementation)│  │   Adapter       │  │ (Usage Monitor) │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│            Integration with @google/gemini-cli-core             │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Interface Layer (`interfaces.ts`)

**Purpose**: Define platform-agnostic interfaces for all agent components

**Key Interfaces**:
- `IAgent`: Main agent interface with conversation processing
- `IChat`: Chat management with streaming support
- `IToolScheduler`: Tool execution coordination
- `ITool`: Tool definition and execution
- `ITokenTracker`: Token usage monitoring

**Benefits**:
- Platform independence
- Type safety
- Clear contracts
- Easy testing and mocking

### 2. Chat Implementation (`geminiChat.ts`)

**Purpose**: Gemini-specific chat implementation with streaming support

**Key Features**:
- Streaming-only responses
- Real-time token tracking
- History management
- Response validation
- Error handling

**Integration Points**:
- Uses `@google/gemini-cli-core` ContentGenerator
- Implements `IChat` interface
- Integrates with TokenTracker

### 3. Tool Integration

**Purpose**: Seamless integration with existing tool infrastructure

**Approach**:
- Use existing `CoreToolScheduler` from core package
- Adapter pattern for interface compatibility
- Maintain existing tool definitions
- Support all tool types (built-in, MCP, custom)

## Data Flow

```
User Input
    ↓
┌─────────────────────┐
│     IAgent          │
│  (Main Controller)  │
└─────────────────────┘
    ↓
┌─────────────────────┐
│     IChat           │
│  (Conversation)     │
└─────────────────────┘
    ↓
┌─────────────────────┐
│  ContentGenerator   │
│  (LLM Interface)    │
└─────────────────────┘
    ↓
┌─────────────────────┐
│  Streaming Response │
│  (Real-time Output) │
└─────────────────────┘
    ↓
┌─────────────────────┐
│  Tool Extraction    │
│  (Parse Tool Calls) │
└─────────────────────┘
    ↓
┌─────────────────────┐
│  IToolScheduler     │
│  (Tool Execution)   │
└─────────────────────┘
    ↓
┌─────────────────────┐
│  Tool Results       │
│  (Back to Chat)     │
└─────────────────────┘
```

## Event Flow

```
┌─────────────────────┐
│   User Message      │
└─────────────────────┘
           ↓
┌─────────────────────┐
│   Agent.process()   │
│   - Validate input  │
│   - Start streaming │
└─────────────────────┘
           ↓
┌─────────────────────┐
│  Chat.sendMessage   │
│  - Create request   │
│  - Send to LLM      │
└─────────────────────┘
           ↓
┌─────────────────────┐
│  Streaming Chunks   │
│  - Content events   │
│  - Token tracking   │
└─────────────────────┘
           ↓
┌─────────────────────┐
│  Tool Extraction    │
│  - Parse calls      │
│  - Create requests  │
└─────────────────────┘
           ↓
┌─────────────────────┐
│  Tool Execution     │
│  - Schedule calls   │
│  - Handle results   │
└─────────────────────┘
           ↓
┌─────────────────────┐
│  History Update     │
│  - Add to history   │
│  - Emit events      │
└─────────────────────┘
```

## Key Design Principles

### 1. Platform Agnostic
- Interfaces work with any LLM provider
- No hard dependencies on specific implementations
- Easy to extend for new providers

### 2. Streaming First
- Real-time response processing
- Immediate user feedback
- Efficient resource usage

### 3. Event-Driven
- Comprehensive event emission
- Real-time monitoring
- Easy integration with UI/logging

### 4. Token Awareness
- Real-time token tracking
- Usage monitoring
- Limit management

### 5. Tool Integration
- Seamless tool execution
- Existing tool compatibility
- Extensible tool system

## Integration Strategy

### Phase 1: Core Chat Implementation
- Implement `GeminiChat` based on core package
- Add streaming-only support
- Integrate token tracking
- Maintain history management

### Phase 2: Tool Integration
- Create `ToolSchedulerAdapter`
- Integrate with `CoreToolScheduler`
- Maintain existing tool compatibility
- Support all tool types

### Phase 3: Agent Implementation
- Create minimal `Agent` class
- Focus on conversation flow
- Integrate chat and tools
- Event emission system

### Phase 4: Refinement
- Performance optimization
- Error handling improvement
- Documentation completion
- Testing coverage

## Benefits of This Architecture

1. **Minimal Dependencies**: Only depends on core package
2. **Clean Abstractions**: Clear separation of concerns
3. **Extensibility**: Easy to add new providers/features
4. **Compatibility**: Works with existing tool ecosystem
5. **Performance**: Streaming-first approach
6. **Monitoring**: Comprehensive event system
7. **Type Safety**: Full TypeScript support

This framework provides a solid foundation for building autonomous AI agents while maintaining simplicity and extensibility.