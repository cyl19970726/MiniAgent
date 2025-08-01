/**
 * @fileoverview MCP Tool Adapter Implementation
 * 
 * This file implements the MCPTool interface, providing an adapter that wraps
 * MCP tools to conform to the ITool interface used by the MiniAgent framework.
 */

import {
  MCPTool,
  MCPToolDefinition,
  MCPToolResponse,
  IMCPServerManager,
  MCPError,
  MCPErrorType,
} from './interfaces.js';
import {
  ToolResult,
  ToolCallConfirmationDetails,
  ToolMcpConfirmationDetails,
  ToolConfirmationOutcome,
  ToolDeclaration,
} from '../interfaces.js';
import { ILogger, createLogger, LogLevel } from '../logger.js';

/**
 * Adapter class that wraps MCP tools to implement the ITool interface
 * 
 * This class provides seamless integration between MCP servers and the
 * MiniAgent tool system, handling parameter validation, execution,
 * and confirmation workflows.
 */
export class MCPToolAdapter implements MCPTool {
  /** Tool name (prefixed with server name for uniqueness) */
  public readonly name: string;
  
  /** Tool description */
  public readonly description: string;
  
  /** Tool schema in MiniAgent format */
  public readonly schema: ToolDeclaration;
  
  /** Whether output is markdown */
  public readonly isOutputMarkdown: boolean = false;
  
  /** Whether tool supports streaming output */
  public readonly canUpdateOutput: boolean = false;
  
  /** MCP server name */
  public readonly serverName: string;
  
  /** Original MCP tool name */
  public readonly mcpToolName: string;
  
  /** MCP tool definition */
  public readonly mcpDefinition: MCPToolDefinition;
  
  /** Logger instance */
  private logger: ILogger;

  constructor(
    private serverManager: IMCPServerManager,
    serverName: string,
    mcpDefinition: MCPToolDefinition,
    logLevel: LogLevel = LogLevel.INFO
  ) {
    this.serverName = serverName;
    this.mcpToolName = mcpDefinition.name;
    this.mcpDefinition = mcpDefinition;
    
    // Create unique tool name by prefixing with server name
    this.name = `${serverName}_${mcpDefinition.name}`;
    this.description = mcpDefinition.description || `MCP tool ${mcpDefinition.name} from ${serverName}`;
    
    // Convert MCP schema to MiniAgent schema
    this.schema = this.convertMCPSchemaToToolDeclaration(mcpDefinition);
    
    this.logger = createLogger(`MCPToolAdapter:${this.name}`, {
      level: logLevel,
    });
    
    this.logger.debug(`MCP Tool Adapter created: ${this.name}`, 'MCPToolAdapter.constructor()');
  }

  /**
   * Validate tool parameters
   */
  validateToolParams(params: Record<string, unknown>): string | null {
    try {
      const schema = this.mcpDefinition.inputSchema;
      
      // Check required parameters
      if (schema.required) {
        for (const requiredParam of schema.required) {
          if (!(requiredParam in params)) {
            return `Missing required parameter: ${requiredParam}`;
          }
        }
      }

      // Basic type validation
      if (schema.properties) {
        for (const [paramName, paramValue] of Object.entries(params)) {
          const paramSchema = schema.properties[paramName];
          if (!paramSchema) {
            // Allow additional properties for flexibility
            continue;
          }

          const validationError = this.validateParameterValue(paramName, paramValue, paramSchema);
          if (validationError) {
            return validationError;
          }
        }
      }

      return null; // Valid
    } catch (error) {
      this.logger.error(`Parameter validation error: ${error instanceof Error ? error.message : String(error)}`, 'MCPToolAdapter.validateToolParams()');
      return `Parameter validation failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Get tool description for given parameters
   */
  getDescription(params: Record<string, unknown>): string {
    const baseDescription = this.description;
    
    // Add parameter information if available
    const paramInfo = Object.keys(params).length > 0 
      ? ` with parameters: ${JSON.stringify(params, null, 2)}`
      : '';
    
    return `${baseDescription}${paramInfo}`;
  }

  /**
   * Check if tool requires confirmation before execution
   */
  async shouldConfirmExecute(
    params: Record<string, unknown>
  ): Promise<ToolCallConfirmationDetails | false> {
    // First validate parameters
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false; // Don't confirm if parameters are invalid
    }

    // Check if this is a potentially destructive operation
    const isDestructive = this.isDestructiveOperation(params);
    
    if (!isDestructive) {
      return false; // No confirmation needed for safe operations
    }

    // Return MCP confirmation details
    return {
      type: 'mcp',
      title: `Execute MCP Tool: ${this.mcpToolName}`,
      serverName: this.serverName,
      toolName: this.mcpToolName,
      toolDisplayName: this.name,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        // The confirmation outcome will be handled by the tool scheduler
        this.logger.debug(`Tool confirmation: ${outcome}`, 'MCPToolAdapter.shouldConfirmExecute()');
      },
    } as ToolMcpConfirmationDetails;
  }

  /**
   * Execute the tool
   */
  async execute(
    params: Record<string, unknown>,
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<ToolResult> {
    this.logger.info(`Executing MCP tool: ${this.mcpToolName}`, 'MCPToolAdapter.execute()');
    
    // Validate parameters first
    const validationError = this.validateToolParams(params);
    if (validationError) {
      throw new MCPError(
        MCPErrorType.InvalidToolParameters,
        validationError,
        this.serverName,
        this.mcpToolName
      );
    }

    try {
      // Optional: Provide execution feedback
      updateOutput?.(`Executing ${this.mcpToolName} on ${this.serverName}...`);

      // Execute the tool via server manager
      const response: MCPToolResponse = await this.serverManager.executeServerTool(
        this.serverName,
        this.mcpToolName,
        params,
        signal
      );

      // Handle error responses
      if (response.isError) {
        const errorMessage = this.extractErrorMessage(response);
        throw new MCPError(
          MCPErrorType.ToolExecutionFailed,
          errorMessage,
          this.serverName,
          this.mcpToolName
        );
      }

      // Convert MCP response to tool result
      const result = this.convertMCPResponseToToolResult(response);
      
      this.logger.info(`Tool execution completed: ${this.mcpToolName}`, 'MCPToolAdapter.execute()');
      updateOutput?.(`✓ ${this.mcpToolName} completed successfully`);
      
      return result;
    } catch (error) {
      this.logger.error(
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        'MCPToolAdapter.execute()'
      );
      
      updateOutput?.(`✗ ${this.mcpToolName} failed: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof MCPError) {
        throw error;
      }

      throw new MCPError(
        MCPErrorType.ToolExecutionFailed,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        this.serverName,
        this.mcpToolName,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Convert MCP schema to MiniAgent ToolDeclaration
   */
  private convertMCPSchemaToToolDeclaration(mcpTool: MCPToolDefinition): ToolDeclaration {
    // Convert MCP JSON schema to MiniAgent tool declaration format
    // This is a simplified conversion - more sophisticated mapping may be needed
    return {
      name: this.name,
      description: mcpTool.description,
      parameters: mcpTool.inputSchema,
    };
  }

  /**
   * Validate a single parameter value
   */
  private validateParameterValue(
    paramName: string, 
    value: unknown, 
    schema: any
  ): string | null {
    if (value === null || value === undefined) {
      return `Parameter ${paramName} cannot be null or undefined`;
    }

    // Basic type checking based on JSON schema
    if (schema.type) {
      switch (schema.type) {
        case 'string':
          if (typeof value !== 'string') {
            return `Parameter ${paramName} must be a string`;
          }
          break;
        case 'number':
        case 'integer':
          if (typeof value !== 'number') {
            return `Parameter ${paramName} must be a number`;
          }
          if (schema.type === 'integer' && !Number.isInteger(value)) {
            return `Parameter ${paramName} must be an integer`;
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            return `Parameter ${paramName} must be a boolean`;
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            return `Parameter ${paramName} must be an array`;
          }
          break;
        case 'object':
          if (typeof value !== 'object' || Array.isArray(value)) {
            return `Parameter ${paramName} must be an object`;
          }
          break;
      }
    }

    // Additional validation rules can be added here
    // e.g., min/max values, string patterns, etc.

    return null; // Valid
  }

  /**
   * Check if operation is potentially destructive
   */
  private isDestructiveOperation(params: Record<string, unknown>): boolean {
    const toolName = this.mcpToolName.toLowerCase();
    
    // List of operations that typically require confirmation
    const destructiveKeywords = [
      'delete', 'remove', 'drop', 'destroy', 'kill', 'terminate',
      'clear', 'reset', 'format', 'wipe', 'purge', 'erase',
      'modify', 'update', 'edit', 'change', 'write', 'create',
      'move', 'rename', 'copy', 'clone', 'install', 'uninstall'
    ];

    // Check tool name for destructive keywords
    const hasDestructiveKeyword = destructiveKeywords.some(keyword => 
      toolName.includes(keyword)
    );

    // Check parameters for destructive patterns
    const paramString = JSON.stringify(params).toLowerCase();
    const hasDestructiveParams = destructiveKeywords.some(keyword => 
      paramString.includes(keyword)
    );

    return hasDestructiveKeyword || hasDestructiveParams;
  }

  /**
   * Extract error message from MCP response
   */
  private extractErrorMessage(response: MCPToolResponse): string {
    if (response.content && response.content.length > 0) {
      const errorContent = response.content.find(c => c.type === 'text' && c.text);
      if (errorContent && errorContent.text) {
        return errorContent.text;
      }
    }
    
    return `Tool execution failed on server ${this.serverName}`;
  }

  /**
   * Convert MCP response to MiniAgent ToolResult
   */
  private convertMCPResponseToToolResult(response: MCPToolResponse): ToolResult {
    if (!response.content || response.content.length === 0) {
      return {
        result: `Tool ${this.mcpToolName} executed successfully (no output)`
      };
    }

    // Combine all text content
    const textContents = response.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!)
      .join('\n');

    // Handle image content (basic support)
    const imageContents = response.content
      .filter(c => c.type === 'image')
      .map(c => `[Image: ${c.mimeType || 'unknown'}]`)
      .join('\n');

    // Handle resource content
    const resourceContents = response.content
      .filter(c => c.type === 'resource')
      .map(c => `[Resource: ${c.mimeType || 'unknown'}]`)
      .join('\n');

    // Combine all content
    const allContent = [textContents, imageContents, resourceContents]
      .filter(content => content.length > 0)
      .join('\n\n');

    return {
      result: allContent || `Tool ${this.mcpToolName} executed successfully`
    };
  }
}