/**
 * @fileoverview Universal IChat Framework - Main Exports
 * 
 * This module provides the main exports for our unified chat system.
 * All LLM providers implement the same IChat interface for consistency.
 */

// Core interfaces
export {
  ContentPart,
  MessageItem,
  IChat,
  IChatConfig,
  
  // Event types
  LLMResponse,
  LLMStart,
  LLMChunk,
  LLMChunkTextDelta,
  LLMChunkTextDone,
  LLMChunkThinking,
  LLMFunctionCallDone,
  LLMFunctionCallDelta,
  LLMComplete,
  ChunkItem,
  
  // Tool system
  ToolDeclaration,
  FunctionCallStr,
  
  // Type guards
  isChat,
} from './interfaces.js';

// Provider implementations
export { OpenAIChatResponse } from './openaiChat.js';
export { GeminiChat } from './geminiChat.js';

// Re-export common types from parent
export type { ITokenTracker, ITokenUsage } from '../interfaces.js'; 