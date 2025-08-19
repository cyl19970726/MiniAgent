# MiniAgent Framework Development Guide

> You are a MiniAgent framework developer responsible for developing, extending, and maintaining the core MiniAgent framework. This document focuses on the internal architecture, development patterns, and core system implementation rather than integration usage.

## Table of Contents

1. [Framework Architecture Overview](#framework-architecture-overview)
2. [Core Components Deep Dive](#core-components-deep-dive)
3. [Event System Architecture](#event-system-architecture)
4. [Tool Definition and Execution Pipeline](#tool-definition-and-execution-pipeline)
5. [Chat History Management System](#chat-history-management-system)
6. [Agent Lifecycle and State Management](#agent-lifecycle-and-state-management)
7. [Streaming Response Architecture](#streaming-response-architecture)
8. [Extension Points and Plugin System](#extension-points-and-plugin-system)
9. [Development Workflow and Best Practices](#development-workflow-and-best-practices)

## Framework Architecture Overview

### Core Design Principles

MiniAgent follows these fundamental architectural principles:

1. **Interface-Driven Design**: All major components implement TypeScript interfaces for maximum flexibility
2. **Event-Driven Architecture**: Comprehensive event system for real-time monitoring and debugging
3. **Streaming-First Approach**: All responses are streaming by default, non-streaming is implemented as stream collection
4. **Platform Agnostic**: Framework adapts providers to our interfaces, not the other way around
5. **Composable Architecture**: Components can be mixed and matched for different use cases

### High-Level Component Interaction

```typescript
// Core Framework Flow:
// UserInput -> BaseAgent -> IChat -> LLMResponse Stream -> AgentEvent Stream
//                      \-> IToolScheduler -> Tool Execution -> AgentEvent Stream

// Key Files:
// src/interfaces.ts         - All TypeScript interfaces and types
// src/baseAgent.ts          - Core agent implementation
// src/agentEvent.ts         - Event system implementation
// src/baseTool.ts           - Tool system foundation
// src/coreToolScheduler.ts  - Tool execution orchestration
// src/chat/interfaces.ts    - Chat system abstractions
// src/standardAgent.ts      - Session management layer
```

### Interface Hierarchy

```typescript
// Core Interfaces defined in src/interfaces.ts
interface IAgent {
  // Main processing pipeline
  process(messages, sessionId, signal): AsyncGenerator<AgentEvent>
  processOneTurn(sessionId, messages, signal): AsyncGenerator<AgentEvent>
  
  // Component access
  getChat(): IChat<any>
  getToolScheduler(): IToolScheduler
  getTokenUsage(): ITokenUsage
  
  // Configuration
  setSystemPrompt(prompt: string): void
  clearHistory(): void
}

interface IChat<T> {
  // Core streaming method
  sendMessageStream(messages, promptId, tools): Promise<AsyncGenerator<LLMResponse>>
  
  // History management
  getHistory(): MessageItem[]
  addHistory(message: MessageItem): void
  setHistory(history: MessageItem[]): void
  
  // Provider conversion
  convertToProviderMessage(message: MessageItem): T
  convertFromChunkItems(chunk: ChunkItem, role): MessageItem
}

interface IToolScheduler {
  // Tool execution lifecycle
  schedule(requests, signal, callbacks): Promise<void>
  handleConfirmationResponse(callId, outcome, payload): Promise<void>
  
  // Tool management
  registerTool(tool: ITool): void
  getTool(name: string): ITool | undefined
  getCurrentToolCalls(): IToolCall[]
}
```

## Core Components Deep Dive

### BaseAgent Implementation (`src/baseAgent.ts`)

The `BaseAgent` class is the orchestrator that connects all framework components:

```typescript
// Core processing flow in BaseAgent
export abstract class BaseAgent implements IAgent {
  private eventHandlers: Map<string, EventHandler> = new Map();
  private currentTurn = 0;
  private isRunning = false;

  constructor(
    protected agentConfig: IAgentConfig,
    protected chat: IChat<any>,
    protected toolScheduler: IToolScheduler,
    registry?: SubAgentRegistry
  ) {
    // Initialize components and setup event handlers
  }

  // Main processing pipeline
  async *process(userMessages, sessionId, abortSignal): AsyncGenerator<AgentEvent> {
    // 1. Convert user messages to MessageItems
    // 2. Process turns with tool execution in loop
    // 3. Handle streaming responses and tool calls
    // 4. Emit events throughout the process
  }
  
  // Single turn processing with tool execution
  private async *processOneTurnWithHistory(sessionId, chatMessages, abortSignal) {
    // 1. Get tool declarations from scheduler
    // 2. Send messages to chat for LLM processing
    // 3. Process streaming response events
    // 4. Extract and schedule tool calls asynchronously
    // 5. Wait for all tool calls to complete
    // 6. Add results to chat history
    // 7. Emit turn completion event
  }
}
```

**Key Responsibilities:**
- Orchestrate conversation flow between IChat and IToolScheduler
- Manage conversation turns and tool execution loops
- Convert LLM responses to AgentEvents via `createAgentEventFromLLMResponse`
- Handle asynchronous tool execution without blocking LLM streaming
- Maintain conversation history through chat integration

**Critical Implementation Details:**

1. **Non-blocking Tool Execution**: Tools are scheduled asynchronously and don't block LLM response streaming
2. **History Integration**: Tool calls and responses are properly added to chat history for LLM context
3. **Turn Management**: Multiple turns can occur if tools are executed (up to 10 turns)
4. **Event Forwarding**: LLM events are directly forwarded as AgentEvents maintaining consistency

### StandardAgent Extension (`src/standardAgent.ts`)

`StandardAgent` extends `BaseAgent` with session management capabilities:

```typescript
export class StandardAgent extends BaseAgent implements IStandardAgent {
  sessionManager: InternalSessionManager;
  private mcpManager?: McpManager;
  
  constructor(tools: ITool[], config: AllConfig, registry?: SubAgentRegistry) {
    // 1. Select chat provider (OpenAI or Gemini)
    // 2. Create tool scheduler with tools
    // 3. Initialize base agent
    // 4. Setup session manager
    // 5. Initialize MCP if configured
  }

  // Session-aware processing
  async *processWithSession(userInput, sessionId?, abortSignal?) {
    // 1. Handle session switching if needed
    // 2. Convert input to BaseAgent format
    // 3. Delegate to BaseAgent.process()
  }
  
  // MCP Integration
  async addMcpServer(config: McpServerConfig): Promise<ITool[]> {
    // 1. Connect to MCP server
    // 2. Convert MCP tools to ITool implementations
    // 3. Register tools with agent
    // 4. Handle naming conflicts
  }
}
```

### Chat System Architecture (`src/chat/interfaces.ts`)

The chat system provides a unified interface for different LLM providers:

```typescript
// Universal content representation
interface ContentPart {
  type: 'text' | 'thinking' | 'function_call' | 'function_response' | ...
  text?: string;
  thinking?: string;
  functionCall?: { id?, call_id, name, args }
  functionResponse?: { id?, call_id, name, result }
}

// Streaming response events
type LLMResponse = 
  | LLMStart 
  | LLMChunkTextDelta | LLMChunkTextDone
  | LLMChunkThinking
  | LLMFunctionCallDelta | LLMFunctionCallDone
  | LLMComplete;

// Provider implementations
interface IChat<T> {
  sendMessageStream(messages, promptId, tools): AsyncGenerator<LLMResponse>
  convertToProviderMessage(message: MessageItem): T  // Provider-specific format
  convertFromChunkItems(chunk: ChunkItem, role): MessageItem
}
```

**Key Features:**
- **Universal Content Format**: Single `ContentPart` interface handles all content types
- **Streaming Events**: Comprehensive event types for all LLM response patterns
- **Provider Abstraction**: Providers implement our interfaces, not vice versa
- **History Management**: Consistent history format across providers

## Event System Architecture

### Event Types and Hierarchy (`src/interfaces.ts`)

```typescript
enum AgentEventType {
  // User interaction events
  UserMessage = 'user.message',
  UserCancelled = 'user.cancelled',
  
  // LLM Response events (forwarded from IChat)
  ResponseStart = 'response.start',
  ResponseChunkTextDelta = 'response.chunk.text.delta',
  ResponseChunkTextDone = 'response.chunk.text.done',
  ResponseChunkThinkingDelta = 'response.chunk.thinking.delta',
  ResponseChunkThinkingDone = 'response.chunk.thinking.done',
  ResponseChunkFunctionCallDelta = 'response.chunk.function_call.delta',
  ResponseChunkFunctionCallDone = 'response.chunk.function_call.done',
  ResponseComplete = 'response.complete',
  ResponseIncomplete = 'response.incomplete',
  ResponseFailed = 'response.failed',
  
  // Tool execution events (Agent-specific)
  ToolExecutionStart = 'tool.call.execution.start',
  ToolExecutionDone = 'tool.call.execution.done',
  ToolConfirmation = 'tool.confirmation',
  
  // Agent-level events
  TurnComplete = 'turn.complete',
  Error = 'agent.error',
  ModelFallback = 'agent.model_fallback',
}
```

### Event Flow Architecture

```typescript
// Event Creation and Forwarding Pattern (src/interfaces.ts:405)
function createAgentEventFromLLMResponse(
  llmResponse: LLMResponse,
  sessionId: string,
  turn: number,
): LLMResponseAgentEvent {
  // Map LLMResponse types to AgentEventTypes
  // Preserve original data while adding agent metadata
  // Maintain event stream consistency between IChat and IAgent
}

// Event Processing in BaseAgent (src/baseAgent.ts:415)
for await (const llmResponse of responseStream) {
  // Forward LLM events directly as Agent events
  yield createAgentEventFromLLMResponse(llmResponse, sessionId, this.currentTurn);
  
  // Handle specific response types for tool extraction
  if (llmResponse.type === 'response.chunk.function_call.done') {
    // Extract tool call and schedule execution
    // Add assistant message to history
    // Schedule tool asynchronously
  }
}
```

### Event System Utilities (`src/agentEvent.ts`)

```typescript
export class AgentEventFactory {
  createEvent(type: AgentEventType, data?, customMetadata?): AgentEvent
  // Type-safe event creation with consistent metadata
}

export class AgentEventEmitter {
  on(id: string, handler: EventHandler, eventTypes?: AgentEventType[]): void
  emit(event: AgentEvent): void
  // Error-safe event emission with filtering
}

export class AgentEventUtils {
  static isUserMessageEvent(event: AgentEvent): boolean
  static isToolExecutionEvent(event: AgentEvent): boolean
  static extractLLMContent(event: AgentEvent): string | null
  static formatForLogging(event: AgentEvent): string
  // Utility methods for event classification and processing
}
```

## Tool Definition and Execution Pipeline

### Tool Interface Design (`src/interfaces.ts`)

```typescript
interface ITool<TParams = unknown, TResult extends IToolResult = DefaultToolResult> {
  name: string;
  description: string;
  schema: ToolDeclaration;
  isOutputMarkdown: boolean;
  canUpdateOutput: boolean;
  
  // Validation and description
  validateToolParams(params: TParams): string | null;
  getDescription(params: TParams): string;
  
  // Confirmation workflow
  shouldConfirmExecute(params: TParams, signal: AbortSignal): Promise<ToolCallConfirmationDetails | false>;
  
  // Execution
  execute(params: TParams, signal: AbortSignal, updateOutput?: (output: string) => void): Promise<TResult>;
}

// Tool result interface with custom history rendering
interface IToolResult {
  toHistoryStr(): string;
}
```

### BaseTool Implementation (`src/baseTool.ts`)

```typescript
export abstract class BaseTool<TParams, TResult> implements ITool<TParams, DefaultToolResult<TResult>> {
  constructor(
    readonly name: string,
    readonly displayName: string,
    readonly description: string,
    readonly parameterSchema: Schema,
    readonly isOutputMarkdown: boolean = true,
    readonly canUpdateOutput: boolean = false,
  ) {}

  // Computed property for tool declaration
  get schema(): ToolDeclaration {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameterSchema,
    };
  }

  // Helper methods for common patterns
  protected validateRequiredParams(params: Record<string, unknown>, requiredFields: string[]): string | null
  protected validateParameterTypes(params: Record<string, unknown>, typeMap: Record<string, string>): string | null
  protected createResult(llmContent: string, returnDisplay?: string, summary?: string)
  protected createErrorResult(error: Error | string, context?: string)
  protected checkAbortSignal(signal: AbortSignal, operation?: string): void
  
  // Abstract execution method
  abstract execute(params: TParams, signal: AbortSignal, updateOutput?: (output: string) => void): Promise<DefaultToolResult<TResult>>;
}
```

### Tool Execution Pipeline (`src/coreToolScheduler.ts`)

```typescript
export class CoreToolScheduler implements IToolScheduler {
  private toolCalls: Map<string, IToolCall> = new Map();
  private toolRegistry: Map<string, ITool> = new Map();
  
  // Main execution pipeline (src/coreToolScheduler.ts:105)
  async schedule(requests: IToolCallRequestInfo[], signal: AbortSignal, callbacks?) {
    // Phase 1: Validate all tool calls
    await this.validateToolCalls(requests);
    
    // Phase 2: Handle confirmations for tools that require them
    await this.handleConfirmations();
    
    // Phase 3: Execute approved tools in parallel
    await this.executeApprovedTools();
    
    // Phase 4: Wait for completion and cleanup
    await this.waitForCompletion();
  }
  
  // Tool call state management (src/coreToolScheduler.ts:281)
  private async validateSingleToolCall(request: IToolCallRequestInfo) {
    // 1. Create validating tool call state
    // 2. Resolve tool from registry
    // 3. Validate tool parameters
    // 4. Check if confirmation required
    // 5. Transition to scheduled or awaiting_approval state
  }
  
  // Tool execution (src/coreToolScheduler.ts:409)
  private async executeToolCall(scheduledCall: IScheduledToolCall) {
    // 1. Transition to executing state
    // 2. Set up output update handler
    // 3. Execute tool with abort signal
    // 4. Handle success/error states
    // 5. Call lifecycle callbacks
  }
}
```

### Tool Call State Machine

```typescript
enum ToolCallStatus {
  Validating = 'validating',      // Initial validation
  Scheduled = 'scheduled',        // Ready for execution
  Executing = 'executing',        // Currently running
  Success = 'success',           // Completed successfully
  Error = 'error',               // Failed with error
  Cancelled = 'cancelled',       // User/system cancelled
  AwaitingApproval = 'awaiting_approval', // Waiting for user confirmation
}

// State-specific interfaces (src/interfaces.ts:592)
interface IValidatingToolCall extends IBaseToolCall {
  status: ToolCallStatus.Validating;
  tool: ITool;
}

interface IExecutingToolCall extends IBaseToolCall {
  status: ToolCallStatus.Executing;
  tool: ITool;
  liveOutput?: string;  // Real-time output updates
}

interface ISuccessfulToolCall extends IBaseToolCall {
  status: ToolCallStatus.Success;
  tool: ITool;
  response: IToolCallResponseInfo;
  durationMs?: number;
}
```

## Chat History Management System

### Message Structure and Flow

```typescript
// Universal message format (src/chat/interfaces.ts:65)
interface MessageItem {
  role: 'user' | 'assistant';
  content: ContentPart;
  turnIdx?: number;  // For cache optimization
  metadata?: {
    sessionId?: string;
    timestamp?: number;
    turn?: number;
    responseId?: string;
  };
}

// Content types for different message patterns (src/chat/interfaces.ts:19)
interface ContentPart {
  type: 'text' | 'thinking' | 'function_call' | 'function_response';
  
  // Text content
  text?: string;
  text_delta?: string;
  
  // AI reasoning
  thinking?: string;
  thinking_delta?: string;
  
  // Function calling
  functionCall?: {
    id?: string;       // OpenAI function ID
    call_id: string;   // Universal call ID
    name: string;
    args: string;      // JSON string
  };
  
  functionResponse?: {
    id?: string;       // OpenAI function ID
    call_id: string;   // Universal call ID  
    name: string;
    result: string;    // Tool result as string
  };
}
```

### History Integration in BaseAgent

```typescript
// Critical history management in processOneTurn (src/baseAgent.ts:418)
for await (const llmResponse of responseStream) {
  if (llmResponse.type === 'response.chunk.text.done') {
    // Add assistant text to history
    const textMessage: MessageItem = {
      role: 'assistant',
      content: llmResponse.content,
      turnIdx: this.currentTurn,
    };
    this.chat.addHistory(textMessage);
  }
  
  else if (llmResponse.type === 'response.chunk.function_call.done') {
    // Add assistant function call to history (src/baseAgent.ts:457)
    const assistantMessage: MessageItem = {
      role: 'assistant',
      content: {
        type: 'function_call',
        functionCall: {
          id: llmResponse.content.functionCall.id || '',
          call_id: llmResponse.content.functionCall.call_id,
          name: llmResponse.content.functionCall.name,
          args: llmResponse.content.functionCall.args,
        },
      },
      turnIdx: this.currentTurn,
    };
    this.chat.addHistory(assistantMessage);
    
    // Schedule tool execution asynchronously (src/baseAgent.ts:475)
    this.toolScheduler.schedule([toolCall], abortSignal, callbacks);
  }
}

// Tool result integration (src/baseAgent.ts:389)
onExecutionDone: (request: IToolCallRequestInfo, response: IToolCallResponseInfo) => {
  // Add tool result as user message so LLM can see the result
  const toolResultMessage: MessageItem = {
    role: 'user',
    content: {
      type: 'function_response',
      functionResponse: {
        ...(request.functionId && { id: request.functionId }),
        call_id: request.callId,
        name: request.name,
        result: response.result ? response.result.toHistoryStr() : (response.error?.message || 'Unknown error'),
      },
    },
    turnIdx: this.currentTurn,
  };
  this.chat.addHistory(toolResultMessage);
}
```

### Session Management in StandardAgent

```typescript
// Session manager implementation (src/standardAgent.ts:24)
class InternalSessionManager implements ISessionManager {
  private sessions: Map<string, AgentSession> = new Map();
  private currentSessionId: string | null = null;

  setCurrentSession(sessionId: string): boolean {
    // Save current session state before switching (src/standardAgent.ts:72)
    if (this.currentSessionId && this.currentSessionId !== sessionId) {
      this.saveCurrentSessionState();
    }
    
    // Switch to new session
    this.currentSessionId = sessionId;
    this.restoreSessionState(session);
    
    return true;
  }

  private saveCurrentSessionState(): void {
    // Save chat history to session (src/standardAgent.ts:134)
    const chat = this.agent.getChat();
    if (chat && chat.getHistory) {
      session.messageHistory = chat.getHistory();
    }
    
    // Save token usage (src/standardAgent.ts:139)
    const tokenUsage = this.agent.getTokenUsage();
    if (tokenUsage) {
      session.tokenUsage = {
        totalInputTokens: tokenUsage.inputTokens || 0,
        totalOutputTokens: tokenUsage.outputTokens || 0,
        totalTokens: tokenUsage.totalTokens || 0
      };
    }
  }

  private restoreSessionState(session: AgentSession): void {
    // Restore chat history (src/standardAgent.ts:157)
    const chat = this.agent.getChat();
    if (chat && chat.clearHistory && chat.setHistory) {
      chat.clearHistory();
      if (session.messageHistory.length > 0) {
        chat.setHistory(session.messageHistory);
      }
    }
    
    // Reset token tracker to avoid stale state (src/standardAgent.ts:166)
    const tokenTracker = chat.getTokenTracker();
    if (tokenTracker && tokenTracker.reset) {
      tokenTracker.reset();
    }
  }
}
```

## Agent Lifecycle and State Management

### Agent State Tracking

```typescript
interface IAgentStatus {
  isRunning: boolean;
  currentTurn: number;
  historySize: number;
  config: IAgentConfig;
  lastUpdateTime: number;
  tokenUsage: ITokenUsage;
  modelInfo: { model: string; tokenLimit: number };
}

// State management in BaseAgent (src/baseAgent.ts:76)
export abstract class BaseAgent implements IAgent {
  private currentTurn = 0;
  private isRunning = false;
  private lastUpdateTime = Date.now();

  async *process(userMessages, sessionId, abortSignal) {
    if (this.isRunning) {
      yield this.createErrorEvent('Agent is already processing a request');
      return;
    }

    this.isRunning = true;
    try {
      // Process multiple turns with tool execution (src/baseAgent.ts:223)
      for (let turnCount = 0; turnCount < 10 && hasToolCallsInTurn && !abortSignal.aborted; turnCount++) {
        for await (const event of this.processOneTurn(sessionId, messagesToProcess, abortSignal)) {
          yield event;
          
          if (event.type === AgentEventType.TurnComplete) {
            hasToolCallsInTurn = (event.data as {hasToolCalls: boolean}).hasToolCalls;
          }
        }
      }
    } finally {
      this.isRunning = false;
      this.lastUpdateTime = Date.now();
    }
  }
}
```

### Token Management

```typescript
// Token usage interface (src/chat/interfaces.ts:298)
interface ITokenUsage {
  inputTokens: number;
  inputTokenDetails?: { cachedTokens: number };
  outputTokens: number;
  outputTokenDetails?: { reasoningTokens: number };
  totalTokens: number;
  cumulativeTokens: number;
  tokenLimit: number;
  usagePercentage: number;
  
  // Cache performance metrics
  cacheHitRate?: number;
  tokenSavings?: number;
  totalCacheableRequests?: number;
  actualCacheHits?: number;
}

// Token tracker interface (src/chat/interfaces.ts:333)
interface ITokenTracker {
  updateUsage(usage: { inputTokens, outputTokens, ... }): void;
  getUsage(): ITokenUsage;
  reset(): void;
  isApproachingLimit(threshold?: number): boolean;
}
```

## Streaming Response Architecture

### Streaming Pipeline Design

```typescript
// Complete streaming flow from IChat to AgentEvent
// 1. IChat.sendMessageStream() -> AsyncGenerator<LLMResponse>
// 2. BaseAgent processes stream -> converts to AgentEvent via createAgentEventFromLLMResponse
// 3. Tool extraction happens during streaming without blocking
// 4. Tool results are integrated back into history

// Non-blocking tool execution pattern (src/baseAgent.ts:410)
for await (const llmResponse of responseStream) {
  // Immediately forward LLM events as AgentEvents
  yield createAgentEventFromLLMResponse(llmResponse, sessionId, this.currentTurn);

  // Extract and schedule tools without blocking the stream
  if (llmResponse.type === 'response.chunk.function_call.done') {
    // Schedule tool execution asynchronously (src/baseAgent.ts:475)
    this.toolScheduler.schedule([toolCall], abortSignal, createToolCallbacks())
      .catch(error => {
        this.logger.error(`Tool scheduling failed: ${error}`);
      });
  }
}

// Wait for all tools to complete after LLM stream ends (src/baseAgent.ts:483)
while (pendingToolCalls.size > 0 && !abortSignal.aborted) {
  // Emit buffered tool execution events
  while (toolExecutionEvents.length > 0) {
    yield toolExecutionEvents.shift()!;
  }
  await new Promise(resolve => setTimeout(resolve, 10));
}
```

### Response Type Processing

```typescript
// LLM Response types mapped to AgentEvent types (src/interfaces.ts:413)
const LLM_TO_AGENT_EVENT_MAP = {
  'response.start': AgentEventType.ResponseStart,
  'response.chunk.text.delta': AgentEventType.ResponseChunkTextDelta,
  'response.chunk.text.done': AgentEventType.ResponseChunkTextDone,
  'response.chunk.thinking.delta': AgentEventType.ResponseChunkThinkingDelta,
  'response.chunk.thinking.done': AgentEventType.ResponseChunkThinkingDone,
  'response.chunk.function_call.delta': AgentEventType.ResponseChunkFunctionCallDelta,
  'response.chunk.function_call.done': AgentEventType.ResponseChunkFunctionCallDone,
  'response.complete': AgentEventType.ResponseComplete,
  'response.incomplete': AgentEventType.ResponseIncomplete,
  'response.failed': AgentEventType.ResponseFailed,
};

// Direct event forwarding with metadata addition (src/interfaces.ts:449)
function createAgentEventFromLLMResponse(llmResponse: LLMResponse, sessionId: string, turn: number) {
  return {
    type: LLM_TO_AGENT_EVENT_MAP[llmResponse.type],
    data: llmResponse,
    timestamp: Date.now(),
    sessionId,
    turn,
    metadata: {
      source: 'llm_response',
      originalType: llmResponse.type,
    },
  };
}
```

## Extension Points and Plugin System

### SubAgent System

```typescript
// SubAgent registry for task delegation (src/interfaces.ts:1217)
interface SubAgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[] | '*';
  whenToUse: string;
}

export class SubAgentRegistry {
  private subagents: Map<string, SubAgentConfig> = new Map();

  register(config: SubAgentConfig): void {
    this.subagents.set(config.name, config);
  }

  generateSystemPromptSnippet(): string {
    // Generate system prompt addition that informs the agent about available subagents
  }
}

// TaskTool for delegating to subagents (src/baseAgent.ts:833)
export class TaskTool extends BaseTool<{ name: string; description: string }, TaskResponse> {
  constructor(
    private registry: SubAgentRegistry,
    private agentConfig: IAgentConfig,
    private createChatInstance: (config: any) => IChat<any>,
    private createSchedulerInstance: (config: any) => Promise<IToolScheduler>
  ) {
    super('task', 'Task', 'Delegate complex tasks to specialized subagents', schema);
  }

  async execute(params: { name: string; description: string }, signal: AbortSignal) {
    // 1. Find appropriate subagent from registry
    // 2. Create new agent instance with subagent configuration
    // 3. Execute task in stateless mode using processOneTurn
    // 4. Return consolidated result
  }
}
```

### MCP Integration

```typescript
// Model Context Protocol integration for external tools (src/interfaces.ts:57)
interface McpServerConfig {
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  timeout?: number;
  autoConnect?: boolean;
}

// MCP tool adapter
export class McpToolAdapter implements ITool {
  constructor(
    private mcpTool: any,
    private mcpClient: any,
    public name: string,
    public description: string
  ) {}

  async execute(params: any, signal: AbortSignal): Promise<DefaultToolResult> {
    // Bridge MCP tool execution to ITool interface
    const result = await this.mcpClient.callTool(this.mcpTool.name, params);
    return new DefaultToolResult(result);
  }
}

// MCP manager in StandardAgent (src/standardAgent.ts:376)
async addMcpServer(config: McpServerConfig): Promise<ITool[]> {
  const mcpTools = await this.mcpManager.addServer(config);
  const tools = this.convertMcpToolsToITools(mcpTools, config.name);
  tools.forEach(tool => this.registerTool(tool));
  return tools;
}
```

### Custom Chat Provider Integration

```typescript
// Example: Adding a new chat provider
export class CustomChat implements IChat<CustomMessage> {
  constructor(private config: IChatConfig) {}

  async sendMessageStream(messages: MessageItem[], promptId: string, tools?: ToolDeclaration[]): Promise<AsyncGenerator<LLMResponse>> {
    // 1. Convert MessageItems to provider format using convertToProviderMessage
    // 2. Set up streaming request to provider
    // 3. Convert provider response events to LLMResponse format
    // 4. Yield standardized LLMResponse events
  }

  convertToProviderMessage(message: MessageItem): CustomMessage {
    // Convert universal MessageItem to provider-specific format
  }

  convertFromChunkItems(chunk: ChunkItem, role: 'user' | 'assistant'): MessageItem {
    // Convert provider response chunks back to universal format
  }

  // Implement other IChat methods...
}

// Usage in StandardAgent
const chat = new CustomChat(config.chatConfig);
const agent = new StandardAgent(tools, { ...config, chatProvider: 'custom' });
```

## Development Workflow and Best Practices

### Code Organization

```typescript
// Recommended project structure for extensions
src/
   interfaces.ts          // Core interfaces (extend, don't modify)
   baseAgent.ts          // Core agent logic (extend via composition)
   agentEvent.ts         // Event system (use utilities, add custom events)
   baseTool.ts           // Tool foundation (extend for custom tools)
   coreToolScheduler.ts  // Tool execution (extend for custom scheduling)
   standardAgent.ts      // Session management (extend for features)
   chat/
      interfaces.ts     // Chat abstractions (implement for new providers)
      geminiChat.ts     // Gemini implementation
      openaiChat.ts     // OpenAI implementation
   tools/                // Custom tool implementations
   extensions/           // Framework extensions
   tests/               // Comprehensive test suite
```

### Extension Development Pattern

```typescript
// Pattern for extending BaseAgent
export class CustomAgent extends BaseAgent {
  private customFeatures: CustomFeatureManager;

  constructor(config: IAgentConfig, chat: IChat<any>, scheduler: IToolScheduler) {
    super(config, chat, scheduler);
    this.customFeatures = new CustomFeatureManager();
  }

  // Override specific methods while preserving core functionality
  protected async processOneTurnWithHistory(sessionId: string, messages: MessageItem[], signal: AbortSignal) {
    // Add custom pre-processing
    await this.customFeatures.preProcessMessages(messages);
    
    // Call parent implementation
    const eventGenerator = super.processOneTurnWithHistory(sessionId, messages, signal);
    
    // Add custom post-processing
    for await (const event of eventGenerator) {
      const enhancedEvent = await this.customFeatures.enhanceEvent(event);
      yield enhancedEvent;
    }
  }
}

// Pattern for custom tool categories
export abstract class CustomToolCategory extends BaseTool {
  constructor(name: string, description: string, schema: Schema) {
    super(name, `Custom ${name}`, description, schema, true, true);
  }

  // Shared validation logic for this tool category
  override validateToolParams(params: any): string | null {
    const baseValidation = super.validateToolParams(params);
    if (baseValidation) return baseValidation;

    // Add category-specific validation
    return this.validateCategorySpecific(params);
  }

  protected abstract validateCategorySpecific(params: any): string | null;
}
```

### Error Handling Best Practices

```typescript
// Comprehensive error handling in framework development
export class RobustAgent extends BaseAgent {
  private errorRecovery: ErrorRecoveryManager;

  async *process(userMessages: UserMessage[], sessionId: string, signal: AbortSignal) {
    try {
      yield* super.process(userMessages, sessionId, signal);
    } catch (error) {
      // Log error with context
      this.logger.error('Agent processing failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        sessionId,
        turn: this.currentTurn,
        userMessages: userMessages.map(m => ({ role: m.role, content: m.content.text?.substring(0, 100) }))
      });

      // Attempt recovery
      const recoveryEvent = await this.errorRecovery.attemptRecovery(error, sessionId);
      if (recoveryEvent) {
        yield recoveryEvent;
      } else {
        // Emit error event for handling by client
        yield this.createErrorEvent(`Processing failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

// Error recovery strategies
class ErrorRecoveryManager {
  async attemptRecovery(error: unknown, sessionId: string): Promise<AgentEvent | null> {
    if (this.isRecoverableError(error)) {
      // Reset state and retry
      return this.createEvent(AgentEventType.ModelFallback, {
        originalError: error,
        recoveryAction: 'state_reset',
        sessionId
      });
    }
    return null;
  }

  private isRecoverableError(error: unknown): boolean {
    // Define recoverable error conditions
    return error instanceof Error && error.message.includes('rate limit');
  }
}
```

This comprehensive guide provides the foundation for developing and extending the MiniAgent framework. Focus on understanding the interface contracts, event flow patterns, and composition-based extension strategies to build robust, maintainable additions to the framework.