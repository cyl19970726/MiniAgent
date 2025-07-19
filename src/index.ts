/**
 * @fileoverview Agent Framework Main Exports
 * 
 * This file exports the core components of the Agent framework.
 * Following the principle of "reference not depend", we only export
 * our own implementations and interfaces.
 */

// ============================================================================
// CORE INTERFACES
// ============================================================================

export type {
  // Core agent interfaces
  IAgent,
  IAgentConfig,
  IAgentStatus,
  IAgentFactory,
  ITurnResult,
  EventHandler,
  PartialAgentConfig,
  AllConfig,
  
  // Chat interfaces
  IChat,
  IChatConfig,
  ITokenUsage,
  ITokenTracker,
  ChatMessage,
  
  // Tool interfaces
  ITool,
  ToolDeclaration,
  ToolResult,
  ToolResultDisplay,
  FileDiff,
  ToolConfirmationPayload,
  ToolCallConfirmationDetails,
  ToolEditConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolMcpConfirmationDetails,
  ToolInfoConfirmationDetails,
  
  // Tool scheduler interfaces
  IToolScheduler,
  IToolSchedulerConfig,
  IToolCallRequestInfo,
  IToolCallResponseInfo,
  IToolCall,
  ICompletedToolCall,
  IConfirmHandler,
  IOutputUpdateHandler,
  IAllToolCallsCompleteHandler,
  IToolCallsUpdateHandler,
  
  
  // Turn interfaces
  ITurn,
  ToolCallRequest,
  ToolCallResponse,
  
  // Data types
  ContentPart,
  ConversationContent,
  LLMResponse,
  
  // Event types
  AgentEvent,
} from './interfaces.js';

// ============================================================================
// ENUMS
// ============================================================================

export {
  AgentEventType,
  ToolConfirmationOutcome,
  ToolCallStatus,
} from './interfaces.js';

export {
  LogLevel,
} from './logger.js';

export type {
  // Logger interfaces
  ILogger,
  ILoggerConfig,
} from './logger.js';

// ============================================================================
// TYPE GUARDS
// ============================================================================

export { isAgent, isChat, isTool } from './interfaces.js';

// ============================================================================
// IMPLEMENTATIONS
// ============================================================================

// Chat implementation
export { GeminiChat } from './geminiChat.js';

// Agent implementation
export { BaseAgent } from './baseAgent.js';
export { StandardAgent } from './standardAgent.js';

// Tool scheduler implementation
export { CoreToolScheduler } from './coreToolScheduler.js';

// Token tracker implementation
export { TokenTracker } from './tokenTracker.js';

// Event system
export {
  AgentEventFactory,
  AgentEventEmitter,
  AgentEventUtils,
} from './agentEvent.js';

// Base tool implementation
export {
  BaseTool,
  SimpleTool,
} from './baseTool.js';

// Logger implementation
export {
  Logger,
  getLogger,
  setLogger,
  configureLogger,
  createLogger,
  logMethod,
} from './logger.js';

// ============================================================================
// UTILITIES
// ============================================================================

// Re-export essential types from @google/genai (our only external dependency)
export type {
  Schema,
} from '@google/genai';