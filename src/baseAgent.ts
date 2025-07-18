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
  ConversationContent,
  ContentPart,
  ToolCallRequest,
  ToolCallResponse,
  IToolCallRequestInfo,
  ICompletedToolCall,
  LLMResponse,
  ChatMessage,
  ITool,
} from './interfaces.js';

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
 * for await (const event of agent.process('Hello', 'session-1', abortController.signal)) {
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
  
  /** Current system prompt, if set */
  private systemPrompt?: string;

  /**
   * Constructor for BaseAgent
   * 
   * @param config - Agent configuration including model, working directory, etc.
   * @param chat - Chat instance for conversation management
   * @param toolScheduler - Tool scheduler for executing tool calls
   */
  constructor(
    protected agentConfig: IAgentConfig,
    protected chat: IChat,
    protected toolScheduler: IToolScheduler,
  ) {
    
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
    // Handle tool completion events
    this.onEvent('internal-tool-completion', (event: AgentEvent) => {
      if (event.type === AgentEventType.ToolCallResponse) {
        // Tool completion is handled in the main process loop
      }
    });
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
   * @param userInput - The user's input text
   * @param sessionId - Unique identifier for this conversation session
   * @param abortSignal - Signal to abort the processing if needed
   * @returns AsyncGenerator that yields AgentEvent objects
   * 
   * @example
   * ```typescript
   * const abortController = new AbortController();
   * for await (const event of agent.process('Hello', 'session-1', abortController.signal)) {
   *   if (event.type === AgentEventType.Content) {
   *     console.log(event.data);
   *   }
   * }
   * ```
   */
  async *process(
    userInput: string,
    sessionId: string,
    abortSignal: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    if (this.isRunning) {
      yield this.createErrorEvent('Agent is already processing a request');
      return;
    }

    this.isRunning = true;
    
    try {
      // 1. Create initial user content
      const userContent = this.createUserContent(userInput, sessionId);
      
      yield this.createEvent(AgentEventType.Content, {
        type: 'user_input',
        content: userInput,
        sessionId,
        turn: this.currentTurn,
      });

      // 2. Create initial chat message
      let currentChatMessage: ChatMessage = {
        content: userContent.parts,
      };

      // 3. Process turns until no more tool calls
      while (!abortSignal.aborted) {
        // Process one turn
        let hasToolCalls = false;
        let toolCallResponses: ToolCallResponse[] = [];
        
        for await (const event of this.processOneTurn(sessionId, currentChatMessage, abortSignal)) {
          yield event;
          
          // Track if we have tool calls in this turn
          if (event.type === AgentEventType.ToolCallResponse) {
            hasToolCalls = true;
            const eventData = event.data as { toolResponse: ToolCallResponse };
            toolCallResponses.push(eventData.toolResponse);
          }
        }

        // If no tool calls in this turn, we're done
        if (!hasToolCalls) {
          break;
        }

        // 4. Convert tool call responses to chat message for next turn
        currentChatMessage = this.convertToolCallResponsesToChatMessage(toolCallResponses);
        console.log('[BASE_AGENT] Will continue with tool responses as next turn input');
      }

    } catch (error) {
      yield this.createErrorEvent(error instanceof Error ? error.message : String(error));
    } finally {
      this.isRunning = false;
      this.lastUpdateTime = Date.now();
    }
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
   * @param chatMessage - The chat message to process
   * @param abortSignal - Signal to abort the processing if needed
   * @returns AsyncGenerator that yields AgentEvent objects
   */
  async *processOneTurn(
    sessionId: string,
    chatMessage: ChatMessage,
    abortSignal: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    this.currentTurn++;
    
    try {
      const promptId = this.generatePromptId();
      const responseStream = await this.chat.sendMessageStream(chatMessage, promptId);

      // Process streaming response
      let fullResponse = '';
      const toolCalls: IToolCallRequestInfo[] = [];
      
      for await (const chunk of responseStream) {
        console.log('[BASE_AGENT] chat response chunk parts:', chunk.content.parts);
        if (abortSignal.aborted) break;

        // Extract content from chunk
        const chunkContent = this.extractContentFromChunk(chunk);
        if (chunkContent) {
          fullResponse += chunkContent;
          
          yield this.createEvent(AgentEventType.Content, {
            type: 'assistant_chunk',
            content: chunkContent,
            sessionId,
            turn: this.currentTurn,
          });
        }
        // Extract tool calls from chunk
        const chunkToolCalls = this.extractToolCallsFromChunk(chunk);
        console.log('[BASE_AGENT] Extracted tool calls:', chunkToolCalls);
        if (chunkToolCalls.length > 0) {
          toolCalls.push(...chunkToolCalls);
        }

        // Emit token usage if available
        if (chunk.usage) {
          yield this.createEvent(AgentEventType.TokenUsage, {
            usage: chunk.usage,
            sessionId,
            turn: this.currentTurn,
          });
        }
      }

      // Execute tools if any were found
      if (toolCalls.length > 0) {
        yield* this.executeTools(toolCalls, sessionId, abortSignal);
      }

      // Emit completion event
      yield this.createEvent(AgentEventType.Content, {
        type: 'turn_complete',
        sessionId,
        turn: this.currentTurn,
        fullResponse,
        toolCallsCount: toolCalls.length,
      });

    } catch (error) {
      yield this.createErrorEvent(error instanceof Error ? error.message : String(error));
    } finally {
      this.isRunning = false;
      this.lastUpdateTime = Date.now();
    }
  }

  /**
   * Execute tools and handle results
   * 
   * This method handles the complete tool execution lifecycle:
   * 1. Emit tool call request events
   * 2. Schedule tools for execution via the tool scheduler
   * 3. Wait for tool completion
   * 4. Process and emit tool results
   * 5. Integrate results back into conversation
   * 
   * The method properly handles errors, timeouts, and abort signals.
   * 
   * @param toolCalls - Array of tool call requests to execute
   * @param sessionId - Current session identifier
   * @param abortSignal - Signal to abort tool execution
   * @returns AsyncGenerator yielding tool-related events
   * 
   * @private
   */
  private async *executeTools(
    toolCalls: IToolCallRequestInfo[],
    sessionId: string,
    abortSignal: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    // Emit tool call request events
    for (const toolCall of toolCalls) {
      const toolCallRequest: ToolCallRequest = {
        callId: toolCall.callId,
        name: toolCall.name,
        args: toolCall.args,
        isClientInitiated: toolCall.isClientInitiated,
        promptId: toolCall.promptId,
      };

      yield this.createEvent(AgentEventType.ToolCallRequest, {
        toolCall: toolCallRequest,
        sessionId,
        turn: this.currentTurn,
      });
    }

    // Schedule tools for execution
    await this.toolScheduler.schedule(toolCalls, abortSignal);

    // Wait for completion and get only current turn's completed calls
    const completedCalls = await this.waitForCurrentToolCompletion(toolCalls, abortSignal);

    // Process completed tools
    for (const completedCall of completedCalls) {
      const toolCallResponse: ToolCallResponse = {
        callId: completedCall.request.callId,
        content: this.convertToolResultToContent(completedCall),
        ...(completedCall.response.resultDisplay && { display: completedCall.response.resultDisplay as string }),
        ...(completedCall.response.error && { error: completedCall.response.error.message }),
      };

      yield this.createEvent(AgentEventType.ToolCallResponse, {
        toolResponse: toolCallResponse,
        sessionId,
        turn: this.currentTurn,
      });
    }

    // Add tool results to chat history
    if (completedCalls.length > 0) {
      const toolResultContent = this.convertToolCallsToContent(completedCalls);
      this.chat.addHistory(toolResultContent);
    }
  }

  /**
   * Wait for completion of current turn's tool calls only
   * 
   * This method waits for the specific tool calls from the current turn to complete,
   * filtering out any previously completed tool calls from other turns.
   * 
   * @param currentToolCalls - The tool calls from the current turn
   * @param abortSignal - Signal to abort waiting
   * @returns Promise resolving to array of completed tool calls from current turn only
   * 
   * @private
   */
  private async waitForCurrentToolCompletion(
    currentToolCalls: IToolCallRequestInfo[],
    abortSignal: AbortSignal
  ): Promise<ICompletedToolCall[]> {
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    const currentCallIds = new Set(currentToolCalls.map(call => call.callId));
    
    while (this.toolScheduler.isRunning() && !abortSignal.aborted) {
      if (Date.now() - startTime > maxWaitTime) {
        this.toolScheduler.cancelAll('Timeout waiting for tool completion');
        break;
      }
      await this.wait(100);
    }

    // Return only completed calls from the current turn
    return this.toolScheduler.getCurrentToolCalls().filter(
      call => {
        const isCompleted = call.status === 'success' || call.status === 'error' || call.status === 'cancelled';
        const isCurrentTurn = currentCallIds.has(call.request.callId);
        return isCompleted && isCurrentTurn;
      }
    ) as ICompletedToolCall[];
  }

  /**
   * Wait for tool completion with timeout (legacy method)
   * 
   * This method waits for all scheduled tools to complete execution.
   * It implements a timeout mechanism to prevent hanging and respects
   * abort signals for graceful cancellation.
   * 
   * @param abortSignal - Signal to abort waiting
   * @returns Promise resolving to array of completed tool calls
   * 
   * @private
   */
  private async waitForToolCompletion(abortSignal: AbortSignal): Promise<ICompletedToolCall[]> {
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.toolScheduler.isRunning() && !abortSignal.aborted) {
      if (Date.now() - startTime > maxWaitTime) {
        this.toolScheduler.cancelAll('Timeout waiting for tool completion');
        break;
      }
      await this.wait(100);
    }

    // Return completed calls (this would need to be implemented in IToolScheduler)
    return this.toolScheduler.getCurrentToolCalls().filter(
      call => call.status === 'success' || call.status === 'error' || call.status === 'cancelled'
    ) as ICompletedToolCall[];
  }

  /**
   * Create user content from input
   * 
   * Converts user input string into a ConversationContent object
   * with proper metadata and formatting.
   * 
   * @param userInput - The user's input text
   * @param sessionId - Current session identifier
   * @returns ConversationContent object representing the user input
   * 
   * @private
   */
  private createUserContent(userInput: string, sessionId: string): ConversationContent {
    const textPart: ContentPart = {
      type: 'text',
      text: userInput,
    };

    return {
      role: 'user',
      parts: [textPart],
      metadata: {
        sessionId,
        timestamp: Date.now(),
        turn: this.currentTurn,
      },
    };
  }

  /**
   * Extract content from LLM response chunk
   * 
   * Extracts text content from a streaming LLM response chunk.
   * Filters for text-type content parts and concatenates their text.
   * 
   * @param chunk - LLM response chunk
   * @returns Extracted text content or null if no text found
   * 
   * @private
   */
  private extractContentFromChunk(chunk: LLMResponse): string | null {
    const textParts = chunk.content.parts.filter(part => part.type === 'text');
    if (textParts.length > 0) {
      return textParts.map(part => part.text || '').join('');
    }
    return null;
  }

  /**
   * Extract tool calls from LLM response chunk
   * 
   * Scans a streaming LLM response chunk for function call parts
   * and converts them to tool call request format.
   * 
   * @param chunk - LLM response chunk to scan
   * @returns Array of tool call request info objects
   * 
   * @private
   */
  private extractToolCallsFromChunk(chunk: LLMResponse): IToolCallRequestInfo[] {
    const toolCalls: IToolCallRequestInfo[] = [];
    
    for (const part of chunk.content.parts) {
      if (part.type === 'function_call' && part.functionCall) {
        toolCalls.push({
          callId: part.functionCall.id,
          name: part.functionCall.name,
          args: part.functionCall.args,
          isClientInitiated: false,
          promptId: this.generatePromptId(),
        });
      }
    }
    
    return toolCalls;
  }

  /**
   * Convert tool result to content parts
   */
  private convertToolResultToContent(completedCall: ICompletedToolCall): ContentPart[] {
    // Convert string response to proper object format for Gemini API
    let result: Record<string, unknown>;
    
    if (typeof completedCall.response.responseParts === 'string') {
      // Wrap string responses in an object with a result field
      result = { result: completedCall.response.responseParts };
    } else if (completedCall.response.responseParts && typeof completedCall.response.responseParts === 'object') {
      // Use object responses as-is
      result = completedCall.response.responseParts as Record<string, unknown>;
    } else {
      // Fallback for other types
      result = { result: String(completedCall.response.responseParts) };
    }

    const resultPart: ContentPart = {
      type: 'function_response',
      functionResponse: {
        id: completedCall.request.callId,
        name: completedCall.request.name,
        result: result,
      },
    };

    console.log('[BASE_AGENT] Created function response part:', resultPart);

    return [resultPart];
  }

  /**
   * Convert completed tool calls to conversation content
   */
  private convertToolCallsToContent(completedCalls: ICompletedToolCall[]): ConversationContent {
    const parts: ContentPart[] = [];
    
    for (const call of completedCalls) {
      parts.push(...this.convertToolResultToContent(call));
    }

    return {
      role: 'function',
      parts,
      metadata: {
        timestamp: Date.now(),
        toolCallsCount: completedCalls.length,
        turn: this.currentTurn,
      },
    };
  }

  /**
   * Convert tool call responses to a single chat message for the next turn.
   * This method aggregates all tool call responses into a single message.
   * 
   * @param toolCallResponses - Array of ToolCallResponse events from the current turn.
   * @returns A single ChatMessage object containing all tool call results.
   */
  private convertToolCallResponsesToChatMessage(toolCallResponses: ToolCallResponse[]): ChatMessage {
    const parts: ContentPart[] = [];

    for (const toolCallResponse of toolCallResponses) {
      // ToolCallResponse.content is already ContentPart[] with proper function_response structure
      parts.push(...toolCallResponse.content);
    }

    console.log('[BASE_AGENT] Converting tool responses to chat message:', parts);

    return {
      content: parts,
    };
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
  getChat(): IChat {
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
    this.emitEvent(this.createEvent(AgentEventType.Content, {
      type: 'history_cleared',
      timestamp: Date.now(),
    }));
  }

  /**
   * Set system prompt
   */
  setSystemPrompt(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
    this.chat.setSystemPrompt(systemPrompt);
    this.emitEvent(this.createEvent(AgentEventType.Content, {
      type: 'system_prompt_set',
      systemPrompt,
      timestamp: Date.now(),
    }));
  }

  /**
   * Get current system prompt
   */
  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
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

  /**
   * Wait for specified time
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}