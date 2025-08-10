/**
 * @fileoverview Mock implementations for MCP adapter testing
 * 
 * This module provides comprehensive mock implementations of MCP interfaces
 * specifically designed for testing the McpToolAdapter functionality.
 */

import { vi } from 'vitest';
import { z, ZodSchema } from 'zod';
import { Schema, Type } from '@google/genai';
import {
  IMcpClient,
  IToolSchemaManager,
  McpTool,
  McpToolResult,
  McpClientConfig,
  McpServerCapabilities,
  SchemaValidationResult,
  SchemaCache,
} from '../interfaces.js';

/**
 * Mock MCP tool for testing with flexible generic typing
 */
export function createMockMcpTool<T = unknown>(
  name: string,
  overrides?: Partial<McpTool<T>>
): McpTool<T> {
  return {
    name,
    displayName: `Mock ${name}`,
    description: `Mock tool for ${name}`,
    inputSchema: {
      type: Type.OBJECT,
      properties: {
        input: {
          type: Type.STRING,
          description: 'Test input parameter',
        },
      },
      required: ['input'],
    },
    ...overrides,
  };
}

/**
 * Mock MCP tool result factory
 */
export function createMockMcpToolResult(
  overrides?: Partial<McpToolResult>
): McpToolResult {
  return {
    content: [
      {
        type: 'text',
        text: 'Mock tool execution result',
      },
    ],
    isError: false,
    serverName: 'mock-server',
    toolName: 'mock-tool',
    executionTime: 100,
    ...overrides,
  };
}

/**
 * Mock tool schema manager for testing schema caching and validation
 */
export class MockToolSchemaManager implements IToolSchemaManager {
  private cache = new Map<string, SchemaCache>();
  private stats = { hits: 0, misses: 0 };

  async cacheSchema(toolName: string, schema: Schema): Promise<void> {
    const zodSchema = z.object({
      input: z.string(),
    });

    this.cache.set(toolName, {
      zodSchema,
      jsonSchema: schema,
      timestamp: Date.now(),
      version: 'v1.0.0',
    });
  }

  async getCachedSchema(toolName: string): Promise<SchemaCache | undefined> {
    const cached = this.cache.get(toolName);
    if (cached) {
      this.stats.hits++;
    } else {
      this.stats.misses++;
    }
    return cached;
  }

  async validateToolParams<T = unknown>(
    toolName: string,
    params: unknown
  ): Promise<SchemaValidationResult<T>> {
    // For testing, we'll be more permissive - allow validation without cached schema
    const cached = await this.getCachedSchema(toolName);
    
    if (!cached) {
      // Return success for basic object parameters to allow tests to proceed
      if (params && typeof params === 'object') {
        return {
          success: true,
          data: params as T,
        };
      }
      return {
        success: false,
        errors: [`No cached schema found for tool: ${toolName}`],
      };
    }

    try {
      const result = cached.zodSchema.safeParse(params);
      if (!result.success) {
        return {
          success: false,
          errors: result.error.issues.map(i => i.message),
          zodError: result.error,
        };
      }

      return {
        success: true,
        data: result.data as T,
      };
    } catch (error) {
      return {
        success: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown'}`],
      };
    }
  }

  async clearCache(toolName?: string): Promise<void> {
    if (toolName) {
      this.cache.delete(toolName);
    } else {
      this.cache.clear();
    }
  }

  async getCacheStats(): Promise<{ size: number; hits: number; misses: number }> {
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
    };
  }

  // Test helper methods
  setCachedZodSchema(toolName: string, zodSchema: ZodSchema): void {
    const existing = this.cache.get(toolName);
    if (existing) {
      existing.zodSchema = zodSchema;
    } else {
      this.cache.set(toolName, {
        zodSchema,
        jsonSchema: { type: Type.OBJECT },
        timestamp: Date.now(),
        version: 'test',
      });
    }
  }

  reset(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }
}

/**
 * Mock MCP client implementation for comprehensive testing
 */
export class MockMcpClient implements IMcpClient {
  private connected = false;
  private tools = new Map<string, McpTool>();
  private toolResults = new Map<string, McpToolResult>();
  private schemaManager = new MockToolSchemaManager();
  private errorHandlers: Array<(error: any) => void> = [];
  private disconnectHandlers: Array<() => void> = [];

  // Mock configuration
  public callHistory: Array<{ name: string; args: unknown; options?: any }> = [];
  public shouldThrowError = false;
  public errorToThrow: Error | null = null;
  public delayMs = 0;

  async initialize(config: McpClientConfig): Promise<void> {
    // Mock implementation - store config for testing
  }

  async connect(): Promise<void> {
    if (this.shouldThrowError) {
      throw this.errorToThrow || new Error('Mock connection error');
    }
    
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }
    
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.disconnectHandlers.forEach(handler => handler());
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getServerInfo(): Promise<{
    name: string;
    version: string;
    capabilities: McpServerCapabilities;
  }> {
    return {
      name: 'mock-server',
      version: '1.0.0',
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    };
  }

  async listTools<T = unknown>(cacheSchemas?: boolean): Promise<McpTool<T>[]> {
    const tools = Array.from(this.tools.values()) as McpTool<T>[];
    
    if (cacheSchemas) {
      // Simulate schema caching
      for (const tool of tools) {
        await this.schemaManager.cacheSchema(tool.name, tool.inputSchema);
      }
    }
    
    return tools;
  }

  async callTool<TParams = unknown>(
    name: string,
    args: TParams,
    options?: {
      validate?: boolean;
      timeout?: number;
    }
  ): Promise<McpToolResult> {
    // Record the call for testing
    this.callHistory.push({ name, args, options });

    if (this.shouldThrowError) {
      throw this.errorToThrow || new Error(`Mock error calling tool: ${name}`);
    }

    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    // Return pre-configured result or default
    const result = this.toolResults.get(name) || createMockMcpToolResult({
      toolName: name,
      content: [
        {
          type: 'text',
          text: `Mock result for ${name} with args: ${JSON.stringify(args)}`,
        },
      ],
    });

    return result;
  }

  getSchemaManager(): IToolSchemaManager {
    return this.schemaManager;
  }

  onError(handler: (error: any) => void): void {
    this.errorHandlers.push(handler);
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }

  // Test helper methods
  addTool<T = unknown>(tool: McpTool<T>): void {
    this.tools.set(tool.name, tool);
  }

  setToolResult(toolName: string, result: McpToolResult): void {
    this.toolResults.set(toolName, result);
  }

  setError(error: Error | null): void {
    this.shouldThrowError = !!error;
    this.errorToThrow = error;
  }

  setDelay(ms: number): void {
    this.delayMs = ms;
  }

  getCallHistory(): Array<{ name: string; args: unknown; options?: any }> {
    return [...this.callHistory];
  }

  triggerError(error: any): void {
    this.errorHandlers.forEach(handler => handler(error));
  }

  triggerDisconnect(): void {
    this.connected = false;
    this.disconnectHandlers.forEach(handler => handler());
  }

  reset(): void {
    this.connected = false;
    this.tools.clear();
    this.toolResults.clear();
    this.callHistory = [];
    this.shouldThrowError = false;
    this.errorToThrow = null;
    this.delayMs = 0;
    this.errorHandlers = [];
    this.disconnectHandlers = [];
    this.schemaManager.reset();
  }
}

/**
 * Factory for creating typed mock tools with specific parameter schemas
 */
export class MockToolFactory {
  /**
   * Create a string input tool
   */
  static createStringInputTool(name: string): McpTool<{ input: string }> {
    return createMockMcpTool<{ input: string }>(name, {
      inputSchema: {
        type: Type.OBJECT,
        properties: {
          input: {
            type: Type.STRING,
            description: 'String input parameter',
          },
        },
        required: ['input'],
      },
      zodSchema: z.object({
        input: z.string(),
      }),
    });
  }

  /**
   * Create a numeric calculation tool
   */
  static createCalculatorTool(): McpTool<{ a: number; b: number; operation: string }> {
    return createMockMcpTool<{ a: number; b: number; operation: string }>('calculator', {
      displayName: 'Calculator',
      description: 'Perform mathematical operations',
      inputSchema: {
        type: Type.OBJECT,
        properties: {
          a: {
            type: Type.NUMBER,
            description: 'First number',
          },
          b: {
            type: Type.NUMBER,
            description: 'Second number',
          },
          operation: {
            type: Type.STRING,
            enum: ['add', 'subtract', 'multiply', 'divide'],
            description: 'Operation to perform',
          },
        },
        required: ['a', 'b', 'operation'],
      },
      zodSchema: z.object({
        a: z.number(),
        b: z.number(),
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      }),
    });
  }

  /**
   * Create a tool with optional parameters
   */
  static createOptionalParamsTool(): McpTool<{ required: string; optional?: number }> {
    return createMockMcpTool<{ required: string; optional?: number }>('optional-params', {
      displayName: 'Optional Parameters Tool',
      description: 'Tool with both required and optional parameters',
      inputSchema: {
        type: Type.OBJECT,
        properties: {
          required: {
            type: Type.STRING,
            description: 'Required parameter',
          },
          optional: {
            type: Type.NUMBER,
            description: 'Optional parameter',
          },
        },
        required: ['required'],
      },
      zodSchema: z.object({
        required: z.string(),
        optional: z.number().optional(),
      }) as ZodSchema<{ required: string; optional?: number }>,
    });
  }

  /**
   * Create a tool that requires confirmation
   */
  static createDestructiveTool(): McpTool<{ action: string; target: string }> {
    return createMockMcpTool<{ action: string; target: string }>('destructive-tool', {
      displayName: 'Destructive Tool',
      description: 'A tool that performs destructive operations',
      capabilities: {
        requiresConfirmation: true,
        destructive: true,
      },
      inputSchema: {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            description: 'Action to perform',
          },
          target: {
            type: Type.STRING,
            description: 'Target for the action',
          },
        },
        required: ['action', 'target'],
      },
      zodSchema: z.object({
        action: z.string(),
        target: z.string(),
      }),
    });
  }

  /**
   * Create a tool without Zod schema (for fallback testing)
   */
  static createJsonSchemaOnlyTool(): McpTool<{ data: any }> {
    return createMockMcpTool<{ data: any }>('json-schema-only', {
      displayName: 'JSON Schema Only Tool',
      description: 'Tool with only JSON schema, no Zod schema',
      inputSchema: {
        type: Type.OBJECT,
        properties: {
          data: {
            type: Type.OBJECT,
            description: 'Data object',
          },
        },
        required: ['data'],
      },
      // Intentionally no zodSchema to test fallback validation
    });
  }
}

/**
 * Create a mock AbortSignal for testing
 */
export function createMockAbortSignal(aborted = false): AbortSignal {
  return {
    aborted,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onabort: null,
    reason: undefined,
    throwIfAborted: vi.fn(() => {
      if (aborted) {
        throw new Error('Operation was aborted');
      }
    }),
  } as AbortSignal;
}

/**
 * Create a mock AbortController for testing
 */
export function createMockAbortController(): AbortController {
  const signal = createMockAbortSignal();
  return {
    signal,
    abort: vi.fn(() => {
      (signal as any).aborted = true;
    }),
  };
}