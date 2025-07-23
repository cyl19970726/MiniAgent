/**
 * @fileoverview OpenAI Response API Chat implementation
 * 
 * This module provides an OpenAI Chat implementation based on the Response API
 * that follows the IChat interface and integrates with our Agent framework.
 * It uses OpenAI's Response API for streaming responses which provides more
 * structured event-based streaming compared to traditional chat completions.
 * 
 * Key features:
 * - Response API streaming for structured events
 * - Event-based response handling
 * - Integrated token tracking with ITokenTracker
 * - Dual history system (comprehensive vs curated)
 * - Platform-agnostic content types
 * - Robust error handling and validation
 * - Function calling support with streaming
 */

import OpenAI from 'openai';
// import OpenAI.Responses from 'openai';
import {
  IChat,
  LLMStart,
  LLMChunk,
  LLMFunctionCallDone,
  LLMComplete,
  LLMResponse,
  ChunkItem,
  MessageItem,
  IChatConfig,
  LLMFunctionCallDelta,
  LLMChunkTextDelta,
  LLMChunkTextDone,
  LLMChunkThinking,
  ToolDeclaration,
} from './interfaces';
import { TokenTracker } from './tokenTracker';
import { ITokenTracker, ITokenUsage } from './interfaces';
import { ILogger, LogLevel, createLogger } from '../logger';
import { convertTypesToLowercase } from '../utils';

type OpenaiMessageItem = OpenAI.Responses.ResponseInputItem;
type OpenaiFunctionCallOutput = OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
type OpenaiFunctionCall = OpenAI.Responses.ResponseFunctionToolCall;
type OpenaiOutputMessage = OpenAI.Responses.ResponseOutputMessage;
type OpenaiUserInputMessage = OpenAI.Responses.ResponseInputItem.Message;

/**
 * OpenAI Response API Chat implementation using our platform-agnostic interfaces
 * 
 * This class provides streaming chat functionality using OpenAI's Response API
 * which offers event-based streaming with more structured response handling.
 * It implements the IChat interface and works with our ConversationContent type
 * system while interfacing with OpenAI's Response API.
 * 
 * Key implementation details:
 * - Uses OpenAI Response API for structured streaming
 * - Event-based response processing
 * - Converts between our types and OpenAI's types
 * - Maintains conversation history in our format
 * - Provides real-time token tracking
 * - Supports function calling with proper streaming
 */
export class OpenAIChatResponse implements IChat<OpenaiMessageItem> {
  private history: MessageItem[] = [];
  private tokenTracker: TokenTracker;
  private sendPromise: Promise<void> = Promise.resolve();
  private isCurrentlyProcessing: boolean = false;
  private openai: OpenAI;
  private logger: ILogger;

  constructor(
    private readonly chatConfig: IChatConfig,
  ) {
    this.chatConfig = chatConfig;
    this.logger = createLogger('OpenAIChatResponse', { level: LogLevel.INFO });
    this.logger.debug(`Initializing OpenAIChatResponse with model: ${chatConfig.modelName}`, 'OpenAIChatResponse.constructor()');
    
    this.openai = new OpenAI({
      apiKey: chatConfig.apiKey,
    });
    
    this.history = [...chatConfig.initialHistory || []];
    this.tokenTracker = new TokenTracker(chatConfig.modelName, chatConfig.tokenLimit);
  }

  /**
   * Send a message and get streaming response
   * 
   * Implements the IChat interface for streaming message sending using Response API.
   * Converts our ChatMessage format to OpenAI Response API format and processes
   * the event-based streaming response.
   * 
   * @param message - Message in our ChatMessage format
   * @param promptId - Unique identifier for this prompt
   * @returns AsyncGenerator yielding LLMResponse objects
   */
  async sendMessageStream(
    message: MessageItem,
    promptId: string,
  ): Promise<AsyncGenerator<LLMResponse>> {
    // Return immediately with an AsyncGenerator that handles initialization internally
    return this.createStreamingResponse(message, promptId);
  }

  /**
   * Create streaming response with internal initialization using Response API
   * 
   * This method immediately returns an AsyncGenerator and handles all initialization
   * (connection, auth, retries) internally within the generator. This eliminates
   * the initial await delay and provides true streaming from the first moment.
   */
  private async *createStreamingResponse(
    message: MessageItem,
    promptId: string,
  ): AsyncGenerator<LLMResponse> {
    await this.sendPromise;
    
    this.isCurrentlyProcessing = true;
    
    // 🎯 Add user input to history FIRST for correct ordering
    this.addHistory(message);
    
    // Create a promise to track completion and set it immediately
    let completionResolve!: () => void;
    let completionReject!: (error: any) => void;
    
    this.sendPromise = new Promise<void>((resolve, reject) => {
      completionResolve = resolve;
      completionReject = reject;
    });

    try {
      // Convert our message format to OpenAI Response API format
      let inputMessages: OpenaiMessageItem[] = [];
      
      // Convert history to provider format
      for (const historyItem of this.history) {
        inputMessages.push(this.convertToProviderMessage(historyItem));
      }

      this.logger.info(`Request contains ${inputMessages.length} messages:\n ${JSON.stringify(inputMessages, null, 2)}`, 'OpenAIChatResponse.createStreamingResponse()');
    
      let tools:OpenAI.Responses.FunctionTool[] = [];
      // Add tools if we have tool declarations
      if (this.chatConfig.toolDeclarations && this.chatConfig.toolDeclarations.length > 0) {
        tools = this.chatConfig.toolDeclarations.map((tool: ToolDeclaration) => ({
          name: tool.name,
          description: tool.description,
          parameters: convertTypesToLowercase(tool.parameters) as Record<string, unknown>,
          strict: false, 
          type: 'function',
        }));

      }

      this.logger.debug(`Calling OpenAI Response API with model: ${this.chatConfig.modelName}`, 'OpenAIChatResponse.createStreamingResponse()');
      
      // Use chat.completions.create for streaming
      // Initialize the stream inside the generator - this is where the await happens
      // But from the caller's perspective, streaming has already begun
      const streamResponse = await this.openai.responses.create({
        model: this.chatConfig.modelName,
        input: inputMessages,
        stream: true,
        store: true,
        tools: tools,
      });

      // Now stream the actual responses using event-based processing
      yield* this.processResponseStreamInternal(streamResponse, message, promptId);
      
      // Stream completed successfully
      completionResolve();
      
    } catch (error) {
      this.isCurrentlyProcessing = false;
      this.logger.error(`Error in createStreamingResponse: ${error instanceof Error ? error.message : String(error)}`, 'OpenAIChatResponse.createStreamingResponse()');
      completionReject(error);
      throw error;
    }
  }

  /**
   * Internal stream processing for Response API events
   * 
   * This processes the event-based streaming response from the Response API,
   * handling different event types and converting them to our format.
   */
  private async *processResponseStreamInternal(
    streamResponse: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>,
    _inputContent: MessageItem,
    promptId: string,
  ): AsyncGenerator<LLMResponse> {
    const outputContent: MessageItem[] = [];
    let errorOccurred = false;
    let chunkCount = 0;

    this.logger.debug(`Processing Response API stream for prompt: ${promptId}`, 'OpenAIChatResponse.processResponseStreamInternal()');


    /* we deal the function call use the 'response.output_item.add/done' event and the 'response.function_call_arguments.delta/done' event
    {"type":"response.output_item.added","response_id":"resp_1234xyz","output_index":0,"item":{"type":"function_call","id":"fc_1234xyz","call_id":"call_1234xyz","name":"get_weather","arguments":""}}
    {"type":"response.function_call_arguments.delta","response_id":"resp_1234xyz","item_id":"fc_1234xyz","output_index":0,"delta":"{\""}
    {"type":"response.function_call_arguments.delta","response_id":"resp_1234xyz","item_id":"fc_1234xyz","output_index":0,"delta":"location"}
    {"type":"response.function_call_arguments.delta","response_id":"resp_1234xyz","item_id":"fc_1234xyz","output_index":0,"delta":"\":\""}
    {"type":"response.function_call_arguments.delta","response_id":"resp_1234xyz","item_id":"fc_1234xyz","output_index":0,"delta":"Paris"}
    {"type":"response.function_call_arguments.delta","response_id":"resp_1234xyz","item_id":"fc_1234xyz","output_index":0,"delta":","}
    {"type":"response.function_call_arguments.delta","response_id":"resp_1234xyz","item_id":"fc_1234xyz","output_index":0,"delta":" France"}
    {"type":"response.function_call_arguments.delta","response_id":"resp_1234xyz","item_id":"fc_1234xyz","output_index":0,"delta":"\"}"}
    {"type":"response.function_call_arguments.done","response_id":"resp_1234xyz","item_id":"fc_1234xyz","output_index":0,"arguments":"{\"location\":\"Paris, France\"}"}
    {"type":"response.output_item.done","response_id":"resp_1234xyz","output_index":0,"item":{"type":"function_call","id":"fc_1234xyz","call_id":"call_2345abc","name":"get_weather","arguments":"{\"location\":\"Paris, France\"}"}}
    */
   try {
      let curChunkFunctionCall: {
        id: string;
        call_id: string;
        name: string;
        args: string;
      } | undefined;
      
      // Extract chunks from output
      const responseChunkItems: ChunkItem[] = [];
      // Handle event-based streaming response from the Response API
      for await (const event of streamResponse) {
        chunkCount++;

        if (event.type == 'response.created'){
          yield {
            id: event.response.id,
            type: 'response.start',
            model: this.chatConfig.modelName,
            tools: this.chatConfig.toolDeclarations,
          } as LLMStart;

        } else if (event.type == 'response.output_item.added'){
          let chunk =  {
            type: 'response.chunk.added',
            chunk_id: event.item.id,
            chunk_idx: event.output_index,
          } as LLMChunk;

          yield chunk;

          if (event.item.type == 'function_call'){
            curChunkFunctionCall = {
              id: event.item.id || '',
              call_id: event.item.call_id,
              name: event.item.name,
              args: event.item.arguments, // now the arguments is empty
            }
          }

          continue;
        } else if (event.type == 'response.output_item.done'){

          let chunk =  {
            type: 'response.chunk.done',
            chunk_id: event.item.id,
            chunk_idx: event.output_index,
          } as LLMChunk;
          yield chunk;
          continue;

        } else if (event.type == 'response.output_text.delta'){
          this.logger.info(`response.output_text.delta: ${event.delta}`, 'OpenAIChatResponse.processResponseStreamInternal()');
          let chunk: LLMChunkTextDelta = {
            type: 'response.chunk.text.delta',
            chunk_idx: event.output_index,
            content: {
              type: 'text',
              text_delta: event.delta,
            },
          };
          responseChunkItems.push(chunk);
          yield chunk;
          continue;
        
        } else if (event.type == 'response.output_text.done'){
            let chunk: LLMChunkTextDone = {
              type: 'response.chunk.text.done',
              chunk_idx: event.output_index,
              content: {
                type: 'text',
                text: event.text,
              },
            };
            responseChunkItems.push(chunk);

            // Don't add to history here - let baseAgent manage the correct order
            yield chunk;

        } else if (event.type == 'response.reasoning_summary_text.delta'){
            let chunk: LLMChunkThinking = {
              type: 'response.chunk.thinking.delta',
              thinking: event.delta,
              chunk_idx: event.output_index,
              content: {
                type: 'text',
                thinking_delta: event.delta,
              },
            };
            responseChunkItems.push(chunk);
            yield chunk;
            continue;

        } else if (event.type == 'response.reasoning_summary_text.done'){
            let chunk: LLMChunkThinking = {
              type: 'response.chunk.thinking.done',
              thinking: event.text,
              chunk_idx: event.output_index,
              content: {
                type: 'text',
                thinking: event.text,
              },
            };
            responseChunkItems.push(chunk);
            
            // Don't add to history here - let baseAgent manage the correct order
            yield chunk;
            continue;
          
        }else if (event.type == 'response.function_call_arguments.delta'){
          if (curChunkFunctionCall){
            let chunk: LLMFunctionCallDelta = {
              type: 'response.chunk.function_call.delta',
              content: {
                type: 'function_call',
                functionCall: {
                  id: curChunkFunctionCall.id,
                  call_id: curChunkFunctionCall.call_id,
                  name: curChunkFunctionCall.name,
                  args: event.delta, // This is the delta part
                },
              },
            };
            responseChunkItems.push(chunk);
            yield chunk;
          } else {
            throw new Error('curChunkFunctionCall is undefined');
          }
          continue;
        }else if (event.type == 'response.function_call_arguments.done'){
          if (curChunkFunctionCall){
            let chunk: LLMFunctionCallDone = {
              type: 'response.chunk.function_call.done',
              content: {
                type: 'function_call',
                functionCall: {
                  id: curChunkFunctionCall.id,
                  call_id: curChunkFunctionCall.call_id,
                  name: curChunkFunctionCall.name,
                  args: event.arguments, // Use the complete arguments
                },
              },
            };

            // Don't add to history here - let baseAgent manage the correct order

            responseChunkItems.push(chunk);
            yield chunk;
          } else {
            throw new Error('curChunkFunctionCall is undefined');
          }
          curChunkFunctionCall = undefined;
          continue;

        } else if (event.type === 'response.completed') {
          // Update token tracking
          if (event.response?.usage) {
            this.tokenTracker.updateUsage({
              inputTokens: event.response.usage.input_tokens || 0,
              inputTokenDetails: {
                cachedTokens: event.response.usage.input_tokens_details?.cached_tokens || 0,
              },
              outputTokens: event.response.usage.output_tokens || 0,
              outputTokenDetails: {
                reasoningTokens: event.response.usage.output_tokens_details?.reasoning_tokens || 0,
              },
              totalTokens: event.response.usage.total_tokens || 
                          ((event.response.usage.input_tokens || 0) + (event.response.usage.output_tokens || 0)),
            });
          }

          this.logger.info(`LLM Token Usage: ${JSON.stringify(event.response.usage)}`, 'OpenAIChatResponse.processResponseStreamInternal()');
          yield {
            response_id: event.response.id,
            type: 'response.complete',
            model: this.chatConfig.modelName,
            chunks: responseChunkItems,
            usage: event.response?.usage ? {
              inputTokens: event.response.usage.input_tokens || 0,
              inputTokenDetails: {
                cachedTokens: event.response.usage.input_tokens_details?.cached_tokens || 0,
              },
              outputTokens: event.response.usage.output_tokens || 0,
              outputTokenDetails: {
                reasoningTokens: event.response.usage.output_tokens_details?.reasoning_tokens || 0,
              },
              totalTokens: event.response.usage.total_tokens || 
                          ((event.response.usage.input_tokens || 0) + (event.response.usage.output_tokens || 0)),
            } : undefined,
            previous_response_id: event.response.previous_response_id || '',
          } as LLMComplete;

        } else if (event.type === 'response.failed') {
          yield {
            response_id: event.response.id,
            type: 'response.failed',
            model: this.chatConfig.modelName,
            chunks: responseChunkItems,
            previous_response_id: event.response.previous_response_id || '',
            error: {
              code: event.response.error?.code,
              message: event.response.error?.message,
            },
          } as LLMComplete;

        } else if (event.type === 'response.incomplete') {
          yield {
            response_id: event.response.id,
            type: 'response.incomplete', 
            model: this.chatConfig.modelName,
            chunks: responseChunkItems,
            previous_response_id: event.response.previous_response_id || '',
            incomplete_details: {
              reason: event.response.incomplete_details?.reason || 'unknown',
            },
          } as LLMComplete;

        } else {
          // Handle other event types
          continue;
        }
      }
      
      this.logger.debug(`Response API stream processing completed - ${chunkCount} events processed, ${outputContent.length} valid responses`, 'OpenAIChatResponse.processResponseStreamInternal()');
    } catch (error) {
      errorOccurred = true;
      this.logger.error(`Error processing Response API stream: ${error instanceof Error ? error.message : String(error)}`, 'OpenAIChatResponse.processResponseStreamInternal()');
      throw error;
    } finally {
      if (!errorOccurred) {
        // History is now managed by baseAgent for correct ordering
        // this.logger.debug(`Recording history - input + ${outputContent.length} responses`, 'OpenAIChatResponse.processResponseStreamInternal()');
        // this.recordHistory(inputContent, outputContent);
      }
      this.isCurrentlyProcessing = false;
    }
  }



  // recordHistory method removed - history is now managed by baseAgent for correct ordering

  /**
   * Extract curated history (valid interactions only)
   */
  private extractCuratedHistory(history: MessageItem[]): MessageItem[] {
    const curatedHistory: MessageItem[] = [];
    let i = 0;
    
    while (i < history.length) {
      if (history[i].role === 'user') {
        const userMessage = history[i];
        curatedHistory.push(userMessage);
        i++;
        
        // Look for corresponding assistant response
        const assistantResponses: MessageItem[] = [];
        let isValid = true;
        
        while (i < history.length && history[i].role === 'assistant') {
          assistantResponses.push(history[i]);
          // With the new event system, we don't need content validation
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
   */
  getHistory(curated: boolean = false): MessageItem[] {
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
   */
  addHistory(content: MessageItem): void {
    this.history.push(content);
  }

  /**
   * Set entire conversation history
   */
  setHistory(history: MessageItem[]): void {
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
   */
  setSystemPrompt(systemPrompt: string): void {
    this.chatConfig.systemPrompt = systemPrompt;
  }

  /**
   * Get current system prompt
   */
  getSystemPrompt(): string | undefined {
    return this.chatConfig.systemPrompt;
  }
  
  /**
   * Handle model fallback
   */
  handleModelFallback(fallbackModel: string): boolean {
    try {
      // Check if API key is available
      const apiKey = this.chatConfig.apiKey;
      if (!apiKey || apiKey.trim() === '') {
        console.warn('No API key available for model fallback');
        return false;
      }
      
      // Update model name in config
      this.chatConfig.modelName = fallbackModel;
      
      // Create new OpenAI client instance (API key is same)
      this.openai = new OpenAI({ apiKey });
      return true;
    } catch (error) {
      console.warn('Failed to switch to fallback model:', error);
      return false;
    }
  }

  /**
   * Get usage summary for debugging
   */
  getUsageSummary(): string {
    return this.tokenTracker.getUsageSummary();
  }

  // ============================================================================
  // TYPE CONVERSION METHODS
  // ============================================================================

  /**
   * Convert our content format to OpenAI's format
   */
  convertToProviderMessage(message: MessageItem): OpenaiMessageItem {

    if (message.content.type === 'text'){
      return {
        role: message.role,
        content: message.content.text! ,
      } ;
    } else if (message.content.type === 'function_call'){
      if (!message.content.functionCall){
        throw new Error('Function call is undefined');
      }
      if (message.role !== 'assistant'){
        throw new Error('Function call is not allowed for user role');
      }
      let content = {
        type: 'function_call',
        id: message.content.functionCall.id ,
        call_id: message.content.functionCall.call_id,
        name: message.content.functionCall.name,
        arguments: message.content.functionCall.args,
      } as OpenaiFunctionCall;
      this.logger.debug(`OpenaiFunctionCall: ${JSON.stringify(content)}`, 'OpenAIChatResponse.convertToProviderMessage()');

      return content;
    } else if (message.content.type === 'function_response'){
      if (!message.content.functionResponse){
        throw new Error('Function response is undefined');
      }
      if (message.role !== 'user'){
        throw new Error('Function response is not allowed for assistant role');
      }

      let content: OpenaiFunctionCallOutput = {
        type: 'function_call_output',
        call_id: message.content.functionResponse.call_id,
        output: message.content.functionResponse.result,
      }
      this.logger.debug(`OpenaiFunctionCallOutput: ${JSON.stringify(content)}`, 'OpenAIChatResponse.convertToProviderMessage()');
      return content;
    } else {
      throw new Error(`Unsupported content type: ${message.content.type}`);
    }
  }

  /**
   * Convert chunk items to message item for history
   * @param chunk Chunk to convert
   * @param role Role for the resulting message
   * @returns Message item for adding to history
   */
  convertFromChunkItems(chunk: ChunkItem, role: 'user' | 'assistant'): MessageItem {
    // Use the unified content structure from the chunk
    // The content is already in the correct ContentPart format
    return {
      role: role,
      content: chunk.content,
    };
  }

}