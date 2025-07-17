/**
 * Demo Example - Framework demonstration without real API calls
 * 
 * This example demonstrates the Agent framework functionality using mock responses,
 * so it can run without needing a real API key.
 */

import { 
  GeminiChat, 
  CoreToolScheduler, 
  TokenTracker,
  AgentEventFactory,
  AgentEventEmitter,
  IAgentConfig,
  ITool,
  IToolResult,
  ToolCallConfirmationDetails,
  AgentEventType,
  AgentEvent,
  IToolSchedulerConfig,
  IToolCallRequestInfo,
  ICompletedToolCall,
  ChatMessage,
  LLMResponse,
  ConversationContent,
} from '../src/index.js';

/**
 * Mock Chat implementation for demonstration
 */
class MockGeminiChat extends GeminiChat {
  private mockResponses = [
    "I'll help you with that calculation. Let me use the calculator tool.",
    "The result is 96. Let me break it down: 15 + (27 * 3) = 15 + 81 = 96",
    "Is there anything else you'd like me to calculate?"
  ];
  
  private responseIndex = 0;

  constructor() {
    super('mock-api-key', 'gemini-pro', 100000, [], 'You are a helpful assistant with access to a calculator.');
  }

  async sendMessageStream(message: ChatMessage, promptId: string): Promise<AsyncGenerator<LLMResponse>> {
    const self = this;
    
    return (async function* () {
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get next mock response
      const responseText = self.mockResponses[self.responseIndex % self.mockResponses.length];
      self.responseIndex++;
      
      // Create mock response
      const response: LLMResponse = {
        id: promptId,
        content: {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: responseText
            }
          ],
          metadata: {
            timestamp: Date.now()
          }
        },
        model: 'gemini-pro',
        usage: {
          inputTokens: 10,
          outputTokens: 25,
          totalTokens: 35
        },
        metadata: {
          timestamp: Date.now(),
          promptId
        }
      };

      // Check if this should include a function call
      if (message.content.includes('Calculate') || message.content.includes('计算')) {
        // Add function call to response
        response.content.parts.push({
          type: 'function_call',
          functionCall: {
            id: 'call_' + Date.now(),
            name: 'calculator',
            args: { expression: '15 + 27 * 3' }
          }
        });
      }

      yield response;
    })();
  }
}

/**
 * Simple Calculator Tool for demonstration
 */
class DemoCalculatorTool implements ITool {
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
          description: 'Mathematical expression to evaluate'
        }
      },
      required: ['expression']
    }
  };
  readonly isOutputMarkdown = false;
  readonly canUpdateOutput = false;

  validateToolParams(params: any): string | null {
    if (!params.expression) return 'Expression is required';
    return null;
  }

  getDescription(params: any): string {
    return `Calculate: ${params.expression}`;
  }

  async shouldConfirmExecute(): Promise<false> {
    return false;
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

    // Simulate calculation delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      // For demo purposes, we'll handle the specific example
      let result: number;
      if (expression === '15 + 27 * 3') {
        result = 96;
      } else {
        // Simple safe evaluation for demo
        result = eval(expression.replace(/[^0-9+\-*/().]/g, ''));
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
 * Demo Agent that orchestrates all components
 */
class DemoAgent {
  private chat: MockGeminiChat;
  private toolScheduler: CoreToolScheduler;
  private tokenTracker: TokenTracker;
  private eventEmitter: AgentEventEmitter;

  constructor() {
    this.chat = new MockGeminiChat();
    this.tokenTracker = new TokenTracker('gemini-pro', 100000);
    this.eventEmitter = new AgentEventEmitter();
    
    // Set up tool scheduler
    const toolRegistry = new Map<string, ITool>();
    toolRegistry.set('calculator', new DemoCalculatorTool());
    
    const toolSchedulerConfig: IToolSchedulerConfig = {
      toolRegistry: Promise.resolve(toolRegistry),
      approvalMode: 'yolo',
      onAllToolCallsComplete: (calls) => this.handleToolsComplete(calls),
      onToolCallsUpdate: (calls) => this.handleToolsUpdate(calls),
      outputUpdateHandler: (callId, output) => this.handleOutputUpdate(callId, output),
    };
    
    this.toolScheduler = new CoreToolScheduler(toolSchedulerConfig);
  }

  private async handleToolsComplete(calls: ICompletedToolCall[]) {
    console.log(`✅ ${calls.length} tool(s) completed`);
    for (const call of calls) {
      console.log(`   - ${call.request.name}: ${call.status}`);
      if (call.status === 'success') {
        console.log(`   Result: ${call.response.resultDisplay}`);
      }
    }
  }

  private async handleToolsUpdate(calls: any[]) {
    console.log(`🔄 ${calls.length} tool(s) in progress`);
  }

  private async handleOutputUpdate(callId: string, output: string) {
    console.log(`📤 [${callId}] ${output}`);
  }

  async* processDemo(userInput: string): AsyncGenerator<AgentEvent> {
    console.log(`🤖 Processing: "${userInput}"`);
    
    // Emit start event
    const eventFactory = new AgentEventFactory('demo-agent');
    yield eventFactory.createContentEvent('assistant_chunk', '🤖 Starting to process your request...\n');
    
    try {
      // Create chat message
      const message: ChatMessage = {
        content: userInput,
        config: { temperature: 0.7 }
      };
      
      // Send message to chat
      const sessionId = 'demo-session';
      const streamResponse = await this.chat.sendMessageStream(message, sessionId);
      
      let fullResponse = '';
      
      // Process streaming response
      for await (const response of streamResponse) {
        console.log('\n📨 Received response from LLM:');
        
        for (const part of response.content.parts) {
          if (part.type === 'text') {
            fullResponse += part.text;
            console.log(`💬 Assistant: ${part.text}`);
            yield eventFactory.createContentEvent('assistant_chunk', part.text + '\n');
          } else if (part.type === 'function_call' && part.functionCall) {
            console.log(`🔧 Tool Call: ${part.functionCall.name}`);
            console.log(`   Args: ${JSON.stringify(part.functionCall.args)}`);
            
            yield eventFactory.createToolCallRequestEvent({
              callId: part.functionCall.id || 'unknown',
              name: part.functionCall.name,
              args: part.functionCall.args,
              isClientInitiated: false,
              prompt_id: sessionId,
            });
            
            // Execute tool
            const toolRequest: IToolCallRequestInfo = {
              callId: part.functionCall.id || 'unknown',
              name: part.functionCall.name,
              args: part.functionCall.args,
              isClientInitiated: false,
              prompt_id: sessionId,
            };
            
            console.log('\n🔧 Executing tool...');
            const abortController = new AbortController();
            await this.toolScheduler.schedule(toolRequest, abortController.signal);
          }
        }
        
        // Update token usage
        if (response.usage) {
          this.tokenTracker.updateUsage({
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
          });
          
          yield eventFactory.createTokenUsageEvent(response.usage);
        }
      }
      
      // Wait a bit for tools to complete
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Show final status
      console.log('\n' + '='.repeat(50));
      console.log('📊 Final Status:');
      console.log(`   • Total tokens: ${this.tokenTracker.getUsage().totalTokens}`);
      console.log(`   • Token usage: ${this.tokenTracker.getUsage().usagePercentage.toFixed(2)}%`);
      console.log('='.repeat(50));
      
      yield eventFactory.createContentEvent('assistant_chunk', '\n✅ Demo completed successfully!');
      
    } catch (error) {
      console.error('❌ Processing error:', error);
      yield eventFactory.createErrorEvent(error instanceof Error ? error : new Error(String(error)));
    }
  }

  getTokenUsage() {
    return this.tokenTracker.getUsage();
  }

  getTokenSummary() {
    return this.tokenTracker.getUsageSummary();
  }
}

/**
 * Main demo function
 */
async function main() {
  console.log('🎭 Agent Framework Demo (No API Key Required)');
  console.log('==============================================\n');
  
  console.log('🔧 Framework Components:');
  console.log('  • GeminiChat (mocked)');
  console.log('  • CoreToolScheduler');
  console.log('  • TokenTracker');
  console.log('  • AgentEventSystem');
  console.log('  • Calculator Tool');
  console.log('');

  try {
    // Create demo agent
    console.log('🤖 Creating demo agent...');
    const agent = new DemoAgent();
    
    // Demo conversation
    console.log('💬 Starting demo conversation...');
    const userInput = 'Calculate 15 + 27 * 3';
    console.log(`👤 User: ${userInput}\n`);
    
    // Process the request
    const events = agent.processDemo(userInput);
    
    let eventCount = 0;
    for await (const event of events) {
      eventCount++;
      
      switch (event.type) {
        case AgentEventType.Content:
          // Content logging is handled in the processDemo method
          break;
        case AgentEventType.ToolCallRequest:
          console.log(`🔧 Event: Tool "${event.data.name}" requested`);
          break;
        case AgentEventType.TokenUsage:
          console.log(`📊 Event: Token usage updated (${event.data.totalTokens} tokens)`);
          break;
        case AgentEventType.Error:
          console.error(`❌ Event: Error occurred - ${event.data.message}`);
          break;
        default:
          console.log(`📡 Event: ${event.type}`);
      }
    }
    
    // Show token usage summary
    console.log('\n📈 Token Usage Summary:');
    console.log(agent.getTokenSummary());
    
    console.log(`\n🎉 Demo completed! Generated ${eventCount} events.`);
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal, shutting down...');
  process.exit(0);
});

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as runDemoExample, DemoAgent, DemoCalculatorTool };