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
  EventHandler,
  PartialAgentConfig,
  AllConfig,
  
  // Chat interfaces
  IChat,
  IChatConfig,
  ITokenUsage,
  ITokenTracker,
  
  // Tool interfaces
  ITool,
  ToolDeclaration,
  ToolResult,
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
  
  ToolCallRequest,
  ToolCallResponse,
  
  // Data types
  ContentPart,
  MessageItem as ConversationContent,
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

// Chat implementations
export { GeminiChat } from './chat/geminiChat.js';
export { OpenAIChatResponse } from './chat/openaiChat.js';
export { OpenAIChatResponse as OpenAIChat } from './chat/openaiChat.js'; // Alias for compatibility

// Agent implementation
export { BaseAgent } from './baseAgent.js';
export { StandardAgent } from './standardAgent.js';

// Tool scheduler implementation
export { CoreToolScheduler } from './coreToolScheduler.js';

// Token tracker implementation
export { TokenTracker } from './chat/tokenTracker.js';

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

// Utility functions
export {
  convertTypesToLowercase,
  deepClone,
  generateId,
  safeJsonParse,
  isValidJson,
  truncateText,
} from './utils.js';

// Re-export essential types from @google/genai (our only external dependency)
export { Type } from '@google/genai';
export type { Schema } from '@google/genai';

