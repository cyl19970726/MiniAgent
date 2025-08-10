/**
 * @fileoverview MCP Integration Export Module
 * 
 * This module exports all MCP-related classes, interfaces, and utilities
 * for integration with the MiniAgent framework.
 */

// Export core interfaces
export * from './interfaces.js';

// Export main implementation classes
export { McpClient } from './mcpClient.js';
export { McpConnectionManager } from './mcpConnectionManager.js';
export { McpToolAdapter } from './mcpToolAdapter.js';
export { McpSchemaManager as SchemaManager } from './schemaManager.js';

// Export transport implementations
export * from './transports/index.js';

// Export utility functions
export {
  createMcpToolAdapters,
  registerMcpTools,
  createTypedMcpToolAdapter
} from './mcpToolAdapter.js';