/**
 * Simple MCP SDK Example
 * 
 * Demonstrates basic MCP functionality:
 * - Connect to test server via stdio
 * - List available tools
 * - Execute a tool
 * - Clean disconnection
 */

import { SimpleMcpClient } from '../src/mcp-sdk/index.js';
import path from 'path';

async function runSimpleMcpExample(): Promise<void> {
  console.log('🚀 Starting Simple MCP Example');
  
  // Create MCP client
  const client = new SimpleMcpClient();
  
  try {
    // Connect to test server via stdio
    console.log('\n📡 Connecting to MCP test server...');
    await client.connect({
      transport: 'stdio',
      stdio: {
        command: 'npx',
        args: ['tsx', path.resolve(__dirname, 'utils/server.ts'), '--stdio']
      }
    });
    
    console.log('✅ Connected to MCP server');
    
    // List available tools
    console.log('\n🔧 Discovering available tools...');
    const tools = await client.listTools();
    
    console.log(`Found ${tools.length} tools:`);
    tools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name} - ${tool.description || 'No description'}`);
    });
    
    // Execute the 'add' tool
    console.log('\n⚡ Executing add tool: 5 + 3');
    const addResult = await client.callTool('add', { a: 5, b: 3 });
    console.log('Result:', addResult.content[0]?.text || 'No result');
    
    // Execute the 'echo' tool
    console.log('\n⚡ Executing echo tool with message');
    const echoResult = await client.callTool('echo', { 
      message: 'Hello from MiniAgent MCP client!' 
    });
    console.log('Result:', echoResult.content[0]?.text || 'No result');
    
    console.log('\n✨ Example completed successfully');
    
  } catch (error) {
    console.error('\n❌ Error in MCP example:', error instanceof Error ? error.message : error);
  } finally {
    // Clean disconnection
    console.log('\n🔌 Disconnecting from MCP server...');
    await client.disconnect();
    console.log('✅ Disconnected');
  }
}

// Run the example
runSimpleMcpExample().catch(console.error);