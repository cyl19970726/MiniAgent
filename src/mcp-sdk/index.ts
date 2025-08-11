/**
 * @fileoverview MCP SDK - Clean Integration Points
 * 
 * Minimal exports for MCP (Model Context Protocol) integration with MiniAgent.
 * Provides clean, type-safe interfaces for connecting to MCP servers and using their tools.
 */

// Core MCP client for connecting to servers
export { SimpleMcpClient } from './client.js';

// Tool adapter for integrating MCP tools with MiniAgent
export { McpToolAdapter, createMcpTools } from './tool-adapter.js';

// Manager for handling multiple MCP servers
export { McpManager } from './manager.js';

// Essential types for MCP integration
export type { 
  McpConfig, 
  McpTool, 
  McpToolResult, 
  McpServerInfo 
} from './client.js';

export type { 
  McpServerConfig 
} from './manager.js';