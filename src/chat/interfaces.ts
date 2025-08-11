/**
 * @fileoverview Universal AI Chat Framework Interfaces
 * 
 * This file defines the core abstractions for our chat system that allows
 * multiple LLM providers to be unified under a single interface design.
 * 
 * DESIGN PRINCIPLE: We don't adapt to provider APIs - providers adapt to our design.
 */

import { Schema } from '@google/genai';

// ============================================================================
// CORE CONTENT TYPES - Universal abstractions
// ============================================================================

/**
 * Universal content part - the atomic unit of all AI communication
 */
export interface ContentPart {
  /** Content type - extensible for future types */
  type: 'text' | 'thinking' | 'image' | 'audio' | 'video' | 'file' | 'function_call' | 'function_response';
  
  // Text content variations
  /** Primary text content */
  text?: string;
  /** Streaming text delta (for incremental updates) */
  text_delta?: string;
  /** AI reasoning/thinking content */
  thinking?: string;
  /** Streaming thinking delta */
  thinking_delta?: string;
  
  // Media content
  /** Base64 encoded data (for media types) */
  data?: string;
  /** MIME type (for media types) */
  mimeType?: string;
  
  // Function calling content
  /** Function call information */
  functionCall?: {
    id?: string;       // Output item ID (optional)
    call_id: string;   // Function call ID for correlation (required)
    name: string;      // Function name
    args: string;      // JSON string of arguments
  };
  
  /** Function response information */
  functionResponse?: {
    id?: string;        // Output item ID (optional) 
    call_id: string;   // Function call ID for correlation (required)
    name: string;      // Function name
    result: string;    // JSON string of result
  };
  
  /** Additional metadata for extensibility */
  metadata?: Record<string, unknown>;
}

/**
 * Message item - represents a single message in conversation history
 * 
 * DESIGN PRINCIPLE: Simple, focused structure. Each message has one role and one content.
 */
export interface MessageItem {
  /** Role of the message creator */
  role: 'user' | 'assistant';
  /** Single content part - keeps messages atomic and focused */
  content: ContentPart;
  /** Turn index for cache optimization - tracks which turn this message belongs to */
  turnIdx?: number;
  /** Additional metadata for extensibility */
  metadata?: {
    sessionId?: string;
    timestamp?: number;
    turn?: number;
    responseId?: string; // Link to OpenAI response ID
  };
}

// ============================================================================
// STREAMING EVENT SYSTEM - Core abstraction
// ============================================================================

/**
 * Streaming function call reference (for compatibility)
 */
export interface FunctionCallStr {
  id: string;
  call_id: string;
  name: string;
  args: string; // JSON string
}

/**
 * Response start event - signals beginning of AI response
 */
export interface LLMStart {
  id: string;
  type: 'response.start';
  model: string;
  tools?: ToolDeclaration[];
}

/**
 * Basic chunk metadata - signals chunk creation/completion
 */
export interface LLMChunk {
  type: 'response.chunk.added' | 'response.chunk.done';
  chunk_idx: number; // Index of this chunk in the response
  chunk_id: string;  // Unique chunk identifier
}

/**
 * Text streaming events - for incremental text generation
 */
export interface LLMChunkTextDelta {
  type: 'response.chunk.text.delta';
  chunk_idx: number;
  content: ContentPart;  // Contains text_delta
}

export interface LLMChunkTextDone {
  type: 'response.chunk.text.done';
  chunk_idx: number;
  content: ContentPart;  // Contains complete text
}

/**
 * Thinking/reasoning events - for AI reasoning transparency
 */
export interface LLMChunkThinking {
  type: 'response.chunk.thinking.delta' | 'response.chunk.thinking.done';
  thinking: string;  // Backward compatibility
  chunk_idx: number;
  content: ContentPart;  // Contains thinking or thinking_delta
}

/**
 * Function call events - for tool usage
 */
export interface LLMFunctionCallDone {
  type: 'response.chunk.function_call.done';
  content: ContentPart;  // Contains functionCall
}

export interface LLMFunctionCallDelta {
  type: 'response.chunk.function_call.delta';
  content: ContentPart;  // Contains partial functionCall
}

/**
 * ChunkItem - Union of all possible chunk types
 */
export type ChunkItem = 
  | LLMChunkThinking 
  | LLMChunkTextDone 
  | LLMChunkTextDelta 
  | LLMFunctionCallDone 
  | LLMFunctionCallDelta;

/**
 * Response completion event - signals end of AI response
 */
export interface LLMComplete {
  response_id: string;
  type: 'response.complete' | 'response.incomplete' | 'response.failed';
  model: string;
  chunks: ChunkItem[];  // All chunks from this response
  
  /** Token usage metadata */
  usage?: {
    inputTokens: number;
    inputTokenDetails: {
      cachedTokens: number;
    };
    outputTokens: number;
    outputTokenDetails: {
      reasoningTokens: number;
    };
    totalTokens: number;
  };
  
  previous_response_id: string;
  
  /** For incomplete responses */
  incomplete_details?: {
    reason: string;
  };
  
  /** For failed responses */
  error?: {
    code?: string;
    message?: string;
  };
}

/**
 * LLMResponse - Union of all possible response events
 */
export type LLMResponse = 
  | LLMStart 
  | LLMChunk 
  | LLMChunkTextDelta 
  | LLMChunkTextDone 
  | LLMFunctionCallDone 
  | LLMFunctionCallDelta 
  | LLMComplete 
  | LLMChunkThinking;

// ============================================================================
// TOOL SYSTEM INTERFACES
// ============================================================================

/**
 * Tool function declaration
 */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters?: Schema;
}

// ============================================================================
// CHAT CONFIGURATION
// ============================================================================

/**
 * Chat configuration - provider-agnostic settings
 */
export interface IChatConfig {
  apiKey: string;
  modelName: string;
  tokenLimit: number;
  systemPrompt?: string;
  initialHistory?: MessageItem[];
  parallelToolCalls?: boolean;
}

// ============================================================================
// CORE CHAT INTERFACE - The heart of our design
// ============================================================================

/**
 * IChat<T> - Universal Chat Interface
 * 
 * CRITICAL FLOW:
 * sendMessageStream() -> yield LLMResponse events -> convertFromChunkItems() -> addHistory()
 */
export interface IChat<T> {
  /**
   * CORE METHOD: Send messages and get streaming response
   */
  sendMessageStream(
    messages: MessageItem[],
    promptId: string,
    toolDeclarations?: ToolDeclaration[],
  ): Promise<AsyncGenerator<LLMResponse>>;

  /**
   * CONVERSION METHOD: Convert our format to provider format
   */
  convertToProviderMessage(message: MessageItem): T;

  /**
   * HISTORY INTEGRATION: Convert chunk to history item
   */
  convertFromChunkItems(chunk: ChunkItem, role: 'user' | 'assistant'): MessageItem;
  
  // ===== HISTORY MANAGEMENT =====
  
  getHistory(curated?: boolean): MessageItem[];
  clearHistory(): void;
  addHistory(content: MessageItem): void;
  setHistory(history: MessageItem[]): void;
  
  // ===== CONFIGURATION =====
  
  setSystemPrompt(systemPrompt: string): void;
  getSystemPrompt(): string | undefined;
  
  // ===== STATUS & MONITORING =====
  
  getTokenUsage(): ITokenUsage;
  getTokenTracker(): ITokenTracker;
  isProcessing(): boolean;
  getModelInfo(): { model: string; tokenLimit: number };
  handleModelFallback(fallbackModel: string): boolean;
}

// ============================================================================
// TOKEN TRACKING INTERFACES
// ============================================================================

/**
 * Token usage tracking information
 */
export interface ITokenUsage {
  /** Input tokens used in this request */
  inputTokens: number;
  inputTokenDetails?: {
    cachedTokens: number;
  };
  /** Output tokens generated in this request */
  outputTokens: number;
  outputTokenDetails?: {
    reasoningTokens: number;
  };
  /** Total tokens used in this request */
  totalTokens: number;
  
  /** Cumulative tokens used in this session */
  cumulativeTokens: number;
  /** Token limit for the current model */
  tokenLimit: number;
  /** Percentage of token limit used */
  usagePercentage: number;
  
  // 🔑 NEW: Cache performance metrics
  /** Percentage of requests that hit cache */
  cacheHitRate?: number;
  /** Total tokens saved through caching */
  tokenSavings?: number;
  /** Requests that could use cache */
  totalCacheableRequests?: number;
  /** Requests that actually hit cache */
  actualCacheHits?: number;
}

/**
 * Real-time token consumption tracking
 */
export interface ITokenTracker {
  /**
   * Update token usage with new consumption
   * @param usage Token usage metadata
   */
  updateUsage(usage: {
    inputTokens: number;
    inputTokenDetails?: {
      cachedTokens: number;
    };
    outputTokens: number;
    outputTokenDetails?: {
      reasoningTokens: number;
    };
    totalTokens?: number;
  }): void;
  
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
// TYPE GUARDS
// ============================================================================

export function isChat(obj: unknown): obj is IChat<any> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'sendMessageStream' in obj &&
    'convertFromChunkItems' in obj &&
    'getHistory' in obj &&
    'addHistory' in obj
  );
} 