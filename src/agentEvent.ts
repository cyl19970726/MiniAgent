/**
 * @fileoverview Agent Event System Implementation
 * 
 * This module provides a comprehensive event system for AI agents, enabling
 * real-time monitoring, debugging, and integration with external systems.
 * The event system supports various event types and provides utilities for
 * event handling and filtering.
 */

import {
  AgentEvent,
  AgentEventType,
  EventHandler,
} from './interfaces.js';

/**
 * Agent event factory and utilities
 * 
 * This class provides factory methods for creating different types of agent events
 * and utilities for event handling. It ensures consistent event structure and
 * provides type-safe event creation.
 * 
 * Key features:
 * - Type-safe event creation
 * - Consistent metadata handling
 * - Event validation and sanitization
 * - Utility methods for common patterns
 * 
 * @example
 * ```typescript
 * const eventFactory = new AgentEventFactory('agent-123');
 * 
 * // Create content event
 * const contentEvent = eventFactory.createContentEvent('user_input', 'Hello world', {
 *   sessionId: 'session-1',
 *   turn: 1,
 * });
 * 
 * // Create tool call event
 * const toolEvent = eventFactory.createToolCallRequestEvent(toolCallRequest, {
 *   sessionId: 'session-1',
 * });
 * ```
 */
export class AgentEventFactory {
  constructor(private readonly agentId: string) {}

  /**
   * Create a generic event
   * 
   * Low-level method for creating events with any type and data.
   * 
   * @param type - Event type
   * @param data - Event data
   * @param customMetadata - Custom metadata to merge
   * @returns AgentEvent
   */
  createEvent(
    type: AgentEventType,
    data?: unknown,
    customMetadata?: Record<string, unknown>,
  ): AgentEvent {
    return {
      type,
      data,
      timestamp: Date.now(),
      metadata: {
        agentId: this.agentId,
        ...customMetadata,
      },
    };
  }
}

/**
 * Event emitter for agents
 * 
 * Manages event handlers and provides methods for emitting events
 * to registered handlers. Supports filtering and error handling.
 * 
 * @example
 * ```typescript
 * const emitter = new AgentEventEmitter();
 * 
 * // Register handlers
 * emitter.on('content', (event) => console.log('Content:', event.data));
 * emitter.on('error', (event) => console.error('Error:', event.data));
 * 
 * // Emit events
 * emitter.emit(eventFactory.createContentEvent('user_input', 'Hello'));
 * ```
 */
export class AgentEventEmitter {
  private handlers: Map<string, EventHandler> = new Map();
  private typeFilters: Map<string, Set<AgentEventType>> = new Map();

  /**
   * Register an event handler
   * 
   * @param id - Unique handler identifier
   * @param handler - Event handler function
   * @param eventTypes - Optional event type filter
   */
  on(
    id: string,
    handler: EventHandler,
    eventTypes?: AgentEventType[],
  ): void {
    this.handlers.set(id, handler);
    
    if (eventTypes && eventTypes.length > 0) {
      this.typeFilters.set(id, new Set(eventTypes));
    }
  }

  /**
   * Remove an event handler
   * 
   * @param id - Handler identifier to remove
   */
  off(id: string): void {
    this.handlers.delete(id);
    this.typeFilters.delete(id);
  }

  /**
   * Emit an event to all registered handlers
   * 
   * Calls all registered handlers that match the event type filter.
   * Handles errors in individual handlers without affecting others.
   * 
   * @param event - Event to emit
   */
  emit(event: AgentEvent): void {
    for (const [id, handler] of this.handlers) {
      try {
        // Check type filter
        const typeFilter = this.typeFilters.get(id);
        if (typeFilter && !typeFilter.has(event.type)) {
          continue;
        }

        handler(event);
      } catch (error) {
        console.error(`Error in event handler '${id}':`, error);
        
        // Emit error event for handler failures (avoid infinite recursion)
        if (event.type !== AgentEventType.Error) {
          const errorEvent: AgentEvent = {
            type: AgentEventType.Error,
            data: {
              message: `Event handler '${id}' failed`,
              originalEvent: event,
              handlerError: error instanceof Error ? error.message : String(error),
            },
            timestamp: Date.now(),
            metadata: {
              source: 'event_emitter',
              handlerId: id,
            },
          };
          
          // Emit to other handlers (excluding the failing one)
          this.emitToOthers(errorEvent, id);
        }
      }
    }
  }

  /**
   * Emit event to all handlers except specified one
   * 
   * @param event - Event to emit
   * @param excludeId - Handler ID to exclude
   */
  private emitToOthers(event: AgentEvent, excludeId: string): void {
    for (const [id, handler] of this.handlers) {
      if (id === excludeId) continue;
      
      try {
        // Check type filter
        const typeFilter = this.typeFilters.get(id);
        if (typeFilter && !typeFilter.has(event.type)) {
          continue;
        }

        handler(event);
      } catch (error) {
        console.error(`Error in event handler '${id}' during error handling:`, error);
      }
    }
  }

  /**
   * Get all registered handler IDs
   * 
   * @returns Array of handler IDs
   */
  getHandlerIds(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get handler count
   * 
   * @returns Number of registered handlers
   */
  getHandlerCount(): number {
    return this.handlers.size;
  }

  /**
   * Check if a handler is registered
   * 
   * @param id - Handler ID to check
   * @returns True if handler is registered
   */
  hasHandler(id: string): boolean {
    return this.handlers.has(id);
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
    this.typeFilters.clear();
  }
}

/**
 * Event utilities and helpers
 */
export class AgentEventUtils {
  /**
   * Check if event is a content event
   * 
   * @param event - Event to check
   * @returns True if event is content type
   */
  static isUserMessageEvent(event: AgentEvent): boolean {
    return event.type === AgentEventType.UserMessage;
  }

  static isTurnCompleteEvent(event: AgentEvent): boolean {
    return event.type === AgentEventType.TurnComplete;
  }

  /**
   * Check if event is a tool execution event
   * 
   * @param event - Event to check
   * @returns True if event is tool execution type
   */
  static isToolExecutionEvent(event: AgentEvent): boolean {
    return event.type === AgentEventType.ToolExecutionStart || 
           event.type === AgentEventType.ToolExecutionDone;
  }

  /**
   * Check if event is an error event
   * 
   * @param event - Event to check
   * @returns True if event is error type
   */
  static isErrorEvent(event: AgentEvent): boolean {
    return event.type === AgentEventType.Error;
  }

  /**
   * Extract content from LLM response event
   * 
   * @param event - Agent event
   * @returns Content string or null if not an LLM response event
   */
  static extractLLMContent(event: AgentEvent): string | null {
    // Check for text content in LLM response events
    if (event.type.startsWith('response.chunk.text.')) {
      const llmData = event.data as any;
      return llmData?.llmResponse?.content?.text || null;
    }
    
    return null;
  }

  /**
   * Extract error message from error event
   * 
   * @param event - Error event
   * @returns Error message or null if not an error event
   */
  static extractError(event: AgentEvent): string | null {
    if (!this.isErrorEvent(event)) return null;
    
    const data = event.data as any;
    return data?.message || null;
  }

  /**
   * Format event for logging
   * 
   * @param event - Event to format
   * @returns Formatted event string
   */
  static formatForLogging(event: AgentEvent): string {
    const timestamp = new Date(event.timestamp).toISOString();
    const type = event.type.toUpperCase();
    const agentId = event.metadata?.agentId || 'unknown';
    
    let summary = '';
    switch (event.type) {
      case AgentEventType.UserMessage:
        const userMessageData = event.data as any;
        summary = `[${userMessageData?.type || 'user_message'}] ${userMessageData?.content?.substring(0, 100) || ''}`;
        break;
      case AgentEventType.TurnComplete:
        const turnCompleteData = event.data as any;
        summary = `[turn_complete] Turn ${turnCompleteData?.turn || 'N/A'} completed`;
        break;
      case AgentEventType.ToolExecutionStart:
        const toolStartData = event.data as any;
        summary = `[tool_start] ${toolStartData?.toolName || 'unknown'}`;
        break;
      case AgentEventType.ToolExecutionDone:
        const toolDoneData = event.data as any;
        const status = toolDoneData?.error ? 'failed' : 'completed';
        summary = `[tool_done] ${toolDoneData?.toolName || 'unknown'} ${status}`;
        break;
      case AgentEventType.Error:
        const errorData = event.data as any;
        summary = `[ERROR] ${errorData?.message || 'Unknown error'}`;
        break;
      default:
        summary = JSON.stringify(event.data).substring(0, 100);
    }
    
    return `[${timestamp}] ${type} (${agentId}): ${summary}`;
  }

  /**
   * Create event filter function
   * 
   * @param types - Event types to include
   * @returns Filter function
   */
  static createTypeFilter(types: AgentEventType[]): (event: AgentEvent) => boolean {
    const typeSet = new Set(types);
    return (event: AgentEvent) => typeSet.has(event.type);
  }

  /**
   * Create event aggregator
   * 
   * @param windowMs - Time window in milliseconds
   * @returns Aggregator function that collects events in time windows
   */
  static createEventAggregator(windowMs: number): {
    add: (event: AgentEvent) => void;
    getEvents: () => AgentEvent[];
    clear: () => void;
  } {
    let events: AgentEvent[] = [];
    let windowStart = Date.now();

    return {
      add: (event: AgentEvent) => {
        const now = Date.now();
        if (now - windowStart > windowMs) {
          events = [];
          windowStart = now;
        }
        events.push(event);
      },
      getEvents: () => [...events],
      clear: () => {
        events = [];
        windowStart = Date.now();
      },
    };
  }
}