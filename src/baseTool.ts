/**
 * @fileoverview Base Tool Implementation for Agent Framework
 * 
 * This module provides base classes and utilities for creating tools that can be
 * executed by AI agents. It references the core package's tool implementation
 * but uses our own framework-specific types and interfaces.
 * 
 * Key Features:
 * - Abstract BaseTool class for common functionality
 * - Type-safe tool parameter validation
 * - Support for confirmation workflows
 * - Output streaming capabilities
 * - Framework-agnostic design
 */

import { Schema } from '@google/genai';
import { 
  ITool, 
  DefaultToolResult,
  ToolResult, 
  ToolCallConfirmationDetails, 
  ToolDeclaration,
} from './interfaces.js';

/**
 * Base implementation for tools with common functionality
 * 
 * This abstract class provides a foundation for creating tools that can be
 * executed by AI agents. It handles common patterns like parameter validation,
 * confirmation workflows, and output formatting.
 * 
 * The design is based on the core package's BaseTool but uses our own types
 * and interfaces for better integration with the agent framework.
 * 
 * @example
 * ```typescript
 * class CalculatorTool extends BaseTool<{ expression: string }, ToolResult> {
 *   constructor() {
 *     super(
 *       'calculator',
 *       'Calculator',
 *       'Perform basic mathematical calculations',
 *       {
 *         type: Type.OBJECT,
 *         properties: {
 *           expression: { type: Type.STRING, description: 'Math expression' }
 *         },
 *         required: ['expression']
 *       }
 *     );
 *   }
 * 
 *   async execute(params: { expression: string }) {
 *     const result = eval(params.expression);
 *     return {
 *       llmContent: `${params.expression} = ${result}`,
 *       returnDisplay: `🔢 ${params.expression} = ${result}`
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseTool<
  TParams = unknown,
  TResult = unknown,
> implements ITool<TParams, DefaultToolResult<TResult>> {
  /**
   * Creates a new instance of BaseTool
   * 
   * @param name - Internal name of the tool (used for API calls)
   * @param displayName - User-friendly display name of the tool
   * @param description - Description of what the tool does
   * @param parameterSchema - JSON Schema defining the parameters
   * @param isOutputMarkdown - Whether the tool's output should be rendered as markdown
   * @param canUpdateOutput - Whether the tool supports live (streaming) output
   */
  constructor(
    readonly name: string,
    readonly displayName: string,
    readonly description: string,
    readonly parameterSchema: Schema,
    readonly isOutputMarkdown: boolean = true,
    readonly canUpdateOutput: boolean = false,
  ) {}

  /**
   * Tool declaration schema computed from name, description, and parameterSchema
   * 
   * This property generates the schema format expected by the tool interface.
   * It combines the tool's name, description, and parameter schema into a 
   * single ToolDeclaration.
   */
  get schema(): ToolDeclaration {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameterSchema,
    };
  }

  /**
   * Validates the parameters for the tool
   * 
   * This is a default implementation that should be overridden by derived classes
   * to provide specific validation logic. The method should be called from both
   * `shouldConfirmExecute` and `execute` methods.
   * 
   * @param params - Parameters to validate
   * @returns An error message string if invalid, null if valid
   */
  validateToolParams(params: TParams): string | null {
    // Default implementation - derived classes should override this
    // to provide specific validation logic
    if (!params) {
      return 'Parameters are required';
    }
    
    if (typeof params !== 'object') {
      return 'Parameters must be an object';
    }
    
    return null;
  }

  /**
   * Gets a pre-execution description of the tool operation
   * 
   * This method provides a human-readable description of what the tool
   * will do with the given parameters. It's used for confirmation dialogs
   * and logging purposes.
   * 
   * @param params - Parameters for the tool execution
   * @returns A string describing what the tool will do
   */
  getDescription(params: TParams): string {
    return `Execute ${this.displayName} with: ${JSON.stringify(params)}`;
  }

  /**
   * Determines if the tool should prompt for confirmation before execution
   * 
   * This method allows tools to request user confirmation before executing
   * potentially dangerous or significant operations. The default implementation
   * returns false (no confirmation needed).
   * 
   * @param params - Parameters for the tool execution
   * @param abortSignal - Signal for canceling the confirmation check
   * @returns Confirmation details if confirmation is needed, false otherwise
   */
  async shouldConfirmExecute(
    params: TParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // Check if parameters are valid first
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false; // Don't confirm if parameters are invalid
    }

    // Default implementation - no confirmation needed
    return false;
  }

  
  /**
   * Abstract method that derived classes implement for tool execution
   * 
   * This is the main method that derived classes must implement to provide
   * their specific functionality. It receives validated parameters and should
   * return a structured result.
   */
  abstract execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<DefaultToolResult<TResult>>;

  /**
   * Helper method to create a basic tool result
   * 
   * This utility method helps create standardized tool results with
   * consistent formatting. It's useful for simple tools that don't
   * need complex result structures.
   * 
   * @param llmContent - Content to send to the LLM
   * @param returnDisplay - Content to display to the user
   * @param summary - Optional summary of the operation
   * @returns A properly formatted ToolResult
   */
  protected createResult(
    llmContent: string,
    returnDisplay?: string,
    summary?: string,
  ): { llmContent: string; returnDisplay?: string; summary?: string } {
    const result: { llmContent: string; returnDisplay?: string; summary?: string } = {
      llmContent,
    };
    
    if (returnDisplay !== undefined) {
      result.returnDisplay = returnDisplay;
    }
    
    if (summary !== undefined) {
      result.summary = summary;
    }
    
    return result;
  }

  /**
   * Helper method to create error tool results
   * 
   * This utility method creates standardized error results with
   * consistent formatting across all tools.
   * 
   * @param error - Error object or string
   * @param context - Optional context for the error
   * @returns A properly formatted error ToolResult
   */
  protected createErrorResult(
    error: Error | string,
    context?: string,
  ): { llmContent: string; returnDisplay: string; summary: string } {
    const errorMessage = error instanceof Error ? error.message : error;
    const fullError = context ? `${context}: ${errorMessage}` : errorMessage;
    
    return {
      llmContent: `Error: ${fullError}`,
      returnDisplay: `❌ Error: ${fullError}`,
      summary: `Failed: ${errorMessage}`,
    };
  }

  /**
   * Helper method to create file diff results
   * 
   * This utility method creates results for file operations that include
   * diff information for display purposes.
   * 
   * @param fileName - Name of the file that was modified
   * @param fileDiff - Diff content showing changes
   * @param llmContent - Content to send to the LLM
   * @param summary - Summary of the operation
   * @returns A properly formatted file diff ToolResult
   */
  protected createFileDiffResult(
    fileName: string,
    fileDiff: string,
    llmContent: string,
    summary?: string,
  ): { llmContent: string; returnDisplay: { fileName: string; fileDiff: string }; summary?: string } {
    const result: { llmContent: string; returnDisplay: { fileName: string; fileDiff: string }; summary?: string } = {
      llmContent,
      returnDisplay: {
        fileName,
        fileDiff,
      },
    };
    
    if (summary !== undefined) {
      result.summary = summary;
    }
    
    return result;
  }

  /**
   * Helper method to create a basic tool result for JSON serialization
   * 
   * @param result - The result data to wrap
   * @returns A properly formatted ToolResult
   */
  protected createJsonStrResult(
    result: unknown,
  ): ToolResult {
    const res : ToolResult = {
      result: JSON.stringify(result),
    };
    
    return res;
  }

  /**
   * Helper method to validate required parameters
   * 
   * This utility method checks if required parameters are present
   * and non-empty. It's commonly used in validateToolParams implementations.
   * 
   * @param params - Parameters to validate
   * @param requiredFields - Array of required field names
   * @returns Error message if validation fails, null if valid
   */
  protected validateRequiredParams(
    params: Record<string, unknown>,
    requiredFields: string[],
  ): string | null {
    for (const field of requiredFields) {
      if (!(field in params)) {
        return `Missing required parameter: ${field}`;
      }
      
      const value = params[field];
      if (value === null || value === undefined || value === '') {
        return `Parameter '${field}' cannot be empty`;
      }
    }
    
    return null;
  }

  /**
   * Helper method to validate parameter types
   * 
   * This utility method checks if parameters have the correct types.
   * It's useful for implementing type validation in validateToolParams.
   * 
   * @param params - Parameters to validate
   * @param typeMap - Map of field names to expected types
   * @returns Error message if validation fails, null if valid
   */
  protected validateParameterTypes(
    params: Record<string, unknown>,
    typeMap: Record<string, string>,
  ): string | null {
    for (const [field, expectedType] of Object.entries(typeMap)) {
      if (field in params) {
        const value = params[field];
        const actualType = typeof value;
        
        if (actualType !== expectedType) {
          return `Parameter '${field}' must be of type ${expectedType}, got ${actualType}`;
        }
      }
    }
    
    return null;
  }

  /**
   * Helper method to format operation progress
   * 
   * This utility method creates formatted progress messages for
   * streaming output updates. It provides consistent formatting
   * across all tools.
   * 
   * @param operation - Name of the operation being performed
   * @param progress - Current progress information
   * @param emoji - Optional emoji to display
   * @returns Formatted progress message
   */
  protected formatProgress(
    operation: string,
    progress: string,
    emoji?: string,
  ): string {
    const prefix = emoji ? `${emoji} ` : '';
    return `${prefix}${operation}: ${progress}`;
  }

  /**
   * Helper method to handle abort signals
   * 
   * This utility method provides a consistent way to handle
   * cancellation signals in tool execution. It throws an
   * appropriate error if the operation is cancelled.
   * 
   * @param signal - AbortSignal to check
   * @param operation - Name of the operation being checked
   * @throws Error if the operation is cancelled
   */
  protected checkAbortSignal(signal: AbortSignal, operation?: string): void {
    if (signal.aborted) {
      const message = operation 
        ? `${operation} was cancelled` 
        : 'Operation was cancelled';
      throw new Error(message);
    }
  }
}

/**
 * Simple tool implementation for tools that don't need complex logic
 * 
 * This class provides a concrete implementation of BaseTool for simple
 * tools that just need to execute a function and return a result.
 * It's useful for prototyping and simple operations.
 * 
 * @example
 * ```typescript
 * const echoTool = new SimpleTool(
 *   'echo',
 *   'Echo',
 *   'Echo back the input',
 *   { type: Type.OBJECT, properties: { text: { type: Type.STRING } } },
 *   async (params) => ({ llmContent: params.text, returnDisplay: params.text })
 * );
 * ```
 */
export class SimpleTool<TParams = unknown, TResult = unknown> extends BaseTool<TParams, TResult> {
  /**
   * Creates a new SimpleTool instance
   * 
   * @param name - Internal name of the tool
   * @param displayName - User-friendly display name
   * @param description - Description of what the tool does
   * @param parameterSchema - JSON Schema for parameters
   * @param executor - Function to execute the tool
   * @param isOutputMarkdown - Whether output is markdown
   * @param canUpdateOutput - Whether tool supports streaming output
   */
  constructor(
    name: string,
    displayName: string,
    description: string,
    parameterSchema: Schema,
    private executor: (
      params: TParams,
      signal: AbortSignal,
      updateOutput?: (output: string) => void,
    ) => Promise<TResult>,
    isOutputMarkdown: boolean = true,
    canUpdateOutput: boolean = false,
  ) {
    super(name, displayName, description, parameterSchema, isOutputMarkdown, canUpdateOutput);
  }

  /**
   * Executes the tool using the provided executor function
   * 
   * @param params - Parameters for the tool execution
   * @param signal - Abort signal for cancellation
   * @param updateOutput - Callback for streaming output
   * @returns Promise resolving to the tool execution result
   */
  async execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<DefaultToolResult<TResult>> {
    // Validate parameters before execution
    const validationError = this.validateToolParams(params);
    if (validationError) {
      const errorResult = this.createErrorResult(validationError);
      return new DefaultToolResult(errorResult as TResult);
    }

    try {
      const result = await this.executor(params, signal, updateOutput);
      return new DefaultToolResult(result);
    } catch (error) {
      const errorResult = this.createErrorResult(error instanceof Error ? error : new Error(String(error)));
      return new DefaultToolResult(errorResult as TResult);
    }
  }
}