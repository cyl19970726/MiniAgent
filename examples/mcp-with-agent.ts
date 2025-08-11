/**
 * MCP Integration with StandardAgent Example
 * 
 * Demonstrates how to use StandardAgent's built-in MCP support:
 * - Configure MCP in agentConfig
 * - Connect to MCP test server automatically
 * - Use addMcpServer/removeMcpServer methods
 * - Show tool discovery and usage
 * - Dynamic server management
 */

import { StandardAgent, AllConfig, configureLogger, LogLevel, McpServerConfig, AgentEventType } from '../src/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Configure logging
configureLogger({ level: LogLevel.INFO });

async function runMcpAgentExample(): Promise<void> {
  console.log('🚀 Starting MCP + StandardAgent Integration Example');
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  try {
    // Configure StandardAgent with built-in MCP support
    const config: AllConfig & { chatProvider: 'gemini' } = {
      chatProvider: 'gemini',
      agentConfig: {
        model: 'gemini-1.5-flash',
        workingDirectory: process.cwd(),
        mcp: {
          enabled: true,
          servers: [
            {
              name: 'test-server',
              transport: 'stdio',
              command: 'npx',
              args: ['tsx', path.resolve(__dirname, 'utils/server.ts'), '--stdio']
            }
          ],
          autoDiscoverTools: true,
          toolNamingStrategy: 'prefix',
          toolNamePrefix: 'mcp'
        }
      },
      chatConfig: {
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '',
        modelName: 'gemini-1.5-flash',
        tokenLimit: 1000000
      },
      toolSchedulerConfig: {}
    };
    
    // Create StandardAgent with built-in MCP support
    console.log('\n🤖 Creating StandardAgent with MCP configuration...');
    const agent = new StandardAgent([], config); // No native tools for this example
    
    // Wait a moment for MCP server initialization
    console.log('\n⏳ Waiting for MCP server initialization...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check MCP server status
    console.log('\n📊 MCP Server Status:');
    const servers = agent.listMcpServers();
    console.log(`  - Connected servers: ${servers.join(', ')}`);
    
    for (const serverName of servers) {
      const status = agent.getMcpServerStatus(serverName);
      if (status) {
        console.log(`  - ${serverName}: ${status.connected ? '✅ Connected' : '❌ Disconnected'} (${status.toolCount} tools)`);
      }
    }
    
    // List discovered MCP tools
    console.log('\n🔧 Discovered MCP Tools:');
    const mcpTools = agent.getMcpTools();
    mcpTools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name} - ${tool.description}`);
    });
    
    // Create a session for our conversation
    const sessionId = agent.createNewSession('MCP Tool Demo');
    console.log(`\n📝 Created session: ${sessionId}`);
    
    // Test conversation using MCP tools
    const queries = [
      'Please add the numbers 15 and 27 for me using the available tools.',
      'Can you echo this message: "MCP integration with StandardAgent is working great!"',
      'Search for "artificial intelligence" and limit results to 3 items.'
    ];
    
    for (const query of queries) {
      console.log(`\n👤 User: ${query}`);
      console.log('🤖 Assistant: ', { flush: true });
      
      // Process query and stream response
      const eventStream = agent.processWithSession(query, sessionId);
      
      for await (const event of eventStream) {
        if (event.type === AgentEventType.ResponseChunkTextDelta) {
          process.stdout.write((event.data as any)?.content || '');
        } else if (event.type === AgentEventType.ToolExecutionStart) {
          console.log(`\n🔧 Calling tool: ${(event.data as any)?.name || 'unknown'}`);
        } else if (event.type === AgentEventType.ToolExecutionDone) {
          console.log(`✅ Tool completed: ${(event.data as any)?.name || 'unknown'}`);
        } else if (event.type === AgentEventType.ResponseComplete) {
          console.log('\n');
        }
      }
    }
    
    // Demonstrate dynamic server management
    console.log('\n🔄 Demonstrating Dynamic Server Management...');
    
    // Try to add another server (this will fail since the server doesn't exist, but shows the API)
    console.log('\n➕ Adding a second MCP server...');
    try {
      const newServerConfig: McpServerConfig = {
        name: 'dynamic-server',
        transport: 'stdio',
        command: 'nonexistent-server'
      };
      
      await agent.addMcpServer(newServerConfig);
      console.log('✅ Successfully added dynamic server');
    } catch (error) {
      console.log(`⚠️  Expected error adding nonexistent server: ${error instanceof Error ? error.message : error}`);
    }
    
    // Refresh tools from existing servers
    console.log('\n🔄 Refreshing tools from existing servers...');
    const refreshedTools = await agent.refreshMcpTools();
    console.log(`Refreshed ${refreshedTools.length} tools`);
    
    // Show final session stats
    const session = agent.getSessionManager().getSession(sessionId);
    if (session) {
      console.log('\n📊 Session Statistics:');
      console.log(`  - Messages: ${session.messageHistory.length}`);
      console.log(`  - Total tokens: ${session.tokenUsage.totalTokens}`);
      console.log(`  - Input tokens: ${session.tokenUsage.totalInputTokens}`);
      console.log(`  - Output tokens: ${session.tokenUsage.totalOutputTokens}`);
    }
    
    console.log('\n✨ StandardAgent MCP integration example completed successfully');
    
  } catch (error) {
    console.error('\n❌ Error in MCP agent example:', error instanceof Error ? error.message : error);
  } finally {
    console.log('\n🏁 Example finished');
  }
}

// Check for required API key
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_AI_API_KEY) {
  console.error('❌ Please set GEMINI_API_KEY or GOOGLE_AI_API_KEY environment variable');
  process.exit(1);
}

// Run the example
runMcpAgentExample().catch(console.error);