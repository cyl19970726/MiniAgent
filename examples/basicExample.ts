/**
 * Basic Agent Example
 * 
 * This example demonstrates how to use our Agent framework with:
 * 1. GeminiChat for conversation management
 * 2. TokenTracker for usage monitoring
 * 3. CoreToolScheduler for tool execution
 * 4. Event system for real-time monitoring
 */

import { error } from 'console';
import { 
  BaseAgent, 
  GeminiChat, 
  CoreToolScheduler, 
  TokenTracker,
  AgentEventFactory,
  AgentEventEmitter,
  IAgentConfig,
  IAgentStatus,
  BaseTool,
  ITool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  AgentEventType,
  AgentEvent,
  IToolSchedulerConfig,
  IToolCallRequestInfo,
  ICompletedToolCall,
  ChatMessage,
  EventHandler,
  ToolCallRequest,
} from '../src/index.js';

import { Type } from '@google/genai';
import { createWeatherTool,createSubTool } from './tools.js';

const weatherTool = createWeatherTool();
const subTool = createSubTool();
/**
 * Simple concrete Agent implementation
 */
class DemoAgent extends BaseAgent {
  private tokenTracker: TokenTracker;

  constructor(config: IAgentConfig) {
    // Initialize chat
    const chat = new GeminiChat(
      config.apiKey || process.env.GEMINI_API_KEY || '',
      config.model || 'gemini-2.5-flash',
      config.maxHistoryTokens || 1000000,
      [],
      `You are a helpful assistant with access to the following tools:
1. get_weather: Get current weather temperature for any coordinates
2. subtract: Perform subtraction between two numbers

When users ask about weather or temperature differences between cities, use the get_weather tool to fetch the current temperatures, then use the subtract tool to calculate the difference.`,
      [weatherTool.schema, subTool.schema],
      false,
    );
    
    // Initialize tool scheduler
    const toolRegistry = new Map<string, ITool>();
    toolRegistry.set('get_weather', weatherTool);
    toolRegistry.set('subtract', subTool);
    
    const toolSchedulerConfig: IToolSchedulerConfig = {
      toolRegistry: Promise.resolve(toolRegistry),
      approvalMode: 'yolo', // Auto-approve for demo
      onAllToolCallsComplete: (calls) => this.handleToolsComplete(calls),
      onToolCallsUpdate: (calls) => this.handleToolsUpdate(calls),
      outputUpdateHandler: (callId, output) => this.handleOutputUpdate(callId, output),
    };
    
    const toolScheduler = new CoreToolScheduler(toolSchedulerConfig);
    
    // Call parent constructor with all required parameters
    super(config, chat, toolScheduler);
    
    // Initialize token tracker
    this.tokenTracker = new TokenTracker(
      config.model || 'gemini-2.0-flash', 
      config.maxHistoryTokens || 1000000
    );
  }

  getTokenTracker() {
    return this.tokenTracker;
  }

  private async handleToolsComplete(calls: ICompletedToolCall[]) {
    console.log(`✅ ${calls.length} tool(s) completed`);
    for (const call of calls) {
      console.log(`   - ${call.request.name}: ${call.status}`);
    }
  }

  private async handleToolsUpdate(calls: any[]) {
    console.log(`🔄 Tool status update: ${calls.length} active calls`);
  }

  private async handleOutputUpdate(callId: string, output: string) {
    console.log(`📤 [${callId}] ${output}`);
  }

}

/**
 * Main demonstration function
 */
async function main() {
  console.log('🚀 Agent Framework Basic Example');
  console.log('================================\n');

  // Check for API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY environment variable is not set');
    console.log('Please set your API key:');
    console.log('export GEMINI_API_KEY="your-api-key-here"');
    console.log('Or run with: GEMINI_API_KEY="your-key" npm run example');
    process.exit(1);
  }

  // Create agent configuration
  const config: IAgentConfig = {
    model: 'gemini-2.0-flash',
    workingDirectory: process.cwd(),
    apiKey: apiKey,
    sessionId: `demo-${Date.now()}`,
    maxHistoryTokens: 100000,
    debugMode: true,
  };

  console.log('🔑 API Key configured: Yes');
  console.log('🤖 Model:', config.model);
  console.log('💾 Working Directory:', config.workingDirectory);
  console.log('🔢 Token Limit:', config.maxHistoryTokens);
  console.log('');

  try {
    // Create agent
    console.log('🤖 Creating agent...');
    const agent = new DemoAgent(config);
    
    // Set up event monitoring
    const eventEmitter = new AgentEventEmitter();
    eventEmitter.on('content', (event: AgentEvent) => {
      console.log('🤖 Assistant Response:',event.data);
    });
    // eventEmitter.on
    
    // Test basic conversation
    console.log('💬 Starting conversation...');
    const sessionId = config.sessionId || 'demo-session';
    const abortController = new AbortController();
    
    // Set timeout
    setTimeout(() => {
      console.log('\n⏰ Timeout reached, aborting...');
      abortController.abort();
    }, 30000);
    
    // Process user input
    const userInput = 'Get the current weather temperature for Beijing (latitude: 39.9042, longitude: 116.4074) and Shanghai (latitude: 31.2304, longitude: 121.4737), then calculate the temperature difference between them.';
    console.log(`👤 User: ${userInput}\n`);
    console.log('🤖 Assistant: ');
    
    const events = agent.process(userInput, sessionId, abortController.signal);
    
    for await (const event of events) {
      switch (event.type) {
        case AgentEventType.Content:
          // Content is already logged by the processing
          console.log('🤖 Assistant Response:',event.data);
          break;
        case AgentEventType.ToolCallRequest:
          const toolData = event.data as any;
          console.log(`\n🔧 Tool requested: ${toolData.toolCall.name}`);
          console.log(`   Args: ${JSON.stringify(toolData.toolCall.args)}`);
          break;
        case AgentEventType.TokenUsage:
          const tokenData = event.data as any;
          console.log(`\n📊 Token usage: ${tokenData.usage.totalTokens} tokens`);
          break;
        case AgentEventType.Error:
          const errorData = event.data as any;
          console.error(`\n❌ Error: ${errorData.message}`);
          break;
      }
    }
    
    // Show final status
    console.log('\n\n' + '='.repeat(50));
    console.log('📊 Final Status:');
    const status = agent.getStatus();
    console.log(`   • Processing: ${status.isRunning ? 'Yes' : 'No'}`);
    console.log(`   • Tokens used: ${status.tokenUsage.totalTokens}`);
    console.log(`   • Token limit: ${status.tokenUsage.tokenLimit}`);
    console.log(`   • Usage: ${status.tokenUsage.usagePercentage.toFixed(2)}%`);
    
    // Show usage summary
    console.log('\n📈 Token Usage Summary:');
    console.log(agent.getTokenTracker().getUsageSummary());
    
    console.log('\n✅ Example completed successfully!');
    
  } catch (error) {
    console.error('❌ Example failed:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal, shutting down...');
  process.exit(0);
});

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as runBasicExample, DemoAgent };