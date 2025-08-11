/**
 * MCP Integration with StandardAgent Example
 * 
 * Demonstrates how to integrate MCP tools with MiniAgent's StandardAgent:
 * - Connect to MCP test server
 * - Create MCP tool adapters using createMcpTools helper
 * - Integrate MCP tools with StandardAgent
 * - Have a conversation using MCP tools
 */

import { StandardAgent, AllConfig, configureLogger, LogLevel } from '../src/index.js';
import { SimpleMcpClient, createMcpTools } from '../src/mcp-sdk/index.js';
import path from 'path';

// Configure logging
configureLogger({ level: LogLevel.INFO });

async function runMcpAgentExample(): Promise<void> {
  console.log('🚀 Starting MCP + StandardAgent Example');
  
  // Create MCP client
  const mcpClient = new SimpleMcpClient();
  
  try {
    // Connect to test server
    console.log('\n📡 Connecting to MCP test server...');
    await mcpClient.connect({
      transport: 'stdio',
      stdio: {
        command: 'npx',
        args: ['tsx', path.resolve(__dirname, 'utils/server.ts'), '--stdio']
      }
    });
    console.log('✅ Connected to MCP server');
    
    // Create MCP tool adapters
    console.log('\n🔧 Creating MCP tool adapters...');
    const mcpTools = await createMcpTools(mcpClient);
    console.log(`Created ${mcpTools.length} MCP tool adapters:`);
    mcpTools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name} - ${tool.description}`);
    });
    
    // Configure agent with MCP tools
    const config: AllConfig & { chatProvider: 'gemini' } = {
      chatProvider: 'gemini',
      chatConfig: {
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '',
        modelName: 'gemini-1.5-flash',
        maxTokenLimit: 1000000,
        historyTurnLimit: 50
      },
      toolSchedulerConfig: {}
    };
    
    // Create StandardAgent with MCP tools
    console.log('\n🤖 Creating StandardAgent with MCP tools...');
    const agent = new StandardAgent(mcpTools, config);
    
    // Create a session for our conversation
    const sessionId = agent.createSession('MCP Tool Demo');
    console.log(`📝 Created session: ${sessionId}`);
    
    // Test conversation using MCP tools
    const queries = [
      'Please add the numbers 15 and 27 for me.',
      'Can you echo this message: "MCP integration is working great!"',
      'Search for "artificial intelligence" and limit results to 3 items.'
    ];
    
    for (const query of queries) {
      console.log(`\n👤 User: ${query}`);
      console.log('🤖 Assistant: ', { flush: true });
      
      // Process query and stream response
      const eventStream = agent.processWithSession(sessionId, query);
      
      for await (const event of eventStream) {
        if (event.type === 'text_chunk_delta') {
          process.stdout.write(event.chunk.content);
        } else if (event.type === 'tool_call_start') {
          console.log(`\n🔧 Calling tool: ${event.toolCall.name}`);
        } else if (event.type === 'tool_call_complete') {
          console.log(`✅ Tool completed: ${event.toolCall.name}`);
        } else if (event.type === 'text_chunk_done') {
          console.log('\n');
        }
      }
    }
    
    // Show final session stats
    const session = agent.getSession(sessionId);
    if (session) {
      console.log('\n📊 Session Statistics:');
      console.log(`  - Messages: ${session.messageHistory.length}`);
      console.log(`  - Total tokens: ${session.tokenUsage.totalTokens}`);
      console.log(`  - Input tokens: ${session.tokenUsage.totalInputTokens}`);
      console.log(`  - Output tokens: ${session.tokenUsage.totalOutputTokens}`);
    }
    
    console.log('\n✨ MCP + Agent integration example completed successfully');
    
  } catch (error) {
    console.error('\n❌ Error in MCP agent example:', error instanceof Error ? error.message : error);
  } finally {
    // Clean disconnection
    console.log('\n🔌 Disconnecting from MCP server...');
    await mcpClient.disconnect();
    console.log('✅ Disconnected');
  }
}

// Check for required API key
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_AI_API_KEY) {
  console.error('❌ Please set GEMINI_API_KEY or GOOGLE_AI_API_KEY environment variable');
  process.exit(1);
}

// Run the example
runMcpAgentExample().catch(console.error);