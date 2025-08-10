/**
 * @fileoverview Mock MCP Client for examples
 * 
 * Simple mock implementation of MCP Client that doesn't rely on vitest
 * for use in examples and demonstrations.
 */

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
  McpClientError,
} from '../../src/mcp/interfaces.js';

/**
 * Simple mock schema manager for examples
 */
class MockSchemaManager implements IToolSchemaManager {
  private cache = new Map<string, SchemaCache>();

  async cacheSchema(toolName: string, schema: Schema): Promise<void> {
    // Simple implementation for examples
    this.cache.set(toolName, {
      zodSchema: z.any(),
      jsonSchema: schema,
      timestamp: Date.now(),
      version: 'mock',
    });
  }

  async getCachedSchema(toolName: string): Promise<SchemaCache | undefined> {
    return this.cache.get(toolName);
  }

  async validateToolParams<T = unknown>(
    toolName: string,
    params: unknown
  ): Promise<SchemaValidationResult<T>> {
    // Always return success for examples
    return {
      success: true,
      data: params as T,
    };
  }

  async clearCache(toolName?: string): Promise<void> {
    if (toolName) {
      this.cache.delete(toolName);
    } else {
      this.cache.clear();
    }
  }

  async getCacheStats(): Promise<{ size: number; hits: number; misses: number }> {
    return { size: this.cache.size, hits: 0, misses: 0 };
  }
}

/**
 * Mock MCP Client for examples that demonstrates the interface
 * without requiring actual MCP servers
 */
export class MockMcpClient implements IMcpClient {
  private schemaManager = new MockSchemaManager();
  private connected = false;
  private serverName = 'mock-server';

  async initialize(config: McpClientConfig): Promise<void> {
    this.serverName = config.serverName;
    console.log(`🔗 Mock MCP client initialized for server: ${config.serverName}`);
  }

  async connect(): Promise<void> {
    this.connected = true;
    console.log(`✅ Mock connection established to ${this.serverName}`);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log(`🔌 Mock disconnection from ${this.serverName}`);
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
      name: this.serverName,
      version: '1.0.0',
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true },
      },
    };
  }

  async listTools<T = unknown>(cacheSchemas?: boolean): Promise<McpTool<T>[]> {
    // Return some mock tools
    const tools: McpTool<T>[] = [
      {
        name: 'get_weather',
        description: 'Get weather information for a location',
        inputSchema: {
          type: Type.OBJECT,
          properties: {
            location: {
              type: Type.STRING,
              description: 'Location to get weather for',
            },
            units: {
              type: Type.STRING,
              description: 'Temperature units (celsius or fahrenheit)',
            },
          },
          required: ['location'],
        },
      },
      {
        name: 'task_create',
        description: 'Create a new task',
        inputSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: 'Task title',
            },
            description: {
              type: Type.STRING,
              description: 'Task description',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'file_operation',
        description: 'Perform file operations',
        inputSchema: {
          type: Type.OBJECT,
          properties: {
            path: {
              type: Type.STRING,
              description: 'File path',
            },
            operation: {
              type: Type.STRING,
              description: 'Operation to perform',
            },
          },
          required: ['path', 'operation'],
        },
      },
    ] as McpTool<T>[];

    if (cacheSchemas) {
      for (const tool of tools) {
        await this.schemaManager.cacheSchema(tool.name, tool.inputSchema);
      }
    }

    console.log(`📋 Mock server ${this.serverName} has ${tools.length} tools`);
    return tools;
  }

  async callTool<TParams = unknown>(
    name: string,
    args: TParams,
    options?: { validate?: boolean; timeout?: number }
  ): Promise<McpToolResult> {
    console.log(`🔧 Mock executing tool: ${name} with args:`, JSON.stringify(args));

    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    // Return a mock result
    return {
      content: [
        {
          type: 'text',
          text: `Mock result from ${name}: Successfully executed with parameters ${JSON.stringify(args)}`,
        },
      ],
      serverName: this.serverName,
      toolName: name,
      executionTime: 100,
    };
  }

  getSchemaManager(): IToolSchemaManager {
    return this.schemaManager;
  }

  onError(handler: (error: McpClientError) => void): void {
    console.log('📝 Mock error handler registered');
  }

  onDisconnect(handler: () => void): void {
    console.log('📝 Mock disconnect handler registered');
  }
}