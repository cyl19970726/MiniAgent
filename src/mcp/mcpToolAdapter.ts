/**
 * @fileoverview MCP Tool Adapter - Refined Architecture Implementation
 * 
 * This adapter bridges MCP tools to MiniAgent's ITool interface using the
 * refined architecture patterns from the official SDK insights:
 * 
 * - Generic type parameters with delayed type resolution
 * - Zod runtime validation for parameters
 * - Schema caching for performance optimization
 * - Streamable HTTP transport support
 */

import { ZodSchema } from 'zod';
import { Schema } from '@google/genai';
import { BaseTool } from '../baseTool.js';
import { 
  ITool, 
  DefaultToolResult, 
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
} from '../interfaces.js';
import { 
  McpTool, 
  McpToolResult,
  IMcpClient,
  IToolSchemaManager
} from './interfaces.js';

/**
 * Enhanced MCP Tool Adapter with generic typing and runtime validation
 * 
 * Key Features:
 * - Generic type parameters: McpToolAdapter<T>
 * - Runtime Zod validation for parameters
 * - Schema caching mechanism
 * - Streamable HTTP transport support
 * - Integration with MiniAgent's tool system
 */
export class McpToolAdapter<T = unknown> extends BaseTool<T, McpToolResult> {
  private readonly mcpClient: IMcpClient;
  private readonly mcpTool: McpTool<T>;
  private readonly serverName: string;
  private readonly schemaManager: IToolSchemaManager;
  private cachedZodSchema?: ZodSchema<T>;

  constructor(
    mcpClient: IMcpClient,
    mcpTool: McpTool<T>,
    serverName: string
  ) {
    super(
      `${serverName}.${mcpTool.name}`,
      mcpTool.displayName || mcpTool.name,
      mcpTool.description,
      mcpTool.inputSchema,
      true, // MCP tools typically return markdown content
      false  // Streaming not yet supported in MCP protocol
    );

    this.mcpClient = mcpClient;
    this.mcpTool = mcpTool;
    this.serverName = serverName;
    this.schemaManager = mcpClient.getSchemaManager();

    // Cache the Zod schema if available
    this.cachedZodSchema = mcpTool.zodSchema as ZodSchema<T>;
  }

  /**
   * Validate tool parameters using Zod schema with caching
   */
  override validateToolParams(params: T): string | null {
    try {
      if (this.cachedZodSchema) {
        const result = this.cachedZodSchema.safeParse(params);
        if (!result.success) {
          return `Parameter validation failed: ${result.error.issues.map(i => i.message).join(', ')}`;
        }
        return null;
      }

      // Fallback to basic JSON Schema validation if Zod schema not available
      return this.validateAgainstJsonSchema(params, this.mcpTool.inputSchema);
    } catch (error) {
      return `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Get tool description for given parameters
   */
  override getDescription(params: T): string {
    const baseDescription = this.mcpTool.description;
    
    // Enhanced description with server context
    const serverContext = `[MCP Server: ${this.serverName}]`;
    
    // Add parameter context if available
    if (params && typeof params === 'object') {
      const paramKeys = Object.keys(params as Record<string, unknown>);
      if (paramKeys.length > 0) {
        return `${serverContext} ${baseDescription} (with parameters: ${paramKeys.join(', ')})`;
      }
    }
    
    return `${serverContext} ${baseDescription}`;
  }

  /**
   * Check if tool requires confirmation before execution
   */
  override async shouldConfirmExecute(
    params: T,
    abortSignal: AbortSignal
  ): Promise<ToolCallConfirmationDetails | false> {
    // Validate parameters first - if invalid, no confirmation needed (will fail in execute)
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false;
    }

    // Check if tool is marked as requiring confirmation or potentially destructive
    const requiresConfirmation = this.mcpTool.capabilities?.requiresConfirmation || 
                                this.mcpTool.capabilities?.destructive ||
                                false;

    if (!requiresConfirmation) {
      return false;
    }

    return {
      type: 'mcp',
      title: `Execute ${this.mcpTool.displayName || this.mcpTool.name}`,
      serverName: this.serverName,
      toolName: this.mcpTool.name,
      toolDisplayName: this.mcpTool.displayName || this.mcpTool.name,
      onConfirm: this.createConfirmHandler(params, abortSignal)
    };
  }

  /**
   * Execute the MCP tool with enhanced error handling and validation
   */
  override async execute(
    params: T,
    _signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<DefaultToolResult<McpToolResult>> {
    try {
      // Validate parameters using cached schema
      const validationError = this.validateToolParams(params);
      if (validationError) {
        throw new Error(`Parameter validation failed: ${validationError}`);
      }

      // Optional: Use schema manager for additional validation
      if (this.schemaManager) {
        const validation = await this.schemaManager.validateToolParams<T>(
          this.mcpTool.name, 
          params
        );
        if (!validation.success) {
          throw new Error(`Schema validation failed: ${validation.errors?.join(', ')}`);
        }
      }

      updateOutput?.(`Executing ${this.mcpTool.name} on server ${this.serverName}...`);

      // Execute the MCP tool with enhanced options
      const startTime = Date.now();
      const mcpResult = await this.mcpClient.callTool(
        this.mcpTool.name,
        params,
        {
          validate: false // We've already validated above
        }
      );

      const executionTime = Date.now() - startTime;
      updateOutput?.(`Completed in ${executionTime}ms`);

      // Wrap MCP result with additional metadata
      const enhancedResult: McpToolResult = {
        ...mcpResult,
        serverName: this.serverName,
        toolName: this.mcpTool.name,
        executionTime
      };

      return new DefaultToolResult(enhancedResult);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateOutput?.(`Error: ${errorMessage}`);
      
      // Return error result with MCP context
      const errorResult: McpToolResult = {
        content: [{
          type: 'text',
          text: `Error executing MCP tool: ${errorMessage}`
        }],
        isError: true,
        serverName: this.serverName,
        toolName: this.mcpTool.name,
        executionTime: 0
      };

      return new DefaultToolResult(errorResult);
    }
  }

  /**
   * Create confirmation handler for tool execution
   */
  private createConfirmHandler(
    _params: T,
    abortSignal: AbortSignal
  ): (outcome: ToolConfirmationOutcome) => Promise<void> {
    return async (outcome: ToolConfirmationOutcome) => {
      switch (outcome) {
        case ToolConfirmationOutcome.ProceedOnce:
        case ToolConfirmationOutcome.ProceedAlways:
        case ToolConfirmationOutcome.ProceedAlwaysServer:
        case ToolConfirmationOutcome.ProceedAlwaysTool:
          // Proceed with execution - the tool scheduler will handle this
          break;
        case ToolConfirmationOutcome.Cancel:
          // Cancel execution
          abortSignal.throwIfAborted();
          break;
        case ToolConfirmationOutcome.ModifyWithEditor:
          // Not applicable for MCP tools - treat as proceed
          break;
      }
    };
  }

  /**
   * Get MCP-specific metadata for debugging and monitoring
   */
  getMcpMetadata(): {
    serverName: string;
    toolName: string;
    capabilities?: McpTool<T>['capabilities'];
    transportType?: string;
    connectionStats?: any;
  } {
    return {
      serverName: this.serverName,
      toolName: this.mcpTool.name,
      capabilities: this.mcpTool.capabilities,
      transportType: 'mcp', // Default value since not all clients expose transport type
      connectionStats: undefined // Default value since not all clients expose connection stats
    };
  }

  /**
   * Factory method to create MCP tool adapters with proper typing
   */
  static async create<T = unknown>(
    mcpClient: IMcpClient,
    mcpTool: McpTool<T>,
    serverName: string,
    options?: {
      /** Whether to cache the Zod schema during creation */
      cacheSchema?: boolean;
      /** Custom schema conversion logic */
      schemaConverter?: (jsonSchema: any) => ZodSchema<T>;
    }
  ): Promise<McpToolAdapter<T>> {
    // Cache schema if requested and not already present
    if (options?.cacheSchema && !mcpTool.zodSchema) {
      const schemaManager = mcpClient.getSchemaManager();
      await schemaManager.cacheSchema(mcpTool.name, mcpTool.inputSchema);
    }

    // Apply custom schema converter if provided
    if (options?.schemaConverter && !mcpTool.zodSchema) {
      mcpTool.zodSchema = options.schemaConverter(mcpTool.inputSchema);
    }

    return new McpToolAdapter(mcpClient, mcpTool, serverName);
  }

  /**
   * Create adapter with delayed type resolution
   * Useful when the exact parameter type is not known at compile time
   */
  static createDynamic(
    mcpClient: IMcpClient,
    mcpTool: McpTool<unknown>,
    serverName: string,
    options?: {
      cacheSchema?: boolean;
      validateAtRuntime?: boolean;
    }
  ): McpToolAdapter<unknown> {
    const adapter = new McpToolAdapter(mcpClient, mcpTool, serverName);
    
    if (options?.validateAtRuntime) {
      // Override validation to use dynamic schema resolution
      const originalValidate = adapter.validateToolParams.bind(adapter);
      adapter.validateToolParams = (params: unknown): string | null => {
        try {
          // First try the original validation
          const originalResult = originalValidate(params);
          if (originalResult) {
            return originalResult;
          }

          // If no cached Zod schema, try basic JSON schema validation
          if (!mcpTool.zodSchema) {
            // Basic runtime validation against JSON schema
            return adapter.validateAgainstJsonSchema(params, mcpTool.inputSchema);
          }

          return null;
        } catch (error) {
          return `Dynamic validation error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      };
    }

    return adapter;
  }

  /**
   * Basic JSON Schema validation fallback
   */
  private validateAgainstJsonSchema(params: unknown, schema: Schema): string | null {
    // This is a simplified validation - in practice, you'd use a JSON Schema validator
    if (!params || typeof params !== 'object') {
      return 'Parameters must be an object';
    }

    // Check required properties if defined
    if (schema.required && Array.isArray(schema.required)) {
      for (const required of schema.required) {
        if (!(required in (params as Record<string, unknown>))) {
          return `Missing required parameter: ${required}`;
        }
      }
    }

    return null;
  }
}

/**
 * Utility function to create multiple MCP tool adapters from a server
 */
export async function createMcpToolAdapters(
  mcpClient: IMcpClient,
  serverName: string,
  options?: {
    /** Filter tools by name pattern */
    toolFilter?: (tool: McpTool) => boolean;
    /** Whether to cache schemas for all tools */
    cacheSchemas?: boolean;
    /** Enable dynamic typing for unknown parameter structures */
    enableDynamicTyping?: boolean;
  }
): Promise<McpToolAdapter[]> {
  const tools = await mcpClient.listTools(options?.cacheSchemas);
  
  const filteredTools = options?.toolFilter ? tools.filter(options.toolFilter) : tools;
  
  const adapters = await Promise.all(
    filteredTools.map(tool => {
      if (options?.enableDynamicTyping) {
        return Promise.resolve(McpToolAdapter.createDynamic(mcpClient, tool, serverName, {
          cacheSchema: options?.cacheSchemas ?? false,
          validateAtRuntime: true
        }));
      } else {
        return McpToolAdapter.create(mcpClient, tool, serverName, {
          cacheSchema: options?.cacheSchemas ?? false
        });
      }
    })
  );

  return adapters;
}

/**
 * Utility function to register MCP tools with a tool scheduler
 */
export async function registerMcpTools(
  toolScheduler: { registerTool: (tool: ITool) => void },
  mcpClient: IMcpClient,
  serverName: string,
  options?: {
    toolFilter?: (tool: McpTool) => boolean;
    cacheSchemas?: boolean;
    enableDynamicTyping?: boolean;
  }
): Promise<McpToolAdapter[]> {
  const adapters = await createMcpToolAdapters(mcpClient, serverName, options);
  
  for (const adapter of adapters) {
    toolScheduler.registerTool(adapter);
  }

  return adapters;
}

/**
 * Advanced tool creation with generic type inference
 */
export async function createTypedMcpToolAdapter<T = unknown>(
  mcpClient: IMcpClient,
  toolName: string,
  serverName: string,
  typeValidator?: ZodSchema<T>,
  options?: {
    cacheSchema?: boolean;
    validateAtRuntime?: boolean;
  }
): Promise<McpToolAdapter<T> | null> {
  const tools = await mcpClient.listTools<T>(options?.cacheSchema);
  const tool = tools.find(t => t.name === toolName);
  
  if (!tool) {
    return null;
  }

  // Apply type validator if provided
  if (typeValidator) {
    tool.zodSchema = typeValidator;
  }

  return McpToolAdapter.create(mcpClient, tool, serverName, options);
}