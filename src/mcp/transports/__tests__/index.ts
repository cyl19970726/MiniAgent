/**
 * @fileoverview MCP Transport Tests Index
 * 
 * This module exports all transport test utilities and provides
 * a centralized way to access testing infrastructure for MCP transports.
 */

// Export test utilities
export * from './utils/index.js';

// Export mock servers
export * from './mocks/MockMcpServer.js';

// Re-export interfaces for testing convenience
export type {
  McpRequest,
  McpResponse,
  McpNotification,
  McpError,
  McpStdioTransportConfig,
  McpStreamableHttpTransportConfig,
  McpAuthConfig,
  McpTool,
  McpContent,
  McpToolResult,
} from '../../interfaces.js';

/**
 * Test file information for discovery
 */
export const TEST_FILES = {
  basic: 'TransportBasics.test.ts',
  stdio: 'StdioTransport.test.ts', 
  http: 'HttpTransport.test.ts',
} as const;

/**
 * Test runner commands for convenience
 */
export const TEST_COMMANDS = {
  // Run basic transport tests (currently working)
  basic: 'npm test -- src/mcp/transports/__tests__/TransportBasics.test.ts',
  
  // Run STDIO transport tests (needs mock fixes)
  stdio: 'npm test -- src/mcp/transports/__tests__/StdioTransport.test.ts',
  
  // Run HTTP transport tests (needs mock fixes)  
  http: 'npm test -- src/mcp/transports/__tests__/HttpTransport.test.ts',
  
  // Run all transport tests
  all: 'npm test -- src/mcp/transports/__tests__/',
  
  // Run with coverage
  coverage: 'npm run test:coverage -- src/mcp/transports/__tests__/',
} as const;

/**
 * Test status information
 */
export const TEST_STATUS = {
  basic: {
    status: 'passing',
    count: 30,
    description: 'Basic transport interface and configuration tests'
  },
  stdio: {
    status: 'implemented',
    count: 57, 
    description: 'Comprehensive StdioTransport tests (needs mock fixes)'
  },
  http: {
    status: 'implemented',
    count: 90,
    description: 'Comprehensive HttpTransport tests (needs mock fixes)'
  }
} as const;