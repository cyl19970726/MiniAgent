/**
 * @fileoverview MCP Tool Adapter for MiniAgent
 * 
 * Minimal adapter that bridges MCP (Model Context Protocol) tools to MiniAgent's BaseTool interface.
 * Provides simple parameter passing and result formatting without complex schema conversions.
 */

import { Schema } from '@google/genai';
import { BaseTool } from '../baseTool.js';
import { DefaultToolResult } from '../interfaces.js';
import { SimpleMcpClient, McpTool } from './client.js';

/**
 * McpToolAdapter - Bridges MCP tools to MiniAgent's BaseTool interface
 * 
 * This adapter extends BaseTool to make MCP tools compatible with MiniAgent's
 * tool execution system. It handles parameter passing and result formatting
 * while maintaining the simplicity of both systems.
 * 
 * Features:
 * - Direct parameter passing to MCP tools
 * - Simple result formatting from MCP responses
 * - Basic error handling and reporting
 * - Minimal schema conversion (uses inputSchema as-is)
 */
export class McpToolAdapter extends BaseTool<Record<string, unknown>, unknown> {
  /**
   * Creates an adapter for an MCP tool
   * 
   * @param client - Connected MCP client instance
   * @param mcpTool - MCP tool definition from server
   */
  constructor(
    private readonly client: SimpleMcpClient,
    private readonly mcpTool: McpTool
  ) {
    super(
      mcpTool.name,
      mcpTool.name, // Use name as display name for simplicity
      mcpTool.description || `MCP tool: ${mcpTool.name}`,
      mcpTool.inputSchema as Schema, // Use MCP schema directly
      true, // isOutputMarkdown
      false  // canUpdateOutput (MCP tools don't support streaming)
    );
  }

  /**
   * Validates MCP tool parameters
   * Basic validation - ensures params exist and are object
   */
  override validateToolParams(params: Record<string, unknown>): string | null {
    if (!params || typeof params !== 'object') {
      return 'Parameters must be a valid object';
    }
    return null;
  }

  /**
   * Executes the MCP tool via the client
   * 
   * @param params - Parameters to pass to the MCP tool
   * @param signal - Abort signal for cancellation
   * @returns DefaultToolResult with MCP tool response
   */
  async execute(
    params: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<DefaultToolResult<unknown>> {
    // Check if operation was cancelled
    this.checkAbortSignal(signal, `MCP tool ${this.mcpTool.name} execution`);

    // Validate parameters
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return new DefaultToolResult(this.createErrorResult(validationError));
    }

    try {
      // Call MCP tool via client
      const mcpResult = await this.client.callTool(this.mcpTool.name, params);
      
      // Format result for MiniAgent
      const formattedContent = this.formatMcpContent(mcpResult.content);
      
      return new DefaultToolResult(this.createResult(
        formattedContent,
        formattedContent,
        `MCP tool ${this.mcpTool.name} executed successfully`
      ));
      
    } catch (error) {
      // Handle MCP errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      return new DefaultToolResult(this.createErrorResult(
        `MCP tool execution failed: ${errorMsg}`,
        `Tool: ${this.mcpTool.name}`
      ));
    }
  }

  /**
   * Formats MCP content array into a readable string
   * MCP returns content as an array of content blocks
   */
  private formatMcpContent(content: unknown[]): string {
    if (!Array.isArray(content) || content.length === 0) {
      return 'No content returned from MCP tool';
    }

    return content
      .map(item => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object') {
          // Handle text content blocks
          if ('type' in item && 'text' in item && item.type === 'text' && item.text) {
            return String(item.text);
          }
          // Handle other content types by stringifying
          return JSON.stringify(item, null, 2);
        }
        return String(item);
      })
      .join('\n\n');
  }
}

/**
 * Helper function to discover and create MCP tool adapters
 * 
 * @param client - Connected MCP client instance
 * @returns Array of McpToolAdapter instances for all available tools
 */
export async function createMcpTools(client: SimpleMcpClient): Promise<McpToolAdapter[]> {
  if (!client.connected) {
    throw new Error('MCP client must be connected before creating tools');
  }

  try {
    // Discover available tools from MCP server
    const mcpTools = await client.listTools();
    
    // Create adapters for each tool
    return mcpTools.map(mcpTool => new McpToolAdapter(client, mcpTool));
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create MCP tools: ${errorMsg}`);
  }
}