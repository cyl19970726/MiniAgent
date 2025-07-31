/**
 * @fileoverview Universal AI Agent Framework Interfaces
 * 
 * This file defines platform-agnostic interfaces for AI agents that can work
 * with multiple LLM providers (Gemini, OpenAI, etc.). All interfaces are 
 * designed to be implementation-independent and focus on core functionality.
 */

// Note: Schema is now imported via chat/interfaces.ts from genai
import { ILogger, LogLevel } from './logger';

// Import chat-related interfaces from the dedicated chat module
import type {
  ContentPart,
  MessageItem,
  FunctionCallStr,
  LLMStart,
  LLMChunk,
  LLMChunkTextDelta,
  LLMChunkTextDone,
  LLMChunkThinking,
  LLMFunctionCallDone,
  LLMFunctionCallDelta,
  ChunkItem,
  LLMComplete,
  LLMResponse,
  ToolDeclaration,
  IChatConfig,
  IChat,
  ITokenUsage,
  ITokenTracker,
} from './chat/interfaces.js';

// Re-export chat interfaces for backward compatibility
export {
  ContentPart,
  MessageItem,
  FunctionCallStr,
  LLMStart,
  LLMChunk,
  LLMChunkTextDelta,
  LLMChunkTextDone,
  LLMChunkThinking,
  LLMFunctionCallDone,
  LLMFunctionCallDelta,
  ChunkItem,
  LLMComplete,
  LLMResponse,
  ToolDeclaration,
  IChatConfig,
  IChat,
  ITokenUsage,
  ITokenTracker,
};

// ============================================================================
// TOOL INTERFACES - Platform agnostic
// ============================================================================



/**
 * File diff information for tool results
 */
export interface FileDiff {
  /** File diff content */
  fileDiff: string;
  /** File name */
  fileName: string;
}

/**
 * Tool execution result - compatible with core package ToolResult
 */
export interface ToolResult {
  result: string; // success message or error message
}

/**
 * Tool confirmation payload for modifications
 */
export interface ToolConfirmationPayload {
  /** New content to override proposed content */
  newContent: string;
}

/**
 * Tool confirmation outcome options
 */
export enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',
  ProceedAlways = 'proceed_always',
  ProceedAlwaysServer = 'proceed_always_server',
  ProceedAlwaysTool = 'proceed_always_tool',
  ModifyWithEditor = 'modify_with_editor',
  Cancel = 'cancel',
}

/**
 * Edit confirmation details
 */
export interface ToolEditConfirmationDetails {
  type: 'edit';
  title: string;
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => Promise<void>;
  fileName: string;
  fileDiff: string;
  isModifying?: boolean;
}

/**
 * Execute confirmation details
 */
export interface ToolExecuteConfirmationDetails {
  type: 'exec';
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  command: string;
  rootCommand: string;
}

/**
 * MCP confirmation details
 */
export interface ToolMcpConfirmationDetails {
  type: 'mcp';
  title: string;
  serverName: string;
  toolName: string;
  toolDisplayName: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
}

/**
 * Info confirmation details
 */
export interface ToolInfoConfirmationDetails {
  type: 'info';
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  prompt: string;
  urls?: string[];
}

/**
 * Tool call confirmation details - union type compatible with core package
 */
export type ToolCallConfirmationDetails =
  | ToolEditConfirmationDetails
  | ToolExecuteConfirmationDetails
  | ToolMcpConfirmationDetails
  | ToolInfoConfirmationDetails;

/**
 * Core tool interface with generic parameters and result types
 * This interface is designed to be compatible with core package tools
 * while remaining platform-agnostic
 */
export interface ITool<
  TParams = unknown,
  TResult extends ToolResult = ToolResult,
> {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Tool schema */
  schema: ToolDeclaration;
  /** Whether output is markdown */
  isOutputMarkdown: boolean;
  /** Whether tool supports streaming output */
  canUpdateOutput: boolean;
  
  /**
   * Validate tool parameters
   * Should be called from both shouldConfirmExecute and execute
   * shouldConfirmExecute should return false immediately if invalid
   * @param params Parameters to validate
   * @returns Error message if invalid, null if valid
   */
  validateToolParams(params: TParams): string | null;
  
  /**
   * Get tool description for given parameters
   * @param params Tool parameters
   * @returns Description of what tool will do
   */
  getDescription(params: TParams): string;
  
  /**
   * Check if tool requires confirmation before execution
   * @param params Tool parameters
   * @param abortSignal Abort signal
   * @returns Confirmation details or false
   */
  shouldConfirmExecute(params: TParams, abortSignal: AbortSignal): Promise<ToolCallConfirmationDetails | false>;
  
  /**
   * Execute the tool
   * @param params Tool parameters
   * @param signal Abort signal
   * @param updateOutput Callback for streaming output
   * @returns Tool result
   */
  execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<TResult>;
}

// ============================================================================
// CHAT INTERFACES - Platform agnostic
// ============================================================================

// Note: ChatMessage interface has been deprecated in favor of MessageItem
// MessageItem is imported from chat/interfaces.ts and should be used instead



// ============================================================================
// TURN INTERFACES - Platform agnostic
// ============================================================================

/**
 * Tool call request information
 */
export interface ToolCallRequest {
  /** Call ID */
  callId: string;
  /** Tool name */
  name: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Whether initiated by client */
  isClientInitiated: boolean;
  /** Prompt ID */
  promptId: string;
}

/**
 * Tool call response information
 */
export interface ToolCallResponse {
  /** Call ID */
  callId: string;
  /** Response content */
  content: ContentPart[];
  /** Display content */
  display?: string;
  /** Error if any */
  error?: string;
}

/**
 * Agent event types - based on IChat LLMResponse events + tool execution events
 * 
 * DESIGN PRINCIPLE: Maximize reuse of IChat's LLMResponse event stream.
 * We only add agent-specific events for tool execution and user interactions.
 * 
 * Base events from LLMResponse:
 * - response.start, response.chunk.*, response.complete, response.failed, response.incomplete
 * 
 * Agent-specific events:
 * - user.message: User input events
 * - tool.call.execution.*: Tool execution lifecycle
 * - agent.*: Agent-level events (errors, cancellation)
 */
export enum AgentEventType {
  // User interaction events
  UserMessage = 'user.message',
  UserCancelled = 'user.cancelled',
  
  // LLM Response events (directly from IChat)
  // Note: These will be forwarded directly from LLMResponse
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

/**
 * Base agent event
 */
export interface AgentEvent {
  /** Event type */
  type: AgentEventType;
  /** Event data */
  data?: unknown;
  /** Event timestamp */
  timestamp: number;
  /** Event metadata */
  metadata?: Record<string, unknown>;
}

/**
 * LLM Response Agent Event - directly wraps LLMResponse
 * 
 * This event type allows us to forward LLMResponse events directly
 * as AgentEvents without data transformation.
 */
export interface LLMResponseAgentEvent extends AgentEvent {
  /** Session ID for this conversation */
  sessionId: string;
  /** Turn number */
  turn: number;
}

/**
 * Tool execution events - Agent-specific
 */
export interface ToolExecutionStartEvent extends AgentEvent {
  type: AgentEventType.ToolExecutionStart;
  data: {
    toolName: string;
    callId: string;
    args: Record<string, unknown>;
    sessionId: string;
    turn: number;
  };
}

export interface ToolExecutionDoneEvent extends AgentEvent {
  type: AgentEventType.ToolExecutionDone;
  data: {
    toolName: string;
    callId: string;
    result?: unknown;
    error?: string;
    duration?: number;
    sessionId: string;
    turn: number;
  };
}

/**
 * Utility function to create AgentEvent from LLMResponse
 * 
 * This is the core function that maps LLMResponse events to AgentEvents,
 * maintaining the event stream consistency between IChat and IAgent layers.
 */
export function createAgentEventFromLLMResponse(
  llmResponse: LLMResponse,
  sessionId: string,
  turn: number,
): LLMResponseAgentEvent {
  // Map LLMResponse type to AgentEventType
  let agentEventType: AgentEventType;
  
  switch (llmResponse.type) {
    case 'response.start':
      agentEventType = AgentEventType.ResponseStart;
      break;
    case 'response.chunk.text.delta':
      agentEventType = AgentEventType.ResponseChunkTextDelta;
      break;
    case 'response.chunk.text.done':
      agentEventType = AgentEventType.ResponseChunkTextDone;
      break;
    case 'response.chunk.thinking.delta':
      agentEventType = AgentEventType.ResponseChunkThinkingDelta;
      break;
    case 'response.chunk.thinking.done':
      agentEventType = AgentEventType.ResponseChunkThinkingDone;
      break;
    case 'response.chunk.function_call.delta':
      agentEventType = AgentEventType.ResponseChunkFunctionCallDelta;
      break;
    case 'response.chunk.function_call.done':
      agentEventType = AgentEventType.ResponseChunkFunctionCallDone;
      break;
    case 'response.complete':
      agentEventType = AgentEventType.ResponseComplete;
      break;
    case 'response.incomplete':
      agentEventType = AgentEventType.ResponseIncomplete;
      break;
    case 'response.failed':
      agentEventType = AgentEventType.ResponseFailed;
      break;
    default:
      // For any new LLM event types, we use a generic mapping
      agentEventType = AgentEventType.ResponseComplete;
  }

  return {
    type: agentEventType,
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

// ============================================================================
// TOOL SCHEDULER INTERFACES - Compatible with core package
// ============================================================================

/**
 * Tool call request information - compatible with core package
 */
export interface IToolCallRequestInfo {
  /** Unique call identifier (call_ prefix) */
  callId: string;
  /** Function call identifier (fc_ prefix, used for OpenAI function responses) */
  functionId?: string;
  /** Tool name */
  name: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Whether initiated by client */
  isClientInitiated: boolean;
  /** Associated prompt ID */
  promptId: string;
}

/**
 * Tool call response information - compatible with core package
 */
export interface IToolCallResponseInfo {
  /** Call identifier */
  callId: string;
  /** Display content for UI */
  result?: string;
  /** Error if execution failed */
  error?: Error;
}

/**
 * Tool call execution states
 */
export enum ToolCallStatus {
  Validating = 'validating',
  Scheduled = 'scheduled',
  Executing = 'executing',
  Success = 'success',
  Error = 'error',
  Cancelled = 'cancelled',
  AwaitingApproval = 'awaiting_approval',
}

/**
 * Base tool call interface
 */
export interface IBaseToolCall {
  /** Current status */
  status: ToolCallStatus;
  /** Request information */
  request: IToolCallRequestInfo;
  /** Start time */
  startTime?: number;
  /** Confirmation outcome */
  outcome?: ToolConfirmationOutcome;
}

/**
 * Validating tool call
 */
export interface IValidatingToolCall extends IBaseToolCall {
  status: ToolCallStatus.Validating;
  tool: ITool;
}

/**
 * Scheduled tool call
 */
export interface IScheduledToolCall extends IBaseToolCall {
  status: ToolCallStatus.Scheduled;
  tool: ITool;
}

/**
 * Executing tool call
 */
export interface IExecutingToolCall extends IBaseToolCall {
  status: ToolCallStatus.Executing;
  tool: ITool;
  liveOutput?: string;
}

/**
 * Successful tool call
 */
export interface ISuccessfulToolCall extends IBaseToolCall {
  status: ToolCallStatus.Success;
  tool: ITool;
  response: IToolCallResponseInfo;
  durationMs?: number;
}

/**
 * Errored tool call
 */
export interface IErroredToolCall extends IBaseToolCall {
  status: ToolCallStatus.Error;
  response: IToolCallResponseInfo;
  durationMs?: number;
}

/**
 * Cancelled tool call
 */
export interface ICancelledToolCall extends IBaseToolCall {
  status: ToolCallStatus.Cancelled;
  tool: ITool;
  response: IToolCallResponseInfo;
  durationMs?: number;
}

/**
 * Waiting for approval tool call
 */
export interface IWaitingToolCall extends IBaseToolCall {
  status: ToolCallStatus.AwaitingApproval;
  tool: ITool;
  confirmationDetails: ToolCallConfirmationDetails;
}

/**
 * Union type for all tool call states
 */
export type IToolCall = 
  | IValidatingToolCall
  | IScheduledToolCall
  | IExecutingToolCall
  | ISuccessfulToolCall
  | IErroredToolCall
  | ICancelledToolCall
  | IWaitingToolCall;

/**
 * Completed tool call types
 */
export type ICompletedToolCall = 
  | ISuccessfulToolCall
  | IErroredToolCall
  | ICancelledToolCall;

/**
 * Handler for tool call confirmation
 */
export type IConfirmHandler = (
  toolCall: IWaitingToolCall,
) => Promise<ToolConfirmationOutcome>;

/**
 * Handler for output updates during tool execution
 */
export type IOutputUpdateHandler = (
  toolCallId: string,
  outputChunk: string,
) => void;

/**
 * Handler called when all tool calls complete
 */
export type IAllToolCallsCompleteHandler = (
  completedToolCalls: ICompletedToolCall[],
) => void;

/**
 * Handler for tool call status updates
 */
export type IToolCallsUpdateHandler = (toolCalls: IToolCall[]) => void;

/**
 * Tool scheduler configuration
 */
export interface IToolSchedulerConfig {
  tools?: ITool[];
  /** Output update handler */
  outputUpdateHandler?: IOutputUpdateHandler;
  /** Completion handler */
  onAllToolCallsComplete?: IAllToolCallsCompleteHandler;
  /** Update handler */
  onToolCallsUpdate?: IToolCallsUpdateHandler;
  /** Approval mode */
  approvalMode?: 'default' | 'yolo' | 'always';
  /** Editor preference getter */
  getPreferredEditor?: () => string | undefined;
  /** Configuration object */
  config?: unknown;
}

/**
 * Core tool scheduler interface - tool scheduler interface
 * 
 * This interface defines core tool scheduling functionality including:
 * - Tool call scheduling and execution
 * - State tracking and management
 * - Confirmation and approval workflows
 * - Error handling and retry logic
 * 
 * Implementation references the core package's CoreToolScheduler but uses our own type system
 */
/**
 * Tool execution lifecycle callbacks
 */
export type ToolExecutionStartCallback = (toolCall: IToolCallRequestInfo) => void;
export type ToolExecutionDoneCallback = (
  request: IToolCallRequestInfo,
  response: IToolCallResponseInfo,
  duration?: number,
) => void;

export interface IToolScheduler {
  /**
   * Schedule tool call(s) for execution
   * @param request Tool call request(s)
   * @param signal Abort signal
   * @param callbacks Optional callbacks for tool execution lifecycle
   */
  schedule(
    request: IToolCallRequestInfo | IToolCallRequestInfo[],
    signal: AbortSignal,
    callbacks?: {
      onExecutionStart?: ToolExecutionStartCallback;
      onExecutionDone?: ToolExecutionDoneCallback;
    },
  ): Promise<void>;

  /**
   * Handle confirmation response
   * @param callId Call identifier
   * @param outcome Confirmation outcome
   * @param payload Optional payload for modifications
   */
  handleConfirmationResponse(
    callId: string,
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ): Promise<void>;

  registerTool(tool: ITool): void;

  // return true: removed, false: not found
  removeTool(toolName: string): boolean;

  getTool(name: string): ITool | undefined;

  getToolList(): ITool[];

  /**
   * Get current tool calls
   * @returns Array of current tool calls
   */
  getCurrentToolCalls(): IToolCall[];

  /**
   * Check if scheduler is currently running
   * @returns True if running
   */
  isRunning(): boolean;

  /**
   * Cancel all pending tool calls
   * @param reason Cancellation reason
   */
  cancelAll(reason: string): void;
}

// ============================================================================
// AGENT INTERFACES - Platform agnostic
// ============================================================================

/**
 * Agent configuration
 */
export interface AllConfig {
  agentConfig: IAgentConfig;
   /** Tool scheduler configuration */
   toolSchedulerConfig: Omit<IToolSchedulerConfig, 'tools'>;
   chatConfig: Omit<IChatConfig, 'toolDeclarations'>;
}

/**
 * Agent configuration
 */
export interface IAgentConfig {
  /** The AI model to use */
  model: string;
  /** Working directory for file operations */
  workingDirectory: string;
  /** API key for authentication */
  apiKey?: string;
  /** Default session identifier */
  sessionId?: string;
  /** Maximum number of history records to keep */
  maxHistorySize?: number;
  /** Maximum number of tokens to include in history */
  maxHistoryTokens?: number;
  /** Enable debug mode */
  debugMode?: boolean;
  /** Logger instance for this agent */
  logger?: ILogger;
  /** Log level for this agent */
  logLevel?: LogLevel;
}

/**
 * Agent status
 */
export interface IAgentStatus {
  /** Whether agent is running */
  isRunning: boolean;
  /** Current turn number */
  currentTurn: number;
  /** History size */
  historySize: number;
  /** Configuration */
  config: IAgentConfig;
  /** Last update time */
  lastUpdateTime: number;
  /** Current token usage */
  tokenUsage: ITokenUsage;
  /** Model information */
  modelInfo: { model: string; tokenLimit: number };
}

/**
 * Event handler type
 */
export type EventHandler = (event: AgentEvent) => void;

/**
 * Core Agent interface
 */
export interface IAgent {
  /**
   * Process user input with streaming responses
   * @param userMessages Array of user messages with content and metadata
   * @param sessionId Session identifier
   * @param abortSignal Abort signal
   * @returns AsyncGenerator yielding agent events
   */
  process(
    userMessages: {role: 'user', content: ContentPart, metadata?: {sessionId: string, previousResponseId?: string}}[],
    sessionId: string,
    abortSignal: AbortSignal,
  ): AsyncGenerator<AgentEvent>;

  /**
   * Process user messages (convenience method for string inputs)
   * @param userMessages Array of user message strings
   * @param sessionId Session identifier
   * @param abortSignal Abort signal
   * @returns AsyncGenerator yielding agent events
   */
  processUserMessages(
    userMessages: string[],
    sessionId: string,
    abortSignal: AbortSignal,
  ): AsyncGenerator<AgentEvent>;

  /**
   * Process one turn of conversation
   * @param sessionId - Unique identifier for this conversation session
   * @param chatMessages - Array of chat messages to process
   * @param abortSignal - Signal to abort the processing if needed
   * @returns AsyncGenerator that yields AgentEvent objects
   */
  processOneTurn(
    sessionId: string,
    chatMessages: MessageItem[],
    abortSignal: AbortSignal,
  ): AsyncGenerator<AgentEvent>;
  
  /**
   * Get the underlying chat instance
   * @returns Chat instance
   */
  getChat(): IChat<any>;

  /**
   * Get list of tools
   * @returns List of tools
   */
  getToolList(): ITool[];

  getTool(toolName: string): ITool | undefined;

  registerTool(tool: ITool): void;

  removeTool(toolName: string): boolean;
  
  /**
   * Get the tool scheduler instance
   * @returns Tool scheduler instance
   */
  getToolScheduler(): IToolScheduler;
  
  /**
   * Get current token usage
   * @returns Token usage information
   */
  getTokenUsage(): ITokenUsage;
  
  /**
   * Clear conversation history
   */
  clearHistory(): void;
  
  /**
   * Set system prompt
   * @param systemPrompt System prompt text
   */
  setSystemPrompt(systemPrompt: string): void;
  
  /**
   * Get current system prompt
   * @returns Current system prompt
   */
  getSystemPrompt(): string | undefined;
  
  /**
   * Get current status
   * @returns Agent status
   */
  getStatus(): IAgentStatus;
  
  /**
   * Register event handler
   * @param id Handler ID
   * @param handler Event handler
   */
  onEvent(id: string, handler: EventHandler): void;
  
  /**
   * Remove event handler
   * @param id Handler ID
   */
  offEvent(id: string): void;
}

// ============================================================================
// FACTORY INTERFACES
// ============================================================================

/**
 * Agent factory interface
 */
export interface IAgentFactory {
  /**
   * Create new agent instance
   * @param config Agent configuration
   * @returns Promise resolving to agent instance
   */
  createAgent(config: IAgentConfig): Promise<IAgent>;
  
  /**
   * Create simple agent with minimal configuration
   * @param model Model name
   * @param workingDirectory Working directory
   * @param systemPrompt Optional system prompt
   * @returns Promise resolving to agent instance
   */
  createSimpleAgent(
    model: string,
    workingDirectory: string,
    systemPrompt?: string,
  ): Promise<IAgent>;
}

// ============================================================================
// SESSION MANAGEMENT INTERFACES
// ============================================================================

/**
 * Agent session data structure
 */
export interface AgentSession {
  /** Unique session identifier */
  id: string;
  /** Optional session title */
  title?: string;
  /** Session creation timestamp */
  createdAt: string;
  /** Last activity timestamp */
  lastActiveAt: string;
  /** Message history for this session */
  messageHistory: MessageItem[];
  /** Token usage tracking for this session */
  tokenUsage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  /** Optional metadata for session customization */
  metadata?: Record<string, unknown>;
}

/**
 * Session manager interface for handling multiple conversation sessions
 */
export interface ISessionManager {
  // Core session management
  createSession(title?: string): string;
  getSession(sessionId: string): AgentSession | null;
  getAllSessions(): AgentSession[];
  deleteSession(sessionId: string): boolean;
  setCurrentSession(sessionId: string): boolean;
  getCurrentSession(): AgentSession | null;
  getCurrentSessionId(): string | null;
  
  // Session state management
  updateSessionTitle(sessionId: string, title: string): boolean;
  getSessionCount(): number;
  clearAllSessions(): void;
  
  // Session persistence (for implementations that support it)
  saveSession(sessionId: string): Promise<boolean>;
  loadSession(sessionId: string): Promise<AgentSession | null>;
}

/**
 * Enhanced StandardAgent interface that extends IAgent with session management
 */
export interface IStandardAgent extends IAgent {
  /**
   * Process user input with session management
   * @param userInput User input as string or MessageItem array
   * @param sessionId Optional session identifier
   * @param abortSignal Optional abort signal
   * @returns AsyncGenerator yielding agent events
   */
  processWithSession(
    userInput: string | MessageItem[],
    sessionId?: string,
    abortSignal?: AbortSignal
  ): AsyncGenerator<AgentEvent>;

  // Session management methods
  createNewSession(title?: string): string;
  switchToSession(sessionId: string): boolean;
  getSessionManager(): ISessionManager;
  getCurrentSessionId(): string | null;
  
  // Convenience session methods
  getSessions(): AgentSession[];
  deleteSession(sessionId: string): boolean;
  updateSessionTitle(sessionId: string, title: string): boolean;
  
  // Enhanced tool management with session context
  getToolsForSession(sessionId?: string): ITool[];
  
  // Session-aware status
  getSessionStatus(sessionId?: string): IAgentStatus & { sessionInfo?: AgentSession | undefined };
}

// ============================================================================
// UTILITY TYPES AND TYPE GUARDS
// ============================================================================

/**
 * Partial agent configuration type
 */
export type PartialAgentConfig = Partial<IAgentConfig> & Pick<IAgentConfig, 'model' | 'workingDirectory'>;

/**
 * Type guard for IAgent
 */
export function isAgent(obj: unknown): obj is IAgent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'process' in obj &&
    'getChat' in obj &&
    'getToolScheduler' in obj &&
    'getTokenUsage' in obj &&
    'clearHistory' in obj &&
    'setSystemPrompt' in obj &&
    'getSystemPrompt' in obj &&
    'getStatus' in obj &&
    'onEvent' in obj &&
    'offEvent' in obj
  );
}

/**
 * Type guard for IChat
 */
export function isChat(obj: unknown): obj is IChat<any> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'sendMessageStream' in obj &&
    'getHistory' in obj &&
    'clearHistory' in obj &&
    'addHistory' in obj &&
    'setHistory' in obj &&
    'setSystemPrompt' in obj &&
    'getSystemPrompt' in obj &&
    'getTokenUsage' in obj &&
    'getTokenTracker' in obj &&
    'isProcessing' in obj &&
    'getModelInfo' in obj &&
    'handleModelFallback' in obj
  );
}

/**
 * Type guard for ITool
 */
export function isTool(obj: unknown): obj is ITool {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'description' in obj &&
    'schema' in obj &&
    'isOutputMarkdown' in obj &&
    'canUpdateOutput' in obj &&
    'validateToolParams' in obj &&
    'getDescription' in obj &&
    'shouldConfirmExecute' in obj &&
    'execute' in obj
  );
}