/**
 * Dynamic MCP Server Management Example
 * 
 * Demonstrates advanced MCP features with StandardAgent:
 * - Dynamic server addition and removal
 * - Tool refresh and status monitoring
 * - Runtime server configuration
 * - Error handling and recovery
 * - Different naming strategies
 */

import { StandardAgent, AllConfig, configureLogger, LogLevel, McpServerConfig, AgentEventType } from '../src/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Configure logging
configureLogger({ level: LogLevel.INFO });

async function runDynamicMcpExample(): Promise<void> {
  console.log('🚀 Starting Dynamic MCP Management Example');
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  try {
    // Configure StandardAgent with MCP enabled but no initial servers
    const config: AllConfig & { chatProvider: 'gemini' } = {
      chatProvider: 'gemini',
      agentConfig: {
        model: 'gemini-1.5-flash',
        workingDirectory: process.cwd(),
        mcp: {
          enabled: true,
          servers: [], // Start with no servers
          autoDiscoverTools: true,
          toolNamingStrategy: 'prefix',
          toolNamePrefix: 'server'
        }
      },
      chatConfig: {
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '',
        modelName: 'gemini-1.5-flash',
        tokenLimit: 1000000,
      },
      toolSchedulerConfig: {}
    };
    
    // Create StandardAgent with empty MCP configuration
    console.log('\n🤖 Creating StandardAgent with empty MCP configuration...');
    const agent = new StandardAgent([], config);
    
    console.log('\n📊 Initial State:');
    console.log(`  - Connected servers: ${agent.listMcpServers().length}`);
    console.log(`  - Available MCP tools: ${agent.getMcpTools().length}`);
    
    // Add first server dynamically
    console.log('\n➕ Adding first MCP server dynamically...');
    
    const server1Config: McpServerConfig = {
      name: 'math-server',
      transport: 'stdio',
      command: 'npx',
      args: ['tsx', path.resolve(__dirname, 'utils/server.ts'), '--stdio']
    };
    
    try {
      const tools1 = await agent.addMcpServer(server1Config);
      console.log(`✅ Successfully added '${server1Config.name}' with ${tools1.length} tools:`);
      tools1.forEach((tool, index) => {
        console.log(`  ${index + 1}. ${tool.name} - ${tool.description}`);
      });
    } catch (error) {
      console.error(`❌ Failed to add server '${server1Config.name}':`, error);
    }
    
    // Check server status
    console.log('\n📊 Server Status After Adding First Server:');
    const servers = agent.listMcpServers();
    console.log(`  - Connected servers: ${servers.join(', ')}`);
    
    for (const serverName of servers) {
      const status = agent.getMcpServerStatus(serverName);
      if (status) {
        console.log(`  - ${serverName}: ${status.connected ? '✅ Connected' : '❌ Disconnected'} (${status.toolCount} tools)`);
      }
    }
    
    // Test the tools with a conversation
    console.log('\n💬 Testing MCP tools with a conversation...');
    const sessionId = agent.createNewSession('Dynamic MCP Demo');
    
    const testQuery = 'Can you add 10 and 20 using the available tools?';
    console.log(`\n👤 User: ${testQuery}`);
    console.log('🤖 Assistant: ', { flush: true });
    
    const eventStream = agent.processWithSession(testQuery, sessionId);
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
    
    // Demonstrate tool refresh
    console.log('\n🔄 Refreshing tools from all servers...');
    const refreshedTools = await agent.refreshMcpTools();
    console.log(`Refreshed ${refreshedTools.length} tools total`);
    
    // Show specific server tools
    console.log('\n🔧 Tools from math-server:');
    const mathServerTools = agent.getMcpTools('math-server');
    mathServerTools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name} - ${tool.description}`);
    });
    
    // Demonstrate server removal
    console.log('\n➖ Removing math-server...');
    const removalSuccess = await agent.removeMcpServer('math-server');
    console.log(`Server removal ${removalSuccess ? 'successful' : 'failed'}`);
    
    // Check final state
    console.log('\n📊 Final State:');
    console.log(`  - Connected servers: ${agent.listMcpServers().length}`);
    console.log(`  - Available MCP tools: ${agent.getMcpTools().length}`);
    
    // Demonstrate error handling with invalid server
    console.log('\n⚠️  Demonstrating error handling with invalid server...');
    const invalidServerConfig: McpServerConfig = {
      name: 'invalid-server',
      transport: 'stdio',
      command: 'nonexistent-command'
    };
    
    try {
      await agent.addMcpServer(invalidServerConfig);
      console.log('❌ Unexpectedly succeeded with invalid server');
    } catch (error) {
      console.log(`✅ Expected error caught: ${error instanceof Error ? error.message : error}`);
    }
    
    // Show session statistics
    const session = agent.getSessionManager().getSession(sessionId);
    if (session) {
      console.log('\n📊 Session Statistics:');
      console.log(`  - Messages: ${session.messageHistory.length}`);
      console.log(`  - Total tokens: ${session.tokenUsage.totalTokens}`);
    }
    
    console.log('\n✨ Dynamic MCP management example completed successfully');
    
  } catch (error) {
    console.error('\n❌ Error in dynamic MCP example:', error instanceof Error ? error.message : error);
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
runDynamicMcpExample().catch(console.error);