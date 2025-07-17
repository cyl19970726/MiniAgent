/**
 * Basic Agent Example
 * 
 * This example demonstrates how to use our Agent framework with:
 * 1. GeminiChat for conversation management
 * 2. TokenTracker for usage monitoring
 * 3. CoreToolScheduler for tool execution
 * 4. Event system for real-time monitoring
 */

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

/**
 * Simple Calculator Tool for demonstration
 */
class CalculatorTool extends BaseTool<{ expression: string }> {
  constructor() {
    super(
      'calculator',
      'Calculator',
      'Perform basic mathematical calculations',
      {
        type: Type.OBJECT,
        properties: {
          expression: {
            type: Type.STRING,
            description: 'Mathematical expression to evaluate (e.g., "2 + 3 * 4")'
          }
        },
        required: ['expression']
      },
      false, // isOutputMarkdown
      true   // canUpdateOutput
    );
  }

  validateToolParams(params: { expression: string }): string | null {
    if (!params.expression || typeof params.expression !== 'string') {
      return 'Expression is required and must be a string';
    }
    
    // Check for dangerous characters
    if (!/^[0-9+\-*/().\s]+$/.test(params.expression)) {
      return 'Expression contains invalid characters';
    }
    
    return null;
  }

  getDescription(params: { expression: string }): string {
    return `Calculate: ${params.expression}`;
  }

  async execute(
    params: { expression: string },
    abortSignal: AbortSignal,
    outputUpdateHandler?: (output: string) => void
  ): Promise<ToolResult> {
    const { expression } = params;
    
    if (outputUpdateHandler) {
      outputUpdateHandler(this.formatProgress('Calculating', expression, '🔢'));
    }

    try {
      // Check for cancellation
      this.checkAbortSignal(abortSignal, 'Calculator execution');

      // Simple safe evaluation (only allow basic math)
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();
      
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Invalid mathematical expression');
      }

      return this.createResult(
        `${expression} = ${result}`,
        `🔢 ${expression} = ${result}`,
        `Calculated: ${result}`
      );
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error : new Error(String(error)),
        'Calculator execution'
      );
    }
  }
}

/**
 * Simple concrete Agent implementation
 */
class DemoAgent extends BaseAgent {
  private tokenTracker: TokenTracker;

  constructor(config: IAgentConfig) {
    // Initialize chat
    const chat = new GeminiChat(
      config.apiKey || process.env.GEMINI_API_KEY || '',
      config.model || 'gemini-pro',
      config.maxHistoryTokens || 1000000,
      [],
      'You are a helpful assistant that can perform calculations.'
    );
    
    // Initialize tool scheduler
    const toolRegistry = new Map<string, ITool>();
    toolRegistry.set('calculator', new CalculatorTool());
    
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
      config.model || 'gemini-pro', 
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
    model: 'gemini-pro',
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
      if (event.type === AgentEventType.Content) {
        process.stdout.write(event.data);
      }
    });
    
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
    const userInput = 'Calculate 15 + 27 * 3';
    console.log(`👤 User: ${userInput}\n`);
    console.log('🤖 Assistant: ');
    
    const events = agent.process(userInput, sessionId, abortController.signal);
    
    for await (const event of events) {
      switch (event.type) {
        case AgentEventType.Content:
          // Content is already logged by the processing
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
    console.log(`   • Processing: ${status.isProcessing ? 'Yes' : 'No'}`);
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

export { main as runBasicExample, DemoAgent, CalculatorTool };