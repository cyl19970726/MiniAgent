/**
 * @fileoverview Test Utilities for MiniAgent Framework
 * 
 * This module provides mock classes and helper functions for comprehensive
 * testing of the MiniAgent framework components.
 */

import { vi } from 'vitest';
import {
  IChat,
  IToolScheduler,
  ILogger,
  ITool,
  ITokenUsage,
  AgentEvent,
  AgentEventType,
  MessageItem,
  ContentPart,
  IToolCallRequestInfo,
  IToolCallResponseInfo,
  DefaultToolResult,
  IToolResult,
  LLMResponse,
  IAgentConfig,
} from '../interfaces.js';

// =============================================================================
// MOCK FACTORIES
// =============================================================================

/**
 * Factory for creating test data objects
 */
export class TestDataFactory {
  /**
   * Create a test user message
   */
  static createUserMessage(text: string, sessionId?: string): MessageItem {
    return {
      role: 'user',
      content: {
        type: 'text',
        text,
      },
      metadata: sessionId ? { sessionId } : undefined,
    };
  }

  /**
   * Create a test assistant message
   */
  static createAssistantMessage(text: string, toolCalls?: IToolCallRequestInfo[]): MessageItem {
    return {
      role: 'assistant',
      content: {
        type: 'text',
        text,
      },
      toolCalls,
    };
  }

  /**
   * Create a test content part
   */
  static createTextContent(text: string): ContentPart {
    return {
      type: 'text',
      text,
    };
  }

  /**
   * Create a test tool call request
   */
  static createToolCallRequest(
    toolName: string,
    params: Record<string, unknown> = {},
    callId?: string,
  ): IToolCallRequestInfo {
    return {
      callId: callId || `call_${Math.random().toString(36).substr(2, 9)}`,
      name: toolName,
      args: params,
      isClientInitiated: false,
      promptId: `prompt_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  /**
   * Create a test tool call response
   */
  static createToolCallResponse(
    callId: string,
    result: IToolResult,
    success: boolean = true,
    error?: Error,
  ): IToolCallResponseInfo {
    return {
      callId,
      result: success ? result : undefined,
      success,
      error: error,
    };
  }

  /**
   * Create test token usage
   */
  static createTokenUsage(
    promptTokens = 10,
    completionTokens = 20,
    totalTokens?: number,
  ): ITokenUsage {
    return {
      promptTokens,
      completionTokens,
      totalTokens: totalTokens || (promptTokens + completionTokens),
    };
  }

  /**
   * Create a test agent event
   */
  static createAgentEvent(
    type: AgentEventType,
    data: unknown,
    timestamp?: number,
  ): AgentEvent {
    return {
      type,
      data,
      timestamp: timestamp || Date.now(),
      metadata: {
        turn: 1,
        sessionId: 'test-session',
      },
    };
  }

  /**
   * Create a test agent configuration
   */
  static createAgentConfig(overrides: Partial<IAgentConfig> = {}): IAgentConfig {
    return {
      modelName: 'test-model',
      workingDir: '/test',
      tokenLimit: 1000,
      ...overrides,
    };
  }

  /**
   * Create a test LLM response
   */
  static createLLMResponse(
    content: string,
    toolCalls: IToolCallRequestInfo[] = [],
    usage?: ITokenUsage,
  ): LLMResponse {
    return {
      content,
      toolCalls,
      usage: usage || this.createTokenUsage(),
      role: 'assistant',
      finish_reason: 'stop',
    };
  }
}

// =============================================================================
// MOCK CHAT PROVIDER
// =============================================================================

/**
 * Mock implementation of IChat for testing
 */
export class MockChatProvider implements IChat<any> {
  private responses: LLMResponse[] = [];
  private currentResponseIndex = 0;
  private history: MessageItem[] = [];
  private systemPrompt?: string;
  private tokenUsage: ITokenUsage = TestDataFactory.createTokenUsage(0, 0, 0);

  /**
   * Set the next response that will be returned by sendMessage
   */
  setResponse(response: LLMResponse): void {
    this.responses.push(response);
  }

  /**
   * Set multiple responses in order
   */
  setResponses(responses: LLMResponse[]): void {
    this.responses = responses;
    this.currentResponseIndex = 0;
  }

  /**
   * Get the next response from the queue
   */
  private getNextResponse(): LLMResponse {
    if (this.currentResponseIndex >= this.responses.length) {
      throw new Error('No more mock responses available');
    }
    return this.responses[this.currentResponseIndex++];
  }

  async sendMessage(message: MessageItem): Promise<LLMResponse> {
    this.history.push(message);
    const response = this.getNextResponse();
    
    // Update token usage
    if (response.usage) {
      this.tokenUsage.promptTokens += response.usage.promptTokens;
      this.tokenUsage.completionTokens += response.usage.completionTokens;
      this.tokenUsage.totalTokens += response.usage.totalTokens;
    }
    
    // Add assistant response to history
    this.history.push({
      role: 'assistant',
      content: { type: 'text', text: response.content },
      toolCalls: response.toolCalls,
    });
    
    return response;
  }

  async *sendMessageStream(messages: MessageItem[], promptId?: string): AsyncGenerator<LLMResponse> {
    // Add messages to history
    for (const message of messages) {
      this.history.push(message);
    }
    
    const response = this.getNextResponse();
    
    // Emit response start event
    yield {
      type: 'response.start',
      content: '',
      usage: response.usage || TestDataFactory.createTokenUsage(),
      role: 'assistant',
      finish_reason: null,
    };
    
    // Simulate streaming by yielding chunks
    const chunks = response.content.split(' ');
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      yield {
        type: isLast ? 'response.chunk.text.done' : 'response.chunk.text.delta',
        content: chunks[i] + (isLast ? '' : ' '),
        usage: isLast ? response.usage : undefined,
        role: 'assistant',
        finish_reason: isLast ? response.finish_reason : null,
        toolCalls: isLast ? response.toolCalls : undefined,
      };
    }
    
    // Emit tool calls if present
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        yield {
          type: 'response.chunk.function_call.done',
          content: {
            functionCall: {
              call_id: toolCall.id,
              name: toolCall.name,
              args: toolCall.arguments,
            },
          },
          usage: response.usage,
          role: 'assistant',
          finish_reason: null,
        };
      }
    }
    
    // Emit completion
    yield {
      type: 'response.complete',
      content: response.content,
      usage: response.usage || TestDataFactory.createTokenUsage(),
      role: 'assistant',
      finish_reason: response.finish_reason || 'stop',
      toolCalls: response.toolCalls,
    };
    
    // Update token usage after streaming
    if (response.usage) {
      this.tokenUsage.promptTokens += response.usage.promptTokens;
      this.tokenUsage.completionTokens += response.usage.completionTokens;
      this.tokenUsage.totalTokens += response.usage.totalTokens;
    }
    
    // Add assistant response to history
    this.history.push({
      role: 'assistant',
      content: { type: 'text', text: response.content },
      toolCalls: response.toolCalls,
    });
  }

  getHistory(): MessageItem[] {
    return [...this.history];
  }

  addHistory(message: MessageItem): void {
    this.history.push(message);
  }

  clearHistory(): void {
    this.history = [];
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }

  getTokenUsage(): ITokenUsage {
    return { ...this.tokenUsage };
  }

  getModelInfo(): { model: string; maxTokens?: number } {
    return {
      model: 'test-model',
      maxTokens: 1000,
    };
  }

  // Test helper methods
  getCallCount(): number {
    return this.currentResponseIndex;
  }

  reset(): void {
    this.responses = [];
    this.currentResponseIndex = 0;
    this.history = [];
    this.systemPrompt = undefined;
    this.tokenUsage = TestDataFactory.createTokenUsage(0, 0, 0);
  }
}

// =============================================================================
// MOCK TOOL SCHEDULER
// =============================================================================

/**
 * Mock implementation of IToolScheduler for testing
 */
export class MockToolScheduler implements IToolScheduler {
  private tools: Map<string, ITool> = new Map();
  private executionResults: Map<string, IToolResult[]> = new Map();

  registerTool(tool: ITool): void {
    this.tools.set(tool.name, tool);
  }

  removeTool(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  getToolList(): ITool[] {
    return Array.from(this.tools.values());
  }

  getTool(toolName: string): ITool | undefined {
    return this.tools.get(toolName);
  }

  async schedule(
    request: IToolCallRequestInfo | IToolCallRequestInfo[],
    signal: AbortSignal,
    callbacks?: {
      onExecutionStart?: (toolCall: IToolCallRequestInfo) => void;
      onExecutionDone?: (
        request: IToolCallRequestInfo,
        response: IToolCallResponseInfo,
        duration?: number,
      ) => void;
    },
  ): Promise<void> {
    const requests = Array.isArray(request) ? request : [request];

    for (const req of requests) {
      // Notify execution start
      callbacks?.onExecutionStart?.(req);

      const tool = this.tools.get(req.name);
      if (!tool) {
        const errorResponse: IToolCallResponseInfo = {
          callId: req.callId,
          success: false,
          error: new Error(`Tool '${req.name}' not found`),
        };
        callbacks?.onExecutionDone?.(req, errorResponse);
        continue;
      }

      try {
        const startTime = Date.now();
        const result = await tool.execute(req.args, signal);
        const duration = Date.now() - startTime;
        
        const response: IToolCallResponseInfo = {
          callId: req.callId,
          result,
          success: true,
          duration,
        };

        // Store for testing
        if (!this.executionResults.has(req.name)) {
          this.executionResults.set(req.name, []);
        }
        this.executionResults.get(req.name)!.push(result);

        // Notify execution done
        callbacks?.onExecutionDone?.(req, response, duration);

      } catch (error) {
        const errorResponse: IToolCallResponseInfo = {
          callId: req.callId,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
        callbacks?.onExecutionDone?.(req, errorResponse);
      }
    }
  }

  async handleConfirmationResponse(
    callId: string,
    outcome: any,
    payload?: any,
  ): Promise<void> {
    // Mock implementation - no-op for testing
  }

  // Test helper methods
  getExecutionResults(toolName: string): IToolResult[] {
    return this.executionResults.get(toolName) || [];
  }

  reset(): void {
    this.tools.clear();
    this.executionResults.clear();
  }
}

// =============================================================================
// MOCK TOOL
// =============================================================================

/**
 * Mock tool implementation for testing
 */
export class MockTool implements ITool {
  public executionCount = 0;
  public lastParams: unknown = null;
  public mockResult: IToolResult = new DefaultToolResult({ success: true, message: 'Mock execution' });

  constructor(
    public name: string,
    public displayName: string = name,
    public description: string = `Mock tool: ${name}`,
  ) {}

  async execute(
    params: unknown,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<IToolResult> {
    this.executionCount++;
    this.lastParams = params;

    // Simulate some async work
    await new Promise(resolve => setTimeout(resolve, 10));

    if (updateOutput) {
      updateOutput(`Executing ${this.name} with params: ${JSON.stringify(params)}`);
    }

    if (signal.aborted) {
      throw new Error('Operation was aborted');
    }

    return this.mockResult;
  }

  validateToolParams(params: unknown): string | null {
    // Simple validation - just check if it's an object
    if (params !== null && typeof params === 'object') {
      return null;
    }
    return 'Parameters must be an object';
  }

  getDescription(params: unknown): string {
    return `${this.description} with params: ${JSON.stringify(params)}`;
  }

  async shouldConfirmExecute(): Promise<false> {
    return false;
  }

  // Test helper methods
  setMockResult(result: IToolResult): void {
    this.mockResult = result;
  }

  reset(): void {
    this.executionCount = 0;
    this.lastParams = null;
    this.mockResult = new DefaultToolResult({ success: true, message: 'Mock execution' });
  }
}

// =============================================================================
// MOCK LOGGER
// =============================================================================

/**
 * Mock logger implementation for testing
 */
export class MockLogger implements ILogger {
  public logs: Array<{ level: string; message: string; context?: string }> = [];

  debug(message: string, context?: string): void {
    this.logs.push({ level: 'debug', message, context });
  }

  info(message: string, context?: string): void {
    this.logs.push({ level: 'info', message, context });
  }

  warn(message: string, context?: string): void {
    this.logs.push({ level: 'warn', message, context });
  }

  error(message: string, context?: string): void {
    this.logs.push({ level: 'error', message, context });
  }

  setLevel(level: string): void {
    // Mock implementation - do nothing
  }

  // Test helper methods
  getLogsByLevel(level: string): Array<{ level: string; message: string; context?: string }> {
    return this.logs.filter(log => log.level === level);
  }

  clear(): void {
    this.logs = [];
  }
}

// =============================================================================
// EVENT CAPTURE UTILITY
// =============================================================================

/**
 * Utility for capturing and analyzing agent events in tests
 */
export class EventCapture {
  private events: AgentEvent[] = [];
  private eventsByType: Map<AgentEventType, AgentEvent[]> = new Map();

  /**
   * Event handler that captures all events
   */
  handleEvent = (event: AgentEvent): void => {
    this.events.push(event);
    
    if (!this.eventsByType.has(event.type)) {
      this.eventsByType.set(event.type, []);
    }
    this.eventsByType.get(event.type)!.push(event);
  };

  /**
   * Get all captured events
   */
  getAllEvents(): AgentEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type
   */
  getEventsByType(type: AgentEventType): AgentEvent[] {
    return this.eventsByType.get(type) || [];
  }

  /**
   * Get the latest event of a specific type
   */
  getLatestEvent(type?: AgentEventType): AgentEvent | undefined {
    if (type) {
      const events = this.getEventsByType(type);
      return events[events.length - 1];
    }
    return this.events[this.events.length - 1];
  }

  /**
   * Check if an event type was emitted
   */
  hasEventType(type: AgentEventType): boolean {
    return this.eventsByType.has(type);
  }

  /**
   * Get count of events by type
   */
  getEventCount(type?: AgentEventType): number {
    if (type) {
      return this.getEventsByType(type).length;
    }
    return this.events.length;
  }

  /**
   * Reset the capture
   */
  reset(): void {
    this.events = [];
    this.eventsByType.clear();
  }

  /**
   * Wait for a specific event type to be emitted
   */
  async waitForEvent(type: AgentEventType, timeout = 5000): Promise<AgentEvent> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const event = this.getLatestEvent(type);
      if (event) {
        return event;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    throw new Error(`Timeout waiting for event type: ${type}`);
  }
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Collection of helper functions for common test scenarios
 */
export class TestHelpers {
  /**
   * Create a simple abort controller for testing
   */
  static createAbortController(timeoutMs?: number): AbortController {
    const controller = new AbortController();
    
    if (timeoutMs) {
      setTimeout(() => controller.abort(), timeoutMs);
    }
    
    return controller;
  }

  /**
   * Collect all events from an async generator
   */
  static async collectEvents(
    generator: AsyncGenerator<AgentEvent>,
    maxEvents?: number,
  ): Promise<AgentEvent[]> {
    const events: AgentEvent[] = [];
    let count = 0;
    
    for await (const event of generator) {
      events.push(event);
      count++;
      
      if (maxEvents && count >= maxEvents) {
        break;
      }
    }
    
    return events;
  }

  /**
   * Wait for a condition to be true
   */
  static async waitForCondition(
    condition: () => boolean,
    timeout = 5000,
    interval = 10,
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error('Timeout waiting for condition');
  }

  /**
   * Simulate user typing delay
   */
  static async simulateTypingDelay(ms = 100): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a promise that resolves after a delay
   */
  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a promise that rejects after a delay
   */
  static rejectAfterDelay(ms: number, message = 'Timeout'): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Create a mock event generator for testing
   */
  static async* createMockEventGenerator(events: AgentEvent[]): AsyncGenerator<AgentEvent> {
    for (const event of events) {
      yield event;
    }
  }
}

// =============================================================================
// ADDITIONAL FACTORY METHODS
// =============================================================================

/**
 * Extended TestDataFactory with additional helper methods
 */
export class TestDataFactoryExtension {
  /**
   * Create a simple message for testing
   */
  static createMessage(content: string, role: 'user' | 'assistant' = 'user'): MessageItem {
    return TestDataFactory.createUserMessage(content);
  }

  /**
   * Create a tool result for testing
   */
  static createToolResult<T = any>(data: T): DefaultToolResult<T> {
    return new DefaultToolResult(data);
  }
}