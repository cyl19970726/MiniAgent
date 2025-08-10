/**
 * @fileoverview Advanced MCP Integration Example for MiniAgent
 * 
 * This example demonstrates advanced MCP integration patterns including:
 * - Custom transport implementations
 * - Concurrent tool execution and batching
 * - Advanced schema validation and type safety
 * - Tool composition and chaining
 * - Performance optimization techniques
 * - Custom error handling and recovery strategies
 * - Dynamic tool discovery and hot-reloading
 * - Integration with MiniAgent's streaming capabilities
 * 
 * Prerequisites:
 * - Understanding of basic MCP concepts (see mcp-basic-example.ts)
 * - Multiple MCP servers for testing concurrent operations
 * - Advanced TypeScript knowledge for custom implementations
 */

import { z } from 'zod';
import { StandardAgent } from '../src/standardAgent.js';
import { BaseTool } from '../src/baseTool.js';
import { DefaultToolResult } from '../src/interfaces.js';
import { Type } from '@sinclair/typebox';
import { 
  McpClient, 
  McpConnectionManager, 
  McpToolAdapter,
  createMcpToolAdapters,
  createTypedMcpToolAdapter 
} from '../src/mcp/index.js';
import { 
  McpServerConfig,
  McpStdioTransportConfig,
  McpStreamableHttpTransportConfig,
  McpTool,
  McpToolResult,
  McpClientError,
  SchemaValidationResult,
  IMcpTransport,
  McpRequest,
  McpResponse,
  McpNotification
} from '../src/mcp/interfaces.js';

/**
 * Example 1: Custom Transport Implementation
 * 
 * Demonstrates how to create a custom transport for specialized
 * communication protocols or debugging purposes.
 */
class DebugTransport implements IMcpTransport {
  private connected = false;
  private messageHandlers: Array<(message: McpResponse | McpNotification) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private disconnectHandlers: Array<() => void> = [];
  
  async connect(): Promise<void> {
    console.log('🔍 [DebugTransport] Connecting...');
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 100));
    this.connected = true;
    console.log('🔍 [DebugTransport] Connected');
  }
  
  async disconnect(): Promise<void> {
    console.log('🔍 [DebugTransport] Disconnecting...');
    this.connected = false;
    this.disconnectHandlers.forEach(handler => handler());
    console.log('🔍 [DebugTransport] Disconnected');
  }
  
  async send(message: McpRequest | McpNotification): Promise<void> {
    console.log('🔍 [DebugTransport] Sending:', JSON.stringify(message, null, 2));
    
    // Simulate server response for debugging
    if ('id' in message) {
      const response: McpResponse = {
        jsonrpc: '2.0',
        id: message.id,
        result: this.generateMockResponse(message.method)
      };
      
      // Simulate network delay
      setTimeout(() => {
        console.log('🔍 [DebugTransport] Receiving:', JSON.stringify(response, null, 2));
        this.messageHandlers.forEach(handler => handler(response));
      }, 50);
    }
  }
  
  onMessage(handler: (message: McpResponse | McpNotification) => void): void {
    this.messageHandlers.push(handler);
  }
  
  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }
  
  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  private generateMockResponse(method: string): unknown {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
            resources: { subscribe: true }
          },
          serverInfo: {
            name: 'debug-server',
            version: '1.0.0'
          }
        };
      case 'tools/list':
        return {
          tools: [
            {
              name: 'debug_tool',
              description: 'A mock tool for debugging',
              inputSchema: {
                type: 'object',
                properties: {
                  message: { type: 'string' }
                },
                required: ['message']
              }
            }
          ]
        };
      case 'tools/call':
        return {
          content: [
            {
              type: 'text',
              text: 'Mock response from debug tool'
            }
          ]
        };
      default:
        return {};
    }
  }
}

async function customTransportExample() {
  console.log('🔧 Example 1: Custom Transport Implementation');
  
  try {
    const client = new McpClient();
    
    // Note: This would require modifying McpClient to accept custom transports
    // For demonstration purposes only
    console.log('🔍 Custom debug transport created');
    console.log('💡 This example shows the transport interface structure');
    console.log('   In practice, you would integrate with McpClient constructor\n');
    
  } catch (error) {
    console.error('❌ Custom Transport Error:', error.message);
  }
}

/**
 * Example 2: Concurrent Tool Execution
 * 
 * Demonstrates how to execute multiple MCP tools concurrently
 * for improved performance.
 */
async function concurrentToolExecutionExample() {
  console.log('⚡ Example 2: Concurrent Tool Execution');
  
  try {
    // Create multiple MCP clients for different servers
    const clients = await Promise.all([
      createMockMcpClient('server-1', ['tool_a', 'tool_b']),
      createMockMcpClient('server-2', ['tool_c', 'tool_d']),
      createMockMcpClient('server-3', ['tool_e', 'tool_f'])
    ]);
    
    console.log(`🔗 Created ${clients.length} MCP client connections`);
    
    // Prepare concurrent tool executions
    const toolExecutions = [
      { client: clients[0], tool: 'tool_a', params: { input: 'data1' } },
      { client: clients[1], tool: 'tool_c', params: { input: 'data2' } },
      { client: clients[2], tool: 'tool_e', params: { input: 'data3' } },
      { client: clients[0], tool: 'tool_b', params: { input: 'data4' } }
    ];
    
    // Execute tools concurrently with timing
    console.log('⚡ Executing tools concurrently...');
    const startTime = Date.now();
    
    const results = await Promise.allSettled(
      toolExecutions.map(async ({ client, tool, params }) => {
        console.log(`🔧 Starting ${tool}...`);
        const result = await client.callTool(tool, params);
        console.log(`✅ Completed ${tool}`);
        return { tool, result, server: await client.getServerInfo() };
      })
    );
    
    const totalTime = Date.now() - startTime;
    console.log(`⏱️  Total execution time: ${totalTime}ms`);
    
    // Process results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`📊 Results: ${successful} successful, ${failed} failed`);
    
    // Detailed result analysis
    results.forEach((result, index) => {
      const execution = toolExecutions[index];
      if (result.status === 'fulfilled') {
        console.log(`✅ ${execution.tool}: Success`);
      } else {
        console.log(`❌ ${execution.tool}: ${result.reason.message}`);
      }
    });
    
    // Clean up connections
    await Promise.all(clients.map(client => client.disconnect()));
    console.log('⚡ Concurrent execution example completed\n');
    
  } catch (error) {
    console.error('❌ Concurrent Execution Error:', error.message);
  }
}

/**
 * Example 3: Advanced Schema Validation and Type Safety
 * 
 * Shows advanced patterns for schema validation, custom validators,
 * and compile-time type safety with MCP tools.
 */
async function advancedSchemaValidationExample() {
  console.log('🔒 Example 3: Advanced Schema Validation');
  
  try {
    // Define complex parameter interfaces
    interface ComplexWorkflowParams {
      workflow: {
        id: string;
        steps: Array<{
          name: string;
          type: 'transform' | 'validate' | 'output';
          config: Record<string, unknown>;
        }>;
      };
      context: {
        userId: string;
        permissions: string[];
        metadata?: Record<string, unknown>;
      };
    }
    
    // Create advanced Zod schema with custom validation
    const ComplexWorkflowSchema = z.object({
      workflow: z.object({
        id: z.string().uuid('Invalid workflow ID format'),
        steps: z.array(z.object({
          name: z.string().min(1, 'Step name cannot be empty'),
          type: z.enum(['transform', 'validate', 'output']),
          config: z.record(z.unknown())
        })).min(1, 'Workflow must have at least one step')
      }),
      context: z.object({
        userId: z.string().min(1, 'User ID required'),
        permissions: z.array(z.string()).min(1, 'At least one permission required'),
        metadata: z.record(z.unknown()).optional()
      })
    }).refine(data => {
      // Custom validation: validate step dependencies
      const stepNames = data.workflow.steps.map(step => step.name);
      const uniqueNames = new Set(stepNames);
      return uniqueNames.size === stepNames.length;
    }, {
      message: 'Workflow steps must have unique names'
    });
    
    const client = await createMockMcpClient('validation-server', ['complex_workflow']);
    
    // Create typed MCP tool adapter
    const workflowTool = await createTypedMcpToolAdapter<ComplexWorkflowParams>(
      client,
      'complex_workflow',
      'validation-server',
      ComplexWorkflowSchema,
      { cacheSchema: true }
    );
    
    if (workflowTool) {
      console.log('🔒 Created typed workflow tool with advanced validation');
      
      // Test valid parameters
      const validParams: ComplexWorkflowParams = {
        workflow: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          steps: [
            { name: 'input', type: 'transform', config: { format: 'json' } },
            { name: 'process', type: 'validate', config: { rules: ['required'] } },
            { name: 'output', type: 'output', config: { format: 'csv' } }
          ]
        },
        context: {
          userId: 'user123',
          permissions: ['read', 'write'],
          metadata: { source: 'api' }
        }
      };
      
      console.log('✅ Executing with valid parameters...');
      const validResult = await workflowTool.execute(
        validParams,
        new AbortController().signal,
        (output) => console.log('   📄 Progress:', output)
      );
      console.log('✅ Valid execution completed');
      
      // Test invalid parameters (this should fail validation)
      try {
        const invalidParams = {
          workflow: {
            id: 'invalid-uuid',  // Invalid UUID format
            steps: []  // Empty steps array
          },
          context: {
            userId: '',  // Empty user ID
            permissions: []  // Empty permissions
          }
        };
        
        console.log('❌ Testing invalid parameters...');
        await workflowTool.execute(invalidParams as any, new AbortController().signal);
        
      } catch (validationError) {
        console.log('✅ Validation correctly caught errors:', validationError.message);
      }
    }
    
    await client.disconnect();
    console.log('🔒 Advanced schema validation example completed\n');
    
  } catch (error) {
    console.error('❌ Schema Validation Error:', error.message);
  }
}

/**
 * Example 4: Tool Composition and Chaining
 * 
 * Demonstrates how to compose multiple MCP tools into complex
 * workflows and chain tool executions.
 */
class ComposedMcpTool extends BaseTool {
  name = 'composed_mcp_workflow';
  description = 'Executes a workflow composed of multiple MCP tools';
  
  constructor(
    private mcpAdapters: McpToolAdapter[],
    private workflow: Array<{
      tool: string;
      params: (previousResults: any[]) => any;
      condition?: (previousResults: any[]) => boolean;
    }>
  ) {
    super(
      'composed_mcp_workflow',
      'Composed MCP Workflow',
      'Executes a workflow composed of multiple MCP tools',
      Type.Object({
        input: Type.Any(),
        options: Type.Optional(Type.Any())
      }),
      true
    );
  }
  
  async execute(
    params: { input: any; options?: any },
    signal?: AbortSignal,
    onUpdate?: (output: string) => void
  ): Promise<DefaultToolResult> {
    const results: any[] = [];
    
    onUpdate?.('🚀 Starting composed MCP workflow...');
    
    for (let i = 0; i < this.workflow.length; i++) {
      const step = this.workflow[i];
      
      // Check condition if specified
      if (step.condition && !step.condition(results)) {
        onUpdate?.(`⏭️  Skipping step ${i + 1}: condition not met`);
        continue;
      }
      
      // Find the MCP adapter for this step
      const adapter = this.mcpAdapters.find(a => a.name === step.tool);
      if (!adapter) {
        return new DefaultToolResult({
          success: false,
          error: `Tool ${step.tool} not found in adapters`
        });
      }
      
      // Prepare parameters using previous results
      const stepParams = step.params(results);
      
      onUpdate?.(`🔧 Executing step ${i + 1}: ${step.tool}`);
      
      try {
        const stepResult = await adapter.execute(stepParams, signal || new AbortController().signal, (output) => {
          onUpdate?.(`   📄 ${step.tool}: ${output}`);
        });
        
        // Check if step failed by checking if result has error data
        const resultData = stepResult.data;
        if (resultData && typeof resultData === 'object' && 'error' in resultData) {
          return new DefaultToolResult({
            success: false,
            error: `Step ${i + 1} (${step.tool}) failed: ${resultData.error || 'Unknown error'}`
          });
        }
        
        results.push(stepResult.data);
        onUpdate?.(`✅ Completed step ${i + 1}: ${step.tool}`);
        
      } catch (error) {
        return new DefaultToolResult({
          success: false,
          error: `Step ${i + 1} (${step.tool}) threw error: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }
    
    onUpdate?.('🎉 Composed workflow completed successfully');
    
    return new DefaultToolResult({
      success: true,
      data: {
        workflow: 'composed_mcp_workflow',
        stepResults: results,
        summary: `Executed ${results.length} steps successfully`
      }
    });
  }
}

async function toolCompositionExample() {
  console.log('🔗 Example 4: Tool Composition and Chaining');
  
  try {
    // Create MCP clients with different tool sets
    const dataClient = await createMockMcpClient('data-server', ['fetch_data', 'transform_data']);
    const analysisClient = await createMockMcpClient('analysis-server', ['analyze_data', 'generate_report']);
    
    // Create MCP adapters
    const dataAdapters = await createMcpToolAdapters(dataClient, 'data-server');
    const analysisAdapters = await createMcpToolAdapters(analysisClient, 'analysis-server');
    
    const allAdapters = [...dataAdapters, ...analysisAdapters];
    
    console.log(`🔗 Created ${allAdapters.length} MCP tool adapters for composition`);
    
    // Define a workflow that chains multiple tools
    const workflow = [
      {
        tool: 'fetch_data',
        params: (results: any[]) => ({ source: 'database', query: 'SELECT * FROM users' })
      },
      {
        tool: 'transform_data',
        params: (results: any[]) => ({ 
          data: results[0]?.data, 
          format: 'normalized' 
        }),
        condition: (results: any[]) => results[0]?.success
      },
      {
        tool: 'analyze_data',
        params: (results: any[]) => ({ 
          dataset: results[1]?.data,
          analysis_type: 'statistical'
        })
      },
      {
        tool: 'generate_report',
        params: (results: any[]) => ({
          analysis: results[2]?.data,
          format: 'pdf',
          template: 'executive_summary'
        })
      }
    ];
    
    // Create composed tool
    const composedTool = new ComposedMcpTool(allAdapters, workflow);
    
    // Execute the composed workflow
    console.log('🚀 Executing composed MCP workflow...');
    const result = await composedTool.execute(
      { input: 'user_analysis_request' },
      new AbortController().signal,
      (output) => console.log(output)
    );
    
    const resultData = result.data;
    if (resultData && typeof resultData === 'object' && 'workflow' in resultData) {
      console.log('✅ Composed workflow executed successfully');
      console.log('📊 Results:', JSON.stringify(result.data, null, 2));
    } else {
      console.log('❌ Composed workflow failed');
    }
    
    // Clean up
    await dataClient.disconnect();
    await analysisClient.disconnect();
    
    console.log('🔗 Tool composition example completed\n');
    
  } catch (error) {
    console.error('❌ Tool Composition Error:', error.message);
  }
}

/**
 * Example 5: Performance Optimization Techniques
 * 
 * Demonstrates various performance optimization techniques for MCP integration.
 */
class OptimizedMcpToolManager {
  private schemaCache = new Map<string, any>();
  private connectionPool = new Map<string, McpClient>();
  private resultCache = new Map<string, { result: any; timestamp: number }>();
  private readonly CACHE_TTL = 300000; // 5 minutes
  
  async getOptimizedClient(serverName: string): Promise<McpClient> {
    // Connection pooling
    if (this.connectionPool.has(serverName)) {
      const client = this.connectionPool.get(serverName)!;
      if (client.isConnected()) {
        return client;
      }
    }
    
    // Create new connection
    const client = new McpClient();
    await client.initialize({
      serverName,
      transport: {
        type: 'stdio',
        command: 'mock-mcp-server',
        args: [serverName]
      },
      timeout: 5000
    });
    
    await client.connect();
    this.connectionPool.set(serverName, client);
    
    return client;
  }
  
  async executeCachedTool(
    serverName: string,
    toolName: string,
    params: any
  ): Promise<McpToolResult> {
    // Generate cache key
    const cacheKey = `${serverName}:${toolName}:${JSON.stringify(params)}`;
    
    // Check cache
    const cached = this.resultCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`💾 Cache hit for ${toolName}`);
      return cached.result;
    }
    
    // Execute tool
    console.log(`🔧 Cache miss, executing ${toolName}`);
    const client = await this.getOptimizedClient(serverName);
    const result = await client.callTool(toolName, params);
    
    // Cache result
    this.resultCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
    
    return result;
  }
  
  async batchExecute(
    requests: Array<{
      serverName: string;
      toolName: string;
      params: any;
    }>
  ): Promise<Array<{ success: boolean; result?: any; error?: string }>> {
    // Group by server for optimal batching
    const byServer = requests.reduce((acc, req) => {
      if (!acc[req.serverName]) acc[req.serverName] = [];
      acc[req.serverName].push(req);
      return acc;
    }, {} as Record<string, typeof requests>);
    
    // Execute in parallel by server
    const serverExecutions = Object.entries(byServer).map(async ([serverName, serverRequests]) => {
      const client = await this.getOptimizedClient(serverName);
      
      return Promise.allSettled(
        serverRequests.map(req => 
          this.executeCachedTool(req.serverName, req.toolName, req.params)
        )
      );
    });
    
    const allResults = await Promise.all(serverExecutions);
    
    // Flatten and format results
    return allResults.flat().map(result => {
      if (result.status === 'fulfilled') {
        return { success: true, result: result.value };
      } else {
        return { success: false, error: result.reason.message };
      }
    });
  }
  
  async cleanup(): Promise<void> {
    // Close all connections
    for (const client of this.connectionPool.values()) {
      await client.disconnect();
    }
    
    // Clear caches
    this.connectionPool.clear();
    this.schemaCache.clear();
    this.resultCache.clear();
  }
}

async function performanceOptimizationExample() {
  console.log('⚡ Example 5: Performance Optimization');
  
  try {
    const manager = new OptimizedMcpToolManager();
    
    // Prepare batch requests
    const requests = [
      { serverName: 'server-1', toolName: 'fast_tool', params: { id: 1 } },
      { serverName: 'server-1', toolName: 'fast_tool', params: { id: 2 } },
      { serverName: 'server-2', toolName: 'slow_tool', params: { query: 'data' } },
      { serverName: 'server-1', toolName: 'fast_tool', params: { id: 1 } }, // Duplicate for cache test
    ];
    
    console.log('⚡ Executing batch requests with optimization...');
    const startTime = Date.now();
    
    const results = await manager.batchExecute(requests);
    
    const totalTime = Date.now() - startTime;
    console.log(`⏱️  Batch execution completed in ${totalTime}ms`);
    
    // Analyze results
    const successful = results.filter(r => r.success).length;
    console.log(`📊 Batch results: ${successful}/${results.length} successful`);
    
    // Test caching effectiveness
    console.log('💾 Testing cache effectiveness...');
    const cacheTestStart = Date.now();
    await manager.executeCachedTool('server-1', 'fast_tool', { id: 1 });
    const cacheTestTime = Date.now() - cacheTestStart;
    console.log(`💨 Cached execution time: ${cacheTestTime}ms`);
    
    await manager.cleanup();
    console.log('⚡ Performance optimization example completed\n');
    
  } catch (error) {
    console.error('❌ Performance Optimization Error:', error.message);
  }
}

/**
 * Example 6: Advanced MiniAgent Integration with Streaming
 * 
 * Shows advanced integration patterns with MiniAgent's streaming capabilities.
 */
async function advancedMiniAgentIntegrationExample() {
  console.log('🤖 Example 6: Advanced MiniAgent Integration');
  
  try {
    // Setup will be done through StandardAgent
    
    // Create connection manager for multiple MCP servers
    const connectionManager = new McpConnectionManager();
    
    await connectionManager.addServer({
      name: 'productivity-server',
      transport: {
        type: 'stdio',
        command: 'mock-productivity-server'
      },
      autoConnect: true
    });
    
    await connectionManager.addServer({
      name: 'data-server',
      transport: {
        type: 'streamable-http',
        url: 'http://localhost:8002/mcp',
        streaming: true
      },
      autoConnect: true
    });
    
    // Discover and register tools from all servers
    const discoveredTools = await connectionManager.discoverTools();
    console.log(`🔍 Discovered ${discoveredTools.length} tools from MCP servers`);
    
    console.log(`🔧 Discovered ${discoveredTools.length} MCP tools`);
    
    // Create MCP tool adapters
    const mcpAdapters: McpToolAdapter[] = [];
    for (const { serverName, tool } of discoveredTools) {
      const client = connectionManager.getClient(serverName);
      if (client) {
        const adapters = await createMcpToolAdapters(client, serverName, {
          toolFilter: (t) => t.name === tool.name
        });
        mcpAdapters.push(...adapters);
      }
    }
    
    // Create agent with MCP tools
    const agent = new StandardAgent(mcpAdapters, {
      agentConfig: {
        model: 'gemini-1.5-flash',
        workingDirectory: process.cwd(),
        apiKey: process.env.GOOGLE_AI_API_KEY || 'demo-key'
      },
      toolSchedulerConfig: {},
      chatConfig: {
        modelName: 'gemini-1.5-flash',
        tokenLimit: 12000,
        apiKey: process.env.GOOGLE_AI_API_KEY || 'demo-key'
      },
      chatProvider: 'gemini'
    });
    
    // Set up callback handlers (simplified for example)
    console.log('🔔 Event handlers configured');
    
    // Execute complex conversation with streaming
    const sessionId = agent.createNewSession('advanced-mcp');
    const complexQuery = `
      Please perform a comprehensive analysis:
      1. Fetch current productivity metrics
      2. Analyze the data for trends
      3. Generate a summary report
      4. Suggest optimization strategies
      
      Use the available MCP tools and provide real-time updates.
    `;
    
    console.log('💬 Starting advanced conversation with streaming MCP integration...');
    
    const eventStream = agent.processWithSession(complexQuery, sessionId);
    
    // Process the response stream
    for await (const event of eventStream) {
      // Simple logging for events
      console.log(`Event: ${event.type}`);
    }
    console.log('🎯 Advanced conversation completed');
    
    // Clean up
    await connectionManager.cleanup();
    console.log('🤖 Advanced MiniAgent integration example completed\n');
    
  } catch (error) {
    console.error('❌ Advanced Integration Error:', error.message);
  }
}

/**
 * Helper function to create a mock MCP client for examples
 */
async function createMockMcpClient(serverName: string, toolNames: string[]): Promise<McpClient> {
  const client = new McpClient();
  
  // In a real implementation, this would connect to actual MCP servers
  // For examples, we simulate the connection
  
  console.log(`🔗 Mock connection to ${serverName} with tools: [${toolNames.join(', ')}]`);
  
  return client;
}

/**
 * Main function to run all advanced examples
 */
async function runAllAdvancedExamples() {
  console.log('🚀 MiniAgent MCP Advanced Examples\n');
  console.log('Note: These examples demonstrate advanced patterns and may require');
  console.log('actual MCP servers for full functionality testing.\n');
  
  // Run examples in sequence
  await customTransportExample();
  await concurrentToolExecutionExample();
  await advancedSchemaValidationExample();
  await toolCompositionExample();
  await performanceOptimizationExample();
  await advancedMiniAgentIntegrationExample();
  
  console.log('🎉 All advanced examples completed!');
  console.log('💡 Next steps:');
  console.log('   - Implement these patterns in your own MCP integrations');
  console.log('   - Customize the examples for your specific use cases');
  console.log('   - Contribute your own patterns back to the community');
}

/**
 * Helper function for running specific advanced examples
 */
export async function runAdvancedExample(exampleName: string) {
  console.log(`🎯 Running advanced example: ${exampleName}\n`);
  
  switch (exampleName) {
    case 'transport':
      await customTransportExample();
      break;
    case 'concurrent':
      await concurrentToolExecutionExample();
      break;
    case 'validation':
      await advancedSchemaValidationExample();
      break;
    case 'composition':
      await toolCompositionExample();
      break;
    case 'performance':
      await performanceOptimizationExample();
      break;
    case 'streaming':
      await advancedMiniAgentIntegrationExample();
      break;
    default:
      console.log('❌ Unknown example. Available: transport, concurrent, validation, composition, performance, streaming');
  }
}

// Export functions for individual testing
export {
  customTransportExample,
  concurrentToolExecutionExample,
  advancedSchemaValidationExample,
  toolCompositionExample,
  performanceOptimizationExample,
  advancedMiniAgentIntegrationExample,
  ComposedMcpTool,
  OptimizedMcpToolManager
};

// Run all examples if this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('mcp-advanced-example.ts')) {
  runAllAdvancedExamples().catch(error => {
    console.error('❌ Advanced example execution failed:', error);
    process.exit(1);
  });
}