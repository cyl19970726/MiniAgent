/**
 * @fileoverview Core Tool Scheduler Implementation
 * 
 * This module provides the core tool scheduling and execution system for AI agents.
 * It manages tool lifecycle, execution state, confirmation workflows, and error handling.
 * The implementation references the core package patterns but uses our interface system.
 */

import {
  IToolScheduler,
  IToolSchedulerConfig,
  IToolCallRequestInfo,
  IToolCall,
  ICompletedToolCall,
  ITool,
  ToolCallStatus,
  ToolConfirmationOutcome,
  ToolConfirmationPayload,
  IValidatingToolCall,
  IScheduledToolCall,
  IExecutingToolCall,
  ISuccessfulToolCall,
  IErroredToolCall,
  ICancelledToolCall,
  IWaitingToolCall,
} from './interfaces.js';

/**
 * Core tool scheduler implementation
 * 
 * This class manages the complete lifecycle of tool execution including:
 * - Request validation and scheduling
 * - Confirmation workflows for destructive operations
 * - Parallel and sequential execution management
 * - Error handling and retry logic
 * - State tracking and event emission
 * 
 * The implementation follows these principles:
 * - Non-blocking operation with async/await patterns
 * - Comprehensive state management for all tool calls
 * - Flexible confirmation system for user safety
 * - Robust error handling with proper cleanup
 * - Event-driven architecture for monitoring
 * 
 * @example
 * ```typescript
 * const scheduler = new CoreToolScheduler({
 *   toolRegistry: toolRegistryPromise,
 *   outputUpdateHandler: (id, output) => console.log(`Tool ${id}: ${output}`),
 *   onAllToolCallsComplete: (completed) => console.log('All tools done'),
 * });
 * 
 * await scheduler.schedule([toolCallRequest], abortSignal);
 * ```
 */
export class CoreToolScheduler implements IToolScheduler {
  /** Map of tool call IDs to their current state */
  private toolCalls: Map<string, IToolCall> = new Map();
  
  /** Current execution state */
  private isCurrentlyRunning = false;
  
  /** Available tools registry */
  private toolRegistry: Map<string, ITool> = new Map();
  
  /** Abort controller for canceling all operations */
  private abortController?: AbortController;
  
  /** Promise that resolves when tool registry is loaded */
  private registryPromise: Promise<void>;

  constructor(private config: IToolSchedulerConfig) {
    this.registryPromise = this.loadToolRegistry();
  }

  /**
   * Schedule tool call(s) for execution
   * 
   * This is the main entry point for tool execution. It processes requests,
   * validates tools, handles confirmations, and manages execution lifecycle.
   * 
   * @param request - Single tool call or array of tool calls
   * @param signal - Abort signal for cancellation
   */
  async schedule(
    request: IToolCallRequestInfo | IToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<void> {
    // Ensure tool registry is loaded
    await this.registryPromise;
    
    const requests = Array.isArray(request) ? request : [request];
    
    if (requests.length === 0) {
      return;
    }

    this.isCurrentlyRunning = true;
    this.abortController = new AbortController();
    
    // Link external abort signal to internal controller
    if (signal.aborted) {
      this.abortController.abort();
      return;
    }
    
    signal.addEventListener('abort', () => {
      this.abortController?.abort();
    });

    try {
      // Phase 1: Validate all tool calls
      await this.validateToolCalls(requests);
      
      // Phase 2: Handle confirmations for tools that require them
      await this.handleConfirmations();
      
      // Phase 3: Execute approved tools
      await this.executeApprovedTools();
      
      // Phase 4: Wait for completion and cleanup
      await this.waitForCompletion();
      
    } catch (error) {
      // Handle errors and cleanup
      await this.handleSchedulingError(error);
    } finally {
      this.isCurrentlyRunning = false;
      this.notifyCompletion();
    }
  }

  /**
   * Handle confirmation response for a tool call
   * 
   * Processes user responses to confirmation prompts and updates
   * tool call state accordingly.
   * 
   * @param callId - Tool call identifier
   * @param outcome - User's confirmation decision
   * @param payload - Optional payload for modifications
   */
  async handleConfirmationResponse(
    _callId: string,
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ): Promise<void> {
    const callId = _callId;
    const toolCall = this.toolCalls.get(callId);
    
    if (!toolCall || toolCall.status !== ToolCallStatus.AwaitingApproval) {
      console.warn(`Cannot handle confirmation for tool call ${callId}: invalid state`);
      return;
    }

    const waitingCall = toolCall as IWaitingToolCall;
    
    try {
      switch (outcome) {
        case ToolConfirmationOutcome.ProceedOnce:
        case ToolConfirmationOutcome.ProceedAlways:
        case ToolConfirmationOutcome.ProceedAlwaysServer:
        case ToolConfirmationOutcome.ProceedAlwaysTool:
          // Approve and execute
          await this.approveAndExecuteToolCall(waitingCall, outcome);
          break;
          
        case ToolConfirmationOutcome.ModifyWithEditor:
          // Handle modification with editor
          await this.handleModificationRequest(waitingCall, payload);
          break;
          
        case ToolConfirmationOutcome.Cancel:
          // Cancel the tool call
          await this.cancelToolCall(waitingCall, 'User cancelled');
          break;
      }
    } catch (error) {
      await this.handleToolCallError(waitingCall, error);
    }
    
    this.notifyUpdate();
  }

  /**
   * Get current tool calls
   * 
   * @returns Array of all current tool calls
   */
  getCurrentToolCalls(): IToolCall[] {
    return Array.from(this.toolCalls.values());
  }

  /**
   * Check if scheduler is currently running
   * 
   * @returns True if scheduler is processing tool calls
   */
  isRunning(): boolean {
    return this.isCurrentlyRunning;
  }

  /**
   * Cancel all pending tool calls
   * 
   * Cancels all tool calls that are not yet completed and cleans up resources.
   * 
   * @param reason - Reason for cancellation
   */
  cancelAll(reason: string): void {
    for (const [_callId, toolCall] of this.toolCalls) {
      if (this.isCompletedToolCall(toolCall)) {
        continue; // Don't cancel completed calls
      }
      
      this.cancelToolCallSync(toolCall, reason);
    }
    
    this.abortController?.abort();
    this.notifyUpdate();
  }

  // ============================================================================
  // PRIVATE IMPLEMENTATION METHODS
  // ============================================================================

  /**
   * Load tool registry from configuration
   */
  private async loadToolRegistry(): Promise<void> {
    try {
      const registry = await this.config.toolRegistry;
      
      // Process the registry to extract tools
      if (registry instanceof Map) {
        // Direct Map assignment
        this.toolRegistry = registry;
      } else if (registry && typeof registry === 'object') {
        // Convert object to Map
        this.toolRegistry = new Map(Object.entries(registry));
      } else {
        console.warn('Tool registry is not in expected format');
      }
    } catch (error) {
      console.error('Failed to load tool registry:', error);
      throw new Error('Tool registry initialization failed');
    }
  }

  /**
   * Validate all tool call requests
   */
  private async validateToolCalls(requests: IToolCallRequestInfo[]): Promise<void> {
    for (const request of requests) {
      await this.validateSingleToolCall(request);
    }
  }

  /**
   * Validate a single tool call request
   */
  private async validateSingleToolCall(request: IToolCallRequestInfo): Promise<void> {
    // Create validating tool call - will populate tool in try block
    let toolCall: IValidatingToolCall | undefined;

    try {
      // Resolve tool first
      const tool = await this.resolveToolForRequest(request);
      
      toolCall = {
        status: ToolCallStatus.Validating,
        request,
        startTime: Date.now(),
        tool,
      };

      this.toolCalls.set(request.callId, toolCall);
      this.notifyUpdate();
      // Validate tool parameters
      const validationError = toolCall.tool.validateToolParams(request.args);
      if (validationError) {
        throw new Error(`Tool parameter validation failed: ${validationError}`);
      }

      // Check if tool requires confirmation
      const confirmationDetails = await toolCall.tool.shouldConfirmExecute(
        request.args,
        this.abortController?.signal || new AbortController().signal,
      );

      if (confirmationDetails) {
        // Move to awaiting approval state
        const waitingCall: IWaitingToolCall = {
          ...toolCall,
          status: ToolCallStatus.AwaitingApproval,
          confirmationDetails,
        };
        
        this.toolCalls.set(request.callId, waitingCall);
        this.notifyUpdate();
      } else {
        // Move to scheduled state
        const scheduledCall: IScheduledToolCall = {
          ...toolCall,
          status: ToolCallStatus.Scheduled,
        };
        
        this.toolCalls.set(request.callId, scheduledCall);
        this.notifyUpdate();
      }
    } catch (error) {
      // If toolCall wasn't created yet (tool not found), create a minimal one for error handling
      if (!toolCall) {
        toolCall = {
          status: ToolCallStatus.Validating,
          request,
          startTime: Date.now(),
          tool: {} as ITool, // Dummy tool for error case
        };
        this.toolCalls.set(request.callId, toolCall);
      }
      await this.handleToolCallError(toolCall, error);
    }
  }

  /**
   * Resolve tool instance for a request
   */
  private async resolveToolForRequest(request: IToolCallRequestInfo): Promise<ITool> {
    const tool = this.toolRegistry.get(request.name);
    
    if (!tool) {
      throw new Error(`Tool '${request.name}' not found in registry`);
    }
    
    return tool;
  }

  /**
   * Handle confirmations for tools that require them
   */
  private async handleConfirmations(): Promise<void> {
    const waitingCalls = this.getToolCallsByStatus(ToolCallStatus.AwaitingApproval) as IWaitingToolCall[];
    
    if (waitingCalls.length === 0) {
      return;
    }

    // Handle confirmations based on approval mode
    switch (this.config.approvalMode) {
      case 'yolo':
        // Auto-approve all tools
        for (const call of waitingCalls) {
          await this.approveAndExecuteToolCall(call, ToolConfirmationOutcome.ProceedAlways);
        }
        break;
        
      case 'always':
        // Wait for manual confirmation of each tool
        // In a real implementation, this would trigger UI prompts
        // For now, we'll wait for external confirmation via handleConfirmationResponse
        break;
        
      case 'default':
      default:
        // Use tool-specific confirmation logic
        // For now, similar to 'always' mode
        break;
    }
  }

  /**
   * Execute all approved (scheduled) tools
   */
  private async executeApprovedTools(): Promise<void> {
    const scheduledCalls = this.getToolCallsByStatus(ToolCallStatus.Scheduled) as IScheduledToolCall[];
    
    // Execute tools in parallel (could be made configurable)
    const executionPromises = scheduledCalls.map(call => this.executeToolCall(call));
    
    await Promise.allSettled(executionPromises);
  }

  /**
   * Execute a single tool call
   */
  private async executeToolCall(scheduledCall: IScheduledToolCall): Promise<void> {
    // Move to executing state
    const executingCall: IExecutingToolCall = {
      ...scheduledCall,
      status: ToolCallStatus.Executing,
      liveOutput: '',
    };
    
    this.toolCalls.set(scheduledCall.request.callId, executingCall);
    this.notifyUpdate();

    try {
      // Set up output update handler
      const updateOutput = (output: string) => {
        executingCall.liveOutput = (executingCall.liveOutput || '') + output;
        this.notifyOutputUpdate(scheduledCall.request.callId, output);
        this.notifyUpdate();
      };

      // Execute the tool
      const result = await executingCall.tool.execute(
        scheduledCall.request.args,
        this.abortController?.signal || new AbortController().signal,
        updateOutput,
      );

      // Move to success state
      const successCall: ISuccessfulToolCall = {
        ...executingCall,
        status: ToolCallStatus.Success,
        response: {
          callId: scheduledCall.request.callId,
          responseParts: result.llmContent,
          resultDisplay: result.returnDisplay,
        },
        durationMs: Date.now() - (scheduledCall.startTime || Date.now()),
      };
      
      this.toolCalls.set(scheduledCall.request.callId, successCall);
      this.notifyUpdate();
      
    } catch (error) {
      await this.handleToolCallError(executingCall, error);
    }
  }

  /**
   * Approve and execute a waiting tool call
   */
  private async approveAndExecuteToolCall(
    waitingCall: IWaitingToolCall,
    outcome: ToolConfirmationOutcome,
  ): Promise<void> {
    // Move to scheduled state first
    const scheduledCall: IScheduledToolCall = {
      ...waitingCall,
      status: ToolCallStatus.Scheduled,
      outcome,
    };
    
    this.toolCalls.set(waitingCall.request.callId, scheduledCall);
    this.notifyUpdate();
    
    // Then execute
    await this.executeToolCall(scheduledCall);
  }

  /**
   * Handle modification request from user
   */
  private async handleModificationRequest(
    waitingCall: IWaitingToolCall,
    payload?: ToolConfirmationPayload,
  ): Promise<void> {
    if (!payload?.newContent) {
      await this.cancelToolCall(waitingCall, 'No modification content provided');
      return;
    }

    // Create modified scheduled call (skip confirmation since user already approved modification)
    const scheduledCall: IScheduledToolCall = {
      ...waitingCall,
      status: ToolCallStatus.Scheduled,
      request: {
        ...waitingCall.request,
        args: {
          ...waitingCall.request.args,
          // Apply the modification (this would depend on tool type)
          content: payload.newContent,
        },
      },
      outcome: ToolConfirmationOutcome.ModifyWithEditor,
    };
    
    this.toolCalls.set(waitingCall.request.callId, scheduledCall);
    this.notifyUpdate();
    
    // Execute the modified tool call
    await this.executeToolCall(scheduledCall);
  }

  /**
   * Cancel a tool call
   */
  private async cancelToolCall(toolCall: IToolCall, reason: string): Promise<void> {
    this.cancelToolCallSync(toolCall, reason);
    this.notifyUpdate();
  }

  /**
   * Cancel tool call synchronously
   */
  private cancelToolCallSync(toolCall: IToolCall, reason: string): void {
    const cancelledCall: ICancelledToolCall = {
      ...toolCall,
      status: ToolCallStatus.Cancelled,
      tool: 'tool' in toolCall ? toolCall.tool : {} as ITool,
      response: {
        callId: toolCall.request.callId,
        responseParts: `Tool call cancelled: ${reason}`,
        error: new Error(reason),
      },
      durationMs: Date.now() - (toolCall.startTime || Date.now()),
    };
    
    this.toolCalls.set(toolCall.request.callId, cancelledCall);
  }

  /**
   * Handle tool call error
   */
  private async handleToolCallError(toolCall: IToolCall, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const erroredCall: IErroredToolCall = {
      ...toolCall,
      status: ToolCallStatus.Error,
      response: {
        callId: toolCall.request.callId,
        responseParts: `Tool execution failed: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(errorMessage),
      },
      durationMs: Date.now() - (toolCall.startTime || Date.now()),
    };
    
    this.toolCalls.set(toolCall.request.callId, erroredCall);
    this.notifyUpdate();
  }

  /**
   * Handle scheduling error
   */
  private async handleSchedulingError(error: unknown): Promise<void> {
    console.error('Tool scheduling error:', error);
    
    // Cancel any incomplete tool calls
    for (const [, toolCall] of this.toolCalls) {
      if (!this.isCompletedToolCall(toolCall)) {
        this.cancelToolCallSync(toolCall, 'Scheduling error');
      }
    }
  }

  /**
   * Wait for all tool calls to complete
   */
  private async waitForCompletion(): Promise<void> {
    const maxWaitTime = 60000; // 60 seconds
    const startTime = Date.now();
    
    while (this.hasIncompleteToolCalls() && !this.abortController?.signal.aborted) {
      if (Date.now() - startTime > maxWaitTime) {
        this.cancelAll('Timeout waiting for tool completion');
        break;
      }
      
      await this.wait(100);
    }
  }

  /**
   * Check if there are incomplete tool calls
   */
  private hasIncompleteToolCalls(): boolean {
    for (const toolCall of this.toolCalls.values()) {
      if (!this.isCompletedToolCall(toolCall)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if tool call is completed
   */
  private isCompletedToolCall(toolCall: IToolCall): toolCall is ICompletedToolCall {
    return toolCall.status === ToolCallStatus.Success ||
           toolCall.status === ToolCallStatus.Error ||
           toolCall.status === ToolCallStatus.Cancelled;
  }

  /**
   * Get tool calls by status
   */
  private getToolCallsByStatus(status: ToolCallStatus): IToolCall[] {
    return Array.from(this.toolCalls.values()).filter(call => call.status === status);
  }

  /**
   * Get completed tool calls
   */
  private getCompletedToolCalls(): ICompletedToolCall[] {
    return Array.from(this.toolCalls.values()).filter(this.isCompletedToolCall);
  }

  /**
   * Notify about output updates
   */
  private notifyOutputUpdate(callId: string, output: string): void {
    this.config.outputUpdateHandler?.(callId, output);
  }

  /**
   * Notify about tool calls update
   */
  private notifyUpdate(): void {
    this.config.onToolCallsUpdate?.(this.getCurrentToolCalls());
  }

  /**
   * Notify about completion
   */
  private notifyCompletion(): void {
    const completedCalls = this.getCompletedToolCalls();
    this.config.onAllToolCallsComplete?.(completedCalls);
  }

  /**
   * Wait for specified time
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}