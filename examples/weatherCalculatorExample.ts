/**
 * Weather Calculator Example
 * 
 * This example demonstrates how to:
 * 1. Create an Agent with custom tools
 * 2. Register weather and calculator tools
 * 3. Process a user request that requires both tools
 * 4. Handle multi-turn execution until completion
 */

import { Agent, IAgentConfig, GeminiEventType, AgentEventType, ApprovalMode } from '../src/index.js';
import { WeatherTool } from './weatherTool.js';
import { CalculateTool } from './calculateTool.js';

async function main() {
  console.log('🌤️  Weather Calculator Example');
  console.log('=====================================\n');

  // Check API key
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Error: GEMINI_API_KEY environment variable is not set');
    console.log('Please set your API key:');
    console.log('export GEMINI_API_KEY="your-api-key-here"');
    console.log('For testing, you can also set it inline:');
    console.log('GEMINI_API_KEY="your-key" npx tsx weatherCalculatorExample.ts');
    process.exit(1);
  }

  // Create agent configuration
  const config: IAgentConfig = {
    model: 'gemini-1.5-flash-latest',
    workingDirectory: process.cwd(),
    apiKey: process.env.GEMINI_API_KEY,
    approvalMode: ApprovalMode.AUTO_EDIT, // Automatic approval for seamless execution
    debugMode: true,
    maxHistorySize: 100,
    maxHistoryTokens: 5000,
  };

  console.log('🔑 API Key configured:', process.env.GEMINI_API_KEY ? 'Yes' : 'No');
  console.log('🤖 Model:', config.model);

  try {
    // Create agent
    console.log('🤖 Creating agent...');
    const agent = await Agent.create(config);
    
    // Register custom tools
    console.log('🔧 Registering tools...');
    const toolRegistry = agent.getToolRegistry();
    
    // Register weather tool
    const weatherTool = new WeatherTool();
    toolRegistry.registerTool(weatherTool);
    console.log('🔧 Registered weather tool:', weatherTool.name);
    
    // Register calculator tool
    const calculateTool = new CalculateTool();
    toolRegistry.registerTool(calculateTool);
    console.log('🔧 Registered calculator tool:', calculateTool.name);
    
    // Verify tools are registered
    const registeredTools = toolRegistry.getAllTools();
    console.log('📋 Total tools registered:', registeredTools.length);
    console.log('🔧 Available tools:', registeredTools.map(t => t.name).join(', '));
    
    console.log('✅ Tools setup complete\n');

    // Set system prompt - be very explicit about tool usage
    agent.setSystemPrompt(`You are a helpful assistant. You MUST use the available tools to answer questions.

IMPORTANT: You have access to these tools and MUST use them:
- get_weather: Get weather for a city (call this for each city mentioned)
- calculate: Perform mathematical calculations (call this for any math)

For weather questions:
1. ALWAYS call get_weather tool for each city
2. ALWAYS call calculate tool for any temperature differences
3. NEVER make up weather data - only use tool results

Example: If asked about weather difference between Beijing and Shanghai:
- Call get_weather with city: "Beijing" 
- Call get_weather with city: "Shanghai"
- Call calculate with the temperature difference expression

You MUST use these tools. Do not provide answers without calling the tools first.`);

    // Set up event handlers
    setupEventHandlers(agent);

    // Process user request
    const userRequest = '计算北京和上海的天气差';
    console.log(`👤 User: ${userRequest}\n`);

    const sessionId = `weather-calc-${Date.now()}`;
    const abortController = new AbortController();

    // Set timeout for the entire operation
    setTimeout(() => {
      console.log('\n⏰ Timeout reached, aborting...');
      abortController.abort();
    }, 30000); // 30 second timeout

    let responseText = '';
    let toolCallCount = 0;

    // Process the request
    const eventStream = agent.process(userRequest, sessionId, abortController.signal);

    for await (const event of eventStream) {
      switch (event.type) {
        case GeminiEventType.Content:
          responseText += event.value;
          break;
          
        case GeminiEventType.ToolCallRequest:
          toolCallCount++;
          console.log(`\n🔧 [${toolCallCount}] Tool requested: ${event.value.name}`);
          if (Object.keys(event.value.args).length > 0) {
            console.log(`   Arguments: ${JSON.stringify(event.value.args, null, 2)}`);
          }
          break;
          
        case AgentEventType.ToolExecuting:
          console.log(`⚙️  Executing: ${event.value.name}`);
          break;
          
        case AgentEventType.ToolComplete:
          console.log(`✅ Completed: ${event.value.completedToolCall.request.name}`);
          break;
          
        case AgentEventType.ToolWaitingApproval:
          console.log(`⏳ Waiting for approval: ${event.value.name}`);
          break;
          
        case GeminiEventType.Thought:
          console.log(`💭 Thinking: ${event.value.subject} - ${event.value.description}`);
          break;
          
        case GeminiEventType.Error:
          console.error(`❌ Error: ${event.value.error.message}`);
          break;
          
        case GeminiEventType.MaxSessionTurns:
          console.log('\n⚠️  Maximum session turns reached');
          break;
      }
    }

    console.log("AGENT RESPONSE: ", responseText);
    
    // Debug: Show the prompt that would be built
    console.log('\n🔍 Debug: Final prompt structure:');
    const finalHistory = agent.getExecutionHistory();
    console.log('History records:', finalHistory.length);
    finalHistory.forEach((record, index) => {
      console.log(`${index + 1}. ${record.type}: ${record.type === 'tool_call' ? record.toolCall.request.name : 'text'}`);
    });

    // Final summary
    console.log('\n\n' + '='.repeat(50));
    console.log('📊 Execution Summary:');
    console.log(`   • Total turns: ${agent.getStatus().currentTurn}`);
    console.log(`   • Tool calls made: ${toolCallCount}`);
    console.log(`   • History size: ${agent.getExecutionHistory().length} records`);
    console.log('='.repeat(50));

    // Show execution history
    console.log('\n📜 Execution History:');
    const history = agent.getExecutionHistory();
    history.forEach((record: any, index: number) => {
      const timestamp = new Date(record.timestamp).toLocaleTimeString();
      console.log(`${index + 1}. [${timestamp}] ${record.type}: ${
        record.type === 'tool_call' 
          ? `${record.toolCall.request.name} (${record.toolCall.status})`
          : record.content?.substring(0, 50) + (record.content?.length > 50 ? '...' : '')
      }`);
    });

  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

/**
 * Set up event handlers for monitoring
 */
function setupEventHandlers(agent: Agent) {
  // General event logger
  agent.onEvent('logger', (event: any) => {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${event.type}:`, event.value);
    }
  });

  // Performance monitor
  let toolStartTime: number;
  agent.onEvent('performance', (event: any) => {
    if (event.type === AgentEventType.ToolExecuting) {
      toolStartTime = Date.now();
    } else if (event.type === AgentEventType.ToolComplete) {
      const duration = Date.now() - toolStartTime;
      console.log(`⏱️  Tool execution time: ${duration}ms`);
    }
  });

  // Error handler
  agent.onEvent('error-handler', (event: any) => {
    if (event.type === GeminiEventType.Error) {
      console.error('🚨 System error detected:', event.value.error.message);
    }
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal, shutting down...');
  process.exit(0);
});

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main as runWeatherCalculatorExample };