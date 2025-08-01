/**
 * @fileoverview MCP Integration Example
 * 
 * This example demonstrates how to use MCP (Model Context Protocol) integration
 * with the MiniAgent framework. It shows how to configure MCP servers,
 * load tools, and use them in agent conversations.
 */

import { 
  createMCPAgent,
  MCPAgentConfig,
  MCPConfigHelpers,
  AgentEventType,
  LogLevel,
  BaseTool,
  ToolResult,
  Type,
} from '../src/index.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Example custom tool to demonstrate mixed tool usage
 */
class CalculatorTool extends BaseTool<{ operation: string; a: number; b: number }> {
  constructor() {
    super(
      'calculator',
      'Calculator Tool',
      'Perform basic mathematical operations',
      {
        type: Type.OBJECT,
        properties: {
          operation: {
            type: Type.STRING,
            description: 'Mathematical operation: add, subtract, multiply, divide',
            enum: ['add', 'subtract', 'multiply', 'divide'],
          },
          a: {
            type: Type.NUMBER,
            description: 'First number',
          },
          b: {
            type: Type.NUMBER,
            description: 'Second number',
          },
        },
        required: ['operation', 'a', 'b'],
      }
    );
  }

  validateToolParams(params: { operation: string; a: number; b: number }): string | null {
    const validOps = ['add', 'subtract', 'multiply', 'divide'];
    if (!validOps.includes(params.operation)) {
      return `Invalid operation. Must be one of: ${validOps.join(', ')}`;
    }
    
    if (params.operation === 'divide' && params.b === 0) {
      return 'Cannot divide by zero';
    }
    
    return null;
  }

  async execute(
    params: { operation: string; a: number; b: number },
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<ToolResult> {
    updateOutput?.(`Calculating: ${params.a} ${params.operation} ${params.b}`);
    
    let result: number;
    switch (params.operation) {
      case 'add':
        result = params.a + params.b;
        break;
      case 'subtract':
        result = params.a - params.b;
        break;
      case 'multiply':
        result = params.a * params.b;
        break;
      case 'divide':
        result = params.a / params.b;
        break;
      default:
        throw new Error(`Unknown operation: ${params.operation}`);
    }

    return this.createResult(
      `Result: ${result}`,
      `🧮 ${params.a} ${params.operation} ${params.b} = ${result}`,
      `Calculator: ${params.operation} operation completed`
    );
  }
}

/**
 * Main example function
 */
async function runMCPExample(): Promise<void> {
  console.log('🚀 Starting MCP Integration Example');
  
  try {
    // Create MCP configuration
    const mcpConfig: MCPAgentConfig = {
      // Standard agent configuration
      agentConfig: {
        model: 'gemini-2.0-flash',
        workingDirectory: process.cwd(),
        apiKey: process.env.GEMINI_API_KEY,
        sessionId: 'mcp-example-session',
        maxHistoryTokens: 100000,
        logLevel: LogLevel.DEBUG,
      },
      
      // Chat configuration  
      chatConfig: {
        apiKey: process.env.GEMINI_API_KEY!,
        modelName: 'gemini-2.0-flash',
        tokenLimit: 100000,
        systemPrompt: 'You are a helpful assistant with access to filesystem tools, git operations, and calculation capabilities. Use the available tools to help users with their requests.',
      },
      
      // Tool scheduler configuration
      toolSchedulerConfig: {
        approvalMode: 'yolo', // Auto-approve for demo
        outputUpdateHandler: (callId, output) => {
          console.log(`🔧 Tool Output [${callId}]: ${output}`);
        },
        onAllToolCallsComplete: (completedCalls) => {
          console.log(`✅ Completed ${completedCalls.length} tool calls`);
        },
      },
      
      // MCP configuration
      mcpConfig: {
        servers: [
          // Filesystem server - allows file operations in current directory
          MCPConfigHelpers.createFilesystemServer(
            'filesystem',
            process.cwd(),
            false // enabled
          ),
          
          // Git server - allows git operations
          MCPConfigHelpers.createGitServer(
            'git',
            process.cwd(),
            false // enabled
          ),
          
          // Example of custom server configuration
          {
            name: 'custom-server',
            command: 'echo', // This is just a placeholder - won't actually work
            args: ['Hello from custom server'],
            disabled: true, // Disabled for demo
          },
        ],
        timeout: 30000,
        retryAttempts: 3,
        logLevel: LogLevel.INFO,
        autoRestart: true,
        maxConcurrentTools: 5,
      },
    };

    console.log('📝 Configuration created');

    // Create regular tools
    const regularTools = [
      new CalculatorTool(),
    ];

    // Create MCP-enabled agent
    console.log('🔧 Creating MCP Agent...');
    const agent = await createMCPAgent(regularTools, mcpConfig);
    
    console.log('✅ MCP Agent created successfully');

    // Get status to show available tools
    const status = agent.getMCPStatus();
    console.log('\n📊 MCP Status:');
    console.log(`  - MCP Enabled: ${status.mcpEnabled}`);
    console.log(`  - Tools Loaded: ${status.toolsLoaded}`);
    console.log(`  - Total Servers: ${status.serverStatus.totalServers}`);
    console.log(`  - Running Servers: ${status.serverStatus.runningServers}`);
    console.log(`  - Failed Servers: ${status.serverStatus.failedServers}`);
    console.log(`  - Total Tools: ${status.serverStatus.totalTools}`);
    console.log(`  - MCP Tools: ${status.mcpTools.length}`);

    // List all available tools
    const allTools = agent.getToolList();
    console.log(`\n🛠️  Available Tools (${allTools.length}):`);
    allTools.forEach((tool, index) => {
      const isMCP = 'serverName' in tool;
      const prefix = isMCP ? '📡 MCP' : '🔧 Regular';
      console.log(`  ${index + 1}. ${prefix}: ${tool.name} - ${tool.description}`);
    });

    // Example interactions
    const examples = [
      'Calculate 15 + 27',
      'List the files in the current directory',
      'Show the git status of this repository',
      'Create a simple text file called "test.txt" with the content "Hello MCP!"',
    ];

    for (const [index, userInput] of examples.entries()) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📝 Example ${index + 1}: ${userInput}`);
      console.log(`${'='.repeat(60)}`);

      // Process the user input
      const abortController = new AbortController();
      
      // Set a timeout for each example
      setTimeout(() => {
        console.log('⏰ Timeout reached, aborting...');
        abortController.abort();
      }, 60000); // 60 second timeout

      console.log(`👤 User: ${userInput}`);
      console.log('🤖 Assistant: ');

      try {
        for await (const event of agent.process(
          [{
            role: 'user',
            content: { type: 'text', text: userInput },
            metadata: { sessionId: 'mcp-example-session' }
          }],
          'mcp-example-session',
          abortController.signal
        )) {
          switch (event.type) {
            case AgentEventType.ResponseChunkTextDelta:
              // Stream assistant response
              process.stdout.write((event.data as any).content.text);
              break;
              
            case AgentEventType.ResponseChunkTextDone:
              // Complete text response
              console.log('\n');
              break;

            case AgentEventType.ToolExecutionStart:
              console.log(`🔧 Executing tool: ${(event.data as any).toolName}`);
              break;

            case AgentEventType.ToolExecutionDone:
              const toolData = event.data as any;
              if (toolData.error) {
                console.log(`❌ Tool failed: ${toolData.error}`);
              } else {
                console.log(`✅ Tool completed: ${toolData.toolName}`);
              }
              break;

            case AgentEventType.TurnComplete:
              console.log('🔄 Turn completed\n');
              break;

            case AgentEventType.Error:
              console.error(`❌ Error: ${(event.data as any).message}`);
              break;
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          console.log('⏰ Example timed out');
        } else {
          console.error(`❌ Error in example: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Brief pause between examples
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Demonstrate MCP server management
    console.log(`\n${'='.repeat(60)}`);
    console.log('🔄 Demonstrating Server Management');
    console.log(`${'='.repeat(60)}`);

    // Show current server status
    const servers = agent.getMCPManager().getServers();
    console.log('\n🖥️  Server Status:');
    servers.forEach((server, name) => {
      const info = server.getInfo();
      console.log(`  - ${name}: ${info.status} (${info.tools.length} tools)`);
    });

    // Cleanup
    console.log('\n🧹 Shutting down agent...');
    await agent.shutdown();
    console.log('✅ Agent shut down successfully');

  } catch (error) {
    console.error('❌ Example failed:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

/**
 * Environment validation
 */
function validateEnvironment(): boolean {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY environment variable is required');
    console.error('   Please set it in your .env file or environment');
    return false;
  }
  
  return true;
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!validateEnvironment()) {
    process.exit(1);
  }
  
  runMCPExample()
    .then(() => {
      console.log('🎉 MCP Example completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 MCP Example failed:', error);
      process.exit(1);
    });
}