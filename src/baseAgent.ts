/**
 * @fileoverview BaseAgent Implementation
 * 
 * This file provides the BaseAgent class that connects all the interfaces
 * and implements the core agent workflow. It coordinates between IChat,
 * IToolScheduler, and AgentEvent system to provide a complete agent experience.
 */

import {
  IAgent,
  IAgentConfig,
  IAgentStatus,
  IChat,
  IToolScheduler,
  ITokenUsage,
  AgentEvent,
  AgentEventType,
  EventHandler,
  MessageItem,
  ContentPart,
  IToolCallRequestInfo,
  IToolCallResponseInfo,
  ITool,
  createAgentEventFromLLMResponse,
  ToolExecutionStartEvent,
  ToolExecutionDoneEvent,
  ToolDeclaration,
} from './interfaces';
import { ILogger, LogLevel, createLogger } from './logger';

/**
 * BaseAgent implementation that connects all core interfaces
 * 
 * This class provides the main agent functionality by coordinating:
 * - IChat: For conversation management and streaming responses
 * - IToolScheduler: For tool execution and management
 * - AgentEvent: For event emission and monitoring
 * 
 * The agent follows this workflow:
 * 1. Receive user input
 * 2. Send to chat for LLM processing
 * 3. Extract tool calls from response
 * 4. Execute tools via scheduler
 * 5. Integrate results back into conversation
 * 6. Emit events throughout the process
 * 
 * Key features:
 * - Streaming-first approach for real-time responses
 * - Comprehensive event emission for monitoring
 * - Automatic tool call extraction and execution
 * - Proper error handling and state management
 * - Thread-safe operation with abort signal support
 * 
 * @example
 * ```typescript
 * const agent = new BaseAgent(config, chat, toolScheduler);
 * agent.onEvent('logger', (event) => console.log(event));
 * 
 * const abortController = new AbortController();
 * const messages = [{
 *   role: 'user' as const,
 *   content: { type: 'text' as const, text: 'Hello' },
 *   metadata: { sessionId: 'session-1' }
 * }];
 * for await (const event of agent.process(messages, 'session-1', abortController.signal)) {
 *   console.log(event);
 * }
 * ```
 */
export abstract class BaseAgent implements IAgent {
  /** Map of event handler IDs to their handler functions */
  private eventHandlers: Map<string, EventHandler> = new Map();
  
  /** Current conversation turn number, incremented for each user input */
  private currentTurn = 0;
  
  /** Flag indicating if the agent is currently processing a request */
  private isRunning = false;
  
  /** Timestamp of the last status update */
  private lastUpdateTime = Date.now();
  
  /** Logger instance for this agent */
  protected logger: ILogger;

  /**
   * Constructor for BaseAgent
   * 
   * @param config - Agent configuration including model, working directory, etc.
   * @param chat - Chat instance for conversation management
   * @param toolScheduler - Tool scheduler for executing tool calls
   */
  constructor(
    protected agentConfig: IAgentConfig,
    protected chat: IChat<any>,
    protected toolScheduler: IToolScheduler,
  ) {
    // Initialize logger
    this.logger = agentConfig.logger || createLogger('BaseAgent', {
      level: agentConfig.logLevel || LogLevel.INFO,
    });
    
    this.logger.debug('BaseAgent initialized', 'BaseAgent.constructor()');
    this.setupEventHandlers();
  }

  registerTool(tool: ITool): void {
    this.toolScheduler.registerTool(tool);
  }

  removeTool(toolName: string): boolean {
    const removed = this.toolScheduler.removeTool(toolName);
    return removed;
  }

  getToolList(): ITool[] {
    return this.toolScheduler.getToolList();
  }

  getTool(toolName: string): ITool | undefined {
    return this.toolScheduler.getTool(toolName);
  }

  /**
   * Set up internal event handlers
   */
  private setupEventHandlers(): void {
    // Internal event handlers setup - currently minimal since we use callbacks
    // for tool execution lifecycle management instead of event listeners
  }

  /**
   * Main processing method - handles complete conversation flow
   * 
   * This is the primary entry point for processing user input. It orchestrates
   * the entire conversation flow including:
   * - User input processing
   * - LLM response generation (streaming)
   * - Tool call extraction and execution
   * - Result integration
   * - Event emission
   * 
   * The method is designed to be thread-safe and respects abort signals for
   * graceful cancellation.
   * 
   * @param userMessages - Array of user messages with content and metadata
   * @param sessionId - Unique identifier for this conversation session
   * @param abortSignal - Signal to abort the processing if needed
   * @returns AsyncGenerator that yields AgentEvent objects
   * 
   * @example
   * ```typescript
   * const abortController = new AbortController();
   * const messages = [{
   *   role: 'user' as const,
   *   content: { type: 'text' as const, text: 'Hello' },
   *   metadata: { sessionId: 'session-1' }
   * }];
   * for await (const event of agent.process(messages, 'session-1', abortController.signal)) {
   *   if (event.type === AgentEventType.AssistantMessage) {
   *     console.log(event.data);
   *   }
   * }
   * ```
   */
  async *process(
    userMessages: {role: 'user', content: ContentPart, metadata?: {sessionId: string, previousResponseId?: string}}[],
    sessionId: string,
    abortSignal: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    if (this.isRunning) {
      this.logger.warn('Agent is already processing a request', 'BaseAgent.process()');
      yield this.createErrorEvent('Agent is already processing a request');
      return;
    }

    this.isRunning = true;
    this.logger.info(`Starting to process ${userMessages.length} user message(s)`, 'BaseAgent.process()');
    
    try {
      // 1. Create MessageItems from user messages
      const messageItems: MessageItem[] = userMessages.map((userMessage) => ({
        role: userMessage.role,
        content: userMessage.content,
        turnIdx: this.currentTurn,
        metadata: {
          ...userMessage.metadata,
          timestamp: Date.now(),
          turn: this.currentTurn,
        },
      }));
      
      // Emit events for each user message
      for (const userMessage of userMessages) {
        yield this.createEvent(AgentEventType.UserMessage, {
          type: 'user_input',
          content: userMessage.content.text || '',
          sessionId,
          turn: this.currentTurn,
          metadata: userMessage.metadata,
        });
      }

      // 2. Process single turn with all messages
      let hasToolCallsInTurn = true;
      
      for (let turnCount = 0; turnCount < 10 && hasToolCallsInTurn && !abortSignal.aborted; turnCount++) {
        this.logger.debug(`Processing turn ${this.currentTurn + 1}`, 'BaseAgent.process()');
        
        let turnHadToolCalls = false;
        // Pass the messages for the first turn, empty array for continuation turns
        const messagesToProcess = turnCount === 0 ? messageItems : [];
        
        for await (const event of this.processOneTurn(sessionId, messagesToProcess, abortSignal)) {
          if (abortSignal.aborted) break;
          yield event;
          
          // Check if this turn had tool calls
          if (event.type === AgentEventType.TurnComplete) {
            turnHadToolCalls = (event.data as {hasToolCalls: boolean}).hasToolCalls;
          }
        }
        
        hasToolCallsInTurn = turnHadToolCalls;
      }
      
      this.logger.debug(`Processing completed for user input`, 'BaseAgent.process()');

    } catch (error) {
      this.logger.error(`Error during processing: ${error instanceof Error ? error.message : String(error)}`, 'BaseAgent.process()');
      yield this.createErrorEvent(error instanceof Error ? error.message : String(error));
    } finally {
      this.isRunning = false;
      this.lastUpdateTime = Date.now();
      this.logger.debug('Processing completed', 'BaseAgent.process()');
    }
  }

  /**
   * Process user messages (convenience method for string inputs)
   * 
   * This is a convenience method that converts string messages to the full
   * message format and calls the main process method.
   * 
   * @param userMessages - Array of user message strings
   * @param sessionId - Unique identifier for this conversation session
   * @param abortSignal - Signal to abort the processing if needed
   * @returns AsyncGenerator that yields AgentEvent objects
   * 
   * @example
   * ```typescript
   * const abortController = new AbortController();
   * const messages = ['Hello', 'How are you?'];
   * for await (const event of agent.processUserMessages(messages, 'session-1', abortController.signal)) {
   *   if (event.type === AgentEventType.ResponseChunkTextDone) {
   *     console.log(event.data);
   *   }
   * }
   * ```
   */
  async *processUserMessages(
    userMessages: string[],
    sessionId: string,
    abortSignal: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    // Convert string messages to full message format
    const formattedMessages = userMessages.map(message => ({
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: message,
      } as ContentPart,
      metadata: {
        sessionId,
        timestamp: Date.now(),
      },
    }));

    // Delegate to the main process method
    yield* this.process(formattedMessages, sessionId, abortSignal);
  }

  /**
   * Process one turn of conversation
   * 
   * This method processes a single turn of conversation, handling:
   * - LLM response generation (streaming)
   * - Tool call extraction and execution
   * - Event emission
   * 
   * @param sessionId - Unique identifier for this conversation session
   * @param chatMessages - Array of chat messages to process
   * @param abortSignal - Signal to abort the processing if needed
   * @returns AsyncGenerator that yields AgentEvent objects
   */
  async *processOneTurn(
    sessionId: string,
    chatMessages: MessageItem[],
    abortSignal: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    this.currentTurn++;
    this.logger.debug(`Starting turn ${this.currentTurn}`, 'BaseAgent.processOneTurn()');
    
    try {
      const promptId = this.generatePromptId();
      this.logger.debug(`Generated prompt ID: ${promptId}`, 'BaseAgent.processOneTurn()');
      
      let toolDeclarations: ToolDeclaration[] = this.getToolList().map((tool: ITool) => (
         tool.schema
      ));
      
      // Handle continuation turns (no new user message)
      let responseStream;
      if (chatMessages.length === 0) {
        // For continuation turns, just get response based on existing history
        this.logger.debug(`Continuation turn - using existing history`, 'BaseAgent.processOneTurn()');
        responseStream = await this.chat.sendMessageStream([{
          role: 'user',
          content: { type: 'text', text: 'continue execution', metadata: { sessionId, timestamp: Date.now(), turn: this.currentTurn } },
          turnIdx: this.currentTurn, // 🔑 NEW: Add turn tracking
        }], promptId, toolDeclarations);
      } else {
        // Normal turn with user messages - send all messages
        responseStream = await this.chat.sendMessageStream(chatMessages, promptId, toolDeclarations);
      }

      // Process streaming response with non-blocking tool execution  
      const pendingToolCalls = new Set<string>(); // Track pending tool calls by callId
      let toolExecutionEvents: AgentEvent[] = []; // Buffer for tool execution events
      let toolsExecutedInThisTurn = 0; // Count tools executed in this turn
      
      // Create tool execution callbacks
      const createToolCallbacks = () => ({
        onExecutionStart: (toolCall: IToolCallRequestInfo) => {
          const startEvent = this.createEvent(AgentEventType.ToolExecutionStart, {
            toolName: toolCall.name,
            callId: toolCall.callId,
            args: toolCall.args,
            sessionId,
            turn: this.currentTurn,
          }) as ToolExecutionStartEvent;
          toolExecutionEvents.push(startEvent);
        },
        
        onExecutionDone: (request: IToolCallRequestInfo, response: IToolCallResponseInfo, duration?: number) => {
          const doneEvent = this.createEvent(AgentEventType.ToolExecutionDone, {
            toolName: request.name,
            callId: request.callId,
            result: response.result,
            error: response.error?.message,
            duration,
            sessionId,
            turn: this.currentTurn,
          }) as ToolExecutionDoneEvent;
          toolExecutionEvents.push(doneEvent);
          toolsExecutedInThisTurn++; // Increment counter
          
          // 🎯 CRITICAL: Add tool execution result to chat history
          // Tool responses must be added as 'user' messages so LLM can see the results
          const toolResultMessage: MessageItem = {
            role: 'user',
            content: {
              type: 'function_response',
              functionResponse: {
                ...(request.functionId && { id: request.functionId }),
                call_id: request.callId, // Use call_ prefixed ID
                name: request.name,
                result: response.result ? response.result.toHistoryStr() : (response.error?.message || 'Tool execution failed'),
              },
            },
            turnIdx: this.currentTurn, // 🔑 NEW: Add turn tracking
          };
          
          this.chat.addHistory(toolResultMessage);
          this.logger.debug(`Added tool result to chat history: ${request.name}`, 'BaseAgent.processOneTurn()');
          
          pendingToolCalls.delete(request.callId); // Mark as completed
        },
      });
      
      for await (const llmResponse of responseStream) {
        if (abortSignal.aborted) break;

        // 🎯 CORE: Forward LLM events directly as Agent events
        // This maintains perfect consistency between IChat and IAgent event streams
        yield createAgentEventFromLLMResponse(llmResponse, sessionId, this.currentTurn);

        // Handle different response types
        if (llmResponse.type === 'response.chunk.text.done') {
          // Add text completion to history
          const textMessage: MessageItem = {
            role: 'assistant',
            content: llmResponse.content,
            turnIdx: this.currentTurn, // 🔑 NEW: Add turn tracking
          };
          
          this.chat.addHistory(textMessage);
          this.logger.debug(`Added assistant text response to chat history`, 'BaseAgent.processOneTurn()');
          
        } else if (llmResponse.type === 'response.chunk.thinking.done') {
          // Add thinking completion to history
          const thinkingMessage: MessageItem = {
            role: 'assistant',
            content: llmResponse.content,
            turnIdx: this.currentTurn, // 🔑 NEW: Add turn tracking
          };
          
          this.chat.addHistory(thinkingMessage);
          this.logger.debug(`Added assistant thinking response to chat history`, 'BaseAgent.processOneTurn()');
          
        } else if (llmResponse.type === 'response.chunk.function_call.done' && llmResponse.content.functionCall) {
          const toolCall: IToolCallRequestInfo = {
            callId: llmResponse.content.functionCall.call_id,
            ...(llmResponse.content.functionCall.id && { functionId: llmResponse.content.functionCall.id }), // Only include if exists
            name: llmResponse.content.functionCall.name,
            args: JSON.parse(llmResponse.content.functionCall.args || '{}'),
            isClientInitiated: false,
            promptId: promptId,
          };

          this.logger.info(`Scheduling tool execution: ${toolCall.name}`, 'BaseAgent.processOneTurn()');
          
          // Add to pending set
          pendingToolCalls.add(toolCall.callId);
          
          // 🎯 CRITICAL: Add assistant message with function call to history
          // This is required for proper OpenAI conversation flow
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
            turnIdx: this.currentTurn, // 🔑 NEW: Add turn tracking
          };
          
          this.chat.addHistory(assistantMessage);
          this.logger.debug(`Added assistant function call to chat history: ${toolCall.name}`, 'BaseAgent.processOneTurn()');
          
          // 🎯 Schedule tool execution asynchronously - this won't block the LLM stream
          this.toolScheduler.schedule([toolCall], abortSignal, createToolCallbacks()).catch(error => {
            this.logger.error(`Tool scheduling failed: ${error}`, 'BaseAgent.processOneTurn()');
            pendingToolCalls.delete(toolCall.callId); // Clean up on error
          });
        }
      }
      
      // 🎯 Wait for all pending tools to complete before finishing turn
      this.logger.debug(`Waiting for ${pendingToolCalls.size} pending tools to complete`, 'BaseAgent.processOneTurn()');
      while (pendingToolCalls.size > 0 && !abortSignal.aborted) {
        // Emit any buffered tool execution events
        while (toolExecutionEvents.length > 0) {
          yield toolExecutionEvents.shift()!;
        }
        
        // Small delay to avoid busy waiting
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Emit any remaining tool execution events
      while (toolExecutionEvents.length > 0) {
        yield toolExecutionEvents.shift()!;
      }

      // Emit completion event
      // Use the dedicated counter for tools executed in this turn
      const hasExecutedTools = toolsExecutedInThisTurn > 0;
      
      this.logger.debug(`Turn ${this.currentTurn} completed with ${toolsExecutedInThisTurn} tools executed`, 'BaseAgent.processOneTurn()');
      yield this.createEvent(AgentEventType.TurnComplete, {
        type: 'turn_complete',
        sessionId,
        turn: this.currentTurn,
        hasToolCalls: hasExecutedTools,
      });

    } catch (error) {
      this.logger.error(`Error in turn ${this.currentTurn}: ${error instanceof Error ? error.message : String(error)}`, 'BaseAgent.processOneTurn()');
      yield this.createErrorEvent(error instanceof Error ? error.message : String(error));
    } finally {
      this.isRunning = false;
      this.lastUpdateTime = Date.now();
    }
  }















  // ============================================================================
  // EVENT SYSTEM
  // ============================================================================

  /**
   * Register event handler
   */
  onEvent(id: string, handler: EventHandler): void {
    this.eventHandlers.set(id, handler);
  }

  /**
   * Remove event handler
   */
  offEvent(id: string): void {
    this.eventHandlers.delete(id);
  }

  /**
   * Create and emit event
   */
  private createEvent(type: AgentEventType, data: unknown): AgentEvent {
    const event: AgentEvent = {
      type,
      data,
      timestamp: Date.now(),
      metadata: {
        agentId: this.agentConfig.sessionId,
        turn: this.currentTurn,
      },
    };

    this.emitEvent(event);
    return event;
  }

  /**
   * Create error event
   */
  private createErrorEvent(message: string): AgentEvent {
    return this.createEvent(AgentEventType.Error, {
      message,
      timestamp: Date.now(),
      turn: this.currentTurn,
    });
  }

  /**
   * Emit event to all handlers
   */
  private emitEvent(event: AgentEvent): void {
    for (const handler of this.eventHandlers.values()) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in event handler:', error);
      }
    }
  }

  // ============================================================================
  // INTERFACE IMPLEMENTATION
  // ============================================================================

  /**
   * Get the underlying chat instance
   */
  getChat(): IChat<any> {
    return this.chat;
  }

  /**
   * Get the tool scheduler instance
   */
  getToolScheduler(): IToolScheduler {
    return this.toolScheduler;
  }

  /**
   * Get current token usage
   */
  getTokenUsage(): ITokenUsage {
    return this.chat.getTokenUsage();
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.chat.clearHistory();
    this.currentTurn = 0;
    // Note: HistoryCleared event type not available yet
    // this.emitEvent(this.createEvent(AgentEventType.HistoryCleared, {
    //   type: 'history_cleared',
    //   timestamp: Date.now(),
    // }));
  }

  /**
   * Set system prompt
   */
  setSystemPrompt(systemPrompt: string): void {
    this.chat.setSystemPrompt(systemPrompt);
    // Note: SystemPromptSet event type not available yet
    // this.emitEvent(this.createEvent(AgentEventType.SystemPromptSet, {
    //   type: 'system_prompt_set',
    //   systemPrompt,
    //   timestamp: Date.now(),
    // }));
  }

  /**
   * Get current system prompt
   */
  getSystemPrompt(): string | undefined {
    return this.chat.getSystemPrompt();
  }

  /**
   * Get current agent status
   */
  getStatus(): IAgentStatus {
    return {
      isRunning: this.isRunning,
      currentTurn: this.currentTurn,
      historySize: this.chat.getHistory().length,
      config: this.agentConfig,
      lastUpdateTime: this.lastUpdateTime,
      tokenUsage: this.getTokenUsage(),
      modelInfo: this.chat.getModelInfo(),
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Generate unique prompt ID
   */
  private generatePromptId(): string {
    return `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }


}