/**
 * @fileoverview Tests for BaseTool Implementation
 * 
 * These tests verify the BaseTool class functionality including:
 * - Abstract class behavior
 * - Parameter validation
 * - Error handling
 * - Helper methods
 * - SimpleTool implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Type } from '@google/genai';
import { BaseTool, SimpleTool } from '../baseTool.js';
import { ToolResult, ToolCallConfirmationDetails } from '../interfaces.js';

// Test tool implementation for testing BaseTool
class TestTool extends BaseTool<{ message: string; count?: number }> {
  constructor(
    name: string = 'test_tool',
    displayName: string = 'Test Tool',
    description: string = 'A tool for testing',
    parameterSchema = {
      type: Type.OBJECT,
      properties: {
        message: {
          type: Type.STRING,
          description: 'Message to process',
        },
        count: {
          type: Type.NUMBER,
          description: 'Optional count parameter',
        },
      },
      required: ['message'],
    },
    isOutputMarkdown: boolean = true,
    canUpdateOutput: boolean = false,
  ) {
    super(name, displayName, description, parameterSchema, isOutputMarkdown, canUpdateOutput);
  }

  async execute(
    params: { message: string; count?: number },
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    // Simulate some processing
    if (updateOutput) {
      updateOutput(`Processing: ${params.message}`);
    }

    // Check for cancellation
    this.checkAbortSignal(signal, 'Test tool execution');

    // Return result based on parameters
    const count = params.count || 1;
    const result = params.message.repeat(count);
    
    return this.createResult(
      `Processed: ${result}`,
      `✅ Result: ${result}`,
      `Repeated "${params.message}" ${count} times`,
    );
  }

  // Override validation for testing
  validateToolParams(params: { message: string; count?: number }): string | null {
    const baseError = super.validateToolParams(params);
    if (baseError) return baseError;

    if (!params.message || typeof params.message !== 'string') {
      return 'Message parameter is required and must be a string';
    }

    if (params.count !== undefined && (typeof params.count !== 'number' || params.count < 1)) {
      return 'Count parameter must be a positive number';
    }

    return null;
  }
}

// Test tool that throws errors
class ErrorTool extends BaseTool<{ shouldError: boolean }> {
  constructor() {
    super(
      'error_tool',
      'Error Tool',
      'A tool that can throw errors',
      {
        type: Type.OBJECT,
        properties: {
          shouldError: {
            type: Type.BOOLEAN,
            description: 'Whether to throw an error',
          },
        },
        required: ['shouldError'],
      },
    );
  }

  async execute(
    params: { shouldError: boolean },
    signal: AbortSignal,
  ): Promise<ToolResult> {
    if (params.shouldError) {
      throw new Error('Test error occurred');
    }
    
    return this.createResult('Success', 'Tool executed successfully');
  }
}

// Test tool that requires confirmation
class ConfirmationTool extends BaseTool<{ action: string }> {
  constructor() {
    super(
      'confirmation_tool',
      'Confirmation Tool',
      'A tool that requires confirmation',
      {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            description: 'Action to perform',
          },
        },
        required: ['action'],
      },
    );
  }

  async shouldConfirmExecute(
    params: { action: string },
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // Validate first
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false;
    }

    // Require confirmation for dangerous actions
    if (params.action && (params.action.includes('delete') || params.action.includes('destroy'))) {
      return {
        type: 'info',
        title: 'Confirm Dangerous Action',
        prompt: `Are you sure you want to ${params.action}?`,
        onConfirm: async () => {
          // Mock confirmation handler
        },
      };
    }

    return false;
  }

  validateToolParams(params: { action: string }): string | null {
    if (!params || !params.action || typeof params.action !== 'string') {
      return 'Action parameter is required and must be a string';
    }
    return null;
  }

  async execute(
    params: { action: string },
    signal: AbortSignal,
  ): Promise<ToolResult> {
    return this.createResult(
      `Executed: ${params.action}`,
      `✅ Action completed: ${params.action}`,
    );
  }
}

describe('BaseTool', () => {
  describe('Constructor and Properties', () => {
    it('should initialize with correct properties', () => {
      const tool = new TestTool();
      
      expect(tool.name).toBe('test_tool');
      expect(tool.displayName).toBe('Test Tool');
      expect(tool.description).toBe('A tool for testing');
      expect(tool.isOutputMarkdown).toBe(true);
      expect(tool.canUpdateOutput).toBe(false);
    });

    it('should allow custom configuration', () => {
      const tool = new TestTool(
        'custom_tool',
        'Custom Tool',
        'Custom description',
        {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING },
          },
          required: ['message'],
        },
        false,
        true,
      );
      
      expect(tool.name).toBe('custom_tool');
      expect(tool.displayName).toBe('Custom Tool');
      expect(tool.description).toBe('Custom description');
      expect(tool.isOutputMarkdown).toBe(false);
      expect(tool.canUpdateOutput).toBe(true);
    });

    it('should generate correct schema', () => {
      const tool = new TestTool();
      const schema = tool.schema;
      
      expect(schema.name).toBe('test_tool');
      expect(schema.description).toBe('A tool for testing');
      expect(schema.parameters).toEqual(tool.parameterSchema);
    });
  });

  describe('Parameter Validation', () => {
    let tool: TestTool;

    beforeEach(() => {
      tool = new TestTool();
    });

    it('should validate required parameters', () => {
      const error = tool.validateToolParams({} as any);
      expect(error).toBe('Message parameter is required and must be a string');
    });

    it('should validate parameter types', () => {
      const error = tool.validateToolParams({ message: 123 } as any);
      expect(error).toBe('Message parameter is required and must be a string');
    });

    it('should validate optional parameters', () => {
      const error = tool.validateToolParams({ message: 'test', count: -1 });
      expect(error).toBe('Count parameter must be a positive number');
    });

    it('should pass validation with valid parameters', () => {
      const error = tool.validateToolParams({ message: 'test', count: 2 });
      expect(error).toBeNull();
    });

    it('should handle missing parameters object', () => {
      const error = tool.validateToolParams(null as any);
      expect(error).toBe('Parameters are required');
    });

    it('should handle non-object parameters', () => {
      const error = tool.validateToolParams('string' as any);
      expect(error).toBe('Parameters must be an object');
    });
  });

  describe('Tool Execution', () => {
    let tool: TestTool;
    let abortController: AbortController;

    beforeEach(() => {
      tool = new TestTool();
      abortController = new AbortController();
    });

    it('should execute successfully with valid parameters', async () => {
      const result = await tool.execute(
        { message: 'hello' },
        abortController.signal,
      );

      expect(result.llmContent).toBe('Processed: hello');
      expect(result.returnDisplay).toBe('✅ Result: hello');
      expect(result.summary).toBe('Repeated "hello" 1 times');
    });

    it('should handle optional parameters', async () => {
      const result = await tool.execute(
        { message: 'hi', count: 3 },
        abortController.signal,
      );

      expect(result.llmContent).toBe('Processed: hihihi');
      expect(result.returnDisplay).toBe('✅ Result: hihihi');
      expect(result.summary).toBe('Repeated "hi" 3 times');
    });

    it('should handle output updates', async () => {
      const updateOutput = vi.fn();
      
      await tool.execute(
        { message: 'test' },
        abortController.signal,
        updateOutput,
      );

      expect(updateOutput).toHaveBeenCalledWith('Processing: test');
    });

    it('should handle abort signal', async () => {
      abortController.abort();
      
      await expect(
        tool.execute({ message: 'test' }, abortController.signal),
      ).rejects.toThrow('Test tool execution was cancelled');
    });
  });

  describe('Error Handling', () => {
    let errorTool: ErrorTool;
    let abortController: AbortController;

    beforeEach(() => {
      errorTool = new ErrorTool();
      abortController = new AbortController();
    });

    it('should handle execution errors', async () => {
      // The ErrorTool doesn't have the error handling built-in, so we need to test it directly
      try {
        await errorTool.execute({ shouldError: true }, abortController.signal);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Test error occurred');
      }
    });

    it('should execute successfully when no error', async () => {
      const result = await errorTool.execute(
        { shouldError: false },
        abortController.signal,
      );

      expect(result.llmContent).toBe('Success');
      expect(result.returnDisplay).toBe('Tool executed successfully');
    });
  });

  describe('Confirmation Workflow', () => {
    let confirmationTool: ConfirmationTool;
    let abortController: AbortController;

    beforeEach(() => {
      confirmationTool = new ConfirmationTool();
      abortController = new AbortController();
    });

    it('should not require confirmation for safe actions', async () => {
      const confirmation = await confirmationTool.shouldConfirmExecute(
        { action: 'read file' },
        abortController.signal,
      );

      expect(confirmation).toBe(false);
    });

    it('should require confirmation for dangerous actions', async () => {
      const confirmation = await confirmationTool.shouldConfirmExecute(
        { action: 'delete file' },
        abortController.signal,
      );

      expect(confirmation).not.toBe(false);
      expect(confirmation).toHaveProperty('type', 'info');
      expect(confirmation).toHaveProperty('title', 'Confirm Dangerous Action');
    });

    it('should not confirm with invalid parameters', async () => {
      const confirmation = await confirmationTool.shouldConfirmExecute(
        { action: undefined } as any,
        abortController.signal,
      );

      expect(confirmation).toBe(false);
    });
  });

  describe('Helper Methods', () => {
    let tool: TestTool;

    beforeEach(() => {
      tool = new TestTool();
    });

    it('should create basic results', () => {
      const result = tool['createResult']('content', 'display', 'summary');
      
      expect(result.llmContent).toBe('content');
      expect(result.returnDisplay).toBe('display');
      expect(result.summary).toBe('summary');
    });

    it('should create error results', () => {
      const error = new Error('Test error');
      const result = tool['createErrorResult'](error, 'Context');
      
      expect(result.llmContent).toBe('Error: Context: Test error');
      expect(result.returnDisplay).toBe('❌ Error: Context: Test error');
      expect(result.summary).toBe('Failed: Test error');
    });

    it('should create error results from strings', () => {
      const result = tool['createErrorResult']('String error');
      
      expect(result.llmContent).toBe('Error: String error');
      expect(result.returnDisplay).toBe('❌ Error: String error');
      expect(result.summary).toBe('Failed: String error');
    });

    it('should create file diff results', () => {
      const result = tool['createFileDiffResult'](
        'test.txt',
        'diff content',
        'Modified test.txt',
        'Updated file',
      );
      
      expect(result.llmContent).toBe('Modified test.txt');
      expect(result.returnDisplay).toEqual({
        fileName: 'test.txt',
        fileDiff: 'diff content',
      });
      expect(result.summary).toBe('Updated file');
    });

    it('should validate required parameters', () => {
      const error = tool['validateRequiredParams'](
        { name: 'test' },
        ['name', 'missing'],
      );
      
      expect(error).toBe('Missing required parameter: missing');
    });

    it('should validate parameter types', () => {
      const error = tool['validateParameterTypes'](
        { name: 123, age: 'twenty' },
        { name: 'string', age: 'number' },
      );
      
      // The function returns the first error it encounters, which should be name type error
      expect(error).toBe('Parameter \'name\' must be of type string, got number');
    });

    it('should format progress messages', () => {
      const progress = tool['formatProgress']('Operation', 'in progress', '🔄');
      
      expect(progress).toBe('🔄 Operation: in progress');
    });

    it('should check abort signals', () => {
      const abortController = new AbortController();
      
      // Should not throw when not aborted
      expect(() => tool['checkAbortSignal'](abortController.signal)).not.toThrow();
      
      // Should throw when aborted
      abortController.abort();
      expect(() => tool['checkAbortSignal'](abortController.signal, 'Test')).toThrow(
        'Test was cancelled',
      );
    });
  });

  describe('Default Implementations', () => {
    let tool: TestTool;

    beforeEach(() => {
      tool = new TestTool();
    });

    it('should provide default description', () => {
      const description = tool.getDescription({ message: 'test' });
      
      expect(description).toBe('Execute Test Tool with: {"message":"test"}');
    });

    it('should return false for confirmation by default', async () => {
      const confirmation = await tool.shouldConfirmExecute(
        { message: 'test' },
        new AbortController().signal,
      );
      
      expect(confirmation).toBe(false);
    });
  });
});

describe('SimpleTool', () => {
  describe('Constructor and Execution', () => {
    it('should create and execute simple tool', async () => {
      const executor = vi.fn().mockResolvedValue({
        llmContent: 'executed',
        returnDisplay: 'Executed successfully',
      });

      const tool = new SimpleTool(
        'simple_tool',
        'Simple Tool',
        'A simple tool',
        {
          type: Type.OBJECT,
          properties: {
            input: { type: Type.STRING },
          },
          required: ['input'],
        },
        executor,
      );

      const result = await tool.execute(
        { input: 'test' },
        new AbortController().signal,
      );

      expect(executor).toHaveBeenCalledWith(
        { input: 'test' },
        expect.any(AbortSignal),
        undefined,
      );
      expect(result.llmContent).toBe('executed');
      expect(result.returnDisplay).toBe('Executed successfully');
    });

    it('should handle validation errors', async () => {
      const executor = vi.fn();

      const tool = new SimpleTool(
        'simple_tool',
        'Simple Tool',
        'A simple tool',
        {
          type: Type.OBJECT,
          properties: {
            input: { type: Type.STRING },
          },
          required: ['input'],
        },
        executor,
      );

      // Override validation to return error
      tool.validateToolParams = vi.fn().mockReturnValue('Validation error');

      const result = await tool.execute(
        { input: 'test' },
        new AbortController().signal,
      );

      expect(executor).not.toHaveBeenCalled();
      expect(result.llmContent).toBe('Error: Validation error');
      expect(result.returnDisplay).toBe('❌ Error: Validation error');
    });

    it('should handle execution errors', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('Execution failed'));

      const tool = new SimpleTool(
        'simple_tool',
        'Simple Tool',
        'A simple tool',
        {
          type: Type.OBJECT,
          properties: {
            input: { type: Type.STRING },
          },
        },
        executor,
      );

      const result = await tool.execute(
        { input: 'test' },
        new AbortController().signal,
      );

      expect(result.llmContent).toBe('Error: Execution failed');
      expect(result.returnDisplay).toBe('❌ Error: Execution failed');
    });

    it('should support output updates', async () => {
      const updateOutput = vi.fn();
      const executor = vi.fn().mockImplementation((params, signal, output) => {
        if (output) output('Processing...');
        return { llmContent: 'done', returnDisplay: 'Done' };
      });

      const tool = new SimpleTool(
        'simple_tool',
        'Simple Tool',
        'A simple tool',
        {
          type: Type.OBJECT,
          properties: {
            input: { type: Type.STRING },
          },
        },
        executor,
      );

      await tool.execute(
        { input: 'test' },
        new AbortController().signal,
        updateOutput,
      );

      expect(updateOutput).toHaveBeenCalledWith('Processing...');
    });

    it('should handle abort signals', async () => {
      const executor = vi.fn().mockImplementation((params, signal) => {
        signal.throwIfAborted();
        return { llmContent: 'done', returnDisplay: 'Done' };
      });

      const tool = new SimpleTool(
        'simple_tool',
        'Simple Tool',
        'A simple tool',
        {
          type: Type.OBJECT,
          properties: {
            input: { type: Type.STRING },
          },
        },
        executor,
      );

      const abortController = new AbortController();
      abortController.abort();

      const result = await tool.execute(
        { input: 'test' },
        abortController.signal,
      );

      expect(result.llmContent).toContain('Error:');
      expect(result.returnDisplay).toContain('❌ Error:');
    });
  });

  describe('Properties', () => {
    it('should have correct properties', () => {
      const tool = new SimpleTool(
        'simple_tool',
        'Simple Tool',
        'A simple tool',
        {
          type: Type.OBJECT,
          properties: {
            input: { type: Type.STRING },
          },
        },
        async () => ({ llmContent: 'test', returnDisplay: 'Test' }),
        false,
        true,
      );

      expect(tool.name).toBe('simple_tool');
      expect(tool.displayName).toBe('Simple Tool');
      expect(tool.description).toBe('A simple tool');
      expect(tool.isOutputMarkdown).toBe(false);
      expect(tool.canUpdateOutput).toBe(true);
    });

    it('should generate correct schema', () => {
      const parameterSchema = {
        type: Type.OBJECT,
        properties: {
          input: { type: Type.STRING },
        },
      };

      const tool = new SimpleTool(
        'simple_tool',
        'Simple Tool',
        'A simple tool',
        parameterSchema,
        async () => ({ llmContent: 'test', returnDisplay: 'Test' }),
      );

      const schema = tool.schema;
      expect(schema.name).toBe('simple_tool');
      expect(schema.description).toBe('A simple tool');
      expect(schema.parameters).toEqual(parameterSchema);
    });
  });
});