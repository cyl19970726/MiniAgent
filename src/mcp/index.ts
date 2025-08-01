/**
 * @fileoverview MCP Module Entry Point
 * 
 * This file exports all public interfaces and classes for the MCP integration.
 * It provides a clean API for users to import MCP functionality.
 */

// Core interfaces
export type {
  MCPConfig,
  MCPServerConfig,
  MCPToolDefinition,
  MCPToolRequest,
  MCPToolResponse,
  MCPTool,
  MCPServerInfo,
  IMCPServer,
  IMCPServerManager,
  MCPToolExecutionContext,
  ConfigValidationResult,
} from './interfaces.js';

// Enums and error types
export {
  MCPServerStatus,
  MCPErrorType,
  MCPError,
  isMCPTool,
  isMCPServerConfig,
} from './interfaces.js';

// Core implementations
export { MCPServer } from './mcpServer.js';
export { MCPServerManager } from './mcpServerManager.js';
export { MCPToolAdapter } from './mcpToolAdapter.js';

// Agent integration
export type { MCPAgentConfig } from './mcpAgent.js';
export { MCPAgent, createMCPAgent } from './mcpAgent.js';

// Configuration utilities
export {
  MCPConfigLoader,
  MCPConfigHelpers,
  DEFAULT_MCP_CONFIG,
  MCP_ENV_PREFIXES,
} from './config.js';

// Re-export useful types from base interfaces
export type {
  ITool,
  ToolResult,
  ToolCallConfirmationDetails,
  AllConfig,
} from '../interfaces.js';