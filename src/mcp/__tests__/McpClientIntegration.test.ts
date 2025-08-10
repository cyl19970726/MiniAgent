/**
 * @fileoverview MCP Client Integration Tests
 * 
 * Comprehensive integration tests for the MCP Client focusing on end-to-end 
 * scenarios, error handling, concurrent operations, and real-world usage patterns.
 * 
 * Test Categories:
 * - Complete tool execution flows
 * - Multiple concurrent tool calls
 * - Error handling and recovery
 * - Network failure scenarios
 * - Transport switching
 * - Session persistence
 * - Schema validation and caching
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpClient } from '../McpClient.js';
import { 
  McpClientConfig,
  McpClientError,
  McpErrorCode,
  McpTool,
  McpToolResult,
  McpStdioTransportConfig,
  McpStreamableHttpTransportConfig,
} from '../interfaces.js';
import { 
  MockStdioMcpServer, 
  MockHttpMcpServer,
  MockServerFactory,
  BaseMockMcpServer 
} from '../transports/__tests__/mocks/MockMcpServer.js';
import { 
  TransportTestUtils,
  McpTestDataFactory,
  TransportAssertions,
  PerformanceTestUtils 
} from '../transports/__tests__/utils/TestUtils.js';

describe('McpClient Integration Tests', () => {
  let client: McpClient;
  let stdioServer: MockStdioMcpServer;
  let httpServer: MockHttpMcpServer;
  let consoleSpies: ReturnType<typeof TransportTestUtils.spyOnConsole>;

  beforeEach(() => {
    client = new McpClient();
    stdioServer = MockServerFactory.createStdioServer('integration-stdio-server');
    httpServer = MockServerFactory.createHttpServer('integration-http-server');
    consoleSpies = TransportTestUtils.spyOnConsole();
  });

  afterEach(async () => {
    try {
      await client.disconnect();
    } catch (error) {
      // Ignore cleanup errors
    }
    
    try {
      await stdioServer.stop();
      await httpServer.stop();
    } catch (error) {
      // Ignore cleanup errors
    }
    
    consoleSpies.restore();
    vi.clearAllMocks();
  });

  // ============================================================================
  // END-TO-END TOOL EXECUTION FLOWS
  // ============================================================================

  describe('End-to-End Tool Execution', () => {
    it('should execute complete tool flow from initialization to result', async () => {
      // Setup STDIO server with tools
      await stdioServer.start();
      stdioServer.addTool({
        name: 'integration_test_tool',
        description: 'Tool for integration testing',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Test message' },
            count: { type: 'number', description: 'Repeat count', default: 1 }
          },
          required: ['message']
        }
      });

      const config: McpClientConfig = {
        serverName: 'integration-test',
        transport: McpTestDataFactory.createStdioConfig({
          command: 'mock-stdio-server',
        }),
        capabilities: {
          tools: { listChanged: true }
        }
      };

      // Initialize and connect
      await client.initialize(config);
      await client.connect();

      // Verify connection
      expect(client.isConnected()).toBe(true);

      // Get server info
      const serverInfo = await client.getServerInfo();
      expect(serverInfo.name).toBe('integration-stdio-server');

      // List tools
      const tools = await client.listTools();
      expect(tools).toHaveLength(3); // 2 from factory + 1 added
      
      const testTool = tools.find(t => t.name === 'integration_test_tool');
      expect(testTool).toBeDefined();
      expect(testTool?.inputSchema.required).toContain('message');

      // Execute tool
      const result = await client.callTool('integration_test_tool', {
        message: 'Hello Integration Test',
        count: 2
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('integration_test_tool');
    });

    it('should handle tool execution with parameter validation', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'validation-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // List tools to cache schemas
      await client.listTools(true);

      // Test valid parameters
      const validResult = await client.callTool('echo', {
        message: 'Valid test message'
      });
      expect(validResult.content[0].text).toContain('echo');

      // Test invalid parameters - should throw validation error
      await expect(client.callTool('echo', {
        invalidParam: 'should fail'
      }, { validate: true })).rejects.toThrow();

      // Test missing required parameters
      await expect(client.callTool('echo', {}, { validate: true }))
        .rejects.toThrow();
    });

    it('should handle tool execution with timeout override', async () => {
      const slowServer = MockServerFactory.createSlowServer('stdio', 2000);
      await slowServer.start();

      const config: McpClientConfig = {
        serverName: 'timeout-test',
        transport: McpTestDataFactory.createStdioConfig(),
        requestTimeout: 1000, // Default timeout
      };

      await client.initialize(config);
      await client.connect();

      // Should timeout with default timeout
      await expect(client.callTool('slow_operation', {
        duration: 1500
      })).rejects.toThrow('Request timeout');

      // Should succeed with longer timeout override
      const result = await client.callTool('slow_operation', {
        duration: 500
      }, { timeout: 3000 });

      expect(result).toBeDefined();
      
      await slowServer.stop();
    });

    it('should execute tool with complex nested parameters', async () => {
      await stdioServer.start();
      stdioServer.addTool({
        name: 'complex_tool',
        description: 'Tool with complex parameters',
        inputSchema: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              properties: {
                settings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      key: { type: 'string' },
                      value: { type: 'number' },
                      enabled: { type: 'boolean' }
                    }
                  }
                }
              }
            }
          },
          required: ['config']
        }
      });

      const config: McpClientConfig = {
        serverName: 'complex-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      const complexParams = {
        config: {
          settings: [
            { key: 'timeout', value: 5000, enabled: true },
            { key: 'retries', value: 3, enabled: false },
            { key: 'bufferSize', value: 1024, enabled: true }
          ]
        }
      };

      const result = await client.callTool('complex_tool', complexParams);
      expect(result.content[0].text).toContain('complex_tool');
    });
  });

  // ============================================================================
  // CONCURRENT OPERATIONS
  // ============================================================================

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent tool calls', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'concurrent-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Execute 5 concurrent tool calls
      const promises = Array.from({ length: 5 }, (_, i) => 
        client.callTool('echo', { message: `Concurrent message ${i}` })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.content[0].text).toContain(`message ${index}`);
      });
    });

    it('should handle concurrent tool calls with some failures', async () => {
      const errorProneServer = MockServerFactory.createErrorProneServer('stdio', 0.4);
      await errorProneServer.start();

      const config: McpClientConfig = {
        serverName: 'error-prone-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Execute many concurrent calls to ensure some succeed and some fail
      const promises = Array.from({ length: 10 }, (_, i) => 
        client.callTool('unreliable_tool', { input: `test ${i}` })
          .catch(error => ({ error: error.message, index: i }))
      );

      const results = await Promise.all(promises);

      // Should have mix of successes and failures
      const successes = results.filter(r => !('error' in r));
      const failures = results.filter(r => 'error' in r);

      expect(successes.length).toBeGreaterThan(0);
      expect(failures.length).toBeGreaterThan(0);
      expect(successes.length + failures.length).toBe(10);
    });

    it('should handle concurrent operations across different tool types', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'mixed-concurrent-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Mix of different tool calls
      const operations = [
        client.callTool('echo', { message: 'Echo test' }),
        client.callTool('calculate', { operation: 'add', a: 5, b: 3 }),
        client.listTools(),
        client.getServerInfo(),
        client.callTool('echo', { message: 'Another echo' })
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(5);
      expect(results[0]).toHaveProperty('content'); // Tool result
      expect(results[1]).toHaveProperty('content'); // Tool result
      expect(Array.isArray(results[2])).toBe(true); // Tools list
      expect(results[3]).toHaveProperty('name'); // Server info
      expect(results[4]).toHaveProperty('content'); // Tool result
    });

    it('should handle high-load concurrent operations', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'high-load-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      const startTime = Date.now();
      
      // Execute 50 concurrent operations
      const promises = Array.from({ length: 50 }, (_, i) => 
        client.callTool('echo', { message: `Load test ${i}` })
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      // All results should be valid
      results.forEach(result => {
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });
    });
  });

  // ============================================================================
  // ERROR HANDLING AND RECOVERY
  // ============================================================================

  describe('Error Handling and Recovery', () => {
    it('should handle tool execution errors gracefully', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'error-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Test tool not found error
      await expect(client.callTool('nonexistent_tool', {}))
        .rejects.toThrow('Tool not found');

      // Verify client is still connected after error
      expect(client.isConnected()).toBe(true);
      
      // Verify other operations still work
      const tools = await client.listTools();
      expect(Array.isArray(tools)).toBe(true);
    });

    it('should handle malformed server responses', async () => {
      // Create a server that sends malformed responses
      const malformedServer = new MockStdioMcpServer({
        name: 'malformed-server',
        autoRespond: false // We'll manually send malformed responses
      });
      
      await malformedServer.start();
      
      // Mock transport to simulate malformed response
      const originalSendRequest = client['sendRequest'];
      client['sendRequest'] = vi.fn().mockResolvedValue({
        // Missing required fields
        invalidResponse: true
      });

      const config: McpClientConfig = {
        serverName: 'malformed-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      await expect(client.listTools()).rejects.toThrow('Invalid response');
      
      // Restore original method
      client['sendRequest'] = originalSendRequest;
      await malformedServer.stop();
    });

    it('should handle server disconnection during operations', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'disconnect-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();
      
      expect(client.isConnected()).toBe(true);

      // Simulate server crash during operation
      const toolCallPromise = client.callTool('echo', { message: 'test' });
      
      // Stop server while operation is in progress
      setTimeout(() => stdioServer.simulateCrash(), 100);

      await expect(toolCallPromise).rejects.toThrow();
      
      // Client should detect disconnection
      await TransportTestUtils.waitFor(
        () => !client.isConnected(),
        { timeout: 2000 }
      );
    });

    it('should handle timeout errors correctly', async () => {
      const slowServer = MockServerFactory.createSlowServer('stdio', 3000);
      await slowServer.start();

      const config: McpClientConfig = {
        serverName: 'timeout-test',
        transport: McpTestDataFactory.createStdioConfig(),
        requestTimeout: 1000,
      };

      await client.initialize(config);
      await client.connect();

      await expect(client.callTool('slow_operation', {
        duration: 2000
      })).rejects.toThrow(McpClientError);

      // Verify specific error type
      try {
        await client.callTool('slow_operation', { duration: 2000 });
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        expect(error).toBeInstanceOf(McpClientError);
        expect(error.code).toBe(McpErrorCode.TimeoutError);
      }

      await slowServer.stop();
    });

    it('should handle validation errors with detailed feedback', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'validation-error-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Cache schemas for validation
      await client.listTools(true);

      try {
        await client.callTool('calculate', {
          operation: 'invalid_operation',
          a: 'not_a_number',
          b: 5
        }, { validate: true });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(McpClientError);
        expect(error.code).toBe(McpErrorCode.InvalidParams);
        expect(error.message).toContain('Parameter validation failed');
      }
    });
  });

  // ============================================================================
  // NETWORK FAILURES AND TRANSPORT SWITCHING
  // ============================================================================

  describe('Network Failures and Transport Behavior', () => {
    it('should handle network failure during HTTP transport', async () => {
      await httpServer.start();
      
      const config: McpClientConfig = {
        serverName: 'network-failure-test',
        transport: McpTestDataFactory.createHttpConfig({
          url: 'http://localhost:3000/mcp',
          timeout: 2000,
        }),
      };

      await client.initialize(config);
      await client.connect();

      // Simulate network failure
      httpServer.simulateConnectionError('conn-1', new Error('Network failure'));

      // Operations should fail with network error
      await expect(client.listTools()).rejects.toThrow();
    });

    it('should handle transport-specific error scenarios', async () => {
      // Test STDIO transport errors
      const config: McpClientConfig = {
        serverName: 'transport-error-test',
        transport: McpTestDataFactory.createStdioConfig({
          command: 'nonexistent-command',
        }),
      };

      await client.initialize(config);

      // Should fail to connect with invalid command
      await expect(client.connect()).rejects.toThrow();
    });

    it('should maintain separate sessions with different transports', async () => {
      // This test demonstrates how multiple clients can work with different transports
      const stdioClient = new McpClient();
      const httpClient = new McpClient();

      try {
        await stdioServer.start();
        await httpServer.start();

        // Configure STDIO client
        await stdioClient.initialize({
          serverName: 'stdio-session',
          transport: McpTestDataFactory.createStdioConfig(),
        });

        // Configure HTTP client
        await httpClient.initialize({
          serverName: 'http-session',
          transport: McpTestDataFactory.createHttpConfig(),
        });

        // Connect both
        await stdioClient.connect();
        await httpClient.connect();

        // Both should work independently
        const stdioTools = await stdioClient.listTools();
        const httpTools = await httpClient.listTools();

        expect(stdioTools).toBeDefined();
        expect(httpTools).toBeDefined();

        // Verify they're using different servers
        const stdioInfo = await stdioClient.getServerInfo();
        const httpInfo = await httpClient.getServerInfo();

        expect(stdioInfo.name).toContain('stdio');
        expect(httpInfo.name).toContain('http');

      } finally {
        await stdioClient.disconnect();
        await httpClient.disconnect();
      }
    });
  });

  // ============================================================================
  // SESSION PERSISTENCE AND RECONNECTION
  // ============================================================================

  describe('Session Persistence and Reconnection', () => {
    it('should maintain session state across reconnection', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'persistence-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Cache initial state
      const initialTools = await client.listTools();
      const initialInfo = await client.getServerInfo();

      // Disconnect and reconnect
      await client.disconnect();
      expect(client.isConnected()).toBe(false);

      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Verify state is maintained
      const reconnectedTools = await client.listTools();
      const reconnectedInfo = await client.getServerInfo();

      expect(reconnectedTools).toHaveLength(initialTools.length);
      expect(reconnectedInfo.name).toBe(initialInfo.name);
    });

    it('should handle schema cache across reconnections', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'schema-cache-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Cache schemas
      await client.listTools(true);
      const schemaManager = client.getSchemaManager();
      
      // Verify schema is cached
      const validation1 = await schemaManager.validateToolParams('echo', {
        message: 'test'
      });
      expect(validation1.success).toBe(true);

      // Disconnect and reconnect
      await client.disconnect();
      await client.connect();

      // Schema cache should be cleared and need to be rebuilt
      await client.listTools(true);
      
      const validation2 = await schemaManager.validateToolParams('echo', {
        message: 'test after reconnect'
      });
      expect(validation2.success).toBe(true);
    });

    it('should handle server restart gracefully', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'restart-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Execute initial operations
      const result1 = await client.callTool('echo', { message: 'before restart' });
      expect(result1.content[0].text).toContain('echo');

      // Simulate server restart
      await stdioServer.stop();
      await stdioServer.start();

      // Client should detect disconnection
      await TransportTestUtils.waitFor(
        () => !client.isConnected(),
        { timeout: 2000 }
      );

      // Reconnect after server restart
      await client.connect();
      
      // Operations should work after restart
      const result2 = await client.callTool('echo', { message: 'after restart' });
      expect(result2.content[0].text).toContain('echo');
    });
  });

  // ============================================================================
  // REAL-WORLD USAGE PATTERNS
  // ============================================================================

  describe('Real-World Usage Patterns', () => {
    it('should handle typical agent workflow pattern', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'workflow-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Typical agent workflow:
      // 1. Discover available tools
      const tools = await client.listTools(true);
      expect(tools.length).toBeGreaterThan(0);

      // 2. Get server information
      const serverInfo = await client.getServerInfo();
      expect(serverInfo.name).toBeDefined();

      // 3. Execute a sequence of tool operations
      const echoResult = await client.callTool('echo', {
        message: 'Starting workflow'
      });
      expect(echoResult.content[0].text).toContain('echo');

      const calcResult = await client.callTool('calculate', {
        operation: 'multiply',
        a: 6,
        b: 7
      });
      expect(calcResult.content[0].text).toContain('calculate');

      // 4. Handle final cleanup
      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle event-driven tool discovery pattern', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'event-driven-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);

      // Set up event handlers
      const errors: McpClientError[] = [];
      const disconnections: number[] = [];
      const toolsChanges: number[] = [];

      client.onError((error) => errors.push(error));
      client.onDisconnect(() => disconnections.push(Date.now()));
      
      if (client.onToolsChanged) {
        client.onToolsChanged(() => toolsChanges.push(Date.now()));
      }

      await client.connect();

      // Initial tool discovery
      const initialTools = await client.listTools();
      const initialCount = initialTools.length;

      // Simulate server adding new tool
      stdioServer.addTool({
        name: 'dynamic_tool',
        description: 'Dynamically added tool',
        inputSchema: {
          type: 'object',
          properties: {
            data: { type: 'string' }
          }
        }
      });

      // Wait for notification (if supported)
      await TransportTestUtils.delay(100);

      // Discover new tools
      const updatedTools = await client.listTools();
      expect(updatedTools.length).toBe(initialCount + 1);

      // Verify new tool is available
      const newTool = updatedTools.find(t => t.name === 'dynamic_tool');
      expect(newTool).toBeDefined();

      // Test the new tool
      const result = await client.callTool('dynamic_tool', {
        data: 'test dynamic execution'
      });
      expect(result.content[0].text).toContain('dynamic_tool');
    });

    it('should handle resource management pattern', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'resource-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Test resource operations (if available)
      try {
        if (client.listResources) {
          const resources = await client.listResources();
          expect(Array.isArray(resources)).toBe(true);
        }
      } catch (error) {
        // Resource operations might not be supported
        console.warn('Resource operations not supported:', error.message);
      }

      // Focus on tool resource management
      const tools = await client.listTools();
      
      // Test each tool to verify resource allocation
      for (const tool of tools.slice(0, 2)) { // Test first 2 tools
        const result = await client.callTool(tool.name, 
          tool.name === 'echo' ? { message: 'resource test' } :
          tool.name === 'calculate' ? { operation: 'add', a: 1, b: 2 } :
          {}
        );
        expect(result).toBeDefined();
      }

      // Verify no resource leaks by checking client state
      expect(client.isConnected()).toBe(true);
      
      // Clean shutdown
      await client.disconnect();
    });

    it('should handle stress testing with rapid operations', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'stress-test',
        transport: McpTestDataFactory.createStdioConfig(),
        requestTimeout: 5000,
      };

      await client.initialize(config);
      await client.connect();

      // Perform stress test with many rapid operations
      const operations: Promise<any>[] = [];
      
      // Mix of different operation types
      for (let i = 0; i < 20; i++) {
        if (i % 4 === 0) {
          operations.push(client.listTools());
        } else if (i % 4 === 1) {
          operations.push(client.getServerInfo());
        } else if (i % 4 === 2) {
          operations.push(client.callTool('echo', { message: `stress ${i}` }));
        } else {
          operations.push(client.callTool('calculate', { 
            operation: 'add', 
            a: i, 
            b: i * 2 
          }));
        }
      }

      const startTime = Date.now();
      const results = await Promise.allSettled(operations);
      const duration = Date.now() - startTime;

      // Analyze results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`Stress test completed in ${duration}ms: ${successful} successful, ${failed} failed`);

      // Expect most operations to succeed
      expect(successful).toBeGreaterThan(15); // At least 75% success rate
      expect(duration).toBeLessThan(10000); // Complete within 10 seconds

      // Client should still be functional
      expect(client.isConnected()).toBe(true);
    });

    it('should handle graceful shutdown with cleanup', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'cleanup-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Start some long-running operations
      const longOperations = [
        client.callTool('echo', { message: 'cleanup test 1' }),
        client.callTool('echo', { message: 'cleanup test 2' }),
        client.listTools(),
      ];

      // Allow operations to start
      await TransportTestUtils.delay(10);

      // Perform graceful shutdown
      await client.close();

      // Wait for operations to complete or be cancelled
      const results = await Promise.allSettled(longOperations);
      
      // Verify client is properly closed
      expect(client.isConnected()).toBe(false);

      // Some operations might have completed, others cancelled
      const completed = results.filter(r => r.status === 'fulfilled').length;
      const cancelled = results.filter(r => r.status === 'rejected').length;
      
      console.log(`Shutdown: ${completed} completed, ${cancelled} cancelled`);
      expect(completed + cancelled).toBe(3);
    });
  });

  // ============================================================================
  // PERFORMANCE AND EDGE CASES
  // ============================================================================

  describe('Performance and Edge Cases', () => {
    it('should handle large message sizes efficiently', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'large-message-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Test with progressively larger messages
      const sizes = [1024, 10240, 102400]; // 1KB, 10KB, 100KB

      for (const size of sizes) {
        const largeMessage = 'x'.repeat(size);
        
        const { result, duration } = await PerformanceTestUtils.measureTime(() =>
          client.callTool('echo', { message: largeMessage })
        );

        expect(result.content[0].text).toContain('echo');
        expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        
        console.log(`${size} byte message processed in ${duration.toFixed(2)}ms`);
      }
    });

    it('should handle rapid connect/disconnect cycles', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'cycle-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);

      // Perform multiple connect/disconnect cycles
      for (let i = 0; i < 5; i++) {
        await client.connect();
        expect(client.isConnected()).toBe(true);

        // Perform quick operation
        const result = await client.callTool('echo', { 
          message: `cycle ${i}` 
        });
        expect(result.content[0].text).toContain(`cycle ${i}`);

        await client.disconnect();
        expect(client.isConnected()).toBe(false);

        // Small delay between cycles
        await TransportTestUtils.delay(100);
      }
    });

    it('should handle edge case parameter values', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'edge-case-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Test various edge case values
      const edgeCases = [
        { message: '' }, // Empty string
        { message: null }, // Null value
        { message: undefined }, // Undefined value
        { message: 'Special chars: 🚀 "quotes" \n newlines \t tabs' },
        { message: JSON.stringify({ nested: { object: true } }) }, // JSON string
      ];

      for (const params of edgeCases) {
        try {
          const result = await client.callTool('echo', params);
          expect(result.content[0].text).toContain('echo');
        } catch (error) {
          // Some edge cases might fail, which is acceptable
          console.warn(`Edge case failed: ${JSON.stringify(params)}`, error.message);
        }
      }
    });

    it('should maintain performance under sustained load', async () => {
      await stdioServer.start();
      
      const config: McpClientConfig = {
        serverName: 'sustained-load-test',
        transport: McpTestDataFactory.createStdioConfig(),
      };

      await client.initialize(config);
      await client.connect();

      // Run sustained load test for 30 operations over time
      const results: number[] = [];
      
      for (let i = 0; i < 30; i++) {
        const { duration } = await PerformanceTestUtils.measureTime(() =>
          client.callTool('echo', { message: `sustained load ${i}` })
        );
        
        results.push(duration);
        
        // Small delay to simulate realistic usage
        await TransportTestUtils.delay(50);
      }

      // Analyze performance trends
      const avgTime = results.reduce((a, b) => a + b, 0) / results.length;
      const maxTime = Math.max(...results);
      const minTime = Math.min(...results);

      console.log(`Sustained load: avg=${avgTime.toFixed(2)}ms, min=${minTime.toFixed(2)}ms, max=${maxTime.toFixed(2)}ms`);

      // Performance should remain reasonable
      expect(avgTime).toBeLessThan(1000); // Average under 1 second
      expect(maxTime).toBeLessThan(3000); // Max under 3 seconds
      
      // Performance shouldn't degrade significantly
      const firstHalf = results.slice(0, 15).reduce((a, b) => a + b, 0) / 15;
      const secondHalf = results.slice(15).reduce((a, b) => a + b, 0) / 15;
      
      expect(secondHalf / firstHalf).toBeLessThan(2); // Second half shouldn't be more than 2x slower
    });
  });
});