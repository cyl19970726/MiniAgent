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
import * as dotenv from 'dotenv';
import { LLMChunkTextDelta, LLMChunkTextDone } from '../src/interfaces.js';

dotenv.config();

// Configure logging
configureLogger({ level: LogLevel.INFO });

async function runMcpAgentExample(): Promise<void> {
  console.log('🚀 Starting MCP + StandardAgent Integration Example');
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  try {
    // Configure StandardAgent with built-in MCP support using OpenAI o1
    const config: AllConfig & { chatProvider: 'openai' } = {
      chatProvider: 'openai',
      agentConfig: {
        model: 'o1',
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
        apiKey: process.env.OPENAI_API_KEY || '',
        modelName: 'o1',
        tokenLimit: 128000
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
    const mcpTools = agent.getToolList();
    mcpTools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name} - ${tool.description}`);
    });
    
    // Create a session for our conversation
    const sessionId = agent.createNewSession('MCP Tool Demo');
    console.log(`\n📝 Created session: ${sessionId}`);
    
    // Test conversation using MCP tools
    const queries = [
      'hi,I am hhh',
    ];
    
    for (const query of queries) {
      console.log(`\n👤 User: ${query}`);
      
      // Process query and stream response
      const eventStream = agent.processWithSession(query, sessionId);
      
      for await (const event of eventStream) {
        switch (event.type) {
          case AgentEventType.UserMessage:
            console.log(`👤 [openai] User message:`, event.data);
            break;
          case AgentEventType.TurnComplete:
            console.log(`🛞 [openai] Turn complete:`, event.data);
            break;
          case AgentEventType.ToolExecutionStart:
            const toolStartData = event.data as any;
            console.log(`\n🔧 [openai] Tool started: ${toolStartData.toolName}`);
            console.log(`   Args: ${JSON.stringify(toolStartData.args)}`);
            break;
          case AgentEventType.ToolExecutionDone:
            const toolDoneData = event.data as any;
            const status = toolDoneData.error ? 'failed' : 'completed';
            console.log(`🔧 [openai] Tool ${status}: ${toolDoneData.toolName}`);
            if (toolDoneData.error) {
              console.log(`   Error: ${toolDoneData.error}`);
            } else if (toolDoneData.result) {
              console.log(`   Result: ${toolDoneData.result}`);
            }
            break;
          case AgentEventType.Error:
            const errorData = event.data as any;
            console.error(`❌  Error: ${errorData.message}`);
            break;
          // Handle LLM Response events
          case AgentEventType.ResponseChunkTextDelta:
            const deltaData = event.data as LLMChunkTextDelta;
            console.log(`\n📝  Text Delta Event:`, deltaData.content.text_delta);
            break;
          case AgentEventType.ResponseChunkTextDone:
            const textDoneData = event.data as LLMChunkTextDone;
            console.log(`🤖  Complete Response: "${textDoneData.content.text}"`);
            break;
          case AgentEventType.ResponseComplete:
            console.log(`✅  LLM Response complete`);
            break;
          case AgentEventType.ResponseFailed:
            const failedData = event.data as any;
            console.error(`❌  LLM Response failed:`, failedData);
            break;
          default:
            break;
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
if (!process.env.OPENAI_API_KEY ) {
  console.error('❌ Please set OPENAI_API_KEY environment variable');
  process.exit(1);
}

// Run the example
runMcpAgentExample().catch(console.error);