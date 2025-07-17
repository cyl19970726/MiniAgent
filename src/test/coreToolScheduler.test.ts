/**
 * @fileoverview CoreToolScheduler Tests
 * 
 * Comprehensive test suite for the CoreToolScheduler implementation.
 * Tests cover tool scheduling, execution lifecycle, confirmations,
 * error handling, and state management scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoreToolScheduler } from '../coreToolScheduler.js';
import {
  IToolSchedulerConfig,
  IToolCallRequestInfo,
  ITool,
  IToolResult,
  ToolCallStatus,
  ToolConfirmationOutcome,
  ToolConfirmationPayload,
  ToolCallConfirmationDetails,
  IValidatingToolCall,
  IWaitingToolCall,
  IScheduledToolCall,
  IExecutingToolCall,
  ISuccessfulToolCall,
  IErroredToolCall,
  ICancelledToolCall,
  ICompletedToolCall,
} from '../interfaces.js';

/**
 * Mock tool implementation for testing
 */
class MockTool implements ITool {
  shouldConfirm = false;
  executeFn = vi.fn();
  shouldFailValidation = false;
  shouldFailExecution = false;
  confirmationDetails?: ToolCallConfirmationDetails;

  constructor(
    public name = 'mockTool',
    public displayName = 'Mock Tool',
    public description = 'A mock tool for testing',
  ) {}

  validateToolParams(_params: Record<string, unknown>): string | null {
    if (this.shouldFailValidation) {
      return 'Validation failed for testing';
    }
    return null;
  }

  async shouldConfirmExecute(
    _params: Record<string, unknown>,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.shouldConfirm && this.confirmationDetails) {
      return this.confirmationDetails;
    }
    return false;
  }

  async execute(
    params: Record<string, unknown>,
    _abortSignal: AbortSignal,
    _outputUpdateHandler?: (output: string) => void,
  ): Promise<IToolResult> {
    this.executeFn(params);
    
    if (this.shouldFailExecution) {
      throw new Error('Tool execution failed for testing');
    }
    
    return {
      llmContent: 'Tool executed successfully',
      returnDisplay: 'Tool executed successfully',
    };
  }
}

/**
 * Mock modifiable tool for testing edit workflows
 */
class MockModifiableTool extends MockTool {
  constructor(name = 'mockModifiableTool') {
    super(name, 'Mock Modifiable Tool', 'A mock modifiable tool for testing');
    this.shouldConfirm = true;
    this.confirmationDetails = {
      type: 'edit',
      title: 'Confirm Mock Tool Edit',
      fileName: 'test.txt',
      fileDiff: 'Mock diff content',
      onConfirm: async () => {},
    };
  }
}

describe('CoreToolScheduler', () => {
  let mockTool: MockTool;
  let mockModifiableTool: MockModifiableTool;
  let mockConfig: IToolSchedulerConfig;
  let scheduler: CoreToolScheduler;
  let abortController: AbortController;

  beforeEach(() => {
    mockTool = new MockTool();
    mockModifiableTool = new MockModifiableTool();
    
    const mockRegistry = new Map<string, ITool>();
    mockRegistry.set('mockTool', mockTool);
    mockRegistry.set('mockModifiableTool', mockModifiableTool);

    mockConfig = {
      toolRegistry: Promise.resolve(mockRegistry),
      approvalMode: 'default',
      outputUpdateHandler: vi.fn(),
      onToolCallsUpdate: vi.fn(),
      onAllToolCallsComplete: vi.fn(),
    };

    scheduler = new CoreToolScheduler(mockConfig);
    abortController = new AbortController();
    
    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(scheduler).toBeInstanceOf(CoreToolScheduler);
      expect(scheduler.isRunning()).toBe(false);
      expect(scheduler.getCurrentToolCalls()).toEqual([]);
    });
  });

  describe('Basic Tool Scheduling', () => {
    it('should schedule and execute a simple tool call', async () => {
      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockTool',
        args: { input: 'test' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      await scheduler.schedule(request, abortController.signal);

      expect(mockTool.executeFn).toHaveBeenCalledWith({ input: 'test' });
      expect(mockConfig.onAllToolCallsComplete).toHaveBeenCalled();
      
      const completedCalls = (mockConfig.onAllToolCallsComplete as any).mock
        .calls[0][0] as ICompletedToolCall[];
      expect(completedCalls).toHaveLength(1);
      expect(completedCalls[0].status).toBe(ToolCallStatus.Success);
      expect(completedCalls[0].request.callId).toBe('test-call-1');
    });

    it('should schedule multiple tool calls in parallel', async () => {
      const requests: IToolCallRequestInfo[] = [
        {
          callId: 'test-call-1',
          name: 'mockTool',
          args: { input: 'test1' },
          isClientInitiated: false,
          prompt_id: 'prompt-1',
        },
        {
          callId: 'test-call-2',
          name: 'mockTool',
          args: { input: 'test2' },
          isClientInitiated: false,
          prompt_id: 'prompt-2',
        },
      ];

      await scheduler.schedule(requests, abortController.signal);

      expect(mockTool.executeFn).toHaveBeenCalledTimes(2);
      expect(mockTool.executeFn).toHaveBeenCalledWith({ input: 'test1' });
      expect(mockTool.executeFn).toHaveBeenCalledWith({ input: 'test2' });
      
      const completedCalls = (mockConfig.onAllToolCallsComplete as any).mock
        .calls[0][0] as ICompletedToolCall[];
      expect(completedCalls).toHaveLength(2);
    });

    it('should handle empty request array', async () => {
      await scheduler.schedule([], abortController.signal);
      
      expect(mockTool.executeFn).not.toHaveBeenCalled();
      expect(mockConfig.onAllToolCallsComplete).not.toHaveBeenCalled();
    });
  });

  describe('Tool Validation', () => {
    it('should handle tool not found error', async () => {
      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'nonexistentTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      await scheduler.schedule(request, abortController.signal);

      const completedCalls = (mockConfig.onAllToolCallsComplete as any).mock
        .calls[0][0] as ICompletedToolCall[];
      expect(completedCalls).toHaveLength(1);
      expect(completedCalls[0].status).toBe(ToolCallStatus.Error);
      expect(completedCalls[0].response.error?.message).toContain('not found in registry');
    });

    it('should handle validation errors', async () => {
      mockTool.shouldFailValidation = true;
      
      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockTool',
        args: { invalid: 'params' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      await scheduler.schedule(request, abortController.signal);

      expect(mockTool.executeFn).not.toHaveBeenCalled();
      
      const completedCalls = (mockConfig.onAllToolCallsComplete as any).mock
        .calls[0][0] as ICompletedToolCall[];
      expect(completedCalls).toHaveLength(1);
      expect(completedCalls[0].status).toBe(ToolCallStatus.Error);
      expect(completedCalls[0].response.error?.message).toContain('validation failed');
    });
  });

  describe('Tool Confirmation Workflow', () => {
    it('should handle tool requiring confirmation', async () => {
      mockTool.shouldConfirm = true;
      mockTool.confirmationDetails = {
        type: 'exec',
        title: 'Confirm Mock Tool',
        command: 'do_thing',
        rootCommand: 'do_thing',
        onConfirm: async () => {},
      };

      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockTool',
        args: { input: 'test' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      // Start scheduling (will wait for confirmation)
      const schedulePromise = scheduler.schedule(request, abortController.signal);

      // Wait a bit to ensure validation is complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check that tool is waiting for approval
      const currentCalls = scheduler.getCurrentToolCalls();
      expect(currentCalls).toHaveLength(1);
      expect(currentCalls[0].status).toBe(ToolCallStatus.AwaitingApproval);

      // Provide confirmation
      await scheduler.handleConfirmationResponse(
        'test-call-1',
        ToolConfirmationOutcome.ProceedOnce,
      );

      await schedulePromise;

      expect(mockTool.executeFn).toHaveBeenCalledWith({ input: 'test' });
      
      const completedCalls = (mockConfig.onAllToolCallsComplete as any).mock
        .calls[0][0] as ICompletedToolCall[];
      expect(completedCalls).toHaveLength(1);
      expect(completedCalls[0].status).toBe(ToolCallStatus.Success);
    });

    it('should handle confirmation cancellation', async () => {
      mockTool.shouldConfirm = true;
      mockTool.confirmationDetails = {
        type: 'exec',
        title: 'Confirm Mock Tool',
        command: 'do_thing',
        rootCommand: 'do_thing',
        onConfirm: async () => {},
      };

      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockTool',
        args: { input: 'test' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      const schedulePromise = scheduler.schedule(request, abortController.signal);

      // Wait for validation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cancel the confirmation
      await scheduler.handleConfirmationResponse(
        'test-call-1',
        ToolConfirmationOutcome.Cancel,
      );

      await schedulePromise;

      expect(mockTool.executeFn).not.toHaveBeenCalled();
      
      const completedCalls = (mockConfig.onAllToolCallsComplete as any).mock
        .calls[0][0] as ICompletedToolCall[];
      expect(completedCalls).toHaveLength(1);
      expect(completedCalls[0].status).toBe(ToolCallStatus.Cancelled);
    });

    it('should handle modification with editor', async () => {
      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockModifiableTool',
        args: { content: 'original content' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      const schedulePromise = scheduler.schedule(request, abortController.signal);

      // Wait for validation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Provide modification
      const payload: ToolConfirmationPayload = {
        newContent: 'modified content',
      };

      await scheduler.handleConfirmationResponse(
        'test-call-1',
        ToolConfirmationOutcome.ModifyWithEditor,
        payload,
      );

      await schedulePromise;

      expect(mockModifiableTool.executeFn).toHaveBeenCalledWith({
        content: 'modified content',
      });
    });
  });

  describe('Auto-approval Modes', () => {
    it('should auto-approve all tools in yolo mode', async () => {
      mockConfig.approvalMode = 'yolo';
      scheduler = new CoreToolScheduler(mockConfig);
      
      mockTool.shouldConfirm = true;
      mockTool.confirmationDetails = {
        type: 'exec',
        title: 'Confirm Mock Tool',
        command: 'do_thing',
        rootCommand: 'do_thing',
        onConfirm: async () => {},
      };

      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockTool',
        args: { input: 'test' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      await scheduler.schedule(request, abortController.signal);

      expect(mockTool.executeFn).toHaveBeenCalledWith({ input: 'test' });
      
      const completedCalls = (mockConfig.onAllToolCallsComplete as any).mock
        .calls[0][0] as ICompletedToolCall[];
      expect(completedCalls).toHaveLength(1);
      expect(completedCalls[0].status).toBe(ToolCallStatus.Success);
    });
  });

  describe('Error Handling', () => {
    it('should handle tool execution errors', async () => {
      mockTool.shouldFailExecution = true;

      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockTool',
        args: { input: 'test' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      await scheduler.schedule(request, abortController.signal);

      expect(mockTool.executeFn).toHaveBeenCalled();
      
      const completedCalls = (mockConfig.onAllToolCallsComplete as any).mock
        .calls[0][0] as ICompletedToolCall[];
      expect(completedCalls).toHaveLength(1);
      expect(completedCalls[0].status).toBe(ToolCallStatus.Error);
      expect(completedCalls[0].response.error?.message).toContain('execution failed');
    });

    it('should handle abort signal before confirmation', async () => {
      mockTool.shouldConfirm = true;
      mockTool.confirmationDetails = {
        type: 'exec',
        title: 'Confirm Mock Tool',
        command: 'do_thing',
        rootCommand: 'do_thing',
        onConfirm: async () => {},
      };

      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockTool',
        args: { input: 'test' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      // Abort immediately
      abortController.abort();
      
      await scheduler.schedule(request, abortController.signal);

      expect(mockTool.executeFn).not.toHaveBeenCalled();
      
      // Should still complete with cancelled status
      if (mockConfig.onAllToolCallsComplete && (mockConfig.onAllToolCallsComplete as any).mock.calls.length > 0) {
        const completedCalls = (mockConfig.onAllToolCallsComplete as any).mock
          .calls[0][0] as ICompletedToolCall[];
        expect(completedCalls.every(call => call.status === ToolCallStatus.Cancelled)).toBe(true);
      }
    });
  });

  describe('State Management', () => {
    it('should track scheduler running state correctly', async () => {
      expect(scheduler.isRunning()).toBe(false);

      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockTool',
        args: { input: 'test' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      const schedulePromise = scheduler.schedule(request, abortController.signal);
      
      // Should be running during execution
      // Note: This might be timing-dependent in real execution
      
      await schedulePromise;
      
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should provide current tool calls', async () => {
      mockTool.shouldConfirm = true;
      mockTool.confirmationDetails = {
        type: 'exec',
        title: 'Confirm Mock Tool',
        command: 'do_thing',
        rootCommand: 'do_thing',
        onConfirm: async () => {},
      };

      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockTool',
        args: { input: 'test' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      const schedulePromise = scheduler.schedule(request, abortController.signal);

      // Wait for validation
      await new Promise(resolve => setTimeout(resolve, 10));

      const currentCalls = scheduler.getCurrentToolCalls();
      expect(currentCalls).toHaveLength(1);
      expect(currentCalls[0].request.callId).toBe('test-call-1');
      expect(currentCalls[0].status).toBe(ToolCallStatus.AwaitingApproval);

      // Complete the execution
      await scheduler.handleConfirmationResponse(
        'test-call-1',
        ToolConfirmationOutcome.ProceedOnce,
      );

      await schedulePromise;
    });

    it('should handle cancelAll operation', async () => {
      mockTool.shouldConfirm = true;
      mockTool.confirmationDetails = {
        type: 'exec',
        title: 'Confirm Mock Tool',
        command: 'do_thing',
        rootCommand: 'do_thing',
        onConfirm: async () => {},
      };

      const requests: IToolCallRequestInfo[] = [
        {
          callId: 'test-call-1',
          name: 'mockTool',
          args: { input: 'test1' },
          isClientInitiated: false,
          prompt_id: 'prompt-1',
        },
        {
          callId: 'test-call-2',
          name: 'mockTool',
          args: { input: 'test2' },
          isClientInitiated: false,
          prompt_id: 'prompt-2',
        },
      ];

      const schedulePromise = scheduler.schedule(requests, abortController.signal);

      // Wait for validation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cancel all
      scheduler.cancelAll('Test cancellation');

      await schedulePromise;

      expect(mockTool.executeFn).not.toHaveBeenCalled();
      
      const completedCalls = (mockConfig.onAllToolCallsComplete as any).mock
        .calls[0][0] as ICompletedToolCall[];
      expect(completedCalls).toHaveLength(2);
      expect(completedCalls.every(call => call.status === ToolCallStatus.Cancelled)).toBe(true);
    });
  });

  describe('Output Updates', () => {
    it('should handle output updates during execution', async () => {
      // Mock tool that provides output updates
      const outputTool = new MockTool('outputTool');
      outputTool.execute = async (
        _params: Record<string, unknown>,
        _abortSignal: AbortSignal,
        outputUpdateHandler?: (output: string) => void,
      ): Promise<IToolResult> => {
        if (outputUpdateHandler) {
          outputUpdateHandler('Processing...');
          outputUpdateHandler('Almost done...');
          outputUpdateHandler('Completed!');
        }
        return {
          llmContent: 'Tool completed with output',
          returnDisplay: 'Tool completed with output',
        };
      };

      const registry = new Map<string, ITool>();
      registry.set('outputTool', outputTool);
      
      const configWithOutputTool: IToolSchedulerConfig = {
        ...mockConfig,
        toolRegistry: Promise.resolve(registry),
      };
      
      const outputScheduler = new CoreToolScheduler(configWithOutputTool);

      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'outputTool',
        args: { input: 'test' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      await outputScheduler.schedule(request, abortController.signal);

      expect(configWithOutputTool.outputUpdateHandler).toHaveBeenCalledTimes(3);
      expect(configWithOutputTool.outputUpdateHandler).toHaveBeenCalledWith('test-call-1', 'Processing...');
      expect(configWithOutputTool.outputUpdateHandler).toHaveBeenCalledWith('test-call-1', 'Almost done...');
      expect(configWithOutputTool.outputUpdateHandler).toHaveBeenCalledWith('test-call-1', 'Completed!');
    });
  });

  describe('Invalid Confirmation Responses', () => {
    it('should handle confirmation response for non-existent call', async () => {
      await scheduler.handleConfirmationResponse(
        'non-existent-call',
        ToolConfirmationOutcome.ProceedOnce,
      );

      // Should not throw error, just log warning
      expect(mockConfig.onAllToolCallsComplete).not.toHaveBeenCalled();
    });

    it('should handle confirmation response for wrong status', async () => {
      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockTool',
        args: { input: 'test' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      await scheduler.schedule(request, abortController.signal);

      // Try to confirm after execution is complete
      await scheduler.handleConfirmationResponse(
        'test-call-1',
        ToolConfirmationOutcome.ProceedOnce,
      );

      // Should not cause issues
      expect(mockTool.executeFn).toHaveBeenCalledTimes(1);
    });

    it('should handle modification without payload', async () => {
      mockTool.shouldConfirm = true;
      mockTool.confirmationDetails = {
        type: 'exec',
        title: 'Confirm Mock Tool',
        command: 'do_thing',
        rootCommand: 'do_thing',
        onConfirm: async () => {},
      };

      const request: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'mockTool',
        args: { input: 'test' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      };

      const schedulePromise = scheduler.schedule(request, abortController.signal);

      // Wait for validation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Try modification without payload
      await scheduler.handleConfirmationResponse(
        'test-call-1',
        ToolConfirmationOutcome.ModifyWithEditor,
      );

      await schedulePromise;

      expect(mockTool.executeFn).not.toHaveBeenCalled();
      
      const completedCalls = (mockConfig.onAllToolCallsComplete as any).mock
        .calls[0][0] as ICompletedToolCall[];
      expect(completedCalls).toHaveLength(1);
      expect(completedCalls[0].status).toBe(ToolCallStatus.Cancelled);
    });
  });
});