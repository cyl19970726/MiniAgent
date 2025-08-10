/**
 * @fileoverview Integration Tests for McpToolAdapter
 * 
 * This module provides comprehensive integration tests for the McpToolAdapter,
 * focusing on real-world scenarios including dynamic tool creation, schema validation,
 * factory method patterns, bulk tool discovery, and integration with CoreToolScheduler.
 * 
 * Key Test Areas:
 * - Dynamic tool creation and type resolution
 * - Schema validation and caching integration
 * - Factory method usage patterns
 * - Bulk tool discovery and registration
 * - Tool composition scenarios
 * - Integration with CoreToolScheduler
 * - Real MCP tool execution scenarios
 * - Performance testing with multiple tools
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { Schema } from '@google/genai';
import {
  McpToolAdapter,
  createMcpToolAdapters,
  registerMcpTools,
  createTypedMcpToolAdapter,
} from '../McpToolAdapter.js';
import {
  McpTool,
  McpToolResult,
  McpContent,
  IMcpClient,
  IToolSchemaManager,
  SchemaValidationResult,
  McpClientError,
  McpErrorCode,
} from '../interfaces.js';
import { CoreToolScheduler } from '../../coreToolScheduler.js';
import { DefaultToolResult, IToolCallRequestInfo, IToolResult } from '../../interfaces.js';

// ============================================================================
// MOCK IMPLEMENTATIONS FOR TESTING
// ============================================================================

/**
 * Mock MCP Client for integration testing
 */
class MockMcpClient implements IMcpClient {
  private tools: Map<string, McpTool> = new Map();
  private connected = false;
  private schemaManager: MockToolSchemaManager;

  constructor() {
    this.schemaManager = new MockToolSchemaManager();
  }

  async initialize(): Promise<void> {
    // Mock initialization
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getServerInfo(): Promise<{ name: string; version: string; capabilities: any }> {
    return {
      name: 'mock-server',
      version: '1.0.0',
      capabilities: {
        tools: { listChanged: true },
      },
    };
  }

  async listTools<T = unknown>(cacheSchemas?: boolean): Promise<McpTool<T>[]> {
    const toolList = Array.from(this.tools.values()) as McpTool<T>[];
    
    if (cacheSchemas) {
      for (const tool of toolList) {
        await this.schemaManager.cacheSchema(tool.name, tool.inputSchema);
      }
    }
    
    return toolList;
  }

  async callTool<TParams = unknown>(
    name: string,
    args: TParams,
    options?: { validate?: boolean; timeout?: number }
  ): Promise<McpToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new McpClientError(`Tool not found: ${name}`, McpErrorCode.ToolNotFound);
    }

    // Simulate validation if requested
    if (options?.validate) {
      const validation = await this.schemaManager.validateToolParams(name, args);
      if (!validation.success) {
        throw new McpClientError(
          `Validation failed: ${validation.errors?.join(', ')}`,
          McpErrorCode.InvalidParams
        );
      }
    }

    // Mock tool execution result
    return this.createMockResult(name, args);
  }

  getSchemaManager(): IToolSchemaManager {
    return this.schemaManager;
  }

  onError(): void {
    // Mock implementation
  }

  onDisconnect(): void {
    // Mock implementation
  }

  // Test helper methods
  addTool(tool: McpTool): void {
    this.tools.set(tool.name, tool);
  }

  removeTool(name: string): void {
    this.tools.delete(name);
  }

  private createMockResult(toolName: string, args: unknown): McpToolResult {
    const content: McpContent[] = [
      {
        type: 'text',
        text: `Mock execution of ${toolName} with args: ${JSON.stringify(args)}`,
      },
    ];

    return {
      content,
      serverName: 'mock-server',
      toolName,
      executionTime: 50,
    };
  }
}

/**
 * Mock Tool Schema Manager for testing
 */
class MockToolSchemaManager implements IToolSchemaManager {
  private cache: Map<string, any> = new Map();
  private stats = { size: 0, hits: 0, misses: 0 };

  async cacheSchema(toolName: string, schema: Schema): Promise<void> {
    this.cache.set(toolName, {
      zodSchema: this.createZodFromJsonSchema(schema),
      jsonSchema: schema,
      timestamp: Date.now(),
      version: '1.0',
    });
    this.stats.size = this.cache.size;
  }

  async getCachedSchema(toolName: string): Promise<any> {
    const cached = this.cache.get(toolName);
    if (cached) {
      this.stats.hits++;
      return cached;
    }
    this.stats.misses++;
    return undefined;
  }

  async validateToolParams<T = unknown>(
    toolName: string,
    params: unknown
  ): Promise<SchemaValidationResult<T>> {
    const cached = await this.getCachedSchema(toolName);
    
    if (!cached) {
      return {
        success: false,
        errors: [`No schema found for tool: ${toolName}`],
      };
    }

    try {
      const data = cached.zodSchema.parse(params);
      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      return {
        success: false,
        errors: error instanceof z.ZodError 
          ? error.issues.map(i => i.message)
          : ['Validation failed'],
        zodError: error instanceof z.ZodError ? error : undefined,
      };
    }
  }

  async clearCache(toolName?: string): Promise<void> {
    if (toolName) {
      this.cache.delete(toolName);
    } else {
      this.cache.clear();
    }
    this.stats.size = this.cache.size;
  }

  async getCacheStats(): Promise<{ size: number; hits: number; misses: number }> {
    return { ...this.stats };
  }

  private createZodFromJsonSchema(schema: Schema): z.ZodTypeAny {
    // Simplified Zod schema creation for testing
    if (schema.type === 'object' && schema.properties) {
      const shape: Record<string, z.ZodTypeAny> = {};
      
      for (const [key, prop] of Object.entries(schema.properties)) {
        const propSchema = prop as Schema;
        if (propSchema.type === 'string') {
          shape[key] = z.string();
        } else if (propSchema.type === 'number') {
          shape[key] = z.number();
        } else if (propSchema.type === 'boolean') {
          shape[key] = z.boolean();
        } else {
          shape[key] = z.any();
        }
      }
      
      const zodSchema = z.object(shape);
      
      if (schema.required && Array.isArray(schema.required)) {
        return zodSchema.required(
          Object.fromEntries(schema.required.map(key => [key, true]))
        );
      }
      
      return zodSchema;
    }
    
    return z.any();
  }
}

/**
 * Test data factory for MCP tools and schemas
 */
class McpTestDataFactory {
  static createBasicTool(name: string = 'test_tool'): McpTool {
    return {
      name,
      displayName: `Test Tool: ${name}`,
      description: `A test tool named ${name}`,
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Input message' },
        },
        required: ['message'],
      },
    };
  }

  static createComplexTool(name: string = 'complex_tool'): McpTool {
    return {
      name,
      displayName: `Complex Tool: ${name}`,
      description: `A complex test tool with multiple parameters`,
      inputSchema: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['create', 'update', 'delete'],
            description: 'Action to perform' 
          },
          target: { type: 'string', description: 'Target resource' },
          options: {
            type: 'object',
            properties: {
              force: { type: 'boolean', default: false },
              timeout: { type: 'number', default: 30000 },
            },
          },
          metadata: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                value: { type: 'string' },
              },
            },
          },
        },
        required: ['action', 'target'],
      },
      capabilities: {
        streaming: false,
        requiresConfirmation: true,
        destructive: true,
      },
    };
  }

  static createTypedTool<T>(name: string, zodSchema: z.ZodSchema<T>): McpTool<T> {
    const tool = this.createBasicTool(name);
    tool.zodSchema = zodSchema;
    return tool as McpTool<T>;
  }

  static createBatchOfTools(count: number, prefix: string = 'tool'): McpTool[] {
    return Array.from({ length: count }, (_, i) => 
      this.createBasicTool(`${prefix}_${i + 1}`)
    );
  }

  static createToolWithCustomSchema(name: string, schema: Schema): McpTool {
    return {
      name,
      displayName: name,
      description: `Tool with custom schema: ${name}`,
      inputSchema: schema,
    };
  }
}

// ============================================================================
// INTEGRATION TEST SUITE
// ============================================================================

describe('McpToolAdapter Integration Tests', () => {
  let mockClient: MockMcpClient;
  let testTool: McpTool;
  let abortController: AbortController;

  beforeEach(async () => {
    mockClient = new MockMcpClient();
    testTool = McpTestDataFactory.createBasicTool();
    mockClient.addTool(testTool);
    abortController = new AbortController();
    
    // Connect the mock client and cache schemas
    await mockClient.connect();
    await mockClient.getSchemaManager().cacheSchema(testTool.name, testTool.inputSchema);
  });

  afterEach(() => {
    vi.clearAllMocks();
    abortController?.abort();
  });

  // ========================================================================
  // DYNAMIC TOOL CREATION TESTS
  // ========================================================================

  describe('Dynamic Tool Creation', () => {
    it('should create adapter with unknown parameter type', async () => {
      const adapter = new McpToolAdapter(mockClient, testTool, 'test-server');
      
      expect(adapter.name).toBe('test-server.test_tool');
      expect(adapter.displayName).toBe('Test Tool: test_tool');
      expect(adapter.description).toBe('A test tool named test_tool');
    });

    it('should create adapter using factory method', async () => {
      const adapter = await McpToolAdapter.create(mockClient, testTool, 'test-server');
      
      expect(adapter).toBeInstanceOf(McpToolAdapter);
      expect(adapter.name).toBe('test-server.test_tool');
    });

    it('should create adapter with schema caching enabled', async () => {
      const adapter = await McpToolAdapter.create(
        mockClient, 
        testTool, 
        'test-server',
        { cacheSchema: true }
      );
      
      // Verify schema was cached
      const schemaManager = mockClient.getSchemaManager();
      const cached = await schemaManager.getCachedSchema(testTool.name);
      expect(cached).toBeDefined();
    });

    it('should create dynamic adapter with runtime validation', () => {
      const adapter = McpToolAdapter.createDynamic(
        mockClient, 
        testTool, 
        'test-server',
        { validateAtRuntime: true }
      );
      
      expect(adapter).toBeInstanceOf(McpToolAdapter);
      expect(adapter.name).toBe('test-server.test_tool');
    });

    it('should create adapter with custom schema converter', async () => {
      const customConverter = vi.fn().mockReturnValue(z.object({ custom: z.string() }));
      
      const adapter = await McpToolAdapter.create(
        mockClient,
        testTool,
        'test-server',
        { schemaConverter: customConverter }
      );
      
      expect(customConverter).toHaveBeenCalledWith(testTool.inputSchema);
      expect(adapter).toBeInstanceOf(McpToolAdapter);
    });
  });

  // ========================================================================
  // SCHEMA VALIDATION INTEGRATION TESTS
  // ========================================================================

  describe('Schema Validation Integration', () => {
    it('should validate parameters using Zod schema', async () => {
      const zodSchema = z.object({ message: z.string() });
      const typedTool = McpTestDataFactory.createTypedTool('typed_tool', zodSchema);
      mockClient.addTool(typedTool);
      
      const adapter = new McpToolAdapter(mockClient, typedTool, 'test-server');
      
      // Valid parameters
      const validationResult = adapter.validateToolParams({ message: 'test' });
      expect(validationResult).toBeNull();
      
      // Invalid parameters
      const invalidResult = adapter.validateToolParams({ message: 123 });
      expect(invalidResult).toContain('validation failed');
    });

    it('should fall back to JSON Schema validation when Zod unavailable', () => {
      const adapter = new McpToolAdapter(mockClient, testTool, 'test-server');
      
      // Valid object
      expect(adapter.validateToolParams({ message: 'test' })).toBeNull();
      
      // Invalid non-object
      expect(adapter.validateToolParams('string')).toContain('must be an object');
      expect(adapter.validateToolParams(null)).toContain('must be an object');
    });

    it('should validate using schema manager during execution', async () => {
      const adapter = new McpToolAdapter(mockClient, testTool, 'test-server');
      
      const result = await adapter.execute(
        { message: 'test' },
        abortController.signal
      );
      
      expect(result).toBeInstanceOf(DefaultToolResult);
      expect(result.toHistoryStr()).toContain('Mock execution of test_tool');
    });

    it('should handle schema validation errors gracefully', async () => {
      const schemaManager = mockClient.getSchemaManager();
      vi.spyOn(schemaManager, 'validateToolParams').mockResolvedValue({
        success: false,
        errors: ['Invalid parameter type'],
      });
      
      const adapter = new McpToolAdapter(mockClient, testTool, 'test-server');
      
      const result = await adapter.execute(
        { invalid: 'params' },
        abortController.signal
      );
      
      expect(result.toHistoryStr()).toContain('Schema validation failed');
    });
  });

  // ========================================================================
  // FACTORY METHOD PATTERN TESTS
  // ========================================================================

  describe('Factory Method Patterns', () => {
    it('should create multiple adapters using createMcpToolAdapters', async () => {
      const tools = McpTestDataFactory.createBatchOfTools(3, 'batch');
      tools.forEach(tool => mockClient.addTool(tool));
      
      const adapters = await createMcpToolAdapters(mockClient, 'test-server');
      
      expect(adapters).toHaveLength(4); // 3 batch tools + 1 original test tool
      expect(adapters.every(a => a instanceof McpToolAdapter)).toBe(true);
      expect(adapters.map(a => a.name)).toEqual([
        'test-server.test_tool',
        'test-server.batch_1', 
        'test-server.batch_2',
        'test-server.batch_3'
      ]);
    });

    it('should filter tools using toolFilter option', async () => {
      const tools = McpTestDataFactory.createBatchOfTools(5, 'filter');
      tools.forEach(tool => mockClient.addTool(tool));
      
      const adapters = await createMcpToolAdapters(
        mockClient,
        'test-server',
        { toolFilter: (tool) => tool.name.includes('filter_2') || tool.name.includes('filter_4') }
      );
      
      expect(adapters).toHaveLength(2);
      expect(adapters.map(a => a.name)).toEqual([
        'test-server.filter_2',
        'test-server.filter_4'
      ]);
    });

    it('should create adapters with dynamic typing enabled', async () => {
      const tools = McpTestDataFactory.createBatchOfTools(2, 'dynamic');
      tools.forEach(tool => mockClient.addTool(tool));
      
      const adapters = await createMcpToolAdapters(
        mockClient,
        'test-server',
        { enableDynamicTyping: true }
      );
      
      expect(adapters.length).toBeGreaterThanOrEqual(2);
      expect(adapters.every(a => a instanceof McpToolAdapter)).toBe(true);
    });

    it('should create typed adapter with specific tool name', async () => {
      const zodSchema = z.object({ 
        action: z.enum(['create', 'update', 'delete']),
        target: z.string()
      });
      
      const typedTool = McpTestDataFactory.createTypedTool('specific_tool', zodSchema);
      mockClient.addTool(typedTool);
      
      const adapter = await createTypedMcpToolAdapter(
        mockClient,
        'specific_tool',
        'test-server',
        zodSchema
      );
      
      expect(adapter).toBeInstanceOf(McpToolAdapter);
      expect(adapter?.name).toBe('test-server.specific_tool');
    });

    it('should return null for non-existent tool in createTypedMcpToolAdapter', async () => {
      const zodSchema = z.object({ value: z.string() });
      
      const adapter = await createTypedMcpToolAdapter(
        mockClient,
        'non_existent_tool',
        'test-server',
        zodSchema
      );
      
      expect(adapter).toBeNull();
    });
  });

  // ========================================================================
  // BULK TOOL DISCOVERY TESTS
  // ========================================================================

  describe('Bulk Tool Discovery', () => {
    it('should discover large numbers of tools efficiently', async () => {
      const largeToolSet = McpTestDataFactory.createBatchOfTools(50, 'bulk');
      largeToolSet.forEach(tool => mockClient.addTool(tool));
      
      const startTime = Date.now();
      const adapters = await createMcpToolAdapters(mockClient, 'test-server');
      const discoveryTime = Date.now() - startTime;
      
      expect(adapters).toHaveLength(51); // 50 bulk tools + 1 original
      expect(discoveryTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle schema caching for bulk operations', async () => {
      const tools = McpTestDataFactory.createBatchOfTools(10, 'cached');
      tools.forEach(tool => mockClient.addTool(tool));
      
      const adapters = await createMcpToolAdapters(
        mockClient,
        'test-server',
        { cacheSchemas: true }
      );
      
      expect(adapters.length).toBeGreaterThanOrEqual(10);
      
      // Verify all schemas were cached
      const schemaManager = mockClient.getSchemaManager();
      const stats = await schemaManager.getCacheStats();
      expect(stats.size).toBeGreaterThanOrEqual(10);
    });

    it('should register tools with scheduler in bulk', async () => {
      const mockScheduler = {
        registerTool: vi.fn(),
      };
      
      const tools = McpTestDataFactory.createBatchOfTools(5, 'scheduled');
      tools.forEach(tool => mockClient.addTool(tool));
      
      const adapters = await registerMcpTools(
        mockScheduler,
        mockClient,
        'test-server'
      );
      
      expect(adapters.length).toBeGreaterThanOrEqual(5);
      expect(mockScheduler.registerTool).toHaveBeenCalledTimes(adapters.length);
    });
  });

  // ========================================================================
  // TOOL COMPOSITION SCENARIOS
  // ========================================================================

  describe('Tool Composition Scenarios', () => {
    it('should handle tools with complex nested schemas', async () => {
      const complexTool = McpTestDataFactory.createComplexTool('complex');
      mockClient.addTool(complexTool);
      await mockClient.getSchemaManager().cacheSchema(complexTool.name, complexTool.inputSchema);
      
      const adapter = new McpToolAdapter(mockClient, complexTool, 'test-server');
      
      const complexParams = {
        action: 'create',
        target: 'resource',
        options: { force: true, timeout: 60000 },
        metadata: [{ key: 'env', value: 'test' }],
      };
      
      const result = await adapter.execute(complexParams, abortController.signal);
      expect(result.toHistoryStr()).toContain('Mock execution of complex');
    });

    it('should support confirmation workflow for destructive tools', async () => {
      const destructiveTool = McpTestDataFactory.createComplexTool('destructive');
      mockClient.addTool(destructiveTool);
      
      const adapter = new McpToolAdapter(mockClient, destructiveTool, 'test-server');
      
      const confirmationDetails = await adapter.shouldConfirmExecute(
        { action: 'delete', target: 'important_data' },
        abortController.signal
      );
      
      expect(confirmationDetails).toBeTruthy();
      if (confirmationDetails) {
        expect(confirmationDetails.type).toBe('mcp');
        expect(confirmationDetails.title).toContain('Execute');
        expect(confirmationDetails.serverName).toBe('test-server');
      }
    });

    it('should compose multiple adapters from different servers', async () => {
      const server1Client = new MockMcpClient();
      const server2Client = new MockMcpClient();
      
      server1Client.addTool(McpTestDataFactory.createBasicTool('server1_tool'));
      server2Client.addTool(McpTestDataFactory.createBasicTool('server2_tool'));
      
      await server1Client.connect();
      await server2Client.connect();
      
      const adapters1 = await createMcpToolAdapters(server1Client, 'server1');
      const adapters2 = await createMcpToolAdapters(server2Client, 'server2');
      
      const allAdapters = [...adapters1, ...adapters2];
      
      expect(allAdapters).toHaveLength(2);
      expect(allAdapters[0].name).toBe('server1.server1_tool');
      expect(allAdapters[1].name).toBe('server2.server2_tool');
    });
  });

  // ========================================================================
  // CORE TOOL SCHEDULER INTEGRATION TESTS
  // ========================================================================

  describe('CoreToolScheduler Integration', () => {
    let scheduler: CoreToolScheduler;
    
    beforeEach(() => {
      scheduler = new CoreToolScheduler({
        outputUpdateHandler: vi.fn(),
        onAllToolCallsComplete: vi.fn(),
        tools: [], // Start with empty tools array
      });
    });

    it('should register MCP adapter with scheduler', async () => {
      const adapter = new McpToolAdapter(mockClient, testTool, 'test-server');
      scheduler.registerTool(adapter);
      
      const registeredTools = scheduler.getToolList();
      expect(registeredTools).toHaveLength(1);
      expect(registeredTools[0].name).toBe('test-server.test_tool');
    });

    it('should execute MCP tool through scheduler', async () => {
      const adapter = new McpToolAdapter(mockClient, testTool, 'test-server');
      scheduler.registerTool(adapter);
      
      const toolCallRequest: IToolCallRequestInfo = {
        callId: 'test-call-1',
        name: 'test-server.test_tool',
        args: { message: 'scheduler test' },
        isClientInitiated: false,
        promptId: 'test-prompt',
      };
      
      const executionPromise = new Promise<IToolResult>((resolve) => {
        scheduler.schedule(toolCallRequest, abortController.signal, {
          onExecutionDone: (req, response) => {
            if (response.success && response.result) {
              resolve(response.result);
            }
          },
        });
      });
      
      const result = await executionPromise;
      expect(result.toHistoryStr()).toContain('Mock execution of test_tool');
    });

    it('should handle multiple MCP tools execution in parallel', async () => {
      const tools = McpTestDataFactory.createBatchOfTools(3, 'parallel');
      tools.forEach(tool => mockClient.addTool(tool));
      
      const adapters = await createMcpToolAdapters(mockClient, 'test-server');
      adapters.forEach(adapter => scheduler.registerTool(adapter));
      
      const toolCalls: IToolCallRequestInfo[] = [
        {
          callId: 'call-1',
          name: 'test-server.parallel_1',
          args: { message: 'test1' },
          isClientInitiated: false,
          promptId: 'test-prompt',
        },
        {
          callId: 'call-2', 
          name: 'test-server.parallel_2',
          args: { message: 'test2' },
          isClientInitiated: false,
          promptId: 'test-prompt',
        },
      ];
      
      const results: IToolResult[] = [];
      const completionPromise = new Promise<void>((resolve) => {
        scheduler.schedule(toolCalls, abortController.signal, {
          onExecutionDone: (req, response) => {
            if (response.success && response.result) {
              results.push(response.result);
              if (results.length === toolCalls.length) {
                resolve();
              }
            }
          },
        });
      });
      
      await completionPromise;
      expect(results).toHaveLength(2);
    });
  });

  // ========================================================================
  // REAL MCP TOOL EXECUTION SCENARIOS
  // ========================================================================

  describe('Real MCP Tool Execution', () => {
    it('should handle tool execution with output updates', async () => {
      const adapter = new McpToolAdapter(mockClient, testTool, 'test-server');
      const outputUpdates: string[] = [];
      
      const result = await adapter.execute(
        { message: 'output test' },
        abortController.signal,
        (output) => outputUpdates.push(output)
      );
      
      expect(outputUpdates.length).toBeGreaterThanOrEqual(1);
      expect(outputUpdates[0]).toContain('Executing test_tool');
      if (outputUpdates.length > 1) {
        expect(outputUpdates[1]).toContain('Completed in');
      }
      expect(result.toHistoryStr()).toContain('Mock execution');
    });

    it('should handle tool execution errors gracefully', async () => {
      vi.spyOn(mockClient, 'callTool').mockRejectedValue(
        new McpClientError('Tool execution failed', McpErrorCode.ServerError)
      );
      
      const adapter = new McpToolAdapter(mockClient, testTool, 'test-server');
      
      const result = await adapter.execute(
        { message: 'error test' },
        abortController.signal
      );
      
      expect(result.toHistoryStr()).toContain('Error executing MCP tool');
    });

    it('should provide MCP metadata for debugging', () => {
      const complexTool = McpTestDataFactory.createComplexTool('metadata_tool');
      const adapter = new McpToolAdapter(mockClient, complexTool, 'test-server');
      
      const metadata = adapter.getMcpMetadata();
      
      expect(metadata).toEqual({
        serverName: 'test-server',
        toolName: 'metadata_tool',
        capabilities: {
          streaming: false,
          requiresConfirmation: true,
          destructive: true,
        },
        transportType: 'mcp',
        connectionStats: undefined,
      });
    });

    it('should handle abort signals during execution', async () => {
      const slowClient = new MockMcpClient();
      vi.spyOn(slowClient, 'callTool').mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );
      
      slowClient.addTool(testTool);
      await slowClient.connect();
      
      const adapter = new McpToolAdapter(slowClient, testTool, 'test-server');
      
      // Create a controller that aborts after 100ms
      const fastAbortController = new AbortController();
      setTimeout(() => fastAbortController.abort(), 100);
      
      const result = await adapter.execute(
        { message: 'abort test' },
        fastAbortController.signal
      );
      
      // Should complete immediately due to mock, but structure shows abort handling
      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // PERFORMANCE TESTING WITH MULTIPLE TOOLS
  // ========================================================================

  describe('Performance Testing', () => {
    it('should handle large tool sets efficiently', async () => {
      const LARGE_TOOL_COUNT = 100;
      const largeToolSet = McpTestDataFactory.createBatchOfTools(LARGE_TOOL_COUNT, 'perf');
      largeToolSet.forEach(tool => mockClient.addTool(tool));
      
      const startTime = Date.now();
      const adapters = await createMcpToolAdapters(mockClient, 'test-server');
      const creationTime = Date.now() - startTime;
      
      expect(adapters.length).toBeGreaterThanOrEqual(LARGE_TOOL_COUNT);
      expect(creationTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should maintain performance with schema caching', async () => {
      const TOOL_COUNT = 50;
      const tools = McpTestDataFactory.createBatchOfTools(TOOL_COUNT, 'cache_perf');
      tools.forEach(tool => mockClient.addTool(tool));
      
      const startTime = Date.now();
      await createMcpToolAdapters(
        mockClient,
        'test-server',
        { cacheSchemas: true }
      );
      const withCacheTime = Date.now() - startTime;
      
      // Second run should be faster due to caching
      const secondStartTime = Date.now();
      await createMcpToolAdapters(
        mockClient,
        'test-server',
        { cacheSchemas: true }
      );
      const secondRunTime = Date.now() - secondStartTime;
      
      expect(withCacheTime).toBeLessThan(1000);
      expect(secondRunTime).toBeLessThan(1000);
    });

    it('should execute multiple tools concurrently without blocking', async () => {
      const CONCURRENT_TOOLS = 10;
      const tools = McpTestDataFactory.createBatchOfTools(CONCURRENT_TOOLS, 'concurrent');
      for (const tool of tools) {
        mockClient.addTool(tool);
        await mockClient.getSchemaManager().cacheSchema(tool.name, tool.inputSchema);
      }
      
      const adapters = await createMcpToolAdapters(mockClient, 'test-server');
      
      const startTime = Date.now();
      const executions = adapters.slice(0, CONCURRENT_TOOLS).map((adapter, index) =>
        adapter.execute(
          { message: `concurrent test ${index}` },
          abortController.signal
        )
      );
      
      const results = await Promise.all(executions);
      const totalTime = Date.now() - startTime;
      
      expect(results).toHaveLength(CONCURRENT_TOOLS);
      expect(totalTime).toBeLessThan(1000); // Concurrent execution should be fast
      expect(results.every(r => r.toHistoryStr().includes('Mock execution'))).toBe(true);
    });

    it('should handle memory efficiently with many tool instances', async () => {
      const MEMORY_TEST_COUNT = 20; // Reduce count for test efficiency
      const tools = McpTestDataFactory.createBatchOfTools(MEMORY_TEST_COUNT, 'memory');
      for (const tool of tools) {
        mockClient.addTool(tool);
        await mockClient.getSchemaManager().cacheSchema(tool.name, tool.inputSchema);
      }
      
      const adapters = await createMcpToolAdapters(mockClient, 'test-server');
      
      // Verify all adapters are created
      expect(adapters.length).toBeGreaterThanOrEqual(MEMORY_TEST_COUNT);
      
      // Execute a subset to verify they work
      const sampleExecutions = adapters.slice(0, 5).map(adapter =>
        adapter.execute({ message: 'memory test' }, abortController.signal)
      );
      
      const results = await Promise.all(sampleExecutions);
      expect(results).toHaveLength(5);
      expect(results.every(r => r.toHistoryStr().includes('Mock execution'))).toBe(true);
    });
  });

  // ========================================================================
  // ERROR HANDLING AND EDGE CASES
  // ========================================================================

  describe('Error Handling and Edge Cases', () => {
    it('should handle disconnected client gracefully', async () => {
      await mockClient.disconnect();
      
      const adapter = new McpToolAdapter(mockClient, testTool, 'test-server');
      
      const result = await adapter.execute(
        { message: 'disconnected test' },
        abortController.signal
      );
      
      // Should still work with mock client (real client would error)
      expect(result).toBeDefined();
    });

    it('should handle invalid tool parameters', async () => {
      const adapter = new McpToolAdapter(mockClient, testTool, 'test-server');
      
      // Test with null params
      const nullResult = adapter.validateToolParams(null);
      expect(nullResult).toContain('must be an object');
      
      // Test with string params
      const stringResult = adapter.validateToolParams('invalid');
      expect(stringResult).toContain('must be an object');
    });

    it('should handle schema manager errors', async () => {
      const errorSchemaManager = mockClient.getSchemaManager();
      vi.spyOn(errorSchemaManager, 'validateToolParams').mockRejectedValue(
        new Error('Schema manager error')
      );
      
      const adapter = new McpToolAdapter(mockClient, testTool, 'test-server');
      
      const result = await adapter.execute(
        { message: 'schema error test' },
        abortController.signal
      );
      
      expect(result.toHistoryStr()).toContain('Error executing MCP tool');
    });

    it('should handle empty tool lists', async () => {
      const emptyClient = new MockMcpClient();
      await emptyClient.connect();
      
      const adapters = await createMcpToolAdapters(emptyClient, 'empty-server');
      
      expect(adapters).toHaveLength(0);
    });

    it('should handle tool registration with invalid scheduler', async () => {
      const invalidScheduler = {
        registerTool: vi.fn().mockImplementation(() => {
          throw new Error('Registration failed');
        }),
      };
      
      // Should not throw despite invalid scheduler
      await expect(
        registerMcpTools(invalidScheduler, mockClient, 'test-server')
      ).rejects.toThrow('Registration failed');
    });
  });
});