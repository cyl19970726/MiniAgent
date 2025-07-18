/**
 * @fileoverview Platform-agnostic GeminiChat implementation
 * 
 * This module provides a GeminiChat implementation that follows the IChat interface
 * and integrates with our Agent framework. It references the core package patterns
 * but uses our own type system and token tracking.
 * 
 * Key features:
 * - Streaming-first approach for real-time responses
 * - Integrated token tracking with ITokenTracker
 * - Dual history system (comprehensive vs curated)
 * - Platform-agnostic content types
 * - Robust error handling and validation
 */

import {
  GoogleGenAI,
  GenerateContentResponse,
  GenerateContentParameters,
  GenerateContentConfig,
  Content as GeminiContent,
  Part as GeminiPart,
  FunctionCallingConfigMode,
} from '@google/genai';
import {
  IChat,
  ITokenTracker,
  ITokenUsage,
  ChatMessage,
  LLMResponse,
  ConversationContent,
  ContentPart,
  IChatConfig,
} from './interfaces.js';
import { TokenTracker } from './tokenTracker.js';
import { ILogger, LogLevel, createLogger } from './logger.js';

function isThinkingSupported(model: string) {
  if (model.startsWith('gemini-2.5')) return true;
  return false;
}

/**
 * GeminiChat implementation using our platform-agnostic interfaces
 * 
 * This class provides streaming chat functionality with integrated token tracking
 * and conversation history management. It implements the IChat interface and works
 * with our ConversationContent type system while interfacing with Google's Gemini API.
 * 
 * Key implementation details:
 * - Uses Google's GenerativeAI SDK directly
 * - Converts between our types and Gemini's types
 * - Maintains conversation history in our format
 * - Provides real-time token tracking
 * - Supports streaming and non-streaming responses
 */
export class GeminiChat implements IChat {
  private history: ConversationContent[] = [];
  private tokenTracker: TokenTracker;
  private sendPromise: Promise<void> = Promise.resolve();
  private isCurrentlyProcessing: boolean = false;
  private aiClient: GoogleGenAI;
  private contentGenerator: {
    generateContentStream: (request: GenerateContentParameters) => Promise<AsyncGenerator<GenerateContentResponse>>;
  };
  private generateContentConfig: GenerateContentConfig;
  private logger: ILogger;

  constructor(
    private readonly chatConfig: IChatConfig,
  ) {
    this.chatConfig = chatConfig;
    this.logger = createLogger('GeminiChat', { level: LogLevel.INFO });
    this.logger.debug(`Initializing GeminiChat with model: ${chatConfig.modelName}`, 'GeminiChat.constructor()');
    
    this.aiClient = new GoogleGenAI({ apiKey: chatConfig.apiKey });
    this.contentGenerator = this.aiClient.models;
    this.history = [...chatConfig.initialHistory || []];
    this.tokenTracker = new TokenTracker(chatConfig.modelName, chatConfig.tokenLimit);

    let config: GenerateContentConfig = {
      systemInstruction: chatConfig.systemPrompt || '',
    }

    // Only add tools if we have tool declarations
    if (chatConfig.toolDeclarations && chatConfig.toolDeclarations.length > 0) {
      config.tools = [{
        functionDeclarations: chatConfig.toolDeclarations.map(tool => {
          const declaration: any = {
            name: tool.name,
            description: tool.description,
          };
          if (tool.parameters) {
            // Convert Type enum values (uppercase) to lowercase for Gemini API
            declaration.parameters = this.convertTypesToLowercase(tool.parameters);
          }

          return declaration;
        })
      }];
      
      // Force the model to call 'any' function, instead of chatting.
      config.toolConfig = {
        functionCallingConfig: {
          // see https://ai.google.dev/gemini-api/docs/function-calling?example=meeting#function_calling_modes
          mode: chatConfig.parallelToolCalls ? FunctionCallingConfigMode.ANY : FunctionCallingConfigMode.AUTO
        }
      };
    }

    this.generateContentConfig = isThinkingSupported(
      chatConfig.modelName
    )
      ? {
          ...config,
          thinkingConfig: {
            includeThoughts: true,
          },
        }
      : config;

  }

  /**
   * Send a message and get streaming response
   * 
   * Implements the IChat interface for streaming message sending.
   * Converts our ChatMessage format to Gemini's format and processes
   * the streaming response.
   * 
   * @param message - Message in our ChatMessage format
   * @param promptId - Unique identifier for this prompt
   * @returns AsyncGenerator yielding LLMResponse objects
   */
  async sendMessageStream(
    message: ChatMessage,
    promptId: string,
  ): Promise<AsyncGenerator<LLMResponse>> {
    await this.sendPromise;
    
    this.isCurrentlyProcessing = true;
    
    const messagePreview = typeof message.content === 'string' 
      ? message.content.slice(0, 100) + (message.content.length > 100 ? '...' : '')
      : `${message.content.length} content parts`;
    
    this.logger.info(`Sending message stream (${promptId}): ${messagePreview}`, 'GeminiChat.sendMessageStream()');
    
    try {
      // Convert our message format to Gemini format
      const userContent = this.convertToGeminiContent(message.content, 'user');
      let requestContents = this.getGeminiHistory(true);
      
      requestContents = requestContents.concat([userContent]);

      this.logger.debug(`Request contains ${requestContents.length} content items`, 'GeminiChat.sendMessageStream()');
      
      // Create request (system prompt will be handled via conversation history)
      // Deep clone the config to avoid mutations
      const requestConfig = JSON.parse(JSON.stringify(this.generateContentConfig));
      
      const request: GenerateContentParameters = {
        model: this.chatConfig.modelName,
        contents: requestContents,
        config: requestConfig,
      };

      this.logger.debug(`Calling Gemini API with model: ${this.chatConfig.modelName}`, 'GeminiChat.sendMessageStream()');
      const streamResponse = await this.contentGenerator.generateContentStream(request);
      const result = this.processStreamResponse(streamResponse, this.convertFromGeminiContent(userContent), promptId);
      
      // Update sendPromise to track completion
      this.sendPromise = this.waitForStreamCompletion(result);
      
      return result;
    } catch (error) {
      this.isCurrentlyProcessing = false;
      this.logger.error(`Error in sendMessageStream: ${error instanceof Error ? error.message : String(error)}`, 'GeminiChat.sendMessageStream()');
      throw error;
    }
  }

  /**
   * Process streaming response and update history
   * 
   * Converts Gemini's streaming response to our LLMResponse format
   * and manages conversation history updates.
   * 
   * @param streamResponse - Gemini's streaming response
   * @param inputContent - User input in our format
   * @param promptId - Prompt identifier
   * @returns AsyncGenerator yielding our LLMResponse objects
   */
  private async *processStreamResponse(
    streamResponse: AsyncGenerator<GenerateContentResponse>,
    inputContent: ConversationContent,
    promptId: string,
  ): AsyncGenerator<LLMResponse> {
    const outputContent: ConversationContent[] = [];
    let errorOccurred = false;
    let responseId = 0;
    let chunkCount = 0;

    this.logger.debug(`Processing stream response for prompt: ${promptId}`, 'GeminiChat.processStreamResponse()');

    try {
      // Handle streaming response from the API
      for await (const chunk of streamResponse) {
        chunkCount++;
        
        // Update token tracking with each chunk
        if (chunk.usageMetadata) {
          this.tokenTracker.updateUsage({
            inputTokens: chunk.usageMetadata.promptTokenCount || 0,
            outputTokens: chunk.usageMetadata.candidatesTokenCount || 0,
          });
          
          this.logger.debug(`Token usage updated - Input: ${chunk.usageMetadata.promptTokenCount}, Output: ${chunk.usageMetadata.candidatesTokenCount}`, 'GeminiChat.processStreamResponse()');
        }

        const parts = chunk.candidates?.[0]?.content?.parts;

        // Skip chunks without parts (can happen during streaming)
        if (!parts || parts.length === 0) {
          this.logger.debug(`Skipping chunk ${chunkCount} - no parts`, 'GeminiChat.processStreamResponse()');
          continue;
        }

        // Convert chunk to our response format
        const llmResponse = this.convertToLLMResponse(chunk, `${promptId}_${responseId++}`);
        
        // Collect valid content for history
        if (this.isValidLLMResponse(llmResponse)) {
          outputContent.push(llmResponse.content);
        }
        
        yield llmResponse;
      }
      
      this.logger.debug(`Stream processing completed - ${chunkCount} chunks processed, ${outputContent.length} valid responses`, 'GeminiChat.processStreamResponse()');
    } catch (error) {
      errorOccurred = true;
      this.logger.error(`Error processing stream response: ${error instanceof Error ? error.message : String(error)}`, 'GeminiChat.processStreamResponse()');
      throw error;
    } finally {
      if (!errorOccurred) {
        // Update history after successful streaming
        this.logger.debug(`Recording history - input + ${outputContent.length} responses`, 'GeminiChat.processStreamResponse()');
        this.recordHistory(inputContent, outputContent);
      }
      this.isCurrentlyProcessing = false;
    }
  }

  /**
   * Wait for stream completion (for internal promise tracking)
   * 
   * This method ensures sequential processing of messages by tracking
   * when the current stream completes.
   * 
   * @param streamGenerator - The stream generator to track
   * @returns Promise that resolves when stream completes
   */
  private async waitForStreamCompletion(
    _streamGenerator: AsyncGenerator<LLMResponse>
  ): Promise<void> {
    try {
      // The stream will be consumed by the caller, we just need to track completion
      // This is handled by the finally block in processStreamResponse
    } catch (_error) {
      // Error handling is done in processStreamResponse
    }
  }

  /**
   * Validate LLM response in our format
   * 
   * Checks if the response contains valid content that should be
   * included in conversation history.
   * 
   * @param response - Our LLMResponse object
   * @returns True if response is valid
   */
  private isValidLLMResponse(response: LLMResponse): boolean {
    return this.isValidConversationContent(response.content);
  }

  /**
   * Validate conversation content
   * 
   * Validates content structure and ensures it contains meaningful data.
   * Filters out empty text and invalid parts.
   * 
   * @param content - ConversationContent to validate
   * @returns True if content is valid
   */
  private isValidConversationContent(content: ConversationContent): boolean {
    if (!content.parts || content.parts.length === 0) {
      return false;
    }
    
    for (const part of content.parts) {
      if (!part || Object.keys(part).length === 0) {
        return false;
      }
      
      // Check for empty text (but allow other content types)
      if (part.type === 'text' && part.text !== undefined && part.text.trim() === '') {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Record history after successful interaction
   * 
   * Adds user input and assistant response to conversation history,
   * maintaining proper role alternation and filtering invalid content.
   * 
   * @param userInput - User input in our format
   * @param modelOutput - Assistant output in our format
   */
  private recordHistory(userInput: ConversationContent, modelOutput: ConversationContent[]): void {
    // Add user input
    this.history.push(userInput);
    
    // Consolidate and add valid model outputs
    const validOutputs = modelOutput.filter(content => this.isValidConversationContent(content));
    
    if (validOutputs.length > 0) {
      // Consolidate multiple assistant responses into one
      const consolidatedResponse = this.consolidateAssistantResponses(validOutputs);
      this.history.push(consolidatedResponse);
    } else {
      // Add empty assistant response to maintain alternating pattern
      this.history.push({
        role: 'assistant',
        parts: [{
          type: 'text',
          text: '',
        }],
        metadata: {
          timestamp: Date.now(),
          empty: true,
        },
      });
    }
  }

  /**
   * Extract curated history (valid interactions only)
   * 
   * Filters conversation history to include only valid user-assistant
   * interactions, removing any turns with invalid responses.
   * 
   * @param history - Full conversation history
   * @returns Curated history with only valid interactions
   */
  private extractCuratedHistory(history: ConversationContent[]): ConversationContent[] {
    const curatedHistory: ConversationContent[] = [];
    let i = 0;
    
    while (i < history.length) {
      if (history[i].role === 'user') {
        const userMessage = history[i];
        curatedHistory.push(userMessage);
        i++;
        
        // Look for corresponding assistant response
        const assistantResponses: ConversationContent[] = [];
        let isValid = true;
        
        while (i < history.length && history[i].role === 'assistant') {
          assistantResponses.push(history[i]);
          if (isValid && !this.isValidConversationContent(history[i])) {
            isValid = false;
          }
          i++;
        }
        
        if (isValid && assistantResponses.length > 0) {
          curatedHistory.push(...assistantResponses);
        } else {
          // Remove the corresponding user input if assistant output is invalid
          curatedHistory.pop();
        }
      } else {
        // Skip orphaned assistant messages
        i++;
      }
    }
    
    return curatedHistory;
  }

  /**
   * Get conversation history
   * 
   * Returns conversation history in our ConversationContent format.
   * Can optionally return only curated (valid) history.
   * 
   * @param curated - Whether to return only valid interactions
   * @returns Array of conversation content
   */
  getHistory(curated: boolean = false): ConversationContent[] {
    const history = curated ? this.extractCuratedHistory(this.history) : this.history;
    return structuredClone(history); // Deep copy to prevent external mutations
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.history = [];
    this.tokenTracker.reset();
  }

  /**
   * Add content to conversation history
   * 
   * Adds a single conversation content item to the history.
   * 
   * @param content - Content to add in our format
   */
  addHistory(content: ConversationContent): void {
    this.history.push(content);
  }

  /**
   * Set entire conversation history
   * 
   * Replaces the entire conversation history with new content.
   * Resets token tracking since usage context changes.
   * 
   * @param history - New conversation history in our format
   */
  setHistory(history: ConversationContent[]): void {
    this.history = [...history];
    this.tokenTracker.reset(); // Reset token tracking when setting new history
  }

  /**
   * Get current token usage tracking
   */
  getTokenUsage(): ITokenUsage {
    return this.tokenTracker.getUsage();
  }

  /**
   * Get token tracker instance
   */
  getTokenTracker(): ITokenTracker {
    return this.tokenTracker;
  }

  /**
   * Check if chat is currently processing a message
   */
  isProcessing(): boolean {
    return this.isCurrentlyProcessing;
  }

  /**
   * Get current model information
   */
  getModelInfo(): { model: string; tokenLimit: number } {
    return {
      model: this.chatConfig.modelName,
      tokenLimit: this.chatConfig.tokenLimit,
    };
  }

  /**
   * Set system prompt
   * 
   * Updates the system prompt used for subsequent conversations.
   * 
   * @param systemPrompt - New system prompt text
   */
  setSystemPrompt(systemPrompt: string): void {
    this.generateContentConfig.systemInstruction = systemPrompt;
  }

  /**
   * Get current system prompt
   * 
   * @returns Current system prompt or undefined if not set
   */
  getSystemPrompt(): string | undefined {
    return this.generateContentConfig.systemInstruction as string;
  }
  
  /**
   * Handle model fallback (e.g., pro -> flash)
   * 
   * Attempts to switch to a fallback model when the current model
   * encounters issues (quota, rate limits, etc.).
   * 
   * @param fallbackModel - Model name to fallback to
   * @returns True if fallback was successful
   */
  handleModelFallback(_fallbackModel: string): boolean {
    try {
      // Check if API key is available
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        console.warn('No API key available for model fallback');
        return false;
      }
      
      // Create new client instance with fallback model
      this.aiClient = new GoogleGenAI({ apiKey });
      this.contentGenerator = this.aiClient.models;
      return true;
    } catch (error) {
      console.warn('Failed to switch to fallback model:', error);
      return false;
    }
  }

  /**
   * Get usage summary for debugging
   * 
   * @returns Formatted usage summary string
   */
  getUsageSummary(): string {
    return this.tokenTracker.getUsageSummary();
  }

  // ============================================================================
  // TYPE CONVERSION METHODS
  // ============================================================================

  /**
   * Convert our content format to Gemini's format
   * 
   * @param content - Content in our format (string or ContentPart[])
   * @param role - Content role
   * @returns Gemini Content object
   */
  private convertToGeminiContent(content: string | ContentPart[], role: string): GeminiContent {
    if (typeof content === 'string') {
      return {
        role: role === 'assistant' ? 'model' : role,
        parts: [{ text: content }],
      };
    }

    const geminiParts: GeminiPart[] = content.map(part => {
      switch (part.type) {
        case 'text':
          return { text: part.text || '' } as GeminiPart;
        case 'function_call':
          return {
            functionCall: {
              name: part.functionCall?.name || '',
              id: part.functionCall?.id || ``,
              args: part.functionCall?.args || {},
            },
          } as GeminiPart;
        case 'function_response':
          return {
            functionResponse: {
              name: part.functionResponse?.name || '',
              id: part.functionResponse?.id || '',
              response: part.functionResponse?.result as Record<string, unknown>,
            },
          } as GeminiPart;
        default:
          return { text: part.text || JSON.stringify(part) } as GeminiPart;
      }
    });

    return {
      role: role === 'assistant' ? 'model' : role,
      parts: geminiParts,
    };
  }

  /**
   * Convert Gemini content to our format
   * 
   * @param geminiContent - Gemini Content object
   * @returns ConversationContent in our format
   */
  private convertFromGeminiContent(geminiContent: GeminiContent): ConversationContent {
    const parts: ContentPart[] = (geminiContent.parts || []).map(part => {
      if ('text' in part) {
        return {
          type: 'text',
          text: part.text,
        };
      }
      if ('functionCall' in part) {
        return {
          type: 'function_call',
          functionCall: {
            id: part.functionCall?.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: part.functionCall?.name || '',
            args: part.functionCall?.args || {},
          },
        };
      }
      if ('functionResponse' in part) {
        return {
          type: 'function_response',
          functionResponse: {
            id: `response_${Date.now()}`,
            name: part.functionResponse?.name || '',
            result: part.functionResponse?.response,
          },
        };
      }
      
      // Fallback for unknown part types
      return {
        type: 'text',
        text: JSON.stringify(part),
      };
    });

    return {
      role: geminiContent.role === 'model' ? 'assistant' : geminiContent.role as 'user' | 'system',
      parts,
      metadata: {
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Convert Gemini response to our LLMResponse format
   * 
   * @param geminiResponse - Gemini GenerateContentResult
   * @param responseId - Unique response ID
   * @returns LLMResponse in our format
   */
  private convertToLLMResponse(geminiResponse: GenerateContentResponse, responseId: string): LLMResponse {
    const candidate = geminiResponse.candidates?.[0];
    
    let content: ConversationContent;
    if (candidate?.content) {
      content = this.convertFromGeminiContent(candidate.content);
    } else {
      // Empty response
      content = {
        role: 'assistant',
        parts: [],
        metadata: {
          timestamp: Date.now(),
          empty: true,
        },
      };
    }

    const response: LLMResponse = {
      id: responseId,
      content,
      model: this.chatConfig.modelName,
      metadata: {
        timestamp: Date.now(),
        promptId: responseId.split('_')[0],
      },
    };

    if (geminiResponse.usageMetadata) {
      response.usage = {
        inputTokens: geminiResponse.usageMetadata.promptTokenCount || 0,
        outputTokens: geminiResponse.usageMetadata.candidatesTokenCount || 0,
        totalTokens: geminiResponse.usageMetadata.totalTokenCount || 0,
      };
    }

    return response;
  }

  /**
   * Get conversation history in Gemini format
   * 
   * @param curated - Whether to return curated history
   * @returns History in Gemini's Content format
   */
  private getGeminiHistory(curated: boolean = false): GeminiContent[] {
    const history = this.getHistory(curated);
    return history.map(content => this.convertToGeminiContent(content.parts, content.role));
  }

  /**
   * Convert Type enum values (OBJECT, NUMBER, STRING) to lowercase for Gemini API
   */
  private convertTypesToLowercase(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.convertTypesToLowercase(item));
    }
    
    const result = { ...obj };
    
    // Convert type field if it exists
    if (result.type && typeof result.type === 'string') {
      result.type = result.type.toLowerCase();
    }
    
    // Recursively convert nested objects
    Object.keys(result).forEach(key => {
      if (typeof result[key] === 'object' && result[key] !== null) {
        result[key] = this.convertTypesToLowercase(result[key]);
      }
    });
    
    return result;
  }

  /**
   * Consolidate multiple assistant responses into one
   * 
   * @param responses - Array of assistant responses
   * @returns Single consolidated response
   */
  private consolidateAssistantResponses(responses: ConversationContent[]): ConversationContent {
    const allParts: ContentPart[] = [];
    const metadata: Record<string, unknown> = {
      timestamp: Date.now(),
      consolidated: true,
      originalCount: responses.length,
    };

    for (const response of responses) {
      allParts.push(...response.parts);
      if (response.metadata) {
        Object.assign(metadata, response.metadata);
      }
    }

    return {
      role: 'assistant',
      parts: allParts,
      metadata,
    };
  }
} 