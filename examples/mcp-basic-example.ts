/**
 * @fileoverview Basic MCP Integration Example for MiniAgent
 * 
 * This example demonstrates the fundamental usage patterns of MCP (Model Context Protocol)
 * integration with MiniAgent, including:
 * - Connecting to MCP servers via STDIO and HTTP transports
 * - Basic tool discovery and execution
 * - Schema validation and error handling
 * - Integration with MiniAgent's StandardAgent
 * 
 * Prerequisites:
 * - An MCP server binary or HTTP endpoint
 * - Basic understanding of MiniAgent's tool system
 */

import { StandardAgent } from '../src/standardAgent.js';
import { 
  McpClient, 
  McpConnectionManager, 
  createMcpToolAdapters
} from '../src/mcp/index.js';
import { 
  McpStdioTransportConfig, 
  McpStreamableHttpTransportConfig,
  McpServerConfig 
} from '../src/mcp/interfaces.js';

/**
 * Example 1: Basic STDIO Connection
 * 
 * This example shows how to connect to an MCP server running as a subprocess
 * via STDIO transport (most common for local development).
 */
async function basicStdioExample() {
  console.log('🔌 Example 1: Basic STDIO Connection');
  
  try {
    // 1. Create MCP client with STDIO transport
    const client = new McpClient();
    
    const stdioConfig: McpStdioTransportConfig = {
      type: 'stdio',
      command: 'python',  // Example: Python MCP server
      args: ['-m', 'your_mcp_server'],  // Replace with actual server module
      env: {
        ...process.env,
        MCP_DEBUG: 'true'
      }
    };
    
    await client.initialize({
      serverName: 'example-stdio-server',
      transport: stdioConfig,
      timeout: 10000,
      requestTimeout: 5000
    });
    
    // 2. Connect to server
    await client.connect();
    console.log('✅ Connected to MCP server via STDIO');
    
    // 3. Get server information
    const serverInfo = await client.getServerInfo();
    console.log('Server Info:', {
      name: serverInfo.name,
      version: serverInfo.version,
      hasTools: !!serverInfo.capabilities.tools,
      hasResources: !!serverInfo.capabilities.resources
    });
    
    // 4. Discover available tools
    const tools = await client.listTools(true); // Cache schemas for performance
    console.log(`📋 Discovered ${tools.length} tools:`);
    tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    
    // 5. Execute a simple tool (assuming a 'echo' tool exists)
    if (tools.some(tool => tool.name === 'echo')) {
      const result = await client.callTool('echo', { message: 'Hello from MiniAgent!' });
      console.log('🔧 Tool execution result:', result.content[0]?.text);
    }
    
    // 6. Clean up
    await client.disconnect();
    console.log('🔌 Disconnected from STDIO server\n');
    
  } catch (error) {
    console.error('❌ STDIO Example Error:', error.message);
  }
}

/**
 * Example 2: Basic HTTP Connection
 * 
 * This example shows how to connect to an MCP server over HTTP
 * using the streamable HTTP transport.
 */
async function basicHttpExample() {
  console.log('🌐 Example 2: Basic HTTP Connection');
  
  try {
    // 1. Create MCP client with HTTP transport
    const client = new McpClient();
    
    const httpConfig: McpStreamableHttpTransportConfig = {
      type: 'streamable-http',
      url: 'http://localhost:8000/mcp',  // Replace with actual server URL
      headers: {
        'User-Agent': 'MiniAgent-MCP/1.0',
        'Content-Type': 'application/json'
      },
      streaming: true,  // Enable streaming responses
      timeout: 10000,
      keepAlive: true
    };
    
    await client.initialize({
      serverName: 'example-http-server',
      transport: httpConfig,
      timeout: 15000,
      requestTimeout: 8000
    });
    
    // 2. Connect to server
    await client.connect();
    console.log('✅ Connected to MCP server via HTTP');
    
    // 3. Discover and list tools
    const tools = await client.listTools(true);
    console.log(`📋 HTTP server has ${tools.length} tools available`);
    
    // 4. Execute a tool with parameters
    if (tools.length > 0) {
      const firstTool = tools[0];
      console.log(`🔧 Executing tool: ${firstTool.name}`);
      
      // Basic parameter validation
      const schemaManager = client.getSchemaManager();
      const validationResult = await schemaManager.validateToolParams(
        firstTool.name, 
        { /* your parameters here */ }
      );
      
      if (validationResult.success) {
        const result = await client.callTool(firstTool.name, validationResult.data);
        console.log('✅ Tool executed successfully');
      } else {
        console.log('❌ Parameter validation failed:', validationResult.errors);
      }
    }
    
    // 5. Clean up
    await client.disconnect();
    console.log('🌐 Disconnected from HTTP server\n');
    
  } catch (error) {
    console.error('❌ HTTP Example Error:', error.message);
    // Note: HTTP connection might fail if no server is running
    console.log('💡 Make sure your MCP HTTP server is running on localhost:8000');
  }
}

/**
 * Example 3: Connection Manager Usage
 * 
 * This example shows how to use the McpConnectionManager to manage
 * multiple MCP servers simultaneously.
 */
async function connectionManagerExample() {
  console.log('🎛️  Example 3: Connection Manager Usage');
  
  try {
    // 1. Create connection manager
    const connectionManager = new McpConnectionManager();
    
    // 2. Configure multiple servers
    const servers: McpServerConfig[] = [
      {
        name: 'filesystem-server',
        transport: {
          type: 'stdio',
          command: 'mcp-server-filesystem',  // Hypothetical filesystem MCP server
          args: ['--root', '/tmp/mcp-workspace']
        },
        autoConnect: true,
        healthCheckInterval: 30000
      },
      {
        name: 'web-server',
        transport: {
          type: 'streamable-http',
          url: 'http://localhost:8001/mcp',
          streaming: true
        },
        autoConnect: false  // Connect manually
      }
    ];
    
    // 3. Add servers to manager
    for (const serverConfig of servers) {
      await connectionManager.addServer(serverConfig);
      console.log(`➕ Added server: ${serverConfig.name}`);
    }
    
    // 4. Connect to specific server
    await connectionManager.connectServer('web-server');
    
    // 5. Check server statuses
    const statuses = connectionManager.getAllServerStatuses();
    console.log('📊 Server Statuses:');
    statuses.forEach((status, name) => {
      console.log(`  ${name}: ${status.status} (${status.toolCount || 0} tools)`);
    });
    
    // 6. Discover all tools from all connected servers
    const allTools = await connectionManager.discoverTools();
    console.log(`🔍 Total tools discovered: ${allTools.length}`);
    
    // Group tools by server
    const toolsByServer = allTools.reduce((acc, { serverName, tool }) => {
      if (!acc[serverName]) acc[serverName] = [];
      acc[serverName].push(tool.name);
      return acc;
    }, {} as Record<string, string[]>);
    
    Object.entries(toolsByServer).forEach(([server, toolNames]) => {
      console.log(`  ${server}: [${toolNames.join(', ')}]`);
    });
    
    // 7. Health check all servers
    const healthResults = await connectionManager.healthCheck();
    console.log('❤️  Health Check Results:');
    healthResults.forEach((isHealthy, serverName) => {
      console.log(`  ${serverName}: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    });
    
    // 8. Clean up
    await connectionManager.cleanup();
    console.log('🧹 Cleaned up all connections\n');
    
  } catch (error) {
    console.error('❌ Connection Manager Error:', error.message);
  }
}

/**
 * Example 4: MCP Tools with MiniAgent Integration
 * 
 * This example shows how to integrate MCP tools with MiniAgent's
 * StandardAgent for complete AI assistant functionality.
 */
async function miniAgentIntegrationExample() {
  console.log('🤖 Example 4: MiniAgent Integration');
  
  try {
    // 1. Setup will be done through StandardAgent
    
    // 2. Create MCP client and connect
    const mcpClient = new McpClient();
    
    await mcpClient.initialize({
      serverName: 'assistant-tools',
      transport: {
        type: 'stdio',
        command: 'python',
        args: ['-m', 'example_mcp_server'],  // Replace with actual server
      },
      timeout: 10000
    });
    
    await mcpClient.connect();
    console.log('✅ MCP server connected for MiniAgent integration');
    
    // 3. Discover and create MCP tool adapters
    const mcpAdapters = await createMcpToolAdapters(
      mcpClient,
      'assistant-tools'
    );
    
    console.log(`🔧 Created ${mcpAdapters.length} MCP tool adapters`);
    
    // 4. Create StandardAgent with MCP tools
    const agent = new StandardAgent(mcpAdapters, {
      agentConfig: {
        model: 'gemini-1.5-flash',
        workingDirectory: process.cwd(),
        apiKey: process.env.GOOGLE_AI_API_KEY || 'your-api-key-here'
      },
      toolSchedulerConfig: {},
      chatConfig: {
        modelName: 'gemini-1.5-flash',
        tokenLimit: 8192,
        apiKey: process.env.GOOGLE_AI_API_KEY || 'your-api-key-here'
      },
      chatProvider: 'gemini'
    });
    
    // 5. Start a conversation that uses MCP tools
    const sessionId = agent.createNewSession('mcp-demo');
    
    console.log('💬 Starting conversation with MCP-enhanced agent...');
    
    // Example conversation that might use MCP tools
    const responses = agent.processWithSession(
      'Please check the current weather in San Francisco and create a summary file.',
      sessionId
    );
    
    // 6. Process the response stream
    for await (const event of responses) {
      // Simple logging for events
      console.log(`Event: ${event.type}`);
    }
    console.log('💬 Conversation completed');
    
    // 7. Clean up
    await mcpClient.disconnect();
    console.log('🤖 MiniAgent integration example completed\n');
    
  } catch (error) {
    console.error('❌ MiniAgent Integration Error:', error.message);
  }
}

/**
 * Example 5: Error Handling and Resilience
 * 
 * This example demonstrates proper error handling and resilience
 * patterns when working with MCP servers.
 */
async function errorHandlingExample() {
  console.log('🛡️  Example 5: Error Handling and Resilience');
  
  const client = new McpClient();
  
  // 1. Set up error handlers
  client.onError((error) => {
    console.log('🚨 MCP Client Error:', {
      message: error.message,
      code: error.code,
      server: error.serverName,
      tool: error.toolName
    });
  });
  
  client.onDisconnect(() => {
    console.log('🔌 MCP server disconnected - attempting reconnection...');
  });
  
  try {
    // 2. Try connecting to a potentially unavailable server
    await client.initialize({
      serverName: 'unreliable-server',
      transport: {
        type: 'stdio',
        command: 'nonexistent-command'  // This will fail
      },
      timeout: 5000,
      maxRetries: 3,
      retryDelay: 1000
    });
    
    await client.connect();
    
  } catch (error) {
    console.log('❌ Expected connection failure:', error.message);
    
    // 3. Demonstrate fallback strategy
    console.log('🔄 Attempting fallback connection...');
    
    try {
      // Try with a working configuration
      await client.initialize({
        serverName: 'fallback-server',
        transport: {
          type: 'stdio',
          command: 'echo',  // Simple command that exists
          args: ['{"jsonrpc":"2.0","id":1,"result":{"capabilities":{}}}']
        },
        timeout: 3000
      });
      
      console.log('✅ Fallback connection strategy worked');
      
    } catch (fallbackError) {
      console.log('❌ Fallback also failed:', fallbackError.message);
    }
  } finally {
    // 4. Always clean up
    try {
      await client.disconnect();
    } catch (disconnectError) {
      console.log('⚠️  Clean disconnect failed (this is normal for failed connections)');
    }
  }
  
  console.log('🛡️  Error handling example completed\n');
}

/**
 * Main function to run all examples
 */
async function runAllExamples() {
  console.log('🚀 MiniAgent MCP Basic Examples\n');
  console.log('Note: Some examples may fail if MCP servers are not available.');
  console.log('This is expected and demonstrates error handling.\n');
  
  // Run examples in sequence
  await basicStdioExample();
  await basicHttpExample();
  await connectionManagerExample();
  await miniAgentIntegrationExample();
  await errorHandlingExample();
  
  console.log('🎉 All basic examples completed!');
  console.log('💡 Next steps:');
  console.log('   - Check out mcp-advanced-example.ts for more complex patterns');
  console.log('   - Read src/mcp/README.md for comprehensive documentation');
  console.log('   - Set up actual MCP servers to test with real tools');
}

/**
 * Helper function for quick testing with a specific example
 */
export async function runExample(exampleName: string) {
  console.log(`🎯 Running specific example: ${exampleName}\n`);
  
  switch (exampleName) {
    case 'stdio':
      await basicStdioExample();
      break;
    case 'http':
      await basicHttpExample();
      break;
    case 'manager':
      await connectionManagerExample();
      break;
    case 'integration':
      await miniAgentIntegrationExample();
      break;
    case 'errors':
      await errorHandlingExample();
      break;
    default:
      console.log('❌ Unknown example. Available: stdio, http, manager, integration, errors');
  }
}

// Export functions for individual testing
export {
  basicStdioExample,
  basicHttpExample,
  connectionManagerExample,
  miniAgentIntegrationExample,
  errorHandlingExample
};

// Run all examples if this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('mcp-basic-example.ts')) {
  runAllExamples().catch(error => {
    console.error('❌ Example execution failed:', error);
    process.exit(1);
  });
}