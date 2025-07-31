/**
 * Basic Agent Example
 * 
 * This example demonstrates how to use our Agent framework with:
 * 1. Multiple chat providers (Gemini, OpenAI, OpenAI Response API)
 * 2. TokenTracker for usage monitoring
 * 3. CoreToolScheduler for tool execution
 * 4. Event system for real-time monitoring
 */

import { error } from 'console';
import { 
  StandardAgent,
  AgentEventType,
  AgentEvent,
  AllConfig,
  ITool,
  LogLevel,
  configureLogger,
  Type,
  Schema,
} from '../src/index.js';


import { createWeatherTool,createSubTool } from './tools';

import dotenv from 'dotenv';
import { LLMChunkTextDelta, LLMChunkTextDone } from '../src/interfaces.js';

dotenv.config();

const weatherTool = createWeatherTool();
const subTool = createSubTool();

/**
 * Create Agent using StandardAgent with specified chat provider
 */
function createAgent(config: AllConfig & { chatProvider?: 'gemini' | 'openai' }, tools: ITool[]): StandardAgent {
  return new StandardAgent(tools, config);
}

/**
 * Parse command line arguments for provider selection
 */
function parseCommandLineArgs(): { providers: ('gemini' | 'openai')[], showHelp: boolean } {
  const args = process.argv.slice(2);
  const providers: ('gemini' | 'openai')[] = [];
  let showHelp = false;

  for (const arg of args) {
    switch (arg.toLowerCase()) {
      case '--gemini':
        if (!providers.includes('gemini')) providers.push('gemini');
        break;
      case '--openai':
        if (!providers.includes('openai')) providers.push('openai');
        break;
      case '--all':
        return { providers: ['gemini', 'openai'], showHelp: false };
      case '--help':
      case '-h':
        showHelp = true;
        break;
      default:
        console.log(`⚠️  Unknown argument: ${arg}`);
        showHelp = true;
        break;
    }
  }

  return { providers, showHelp };
}

/**
 * Show help message
 */
function showHelpMessage() {
  console.log('🚀 Agent Framework Basic Example');
  console.log('================================\n');
  console.log('Usage: npx tsx examples/basicExample.ts [options]\n');
  console.log('Options:');
  console.log('  --gemini          Test with Gemini provider');
  console.log('  --openai          Test with OpenAI Chat Completions API');
  console.log('  --openairep       Test with OpenAI Response API');
  console.log('  --all             Test with all available providers');
  console.log('  --help, -h        Show this help message\n');
  console.log('Environment Variables:');
  console.log('  GEMINI_API_KEY    API key for Gemini provider');
  console.log('  OPENAI_API_KEY    API key for OpenAI providers');
  console.log('  LOG_LEVEL         Set log level (NONE|ERROR|WARN|INFO|DEBUG)\n');
  console.log('Examples:');
  console.log('  npx tsx examples/basicExample.ts --gemini');
  console.log('  npx tsx examples/basicExample.ts --openai --openairep');
  console.log('  npx tsx examples/basicExample.ts --all');
  console.log('  OPENAI_API_KEY="sk-..." npx tsx examples/basicExample.ts --openai\n');
}

/**
 * Test a specific provider
 */
async function testProvider(
  provider: 'gemini' | 'openai',
  finalLogLevel: LogLevel
): Promise<{ success: boolean; tokenUsage?: any; error?: string }> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Testing ${provider.toUpperCase()} Provider`);
  console.log(`${'='.repeat(70)}`);

  try {
    // Determine API key based on provider
    let apiKey: string;
    switch (provider) {
      case 'openai':
        apiKey = process.env.OPENAI_API_KEY || '';
        if (!apiKey) {
          console.error('❌ Error: OPENAI_API_KEY environment variable is not set');
          console.log('Please set your API key:');
          console.log('export OPENAI_API_KEY="your-api-key-here"');
          return { success: false, error: 'Missing OPENAI_API_KEY' };
        }
        break;
      case 'gemini':
      default:
        apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) {
          console.error('❌ Error: GEMINI_API_KEY environment variable is not set');
          console.log('Please set your API key:');
          console.log('export GEMINI_API_KEY="your-api-key-here"');
          return { success: false, error: 'Missing GEMINI_API_KEY' };
        }
        break;
    }

    // Determine model name based on provider
    let modelName: string;
    switch (provider) {
      case 'openai':
        modelName = 'o1';
        break;
      case 'gemini':
      default:
        modelName = 'gemini-2.0-flash';
        break;
    }

    // Create agent configuration
    const config: AllConfig & { chatProvider?: 'gemini' | 'openai' } = {
      chatProvider: provider,
      agentConfig: {
        model: modelName,
        workingDirectory: process.cwd(),
        apiKey: apiKey,
        sessionId: `demo-${provider}-${Date.now()}`,
        maxHistoryTokens: 100000,
        debugMode: finalLogLevel === LogLevel.DEBUG,
      },
      chatConfig: {
        apiKey: apiKey,
        modelName: modelName,
        tokenLimit: 100000,
        systemPrompt: `You are a helpful assistant with access to the following tools:
1. get_weather: Get current weather temperature for any coordinates
2. subtract: Perform subtraction between two numbers

IMPORTANT: After using tools to gather information, you must provide a complete text response to the user with your analysis and final answer. Always respond with the results in a clear, human-readable format.

For this specific task: After getting weather data for both cities, calculate the temperature difference and provide a summary in your response.`,
      },
      toolSchedulerConfig: {
        approvalMode: 'yolo', // Auto-approve for demo
        onAllToolCallsComplete: (calls) => {
          console.log(`✅ [${provider}] ${calls.length} tool(s) completed`);
          for (const call of calls) {
            console.log(`   - ${call.request.name}: ${call.status}`);
          }
        },
        onToolCallsUpdate: (calls) => {
          console.log(`🔄 [${provider}] Tool status update: ${calls.length} active calls`);
        },
        outputUpdateHandler: (callId, output) => {
          console.log(`📤 [${provider}] [${callId}] ${output}`);
        },
      },
    };

    console.log('🔑 API Key configured: Yes');
    console.log('🤖 Model:', config.agentConfig.model);
    console.log('💾 Working Directory:', config.agentConfig.workingDirectory);
    console.log('🔢 Token Limit:', config.agentConfig.maxHistoryTokens);
    console.log('');

    // Create agent
    console.log('🤖 Creating agent...');
    const tools = [weatherTool, subTool];
    const agent = createAgent(config, tools);
    
    // Test basic conversation
    console.log('💬 Starting conversation...');
    const sessionId = config.agentConfig.sessionId || 'demo-session';
    const abortController = new AbortController();
    
    // Set timeout
    setTimeout(() => {
      console.log(`\n⏰ [${provider}] Timeout reached, aborting...`);
      abortController.abort();
    }, 45000);
    
    // Process user input
    const userMessages = [`Get the current weather temperature 
    for Beijing (latitude: 39.9042, longitude: 116.4074) , and then calculate the temperature difference between Beijing and Shanghai (latitude: 31.2304, longitude: 121.4737).
    `];
    
    const events = agent.processUserMessages(userMessages, sessionId, abortController.signal);
    
    for await (const event of events) {
      switch (event.type) {
        case AgentEventType.UserMessage:
          console.log(`👤 [${provider}] User message:`, event.data);
          break;
        case AgentEventType.TurnComplete:
          console.log(`🛞 [${provider}] Turn complete:`, event.data);
          break;
        case AgentEventType.ToolExecutionStart:
          const toolStartData = event.data as any;
          console.log(`\n🔧 [${provider}] Tool started: ${toolStartData.toolName}`);
          console.log(`   Args: ${JSON.stringify(toolStartData.args)}`);
          break;
        case AgentEventType.ToolExecutionDone:
          const toolDoneData = event.data as any;
          const status = toolDoneData.error ? 'failed' : 'completed';
          console.log(`🔧 [${provider}] Tool ${status}: ${toolDoneData.toolName}`);
          if (toolDoneData.error) {
            console.log(`   Error: ${toolDoneData.error}`);
          } else if (toolDoneData.result) {
            console.log(`   Result: ${toolDoneData.result}`);
          }
          break;
        case AgentEventType.Error:
          const errorData = event.data as any;
          console.error(`❌ [${provider}] Error: ${errorData.message}`);
          break;
        // Handle LLM Response events
        case AgentEventType.ResponseChunkTextDelta:
          const deltaData = event.data as LLMChunkTextDelta;
          console.log(`\n📝 [${provider}] Text Delta Event:`, deltaData.content.text_delta);
          break;
        case AgentEventType.ResponseChunkTextDone:
          const textDoneData = event.data as LLMChunkTextDone;
          console.log(`🤖 [${provider}] Complete Response: "${textDoneData.content.text}"`);
          break;
        case AgentEventType.ResponseComplete:
          console.log(`✅ [${provider}] LLM Response complete`);
          break;
        case AgentEventType.ResponseFailed:
          const failedData = event.data as any;
          console.error(`❌ [${provider}] LLM Response failed:`, failedData);
          break;
        default:
          // Log other event types for debugging
          if (finalLogLevel === LogLevel.DEBUG) {
            console.log(`🔍 [${provider}] Event: ${event.type}`, event.data);
          }
          break;
      }
    }

    const history = agent.getChat().getHistory();
    console.log(`\n====History====`);
    history.forEach((message, index) => {
      console.log(`\n[${index + 1}] ${message.role}:`);
      if (message.content.type === 'text') {
        console.log(`   Text: "${message.content.text}"`);
        if (message.content.metadata) {
          console.log(`   Metadata:`, JSON.stringify(message.content.metadata, null, 2));
        }
      } else if (message.content.type === 'function_call') {
        console.log(`   Function Call:`);
        console.log(`   • Name: ${message.content.functionCall?.name}`);
        console.log(`   • ID: ${message.content.functionCall?.id}`);
        console.log(`   • Call ID: ${message.content.functionCall?.call_id}`);
        console.log(`   • Args: ${message.content.functionCall?.args}`);
      } else if (message.content.type === 'function_response') {
        console.log(`   Function Response:`);
        console.log(`   • Name: ${message.content.functionResponse?.name}`);
        console.log(`   • ID: ${message.content.functionResponse?.id}`);
        console.log(`   • Call ID: ${message.content.functionResponse?.call_id}`);
        console.log(`   • Result: ${message.content.functionResponse?.result}`);
      }
    });
    console.log(`\n====End History====`);
    
    // Show final status
    console.log(`\n📊 [${provider}] Final Status:`);
    const status = agent.getStatus();
    console.log(`   • Processing: ${status.isRunning ? 'Yes' : 'No'}`);
    console.log(`   • Tokens used: ${status.tokenUsage.totalTokens}`);
    console.log(`   • Token limit: ${status.tokenUsage.tokenLimit}`);
    console.log(`   • Usage: ${status.tokenUsage.usagePercentage.toFixed(2)}%`);
    
    // Show usage summary
    console.log(`\n📈 [${provider}] Token Usage Summary:`);
    const tokenUsage = agent.getTokenUsage();
    console.log(`   • Input tokens: ${tokenUsage.inputTokens}`);
    console.log(`   • Cached tokens: ${tokenUsage.inputTokenDetails?.cachedTokens}`);
    console.log(`   • Output tokens: ${tokenUsage.outputTokens}`);
    console.log(`   • Reasoning tokens: ${tokenUsage.outputTokenDetails?.reasoningTokens}`);
    console.log(`   • Total tokens: ${tokenUsage.totalTokens}`);
    
    console.log(`\n✅ [${provider}] Test completed successfully!`);
    
    return { success: true, tokenUsage: status.tokenUsage };
    
  } catch (error) {
    console.error(`❌ [${provider}] Test failed:`, error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Main demonstration function
 */
async function main() {
  // Parse command line arguments
  const { providers, showHelp } = parseCommandLineArgs();
  
  if (showHelp) {
    showHelpMessage();
    return;
  }
  
  // If no providers specified, fall back to environment variable or default
  const providersToTest = providers.length > 0 
    ? providers 
    : [(process.env.CHAT_PROVIDER as 'gemini' | 'openai') || 'gemini'];

  console.log('🚀 Agent Framework Basic Example');
  console.log('================================\n');

  // Configure logger based on environment
  const logLevel = process.env.LOG_LEVEL?.toUpperCase() as keyof typeof LogLevel;
  const finalLogLevel = logLevel && LogLevel[logLevel] !== undefined ? LogLevel[logLevel] : LogLevel.INFO;
  
  configureLogger({
    level: finalLogLevel,
    autoDetectContext: true,
    includeTimestamp: true,
    enableColors: true,
  });

  console.log(`🪵 Logger Level: ${LogLevel[finalLogLevel]}`);
  console.log('   Set LOG_LEVEL environment variable (NONE|ERROR|WARN|INFO|DEBUG) to change');
  console.log(`🧪 Testing Providers: ${providersToTest.join(', ')}`);
  console.log('');

  // Test each provider
  const results: Array<{ provider: string; success: boolean; tokenUsage?: any; error?: string }> = [];
  
  for (const provider of providersToTest) {
    const result = await testProvider(provider, finalLogLevel);
    results.push({ provider, ...result });
  }

  // Show summary if testing multiple providers
  if (results.length > 1) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 SUMMARY RESULTS');
    console.log(`${'='.repeat(80)}`);
    
    let successful = 0;
    let failed = 0;
    
    for (const result of results) {
      if (result.success) {
        successful++;
        console.log(`✅ ${result.provider.toUpperCase()}:`);
        if (result.tokenUsage) {
          console.log(`   • Total tokens: ${result.tokenUsage.totalTokens}`);
          console.log(`   • Usage: ${result.tokenUsage.usagePercentage.toFixed(2)}%`);
        }
      } else {
        failed++;
        console.log(`❌ ${result.provider.toUpperCase()}: ${result.error || 'Failed'}`);
      }
    }
    
    console.log(`\n📈 Overall Results: ${successful} successful, ${failed} failed out of ${results.length} providers`);
    
    if (successful > 0) {
      console.log('\n🎯 Key Differences:');
      console.log('• gemini: Google\'s Generative AI with thinking support');
      console.log('• openai: OpenAI Chat Completions API');
      console.log('• openai-response: OpenAI Response API with structured events');
    }
  }

  const allSuccessful = results.every(r => r.success);
  console.log(`\n${allSuccessful ? '✅' : '⚠️'} Example completed ${allSuccessful ? 'successfully' : 'with some failures'}!`);
  
  if (!allSuccessful) {
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

export { main as runBasicExample };