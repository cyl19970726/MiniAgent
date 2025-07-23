/**
 * Provider Comparison Example
 * 
 * This example compares all three chat providers:
 * 1. Gemini (Google's Generative AI)
 * 2. OpenAI Chat Completions
 * 3. OpenAI Response API
 * 
 * It demonstrates the same task across all providers to show
 * performance, token usage, and response quality differences.
 */

import { 
  StandardAgent,
  AgentEventType,
  AllConfig,
  ITool,
  LogLevel,
  configureLogger,
} from '../src/index.js';

import { createWeatherTool, createSubTool } from './tools.js';

type ChatProvider = 'gemini' | 'openai' | 'openai-response';

interface ProviderResult {
  provider: ChatProvider;
  success: boolean;
  tokenUsage?: {
    totalTokens: number;
    usagePercentage: number;
    inputTokens: number;
    outputTokens: number;
  };
  responseTime?: number;
  error?: string;
}

/**
 * Create agent for a specific provider
 */
function createAgentForProvider(provider: ChatProvider): StandardAgent {
  let apiKey: string;
  let modelName: string;

  // Configure based on provider
  switch (provider) {
    case 'gemini':
      apiKey = process.env.GEMINI_API_KEY || '';
      modelName = 'gemini-2.0-flash';
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not set');
      }
      break;
    case 'openai':
    case 'openai-response':
      apiKey = process.env.OPENAI_API_KEY || '';
      modelName = 'gpt-4o';
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
      }
      break;
  }

  const config: AllConfig & { chatProvider: ChatProvider } = {
    chatProvider: provider,
    agentConfig: {
      model: modelName,
      workingDirectory: process.cwd(),
      apiKey: apiKey,
      sessionId: `comparison-${provider}-${Date.now()}`,
      maxHistoryTokens: 100000,
      debugMode: false, // Reduce noise for comparison
    },
    chatConfig: {
      apiKey: apiKey,
      modelName: modelName,
      tokenLimit: 100000,
      systemPrompt: `You are a helpful assistant with access to weather and calculation tools. 
Use the get_weather tool to fetch temperatures and the subtract tool for calculations.
Provide concise, accurate responses.`,
    },
    toolSchedulerConfig: {
      approvalMode: 'yolo',
      onAllToolCallsComplete: () => {}, // Silent for comparison
      onToolCallsUpdate: () => {}, // Silent for comparison
      outputUpdateHandler: () => {}, // Silent for comparison
    },
  };

  const tools = [createWeatherTool(), createSubTool()];
  return new StandardAgent(tools, config);
}

/**
 * Test a specific provider
 */
async function testProvider(provider: ChatProvider, testQuery: string): Promise<ProviderResult> {
  console.log(`🧪 Testing ${provider}...`);
  
  const startTime = Date.now();
  
  try {
    const agent = createAgentForProvider(provider);
    const sessionId = `test-${provider}-${Date.now()}`;
    const abortController = new AbortController();

    // Set timeout (longer for comparison)
    setTimeout(() => {
      abortController.abort();
    }, 60000);

    const events = agent.process(testQuery, sessionId, abortController.signal);
    
    let responses: string[] = [];
    
    // Process events silently
    for await (const event of events) {
      if (event.type === AgentEventType.AssistantMessage) {
        responses.push(String(event.data));
      }
    }

    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    const status = agent.getStatus();
    
    console.log(`✅ ${provider}: ${responseTime}ms, ${status.tokenUsage.totalTokens} tokens`);
    
    return {
      provider,
      success: true,
      tokenUsage: {
        totalTokens: status.tokenUsage.totalTokens,
        usagePercentage: status.tokenUsage.usagePercentage,
        inputTokens: status.tokenUsage.inputTokens,
        outputTokens: status.tokenUsage.outputTokens,
      },
      responseTime,
    };
    
  } catch (error) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log(`❌ ${provider}: Failed after ${responseTime}ms`);
    
    return {
      provider,
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run comparison tests
 */
async function runComparison() {
  const testQueries = [
    'Get the weather temperature for Tokyo (35.6762, 139.6503) and Beijing (39.9042, 116.4074), then calculate the difference.',
    'What is the current temperature in London (51.5074, -0.1278)? Then subtract 10 from that temperature.',
    'Check the weather in Sydney (-33.8688, 151.2093) and Mumbai (19.0760, 72.8777), then find the temperature difference.'
  ];

  console.log('🚀 Running Provider Comparison Tests');
  console.log('=====================================\n');

  // Check API keys
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  console.log('🔑 API Key Status:');
  console.log(`   • Gemini: ${geminiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   • OpenAI: ${openaiKey ? '✅ Set' : '❌ Missing'}`);
  console.log('');

  const availableProviders: ChatProvider[] = [];
  if (geminiKey) availableProviders.push('gemini');
  if (openaiKey) availableProviders.push('openai', 'openai-response');

  if (availableProviders.length === 0) {
    console.error('❌ No API keys configured. Please set GEMINI_API_KEY and/or OPENAI_API_KEY');
    process.exit(1);
  }

  const allResults: ProviderResult[] = [];

  for (let i = 0; i < testQueries.length; i++) {
    const query = testQueries[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📝 Test ${i + 1}: ${query.substring(0, 60)}...`);
    console.log(`${'='.repeat(80)}`);

    // Test all available providers for this query
    const queryResults = await Promise.allSettled(
      availableProviders.map(provider => testProvider(provider, query))
    );

    queryResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allResults.push(result.value);
      } else {
        allResults.push({
          provider: availableProviders[index],
          success: false,
          error: String(result.reason),
        });
      }
    });
  }

  // Generate comparison report
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 FINAL COMPARISON REPORT');
  console.log(`${'='.repeat(80)}`);

  // Group results by provider
  const providerStats = new Map<ChatProvider, {
    successes: number;
    totalTests: number;
    avgTokens: number;
    avgResponseTime: number;
    errors: string[];
  }>();

  for (const result of allResults) {
    if (!providerStats.has(result.provider)) {
      providerStats.set(result.provider, {
        successes: 0,
        totalTests: 0,
        avgTokens: 0,
        avgResponseTime: 0,
        errors: [],
      });
    }

    const stats = providerStats.get(result.provider)!;
    stats.totalTests++;

    if (result.success && result.tokenUsage && result.responseTime) {
      stats.successes++;
      stats.avgTokens += result.tokenUsage.totalTokens;
      stats.avgResponseTime += result.responseTime;
    } else if (result.error) {
      stats.errors.push(result.error);
    }
  }

  // Print provider comparison
  for (const [provider, stats] of providerStats.entries()) {
    const successRate = (stats.successes / stats.totalTests * 100).toFixed(1);
    const avgTokens = stats.successes > 0 ? Math.round(stats.avgTokens / stats.successes) : 0;
    const avgTime = stats.successes > 0 ? Math.round(stats.avgResponseTime / stats.successes) : 0;

    console.log(`\n🤖 ${provider.toUpperCase()}:`);
    console.log(`   • Success Rate: ${successRate}% (${stats.successes}/${stats.totalTests})`);
    console.log(`   • Avg Tokens: ${avgTokens}`);
    console.log(`   • Avg Response Time: ${avgTime}ms`);
    
    if (stats.errors.length > 0) {
      console.log(`   • Errors: ${stats.errors.length}`);
    }
  }

  // Recommendations
  console.log('\n🎯 Recommendations:');
  const bestPerformer = Array.from(providerStats.entries())
    .filter(([_, stats]) => stats.successes > 0)
    .sort((a, b) => {
      const aAvgTime = a[1].avgResponseTime / a[1].successes;
      const bAvgTime = b[1].avgResponseTime / b[1].successes;
      return aAvgTime - bAvgTime;
    })[0];

  if (bestPerformer) {
    console.log(`• Fastest: ${bestPerformer[0]} (${Math.round(bestPerformer[1].avgResponseTime / bestPerformer[1].successes)}ms avg)`);
  }

  const mostEfficient = Array.from(providerStats.entries())
    .filter(([_, stats]) => stats.successes > 0)
    .sort((a, b) => {
      const aAvgTokens = a[1].avgTokens / a[1].successes;
      const bAvgTokens = b[1].avgTokens / b[1].successes;
      return aAvgTokens - bAvgTokens;
    })[0];

  if (mostEfficient) {
    console.log(`• Most Token Efficient: ${mostEfficient[0]} (${Math.round(mostEfficient[1].avgTokens / mostEfficient[1].successes)} tokens avg)`);
  }

  console.log('\n✨ All providers support the same IChat interface!');
}

/**
 * Main function
 */
async function main() {
  // Configure minimal logging for cleaner output
  configureLogger({
    level: LogLevel.WARN,
    autoDetectContext: false,
    includeTimestamp: false,
    enableColors: true,
  });

  try {
    await runComparison();
    console.log('\n✅ Comparison completed successfully!');
  } catch (error) {
    console.error('❌ Comparison failed:', error);
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

export { main as runProviderComparison };