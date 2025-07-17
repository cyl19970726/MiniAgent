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
  ITool,
  IToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  AgentEventType,
  AgentEvent,
  IToolSchedulerConfig,
  IToolCallRequestInfo,
  ICompletedToolCall,
  ChatMessage,
  EventHandler,
} from '../src/index.js';

/**
 * Simple Calculator Tool for demonstration
 */
class CalculatorTool implements ITool {
  readonly name = 'calculator';
  readonly displayName = 'Calculator';
  readonly description = 'Perform basic mathematical calculations';
  readonly schema = {
    name: 'calculator',
    description: 'Perform basic mathematical calculations',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate (e.g., "2 + 3 * 4")'
        }
      },
      required: ['expression']
    }
  };
  readonly isOutputMarkdown = false;
  readonly canUpdateOutput = false;

  validateToolParams(params: any): string | null {
    if (!params.expression || typeof params.expression !== 'string') {
      return 'Expression is required and must be a string';
    }
    return null;
  }

  getDescription(params: any): string {
    return `Calculate: ${params.expression}`;
  }

  async shouldConfirmExecute(
    params: any,
    abortSignal: AbortSignal
  ): Promise<ToolCallConfirmationDetails | false> {
    return false; // No confirmation needed
  }

  async execute(
    params: any,
    abortSignal: AbortSignal,
    outputUpdateHandler?: (output: string) => void
  ): Promise<IToolResult> {
    const { expression } = params;
    
    if (outputUpdateHandler) {
      outputUpdateHandler(`🔢 Calculating: ${expression}`);
    }

    try {
      // Simple safe evaluation (only allow basic math)
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();
      
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Invalid result');
      }

      return {
        llmContent: `${expression} = ${result}`,
        returnDisplay: `🔢 ${expression} = ${result}`,
      };
    } catch (error) {
      return {
        llmContent: `Error: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: `❌ Calculation error`,
      };
    }
  }
}

/**
 * Simple concrete Agent implementation
 */
class DemoAgent extends BaseAgent {
  private chat: GeminiChat;
  private toolScheduler: CoreToolScheduler;
  private tokenTracker: TokenTracker;

  constructor(config: IAgentConfig) {
    super(config);
    
    // Initialize chat
    this.chat = new GeminiChat(
      config.apiKey || process.env.GEMINI_API_KEY || '',
      config.model || 'gemini-pro',
      config.maxHistoryTokens || 1000000,
      [],
      'You are a helpful assistant that can perform calculations.'
    );
    
    // Initialize token tracker
    this.tokenTracker = new TokenTracker(
      config.model || 'gemini-pro', 
      config.maxHistoryTokens || 1000000
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
    
    this.toolScheduler = new CoreToolScheduler(toolSchedulerConfig);
  }

  getChat() {
    return this.chat;
  }

  getToolScheduler() {
    return this.toolScheduler;
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

  // Implementation of abstract methods
  async* process(
    userInput: string,
    sessionId: string,
    signal: AbortSignal
  ): AsyncGenerator<AgentEvent> {
    console.log(`🤖 Processing: "${userInput}"`);
    
    // Emit start event
    yield AgentEventFactory.createContentEvent('Processing your request...');
    
    try {
      // Create chat message
      const message: ChatMessage = {
        content: userInput,
        config: { temperature: 0.7 }
      };
      
      // Send message to chat
      const streamResponse = await this.chat.sendMessageStream(message, sessionId);
      
      let fullResponse = '';
      
      // Process streaming response
      for await (const response of streamResponse) {
        if (response.content.parts.length > 0) {
          const text = response.content.parts
            .filter(part => part.type === 'text')
            .map(part => part.text)
            .join('');
          
          if (text) {
            fullResponse += text;
            yield AgentEventFactory.createContentEvent(text);
          }
          
          // Check for function calls
          const functionCalls = response.content.parts
            .filter(part => part.type === 'function_call');
          
          for (const call of functionCalls) {
            if (call.functionCall) {
              yield AgentEventFactory.createToolCallRequestEvent({
                callId: call.functionCall.id || 'unknown',
                name: call.functionCall.name,
                args: call.functionCall.args,
                isClientInitiated: false,
                prompt_id: sessionId,
              });
              
              // Execute tool
              const toolRequest: IToolCallRequestInfo = {
                callId: call.functionCall.id || 'unknown',
                name: call.functionCall.name,
                args: call.functionCall.args,
                isClientInitiated: false,
                prompt_id: sessionId,
              };
              
              await this.toolScheduler.schedule(toolRequest, signal);
            }
          }
        }
        
        // Update token usage
        if (response.usage) {
          this.tokenTracker.updateUsage({
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
          });
          
          yield AgentEventFactory.createTokenUsageEvent(response.usage);
        }
      }
      
      // Emit completion event
      yield AgentEventFactory.createContentEvent('\n✅ Processing complete!');
      
    } catch (error) {
      console.error('❌ Processing error:', error);
      yield AgentEventFactory.createErrorEvent(error instanceof Error ? error : new Error(String(error)));
    }
  }

  getStatus(): IAgentStatus {
    return {
      currentTurn: 1,
      isProcessing: this.chat.isProcessing(),
      tokenUsage: this.tokenTracker.getUsage(),
    };
  }

  getExecutionHistory(): any[] {
    return this.chat.getHistory();
  }

  setSystemPrompt(prompt: string): void {
    this.chat.setSystemPrompt(prompt);
  }

  onEvent(eventType: string, handler: EventHandler): void {
    // Simple event handling for demo
    console.log(`📡 Event handler registered for: ${eventType}`);
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up agent...');
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
          console.log(`\n🔧 Tool requested: ${event.data.name}`);
          console.log(`   Args: ${JSON.stringify(event.data.args)}`);
          break;
        case AgentEventType.TokenUsage:
          console.log(`\n📊 Token usage: ${event.data.totalTokens} tokens`);
          break;
        case AgentEventType.Error:
          console.error(`\n❌ Error: ${event.data.message}`);
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