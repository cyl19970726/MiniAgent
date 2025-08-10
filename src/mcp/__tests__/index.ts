/**
 * @fileoverview MCP Client Test Suite Index
 * 
 * Entry point for MCP Client integration tests. Provides organized access
 * to all test suites and utilities.
 */

// Re-export test utilities for other test files
export * from '../transports/__tests__/mocks/MockMcpServer.js';
export * from '../transports/__tests__/utils/TestUtils.js';

// Test suite documentation
/**
 * MCP Client Test Suites:
 * 
 * 1. McpClientBasic.test.ts (✅ 20 tests passing)
 *    - Basic client functionality and configuration
 *    - State management and error handling
 *    - Schema manager integration
 *    - Event handler registration
 *    - Resource cleanup validation
 * 
 * 2. McpClientIntegration.test.ts (🔄 42 tests - requires mock integration)
 *    - End-to-end tool execution flows
 *    - Concurrent operations and error recovery
 *    - Network failures and transport switching  
 *    - Session persistence and reconnection
 *    - Real-world usage patterns
 *    - Performance and edge cases
 * 
 * Usage:
 *   npm test -- src/mcp/__tests__/McpClientBasic.test.ts        # Basic tests
 *   npm test -- src/mcp/__tests__/McpClientIntegration.test.ts  # Full integration
 *   npm test -- src/mcp/__tests__/                             # All tests
 */