/**
 * @fileoverview Universal AI Agent Framework Interfaces
 * 
 * This file defines platform-agnostic interfaces for AI agents that can work
 * with multiple LLM providers (Gemini, OpenAI, etc.). All interfaces are 
 * designed to be implementation-independent and focus on core functionality.
 */

// Import Schema from genai for tool parameter definitions
import { Schema } from '@google/genai';

// ============================================================================
// CORE DATA TYPES - Platform agnostic
// ============================================================================

/**
 * Generic content part that can represent text, images, or other content types
 */
export interface ContentPart {
  /** Content type */
  type: 'text' | 'image' | 'audio' | 'video' | 'file' | 'function_call' | 'function_response';
  /** Text content (for text type) */
  text?: string;
  /** Base64 encoded data (for media types) */
  data?: string;
  /** MIME type (for media types) */
  mimeType?: string;
  /** Function call information (for function_call type) */
  functionCall?: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  };
  /** Function response information (for function_response type) */
  functionResponse?: {
    id: string;
    name: string;
    result: unknown;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Generic conversation content - our own conversation content type
 * 
 * This type replaces the core package's Content type, providing more flexible
 * content structure supporting multiple media types and function calls.
 * 
 * Key differences from core package's Content:
 * - Uses ContentPart[] instead of Part[]
 * - Supports more role types
 * - Includes optional metadata
 */
export interface ConversationContent {
  /** Role of the content creator */
  role: 'user' | 'assistant' | 'system' | 'function';
  /** Content parts */
  parts: ContentPart[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Generic LLM response
 */
export interface LLMResponse {
  /** Response ID */
  id: string;
  /** Response content */
  content: ConversationContent;
  /** Usage metadata */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Model information */
  model?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Token usage tracking information
 */
export interface ITokenUsage {
  /** Input tokens used in this request */
  inputTokens: number;
  /** Output tokens generated in this request */
  outputTokens: number;
  /** Total tokens used in this request */
  totalTokens: number;
  /** Cumulative tokens used in this session */
  cumulativeTokens: number;
  /** Token limit for the current model */
  tokenLimit: number;
  /** Percentage of token limit used */
  usagePercentage: number;
}

/**
 * Real-time token consumption tracking
 */
export interface ITokenTracker {
  /**
   * Update token usage with new consumption
   * @param usage Token usage metadata
   */
  updateUsage(usage: { inputTokens: number; outputTokens: number }): void;
  
  /**
   * Get current token usage statistics
   * @returns Current token usage information
   */
  getUsage(): ITokenUsage;
  
  /**
   * Reset token tracking (e.g., for new session)
   */
  reset(): void;
  
  /**
   * Check if approaching token limit
   * @param threshold Warning threshold (default: 0.8)
   * @returns True if approaching limit
   */
  isApproachingLimit(threshold?: number): boolean;
}

// ============================================================================
// TOOL INTERFACES - Platform agnostic
// ============================================================================

/**
 * Tool function declaration
 */
export interface ToolDeclaration {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Parameter schema - using genai Schema for compatibility */
  parameters?: Schema;
}

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
 * Tool result display type - can be string or file diff
 */
export type ToolResultDisplay = string | FileDiff;

/**
 * Tool execution result - compatible with core package ToolResult
 */
export interface ToolResult {
  /**
   * A short, one-line summary of the tool's action and result.
   * e.g., "Read 5 files", "Wrote 256 bytes to foo.txt"
   */
  summary?: string;
  
  /**
   * Content meant to be included in LLM history.
   * This should represent the factual outcome of the tool execution.
   * Platform-agnostic version - can be string or ContentPart array
   */
  llmContent: string | ContentPart[];

  /**
   * Display content for user interface.
   * This provides a user-friendly summary or visualization of the result.
   */
  returnDisplay: ToolResultDisplay;
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

/**
 * Chat message parameters
 */
export interface ChatMessage {
  /** Message content */
  content: string | ContentPart[];
  /** Additional configuration */
  config?: Record<string, unknown>;
}

/**
 * Core Chat interface - platform agnostic
 */
export interface IChat {
  /**
   * Send a message and get streaming response
   * @param message Message to send
   * @param promptId Unique identifier for this prompt
   * @returns AsyncGenerator yielding response chunks
   */
  sendMessageStream(
    message: ChatMessage,
    promptId: string,
  ): Promise<AsyncGenerator<LLMResponse>>;
  
  /**
   * Get conversation history
   * @param curated Whether to return curated (valid) history
   * @returns Array of conversation content
   */
  getHistory(curated?: boolean): ConversationContent[];
  
  /**
   * Clear conversation history
   */
  clearHistory(): void;
  
  /**
   * Add content to conversation history
   * @param content Content to add
   */
  addHistory(content: ConversationContent): void;
  
  /**
   * Set entire conversation history
   * @param history New conversation history
   */
  setHistory(history: ConversationContent[]): void;
  
  /**
   * Set system prompt
   * @param systemPrompt System prompt text
   */
  setSystemPrompt(systemPrompt: string): void;
  
  /**
   * Get current system prompt
   * @returns Current system prompt or undefined
   */
  getSystemPrompt(): string | undefined;
  
  /**
   * Get current token usage tracking
   * @returns Token usage information
   */
  getTokenUsage(): ITokenUsage;
  
  /**
   * Get token tracker instance
   * @returns Token tracker for real-time monitoring
   */
  getTokenTracker(): ITokenTracker;
  
  /**
   * Check if chat is currently processing a message
   * @returns True if processing
   */
  isProcessing(): boolean;
  
  /**
   * Get current model information
   * @returns Model name and configuration
   */
  getModelInfo(): { model: string; tokenLimit: number };
  
  /**
   * Handle model fallback
   * @param fallbackModel Model to fallback to
   * @returns True if fallback was successful
   */
  handleModelFallback(fallbackModel: string): boolean;
}

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
 * Agent event types - agent event types
 * 
 * Defines various events emitted during agent processing:
 * - Content: Content generation events
 * - ToolCallRequest: Tool call request events
 * - ToolCallResponse: Tool call response events
 * - TokenUsage: Token usage tracking events
 * - Error: Error events
 * - ModelFallback: Model fallback events
 */
export enum AgentEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
  ToolCallResponse = 'tool_call_response',
  ToolConfirmation = 'tool_confirmation',
  UserCancelled = 'user_cancelled',
  Error = 'error',
  TokenUsage = 'token_usage',
  ModelFallback = 'model_fallback',
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
 * Turn interface - represents a single conversation turn
 */
export interface ITurn {
  /** Turn ID */
  id: string;
  /** Prompt ID */
  promptId: string;
  /** Pending tool calls */
  pendingToolCalls: ToolCallRequest[];
  
  /**
   * Run the turn
   * @param input Input content
   * @param signal Abort signal
   * @returns AsyncGenerator yielding agent events
   */
  run(
    input: ConversationContent,
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent>;
  
  /**
   * Get debug information
   * @returns Debug data
   */
  getDebugInfo(): Record<string, unknown>;
}

// ============================================================================
// TOOL SCHEDULER INTERFACES - Compatible with core package
// ============================================================================

/**
 * Tool call request information - compatible with core package
 */
export interface IToolCallRequestInfo {
  /** Unique call identifier */
  callId: string;
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
  /** Response parts in Gemini format */
  responseParts: unknown;
  /** Display content for UI */
  resultDisplay?: string | FileDiff;
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
  /** Tool registry provider */
  toolRegistry: Promise<unknown>;
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
export interface IToolScheduler {
  /**
   * Schedule tool call(s) for execution
   * @param request Tool call request(s)
   * @param signal Abort signal
   */
  schedule(
    request: IToolCallRequestInfo | IToolCallRequestInfo[],
    signal: AbortSignal,
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
  /** Tool scheduler configuration */
  toolSchedulerConfig?: IToolSchedulerConfig;
  /** Additional provider-specific configuration */
  providerConfig?: Record<string, unknown>;
}

/**
 * Turn result
 */
export interface ITurnResult {
  /** Whether tool calls were made */
  hasToolCalls: boolean;
  /** Events generated */
  events: AgentEvent[];
  /** Assistant response */
  assistantResponse?: string;
  /** Tool calls that were requested */
  toolCalls: ToolCallRequest[];
  /** Token usage for this turn */
  tokenUsage?: ITokenUsage;
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
   * @param userInput User input text
   * @param sessionId Session identifier
   * @param abortSignal Abort signal
   * @returns AsyncGenerator yielding agent events
   */
  process(
    userInput: string,
    sessionId: string,
    abortSignal: AbortSignal,
  ): AsyncGenerator<AgentEvent>;
  
  /**
   * Get the underlying chat instance
   * @returns Chat instance
   */
  getChat(): IChat;
  
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
export function isChat(obj: unknown): obj is IChat {
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