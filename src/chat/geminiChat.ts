/**
 * @fileoverview Simplified GeminiChat Implementation
 * 
 * This module provides a GeminiChat implementation that follows our unified IChat framework
 * using Gemini's Chat API for maximum simplicity and consistency.
 * 
 * Key design principles:
 * - Uses Gemini Chat API directly (no over-abstraction)
 * - Follows unified event streaming (Start → Delta → Done → Complete)
 * - Automatic history management on Done events
 * - Final-only token usage strategy
 * - Single content per message (no complex multi-part)
 */

import { GoogleGenAI } from '@google/genai';
import type { Content as GeminiContent, Part as GeminiPart } from '@google/genai';
import {
  IChat,
  LLMStart,
  LLMChunkTextDelta,
  LLMChunkTextDone,
  LLMChunkThinking,
  LLMFunctionCallDone,

  LLMComplete,
  LLMResponse,
  ChunkItem,
  MessageItem,
  ContentPart,
  IChatConfig,
  ToolDeclaration,
} from './interfaces';
import { TokenTracker } from './tokenTracker.js';
import { ITokenTracker, ITokenUsage } from './interfaces';
import { ILogger, LogLevel, createLogger } from '../logger';
import { convertTypesToLowercase } from '../utils';

type GeminiMessage = GeminiContent;

/**
 * Old MessageItem structure (for migration compatibility)
 */
interface OldMessageItem {
  role: string;
  parts: ContentPart[];
  metadata?: any;
}

/**
 * GeminiChat - Simplified implementation using Chat API
 * 
 * This class eliminates the complex over-abstraction of the previous implementation
 * and directly uses Gemini's Chat API while conforming to our unified IChat framework.
 */
export class GeminiChat implements IChat<GeminiMessage> {
  private ai: GoogleGenAI;
  private history: MessageItem[] = [];
  private tokenTracker: TokenTracker;
  private sendPromise: Promise<void> = Promise.resolve();
  private isCurrentlyProcessing: boolean = false;
  private logger: ILogger;

  constructor(private readonly chatConfig: IChatConfig) {
    this.logger = createLogger('GeminiChat', { level: LogLevel.INFO });
    this.logger.debug(`Initializing GeminiChat with model: ${chatConfig.modelName}`, 'GeminiChat.constructor()');
    
    this.ai = new GoogleGenAI({
      apiKey: chatConfig.apiKey
    });
    
    // Convert old history format if needed and initialize
    this.initializeHistory();
    this.tokenTracker = new TokenTracker(chatConfig.modelName, chatConfig.tokenLimit);
  }

  /**
   * Initialize history from config, converting old format if necessary
   */
  private initializeHistory(): void {
    if (this.chatConfig.initialHistory) {
      // Check if it's old format (has parts array) or new format (has content)
      const history = this.chatConfig.initialHistory as any[];
      if (history.length > 0 && 'parts' in history[0]) {
        // Old format - convert to new
        this.history = this.convertHistoryToNewFormat(history as OldMessageItem[]);
      } else {
        // Already new format
        this.history = [...this.chatConfig.initialHistory];
      }
    } else {
      this.history = [];
    }
  }

  /**
   * Convert old history format (parts array) to new format (single content)
   * 
   * Strategy: Split each multi-part message into multiple single-content messages
   */
  private convertHistoryToNewFormat(oldHistory: OldMessageItem[]): MessageItem[] {
    const newHistory: MessageItem[] = [];
    
    for (const oldMessage of oldHistory) {
      const splitMessages = this.splitPartsToMessages(oldMessage);
      newHistory.push(...splitMessages);
    }
    
    return newHistory;
  }

  /**
   * Split multi-part message into multiple single-content messages
   */
  private splitPartsToMessages(oldMessage: OldMessageItem): MessageItem[] {
    const messages: MessageItem[] = [];
    
    for (const part of oldMessage.parts) {
      messages.push({
        role: oldMessage.role as 'user' | 'assistant',
        content: part  // Direct use of part as content
      });
    }
    
    return messages;
  }

  /**
   * Create a fresh chat instance with current history
   * 
   * We create a new instance each time to ensure history synchronization
   */
  private createChatInstance(): any {
    const geminiHistory = this.convertHistoryToGemini(this.history);
    
    const config: any = {
      model: this.chatConfig.modelName,
      history: geminiHistory,
    };

    // Add system instruction if available
    if (this.chatConfig.systemPrompt) {
      config.systemInstruction = this.chatConfig.systemPrompt;
    }

    // Add tools if available
    if (this.chatConfig.toolDeclarations && this.chatConfig.toolDeclarations.length > 0) {
      config.tools = [{
        functionDeclarations: this.chatConfig.toolDeclarations.map((tool: ToolDeclaration) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters ? convertTypesToLowercase(tool.parameters) : undefined,
        }))
      }];
    }

    // Add thinking config for Gemini 2.5 models
    if (this.chatConfig.modelName.includes('2.5')) {
      config.generationConfig = {
        ...config.generationConfig,
        responseSchema: undefined, // Let thinking work naturally
      };
      config.thinkingConfig = {
        includeThoughts: true,
      };
    }

    return this.ai.chats.create(config);
  }

  /**
   * CORE METHOD: Send message and get streaming response
   * 
   * Implements our unified streaming pattern: Start → Delta → Done → Complete
   */
  async sendMessageStream(
    messages: MessageItem[],
    promptId: string,
  ): Promise<AsyncGenerator<LLMResponse>> {
    return this.createStreamingResponse(messages, promptId);
  }

  /**
   * Create streaming response with unified event flow
   * 
   * This follows our standard pattern: LLMStart → LLMChunk*Delta → LLMChunk*Done → LLMComplete
   */
  private async *createStreamingResponse(
    messages: MessageItem[],
    promptId: string,
  ): AsyncGenerator<LLMResponse> {
    await this.sendPromise;
    
    this.isCurrentlyProcessing = true;
    
    // Promise for completion tracking
    let completionResolve!: () => void;
    let completionReject!: (error: any) => void;
    
    this.sendPromise = new Promise<void>((resolve, reject) => {
      completionResolve = resolve;
      completionReject = reject;
    });

    try {
      // 1. Create chat instance with current history
      const chat = this.createChatInstance();
      
      // 2. Send LLMStart event
      yield {
        id: promptId,
        type: 'response.start',
        model: this.chatConfig.modelName,
        tools: this.chatConfig.toolDeclarations,
      } as LLMStart;

      // 3. Convert messages to Gemini format and start streaming
      // For multiple messages, we need to add them to history first
      for (const message of messages) {
        this.addHistory(message);
      }
      
      // Send the last message for streaming (Gemini uses history for context)
      const lastMessage = messages[messages.length - 1];
      const geminiMessage = this.convertMessageToGemini(lastMessage);
      const stream = await chat.sendMessageStream({
        message: geminiMessage,
      });
      
      // 4. Process streaming chunks with unified event mapping
      const responseChunks: ChunkItem[] = [];
      let chunkIndex = 0;
      let accumulatedText = '';
      let finalUsage = null;

      for await (const chunk of stream) {
        // Save final usage (Gemini provides cumulative usage)
        if (chunk.usageMetadata) {
          finalUsage = chunk.usageMetadata;
        }

        // Handle different chunk types
        if (chunk.text) {
          // Text streaming
          accumulatedText += chunk.text;
          
          const deltaChunk: LLMChunkTextDelta = {
            type: 'response.chunk.text.delta',
            chunk_idx: chunkIndex++,
            content: {
              type: 'text',
              text_delta: chunk.text,
            },
          };
          
          responseChunks.push(deltaChunk);
          yield deltaChunk;
        }

        // Handle thinking (for Gemini 2.5)
        if ((chunk as any).thinking) {
          const thinkingChunk: LLMChunkThinking = {
            type: 'response.chunk.thinking.done',
            thinking: (chunk as any).thinking,
            chunk_idx: chunkIndex++,
            content: {
              type: 'thinking',
              thinking: (chunk as any).thinking,
            },
          };
          
          responseChunks.push(thinkingChunk);
          this.addHistory(this.convertFromChunkItems(thinkingChunk, 'assistant'));
          yield thinkingChunk;
        }

        // Handle function calls (if present)
        if ((chunk as any).functionCall) {
          const funcCall = (chunk as any).functionCall;
          const functionChunk: LLMFunctionCallDone = {
            type: 'response.chunk.function_call.done',
            content: {
              type: 'function_call',
              functionCall: {
                id: funcCall.id || `call_${Date.now()}`,
                call_id: funcCall.id || `call_${Date.now()}`,
                name: funcCall.name,
                args: JSON.stringify(funcCall.args || {}),
              },
            },
          };
          
          responseChunks.push(functionChunk);
          this.addHistory(this.convertFromChunkItems(functionChunk, 'assistant'));
          yield functionChunk;
        }
      }

      // 5. Send Done event for accumulated text + Auto History
      if (accumulatedText) {
        const doneChunk: LLMChunkTextDone = {
          type: 'response.chunk.text.done',
          chunk_idx: chunkIndex,
          content: {
            type: 'text',
            text: accumulatedText,
          },
        };
        
        responseChunks.push(doneChunk);
        this.addHistory(this.convertFromChunkItems(doneChunk, 'assistant'));
        yield doneChunk;
      }

      // 6. Send Complete event with final metadata
      yield {
        response_id: promptId,
        type: 'response.complete',
        model: this.chatConfig.modelName,
        chunks: responseChunks,
        usage: finalUsage ? {
          inputTokens: finalUsage.promptTokenCount || 0,
          inputTokenDetails: {
            cachedTokens: 0, // Gemini doesn't provide this
          },
          outputTokens: finalUsage.candidatesTokenCount || 0,
          outputTokenDetails: {
            reasoningTokens: 0, // Would need to parse from thinking
          },
          totalTokens: finalUsage.totalTokenCount || 0,
        } : undefined,
        previous_response_id: '',
      } as LLMComplete;

      // 7. Update token tracker ONCE with final usage (prevent double-counting)
      if (finalUsage) {
        this.tokenTracker.updateUsage({
          inputTokens: finalUsage.promptTokenCount || 0,
          outputTokens: finalUsage.candidatesTokenCount || 0,
        });
      }

      // Messages already added to history above
      
      completionResolve();
      
    } catch (error) {
      this.isCurrentlyProcessing = false;
      this.logger.error(`Error in streaming response: ${error instanceof Error ? error.message : String(error)}`, 'GeminiChat.createStreamingResponse()');
      completionReject(error);
      throw error;
    } finally {
      this.isCurrentlyProcessing = false;
    }
  }

  // ============================================================================
  // CONVERSION METHODS - Provider-specific format handling
  // ============================================================================

  /**
   * Convert our MessageItem to Gemini format
   */
  convertToProviderMessage(message: MessageItem): GeminiMessage {
    const part = this.convertContentPartToGeminiPart(message.content);
    
    return {
      role: message.role === 'assistant' ? 'model' : message.role,
      parts: [part]  // Single content becomes single part
    } as GeminiMessage;
  }

  /**
   * Convert our MessageItem to Gemini message format (for streaming)
   */
  private convertMessageToGemini(message: MessageItem): string | GeminiPart[] {
    if (message.content.type === 'text' && message.content.text) {
      return message.content.text;
    }
    
    // For non-text content, convert to parts array
    return [this.convertContentPartToGeminiPart(message.content)];
  }

  /**
   * Convert ContentPart to GeminiPart
   */
  private convertContentPartToGeminiPart(content: ContentPart): GeminiPart {
    switch (content.type) {
      case 'text':
        return { text: content.text || '' };
        
      case 'function_call':
        return {
          functionCall: {
            name: content.functionCall?.name || '',
            args: content.functionCall?.args ? 
              JSON.parse(content.functionCall.args) : {}
          }
        } as GeminiPart;
        
      case 'function_response':
        return {
          functionResponse: {
            name: content.functionResponse?.name || '',
            response: content.functionResponse?.result ?
              JSON.parse(content.functionResponse.result) : {}
          }
        } as GeminiPart;
        
      default:
        return { text: JSON.stringify(content) };
    }
  }

  /**
   * Convert ChunkItem to MessageItem for history
   * 
   * CRITICAL: This is called automatically for all Done events
   */
  convertFromChunkItems(chunk: ChunkItem, role: 'user' | 'assistant'): MessageItem {
    return {
      role,
      content: chunk.content  // Unified content structure
    };
  }

  /**
   * Convert our history to Gemini format
   */
  private convertHistoryToGemini(history: MessageItem[]): GeminiContent[] {
    return history.map(message => this.convertToProviderMessage(message));
  }

  // ============================================================================
  // HISTORY MANAGEMENT - Unified interface implementation
  // ============================================================================

  getHistory(_curated: boolean = false): MessageItem[] {
    // For now, we don't implement curation filtering
    // All messages in our new system should be valid
    return structuredClone(this.history);
  }

  clearHistory(): void {
    this.history = [];
    this.tokenTracker.reset();
  }

  addHistory(content: MessageItem): void {
    this.history.push(content);
  }

  setHistory(history: MessageItem[]): void {
    this.history = [...history];
    this.tokenTracker.reset();
  }

  // ============================================================================
  // CONFIGURATION & STATUS - Standard interface methods
  // ============================================================================

  setSystemPrompt(systemPrompt: string): void {
    this.chatConfig.systemPrompt = systemPrompt;
  }

  getSystemPrompt(): string | undefined {
    return this.chatConfig.systemPrompt;
  }

  getTokenUsage(): ITokenUsage {
    return this.tokenTracker.getUsage();
  }

  getTokenTracker(): ITokenTracker {
    return this.tokenTracker;
  }

  isProcessing(): boolean {
    return this.isCurrentlyProcessing;
  }

  getModelInfo(): { model: string; tokenLimit: number } {
    return {
      model: this.chatConfig.modelName,
      tokenLimit: this.chatConfig.tokenLimit,
    };
  }

  handleModelFallback(fallbackModel: string): boolean {
    try {
      const apiKey = this.chatConfig.apiKey;
      if (!apiKey || apiKey.trim() === '') {
        console.warn('No API key available for model fallback');
        return false;
      }
      
      // Update model name and reinitialize
      this.chatConfig.modelName = fallbackModel;
      this.ai = new GoogleGenAI({ apiKey });
      return true;
    } catch (error) {
      console.warn('Failed to switch to fallback model:', error);
      return false;
    }
  }

  getUsageSummary(): string {
    return this.tokenTracker.getUsageSummary();
  }
} 