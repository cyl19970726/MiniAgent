/**
 * @fileoverview Comprehensive Unit Tests for McpToolAdapter
 * 
 * This test suite provides extensive coverage of the McpToolAdapter functionality,
 * focusing on:
 * - Generic type parameter behavior
 * - Parameter validation (Zod and JSON Schema fallback)
 * - Result transformation and mapping
 * - BaseTool interface compliance
 * - Error handling and propagation
 * - Confirmation workflow
 * - Tool metadata preservation
 * 
 * Test Count: ~45 comprehensive unit tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { Type } from '@google/genai';
import { McpToolAdapter, createMcpToolAdapters, createTypedMcpToolAdapter } from '../McpToolAdapter.js';
import { 
  ToolConfirmationOutcome, 
  DefaultToolResult,
  ToolCallConfirmationDetails,
} from '../../interfaces.js';
import { 
  McpTool, 
  McpToolResult, 
  McpClientError, 
  McpErrorCode,
} from '../interfaces.js';
import {
  MockMcpClient,
  MockToolFactory,
  createMockMcpTool,
  createMockMcpToolResult,
  createMockAbortSignal,
  createMockAbortController,
} from './mocks.js';

// =============================================================================
// TEST SETUP AND UTILITIES
// =============================================================================

describe('McpToolAdapter', () => {
  let mockClient: MockMcpClient;
  let mockAbortSignal: AbortSignal;
  let updateOutputSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockClient = new MockMcpClient();
    mockAbortSignal = createMockAbortSignal();
    updateOutputSpy = vi.fn();
    
    // Ensure client is connected for tests
    await mockClient.connect();
    
    vi.clearAllMocks();
  });

  // =============================================================================
  // CONSTRUCTOR AND BASIC PROPERTIES TESTS
  // =============================================================================

  describe('Constructor and Basic Properties', () => {
    it('should create adapter with correct basic properties', () => {
      const tool = MockToolFactory.createStringInputTool('test-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'test-server');

      expect(adapter.name).toBe('test-server.test-tool');
      expect(adapter.displayName).toBe('Mock test-tool');
      expect(adapter.description).toBe('Mock tool for test-tool');
      expect(adapter.isOutputMarkdown).toBe(true);
      expect(adapter.canUpdateOutput).toBe(false);
    });

    it('should use tool displayName when provided', () => {
      const tool = createMockMcpTool('test-tool', {
        displayName: 'Custom Display Name',
      });
      const adapter = new McpToolAdapter(mockClient, tool, 'test-server');

      expect(adapter.displayName).toBe('Custom Display Name');
    });

    it('should fallback to tool name when displayName not provided', () => {
      const tool = createMockMcpTool('test-tool');
      delete tool.displayName;
      const adapter = new McpToolAdapter(mockClient, tool, 'test-server');

      expect(adapter.displayName).toBe('test-tool');
    });

    it('should generate correct tool schema', () => {
      const tool = MockToolFactory.createStringInputTool('test-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'test-server');

      const schema = adapter.schema;
      expect(schema.name).toBe('test-server.test-tool');
      expect(schema.description).toBe('Mock tool for test-tool');
      expect(schema.parameters).toEqual(tool.inputSchema);
    });

    it('should preserve parameter schema structure', () => {
      const customSchema = {
        type: Type.OBJECT,
        properties: {
          customParam: {
            type: Type.STRING,
            description: 'Custom parameter',
          },
        },
        required: ['customParam'],
      };
      
      const tool = createMockMcpTool('custom-tool', {
        inputSchema: customSchema,
      });
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      expect(adapter.parameterSchema).toEqual(customSchema);
    });
  });

  // =============================================================================
  // GENERIC TYPE PARAMETER TESTS
  // =============================================================================

  describe('Generic Type Parameter Behavior', () => {
    it('should work with unknown generic type parameter', () => {
      const tool = createMockMcpTool<unknown>('generic-tool');
      const adapter = new McpToolAdapter<unknown>(mockClient, tool, 'server');

      expect(adapter).toBeInstanceOf(McpToolAdapter);
      expect(adapter.name).toBe('server.generic-tool');
    });

    it('should work with specific typed parameters', () => {
      interface CustomParams {
        message: string;
        count: number;
      }

      const tool = createMockMcpTool<CustomParams>('typed-tool');
      const adapter = new McpToolAdapter<CustomParams>(mockClient, tool, 'server');

      expect(adapter).toBeInstanceOf(McpToolAdapter);
      expect(adapter.name).toBe('server.typed-tool');
    });

    it('should preserve type information in validation', async () => {
      const tool = MockToolFactory.createCalculatorTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const validParams = { a: 5, b: 3, operation: 'add' as const };
      const validationResult = adapter.validateToolParams(validParams);

      expect(validationResult).toBeNull();
    });

    it('should handle complex nested generic types', () => {
      interface NestedParams {
        data: {
          items: Array<{ id: string; value: number }>;
          metadata: Record<string, any>;
        };
      }

      const tool = createMockMcpTool<NestedParams>('nested-tool');
      const adapter = new McpToolAdapter<NestedParams>(mockClient, tool, 'server');

      expect(adapter).toBeInstanceOf(McpToolAdapter);
    });

    it('should work with union types', () => {
      type UnionParams = { type: 'text'; content: string } | { type: 'number'; value: number };

      const tool = createMockMcpTool<UnionParams>('union-tool');
      const adapter = new McpToolAdapter<UnionParams>(mockClient, tool, 'server');

      expect(adapter).toBeInstanceOf(McpToolAdapter);
    });
  });

  // =============================================================================
  // ZOD SCHEMA VALIDATION TESTS
  // =============================================================================

  describe('Zod Schema Validation', () => {
    it('should validate using Zod schema when available', () => {
      const tool = MockToolFactory.createStringInputTool('zod-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const validParams = { input: 'test string' };
      const result = adapter.validateToolParams(validParams);

      expect(result).toBeNull();
    });

    it('should return validation error for invalid Zod schema', () => {
      const tool = MockToolFactory.createStringInputTool('zod-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const invalidParams = { input: 123 }; // Should be string
      const result = adapter.validateToolParams(invalidParams);

      expect(result).toContain('Parameter validation failed');
      expect(result).toContain('Expected string');
    });

    it('should validate complex Zod schema with multiple fields', () => {
      const tool = MockToolFactory.createCalculatorTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const validParams = { a: 10, b: 5, operation: 'multiply' };
      const result = adapter.validateToolParams(validParams);

      expect(result).toBeNull();
    });

    it('should validate optional parameters in Zod schema', () => {
      const tool = MockToolFactory.createOptionalParamsTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      // Test with required parameter only
      const minimalParams = { required: 'test' };
      const minimalResult = adapter.validateToolParams(minimalParams);
      expect(minimalResult).toBeNull();

      // Test with both required and optional parameters
      const fullParams = { required: 'test', optional: 42 };
      const fullResult = adapter.validateToolParams(fullParams);
      expect(fullResult).toBeNull();
    });

    it('should return detailed error for missing required Zod fields', () => {
      const tool = MockToolFactory.createCalculatorTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const incompleteParams = { a: 10 }; // Missing b and operation
      const result = adapter.validateToolParams(incompleteParams);

      expect(result).toContain('Parameter validation failed');
      expect(result).toContain('Required');
    });

    it('should handle Zod validation with custom error messages', () => {
      const customSchema = z.object({
        value: z.number().positive('Value must be positive'),
      });

      const tool = createMockMcpTool('custom-zod-tool', {
        zodSchema: customSchema,
      });
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const invalidParams = { value: -5 };
      const result = adapter.validateToolParams(invalidParams);

      expect(result).toContain('Value must be positive');
    });

    it('should catch and handle Zod validation exceptions', () => {
      const tool = createMockMcpTool('exception-tool', {
        zodSchema: {
          safeParse: vi.fn().mockImplementation(() => {
            throw new Error('Zod validation exception');
          }),
        } as any,
      });
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const result = adapter.validateToolParams({ test: 'data' });

      expect(result).toContain('Validation error: Zod validation exception');
    });
  });

  // =============================================================================
  // JSON SCHEMA FALLBACK VALIDATION TESTS
  // =============================================================================

  describe('JSON Schema Fallback Validation', () => {
    it('should fallback to JSON Schema validation when Zod schema unavailable', () => {
      const tool = MockToolFactory.createJsonSchemaOnlyTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const validParams = { data: { key: 'value' } };
      const result = adapter.validateToolParams(validParams);

      expect(result).toBeNull();
    });

    it('should require object for JSON Schema validation', () => {
      const tool = MockToolFactory.createJsonSchemaOnlyTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const invalidParams = 'not an object';
      const result = adapter.validateToolParams(invalidParams);

      expect(result).toBe('Parameters must be an object');
    });

    it('should reject null parameters in JSON Schema validation', () => {
      const tool = MockToolFactory.createJsonSchemaOnlyTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const result = adapter.validateToolParams(null);

      expect(result).toBe('Parameters must be an object');
    });

    it('should validate required properties in JSON Schema', () => {
      const tool = createMockMcpTool('required-props-tool', {
        inputSchema: {
          type: 'object',
          properties: {
            requiredField: { type: 'string' },
            optionalField: { type: 'string' },
          },
          required: ['requiredField'],
        },
        // Explicitly remove Zod schema to force JSON schema validation
        zodSchema: undefined,
      });
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const missingRequired = { optionalField: 'present' };
      const result = adapter.validateToolParams(missingRequired);

      expect(result).toBe('Missing required parameter: requiredField');
    });

    it('should pass validation when all required properties present', () => {
      const tool = createMockMcpTool('required-props-tool', {
        inputSchema: {
          type: 'object',
          properties: {
            requiredField: { type: 'string' },
          },
          required: ['requiredField'],
        },
        // Explicitly remove Zod schema to force JSON schema validation
        zodSchema: undefined,
      });
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const validParams = { requiredField: 'value' };
      const result = adapter.validateToolParams(validParams);

      expect(result).toBeNull();
    });

    it('should handle schemas without required properties', () => {
      const tool = createMockMcpTool('no-required-tool', {
        inputSchema: {
          type: 'object',
          properties: {
            optionalField: { type: 'string' },
          },
          // No required array
        },
        // Explicitly remove Zod schema to force JSON schema validation
        zodSchema: undefined,
      });
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const result = adapter.validateToolParams({ optionalField: 'value' });

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // PARAMETER TRANSFORMATION AND RESULT MAPPING TESTS
  // =============================================================================

  describe('Parameter Transformation and Result Mapping', () => {
    it('should pass parameters correctly to MCP client', async () => {
      const tool = MockToolFactory.createStringInputTool('transform-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const params = { input: 'test data' };
      await adapter.execute(params, mockAbortSignal, updateOutputSpy);

      const callHistory = mockClient.getCallHistory();
      expect(callHistory).toHaveLength(1);
      expect(callHistory[0].name).toBe('transform-tool');
      expect(callHistory[0].args).toEqual(params);
    });

    it('should map MCP result to DefaultToolResult', async () => {
      const tool = MockToolFactory.createStringInputTool('result-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const mcpResult = createMockMcpToolResult({
        content: [{ type: 'text', text: 'Execution result' }],
        serverName: 'server',
        toolName: 'result-tool',
      });
      mockClient.setToolResult('result-tool', mcpResult);

      const result = await adapter.execute({ input: 'test' }, mockAbortSignal);

      expect(result).toBeInstanceOf(DefaultToolResult);
      expect(result.data.content).toEqual(mcpResult.content);
      expect(result.data.serverName).toBe('server');
      expect(result.data.toolName).toBe('result-tool');
    });

    it('should enhance MCP result with adapter metadata', async () => {
      const tool = MockToolFactory.createStringInputTool('metadata-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'test-server');

      const originalResult = createMockMcpToolResult({
        content: [{ type: 'text', text: 'Result' }],
      });
      mockClient.setToolResult('metadata-tool', originalResult);

      const result = await adapter.execute({ input: 'test' }, mockAbortSignal);
      const resultData = result.data;

      expect(resultData.serverName).toBe('test-server');
      expect(resultData.toolName).toBe('metadata-tool');
      expect(resultData.executionTime).toBeGreaterThanOrEqual(0); // Changed to allow 0 for fast execution
    });

    it('should preserve all MCP result content types', async () => {
      const tool = MockToolFactory.createStringInputTool('content-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const complexResult = createMockMcpToolResult({
        content: [
          { type: 'text', text: 'Text content' },
          { type: 'image', data: 'base64data', mimeType: 'image/png' },
          { type: 'resource', resource: { uri: 'file://test.txt', text: 'File content' } },
        ],
      });
      mockClient.setToolResult('content-tool', complexResult);

      const result = await adapter.execute({ input: 'test' }, mockAbortSignal);
      const resultData = result.data;

      expect(resultData.content).toHaveLength(3);
      expect(resultData.content[0].type).toBe('text');
      expect(resultData.content[1].type).toBe('image');
      expect(resultData.content[2].type).toBe('resource');
    });

    it('should handle transformation with complex parameter types', async () => {
      const tool = MockToolFactory.createCalculatorTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const complexParams = {
        a: 15.5,
        b: 3.2,
        operation: 'multiply' as const,
      };

      await adapter.execute(complexParams, mockAbortSignal);

      const callHistory = mockClient.getCallHistory();
      expect(callHistory[0].args).toEqual(complexParams);
    });
  });

  // =============================================================================
  // ERROR HANDLING AND PROPAGATION TESTS
  // =============================================================================

  describe('Error Handling and Propagation', () => {
    it('should handle parameter validation errors in execute', async () => {
      const tool = MockToolFactory.createStringInputTool('error-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const invalidParams = { input: 123 }; // Should be string
      const result = await adapter.execute(invalidParams as any, mockAbortSignal);

      expect(result).toBeInstanceOf(DefaultToolResult);
      const resultData = result.data;
      expect(resultData.isError).toBe(true);
      expect(resultData.content[0].text).toContain('Error executing MCP tool');
    });

    it('should handle MCP client call errors', async () => {
      const tool = MockToolFactory.createStringInputTool('client-error-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const clientError = new McpClientError(
        'Tool execution failed',
        McpErrorCode.ToolNotFound,
        'server',
        'client-error-tool'
      );
      mockClient.setError(clientError);

      const result = await adapter.execute({ input: 'test' }, mockAbortSignal, updateOutputSpy);

      expect(result).toBeInstanceOf(DefaultToolResult);
      const resultData = result.data;
      expect(resultData.isError).toBe(true);
      expect(resultData.content[0].text).toContain('Tool execution failed');
      expect(updateOutputSpy).toHaveBeenCalledWith('Error: Tool execution failed');
    });

    it('should handle schema manager validation errors', async () => {
      const tool = MockToolFactory.createStringInputTool('schema-error-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      // Mock schema manager to return validation error
      const schemaManager = mockClient.getSchemaManager();
      vi.spyOn(schemaManager, 'validateToolParams').mockResolvedValue({
        success: false,
        errors: ['Custom schema validation error'],
      });

      const result = await adapter.execute({ input: 'test' }, mockAbortSignal);

      expect(result).toBeInstanceOf(DefaultToolResult);
      const resultData = result.data;
      expect(resultData.isError).toBe(true);
      expect(resultData.content[0].text).toContain('Custom schema validation error');
    });

    it('should handle unknown errors gracefully', async () => {
      const tool = MockToolFactory.createStringInputTool('unknown-error-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      mockClient.setError(new Error('Unknown error type'));

      const result = await adapter.execute({ input: 'test' }, mockAbortSignal);

      expect(result).toBeInstanceOf(DefaultToolResult);
      const resultData = result.data;
      expect(resultData.isError).toBe(true);
      expect(resultData.executionTime).toBe(0);
    });

    it('should propagate validation exceptions', () => {
      const tool = createMockMcpTool('exception-tool', {
        zodSchema: {
          safeParse: () => {
            throw new Error('Validation exception');
          },
        } as any,
      });
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const result = adapter.validateToolParams({ test: 'data' });

      expect(result).toContain('Validation error: Validation exception');
    });

    it('should handle non-Error exceptions in validation', () => {
      const tool = createMockMcpTool('non-error-exception-tool', {
        zodSchema: {
          safeParse: () => {
            throw 'String exception';
          },
        } as any,
      });
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const result = adapter.validateToolParams({ test: 'data' });

      expect(result).toContain('Validation error: Unknown error');
    });
  });

  // =============================================================================
  // BASETOOL INTERFACE COMPLIANCE TESTS
  // =============================================================================

  describe('BaseTool Interface Compliance', () => {
    it('should implement all required ITool interface methods', () => {
      const tool = MockToolFactory.createStringInputTool('interface-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      // Check required properties
      expect(typeof adapter.name).toBe('string');
      expect(typeof adapter.displayName).toBe('string');
      expect(typeof adapter.description).toBe('string');
      expect(typeof adapter.isOutputMarkdown).toBe('boolean');
      expect(typeof adapter.canUpdateOutput).toBe('boolean');
      expect(adapter.parameterSchema).toBeDefined();
      expect(adapter.schema).toBeDefined();

      // Check required methods
      expect(typeof adapter.execute).toBe('function');
      expect(typeof adapter.validateToolParams).toBe('function');
      expect(typeof adapter.getDescription).toBe('function');
      expect(typeof adapter.shouldConfirmExecute).toBe('function');
    });

    it('should return proper tool schema structure', () => {
      const tool = MockToolFactory.createCalculatorTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'math-server');

      const schema = adapter.schema;

      expect(schema).toHaveProperty('name', 'math-server.calculator');
      expect(schema).toHaveProperty('description');
      expect(schema).toHaveProperty('parameters');
      expect(schema.parameters).toHaveProperty('type');
      expect(schema.parameters).toHaveProperty('properties');
    });

    it('should generate contextual descriptions', () => {
      const tool = MockToolFactory.createStringInputTool('desc-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'test-server');

      const emptyDescription = adapter.getDescription({});
      expect(emptyDescription).toContain('[MCP Server: test-server]');
      expect(emptyDescription).toContain('Mock tool for desc-tool');

      const paramsDescription = adapter.getDescription({ input: 'test', extra: 'param' });
      expect(paramsDescription).toContain('(with parameters: input, extra)');
    });

    it('should handle null and undefined parameters in description', () => {
      const tool = MockToolFactory.createStringInputTool('null-desc-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const nullDescription = adapter.getDescription(null);
      expect(nullDescription).toContain('[MCP Server: server]');
      expect(nullDescription).not.toContain('with parameters');

      const undefinedDescription = adapter.getDescription(undefined);
      expect(undefinedDescription).not.toContain('with parameters');
    });

    it('should execute with proper async behavior', async () => {
      const tool = MockToolFactory.createStringInputTool('async-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const executePromise = adapter.execute({ input: 'test' }, mockAbortSignal);
      expect(executePromise).toBeInstanceOf(Promise);

      const result = await executePromise;
      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(DefaultToolResult);
    });

    it('should support output updates during execution', async () => {
      const tool = MockToolFactory.createStringInputTool('update-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      await adapter.execute({ input: 'test' }, mockAbortSignal, updateOutputSpy);

      expect(updateOutputSpy).toHaveBeenCalledWith('Executing update-tool on server server...');
      expect(updateOutputSpy).toHaveBeenCalledWith(expect.stringContaining('Completed in'));
    });
  });

  // =============================================================================
  // CONFIRMATION WORKFLOW TESTS
  // =============================================================================

  describe('Confirmation Workflow', () => {
    it('should not require confirmation for non-destructive tools', async () => {
      const tool = MockToolFactory.createStringInputTool('safe-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const confirmationDetails = await adapter.shouldConfirmExecute(
        { input: 'test' },
        mockAbortSignal
      );

      expect(confirmationDetails).toBe(false);
    });

    it('should require confirmation for destructive tools', async () => {
      const tool = MockToolFactory.createDestructiveTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const confirmationDetails = await adapter.shouldConfirmExecute(
        { action: 'delete', target: 'file.txt' },
        mockAbortSignal
      ) as ToolCallConfirmationDetails;

      expect(confirmationDetails).not.toBe(false);
      expect(confirmationDetails.type).toBe('mcp');
      expect(confirmationDetails.title).toContain('Destructive Tool');
      expect(confirmationDetails.serverName).toBe('server');
      expect(confirmationDetails.toolName).toBe('destructive-tool');
    });

    it('should require confirmation for tools marked as requiring confirmation', async () => {
      const tool = createMockMcpTool('confirm-tool', {
        capabilities: {
          requiresConfirmation: true,
          destructive: false,
        },
      });
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const confirmationDetails = await adapter.shouldConfirmExecute(
        { input: 'test' },
        mockAbortSignal
      );

      expect(confirmationDetails).not.toBe(false);
    });

    it('should not require confirmation for invalid parameters', async () => {
      const tool = MockToolFactory.createDestructiveTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const confirmationDetails = await adapter.shouldConfirmExecute(
        { invalid: 'params' } as any,
        mockAbortSignal
      );

      expect(confirmationDetails).toBe(false);
    });

    it('should handle confirmation outcomes correctly', async () => {
      const tool = MockToolFactory.createDestructiveTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const confirmationDetails = await adapter.shouldConfirmExecute(
        { action: 'delete', target: 'file.txt' },
        mockAbortSignal
      ) as ToolCallConfirmationDetails;

      expect(confirmationDetails.onConfirm).toBeDefined();
      expect(typeof confirmationDetails.onConfirm).toBe('function');

      // Test different confirmation outcomes
      const confirmHandler = confirmationDetails.onConfirm;

      await expect(confirmHandler(ToolConfirmationOutcome.ProceedOnce)).resolves.toBeUndefined();
      await expect(confirmHandler(ToolConfirmationOutcome.ProceedAlways)).resolves.toBeUndefined();
      await expect(confirmHandler(ToolConfirmationOutcome.ProceedAlwaysServer)).resolves.toBeUndefined();
      await expect(confirmHandler(ToolConfirmationOutcome.ProceedAlwaysTool)).resolves.toBeUndefined();
      await expect(confirmHandler(ToolConfirmationOutcome.ModifyWithEditor)).resolves.toBeUndefined();
    });

    it('should handle cancel confirmation outcome', async () => {
      const tool = MockToolFactory.createDestructiveTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const abortController = createMockAbortController();
      abortController.abort = vi.fn(() => {
        (abortController.signal as any).aborted = true;
        (abortController.signal as any).throwIfAborted = vi.fn(() => {
          throw new Error('Operation was aborted');
        });
      });

      const confirmationDetails = await adapter.shouldConfirmExecute(
        { action: 'delete', target: 'file.txt' },
        abortController.signal
      ) as ToolCallConfirmationDetails;

      const confirmHandler = confirmationDetails.onConfirm;

      // The cancel outcome should call throwIfAborted
      await confirmHandler(ToolConfirmationOutcome.Cancel);
      expect(abortController.signal.throwIfAborted).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // METADATA AND DEBUGGING TESTS
  // =============================================================================

  describe('Metadata and Debugging', () => {
    it('should provide MCP metadata', () => {
      const tool = MockToolFactory.createStringInputTool('metadata-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'debug-server');

      const metadata = adapter.getMcpMetadata();

      expect(metadata.serverName).toBe('debug-server');
      expect(metadata.toolName).toBe('metadata-tool');
      expect(metadata.transportType).toBe('mcp');
      expect(metadata.capabilities).toBeUndefined(); // No capabilities on basic tool
    });

    it('should include tool capabilities in metadata', () => {
      const tool = MockToolFactory.createDestructiveTool();
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      const metadata = adapter.getMcpMetadata();

      expect(metadata.capabilities).toBeDefined();
      expect(metadata.capabilities?.requiresConfirmation).toBe(true);
      expect(metadata.capabilities?.destructive).toBe(true);
    });

    it('should track execution timing', async () => {
      const tool = MockToolFactory.createStringInputTool('timing-tool');
      const adapter = new McpToolAdapter(mockClient, tool, 'server');

      // Add delay to mock client
      mockClient.setDelay(50);

      const result = await adapter.execute({ input: 'test' }, mockAbortSignal);
      const resultData = result.data;

      expect(resultData.executionTime).toBeGreaterThan(40); // Should be at least 50ms
    });
  });

  // =============================================================================
  // FACTORY METHODS TESTS
  // =============================================================================

  describe('Factory Methods', () => {
    it('should create adapter using static create method', async () => {
      const tool = MockToolFactory.createStringInputTool('factory-tool');

      const adapter = await McpToolAdapter.create(mockClient, tool, 'factory-server');

      expect(adapter).toBeInstanceOf(McpToolAdapter);
      expect(adapter.name).toBe('factory-server.factory-tool');
    });

    it('should cache schema when requested in factory method', async () => {
      const tool = createMockMcpTool('cache-tool', {
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
        },
        // Remove zodSchema so caching will happen
        zodSchema: undefined,
      });
      
      // Add tool to client so it can be found
      mockClient.addTool(tool);

      await McpToolAdapter.create(mockClient, tool, 'server', {
        cacheSchema: true,
      });

      const schemaManager = mockClient.getSchemaManager();
      const cached = await schemaManager.getCachedSchema('cache-tool');
      expect(cached).toBeDefined();
    });

    it('should apply custom schema converter in factory method', async () => {
      const tool = createMockMcpTool('converter-tool');
      const customSchema = z.object({ custom: z.string() });

      const adapter = await McpToolAdapter.create(mockClient, tool, 'server', {
        schemaConverter: () => customSchema,
      });

      expect(adapter).toBeInstanceOf(McpToolAdapter);
      // Tool should now have the custom schema
      expect(tool.zodSchema).toBe(customSchema);
    });

    it('should create dynamic adapter', () => {
      const tool = createMockMcpTool('dynamic-tool');

      const adapter = McpToolAdapter.createDynamic(mockClient, tool, 'server', {
        validateAtRuntime: true,
      });

      expect(adapter).toBeInstanceOf(McpToolAdapter);
      expect(adapter.name).toBe('server.dynamic-tool');
    });

    it('should create multiple adapters from server', async () => {
      const tools = [
        MockToolFactory.createStringInputTool('tool1'),
        MockToolFactory.createCalculatorTool(),
        MockToolFactory.createOptionalParamsTool(),
      ];

      for (const tool of tools) {
        mockClient.addTool(tool);
      }

      const adapters = await createMcpToolAdapters(mockClient, 'multi-server');

      expect(adapters).toHaveLength(3);
      expect(adapters[0].name).toBe('multi-server.tool1');
      expect(adapters[1].name).toBe('multi-server.calculator');
      expect(adapters[2].name).toBe('multi-server.optional-params');
    });

    it('should filter tools in createMcpToolAdapters', async () => {
      const tools = [
        MockToolFactory.createStringInputTool('include-me'),
        MockToolFactory.createStringInputTool('exclude-me'),
        MockToolFactory.createCalculatorTool(),
      ];

      for (const tool of tools) {
        mockClient.addTool(tool);
      }

      const adapters = await createMcpToolAdapters(mockClient, 'filtered-server', {
        toolFilter: (tool) => !tool.name.includes('exclude'),
      });

      expect(adapters).toHaveLength(2);
      expect(adapters.some(a => a.name.includes('exclude-me'))).toBe(false);
      expect(adapters.some(a => a.name.includes('include-me'))).toBe(true);
    });

    it('should create typed adapter with specific tool', async () => {
      const tool = MockToolFactory.createCalculatorTool();
      mockClient.addTool(tool);

      const adapter = await createTypedMcpToolAdapter<{ a: number; b: number; operation: string }>(
        mockClient,
        'calculator',
        'typed-server'
      );

      expect(adapter).toBeInstanceOf(McpToolAdapter);
      expect(adapter?.name).toBe('typed-server.calculator');
    });

    it('should return null for non-existent tool in createTypedMcpToolAdapter', async () => {
      const adapter = await createTypedMcpToolAdapter(
        mockClient,
        'non-existent-tool',
        'server'
      );

      expect(adapter).toBeNull();
    });
  });
});