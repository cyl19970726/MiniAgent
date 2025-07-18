/**
 * Demo Example - Framework demonstration without real API calls
 * 
 * This example demonstrates the Agent framework functionality using mock responses,
 * so it can run without needing a real API key.
 */

import { 
  StandardAgent,
  GeminiChat, 
  BaseTool,
  ITool,
  ToolResult,
  AgentEventFactory,
  AgentEventType,
  AgentEvent,
  ICompletedToolCall,
  ITokenUsage,
  ChatMessage,
  LLMResponse,
  ConversationContent,
  ToolCallRequest,
  AllConfig,
} from '../src/index.js';

import { Type } from '@google/genai';

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
    super({
      apiKey: 'mock-api-key',
      modelName: 'gemini-pro',
      tokenLimit: 100000,
      systemPrompt: 'You are a helpful assistant with access to a calculator.',
      initialHistory: [],
    });
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
      const contentString = typeof message.content === 'string' ? message.content : '';
      if (contentString.includes('Calculate') || contentString.includes('计算')) {
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
 * Simple Calculator Tool for demonstration using BaseTool
 */
class DemoCalculatorTool extends BaseTool<{ expression: string }> {
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
            description: 'Mathematical expression to evaluate'
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

    // Simulate calculation delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      // Check for cancellation
      this.checkAbortSignal(abortSignal, 'Demo calculator execution');

      // For demo purposes, we'll handle the specific example
      let result: number;
      if (expression === '15 + 27 * 3') {
        result = 96;
      } else {
        // Simple safe evaluation for demo
        result = eval(expression.replace(/[^0-9+\-*/().]/g, ''));
      }

      return this.createResult(
        `${expression} = ${result}`,
        `🔢 ${expression} = ${result}`,
        `Demo calculation: ${result}`
      );
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error : new Error(String(error)),
        'Demo calculator execution'
      );
    }
  }
}

/**
 * Demo Agent wrapper that uses StandardAgent with MockGeminiChat
 */
class DemoAgent {
  private agent: StandardAgent;
  private mockChat: MockGeminiChat;

  constructor(config: AllConfig, tools: ITool[]) {
    // Create the agent with custom chat implementation
    this.mockChat = new MockGeminiChat();
    this.agent = new StandardAgent(tools, config);
    
    // Replace the chat with our mock implementation
    // We need to use the agent's internal structure for demo purposes
    (this.agent as any).chat = this.mockChat;
  }

  async* processDemo(userInput: string): AsyncGenerator<AgentEvent> {
    console.log(`🤖 Processing: "${userInput}"`);
    
    // Use the standard agent's process method
    const sessionId = 'demo-session';
    const abortController = new AbortController();
    
    yield* this.agent.process(userInput, sessionId, abortController.signal);
  }

  getTokenUsage() {
    return this.agent.getTokenUsage();
  }

  getTokenSummary() {
    const usage = this.agent.getTokenUsage();
    return `Input: ${usage.inputTokens}, Output: ${usage.outputTokens}, Total: ${usage.totalTokens}`;
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
    // Create demo agent configuration
    const config: AllConfig = {
      agentConfig: {
        model: 'gemini-pro',
        workingDirectory: process.cwd(),
        apiKey: 'mock-api-key',
        sessionId: 'demo-session',
        maxHistoryTokens: 100000,
        debugMode: true,
      },
      chatConfig: {
        apiKey: 'mock-api-key',
        modelName: 'gemini-pro',
        tokenLimit: 100000,
        systemPrompt: 'You are a helpful assistant with access to a calculator.',
      },
      toolSchedulerConfig: {
        approvalMode: 'yolo',
        onAllToolCallsComplete: (calls) => {
          console.log(`✅ ${calls.length} tool(s) completed`);
          for (const call of calls) {
            console.log(`   - ${call.request.name}: ${call.status}`);
            if (call.status === 'success') {
              console.log(`   Result: ${call.response.resultDisplay}`);
            }
          }
        },
        onToolCallsUpdate: (calls) => {
          console.log(`🔄 ${calls.length} tool(s) in progress`);
        },
        outputUpdateHandler: (callId, output) => {
          console.log(`📤 [${callId}] ${output}`);
        },
      },
    };
    
    // Create tools
    const tools = [new DemoCalculatorTool()];
    
    // Create demo agent
    console.log('🤖 Creating demo agent...');
    const agent = new DemoAgent(config, tools);
    
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
          console.log(`🔧 Event: Tool "${(event.data as any).toolCall.name}" requested`);
          break;
        case AgentEventType.TokenUsage:
          console.log(`📊 Event: Token usage updated (${(event.data as any).usage.totalTokens} tokens)`);
          break;
        case AgentEventType.Error:
          console.error(`❌ Event: Error occurred - ${(event.data as any).message}`);
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