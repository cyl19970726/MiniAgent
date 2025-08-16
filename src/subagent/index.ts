/**
 * @fileoverview SubAgent Module Exports
 * 
 * This module exports all subagent-related components including the registry,
 * task tool, and type definitions.
 */

// Export the registry implementation
export { SubAgentRegistry } from './registry.js';

// Export the task delegation tool
export { TaskTool } from './taskTool.js';

// Re-export types from interfaces for convenience
export type { SubAgentTask, SubAgentResult, SubAgentConfig } from '../interfaces.js';