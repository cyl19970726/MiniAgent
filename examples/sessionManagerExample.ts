/**
 * Session Manager Example
 * 
 * This example demonstrates the enhanced session management capabilities:
 * 1. Creating and switching between multiple conversation sessions
 * 2. Session-isolated conversation histories  
 * 3. Temperature comparison tasks across different sessions
 * 4. Session state persistence and restoration
 */

import { 
  StandardAgent,
  AgentEventType,
  AgentEvent,
  AllConfig,
  ITool,
  LogLevel,
  configureLogger,
} from '../src/index.js';

import { createWeatherTool, createSubTool } from './tools';
import dotenv from 'dotenv';
import { LLMChunkTextDelta, LLMChunkTextDone, MessageItem } from '../src/interfaces.js';
import { json } from 'stream/consumers';

dotenv.config();

/**
 * Process conversation in a session and collect results
 */
async function processConversation(
  agent: StandardAgent, 
  userMessage: string, 
  sessionId: string,
  provider: string
): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    console.log(`\n💬 [${provider}] Session: ${sessionId}`);
    console.log(`👤 User: ${userMessage}`);
    
    const abortController = new AbortController();
    let assistantResponse = '';
    
    // Set timeout
    setTimeout(() => {
      console.log(`⏰ [${provider}] Session ${sessionId}: Timeout, aborting...`);
      abortController.abort();
    }, 45000);
    
    // Process with session-aware method
    const events = agent.processWithSession(userMessage, sessionId, abortController.signal);
    
    for await (const event of events) {
      switch (event.type) {
        case AgentEventType.ToolExecutionStart:
          const toolStartData = event.data as any;
          console.log(`🔧 [${provider}] Session ${sessionId}: Tool started: ${toolStartData.toolName}`);
          break;
        case AgentEventType.ToolExecutionDone:
          const toolDoneData = event.data as any;
          console.log(`🔧 [${provider}] Session ${sessionId}: Tool completed: ${toolDoneData.toolName}`);
          break;
        case AgentEventType.ResponseChunkTextDelta:
          const deltaData = event.data as LLMChunkTextDelta;
          // process.stdout.write(deltaData.content.text_delta || '');
          assistantResponse += deltaData.content.text_delta || '';
          break;
        case AgentEventType.ResponseChunkTextDone:
          const textDoneData = event.data as LLMChunkTextDone;
          console.log(`\n🤖 [${provider}] Assistant response completed \n [content] ${textDoneData.content.text}`);
          break;
        case AgentEventType.ResponseComplete:
          console.log(`✅ [${provider}] Session ${sessionId}: Turn complete`);
          break;
        case AgentEventType.Error:
          const errorData = event.data as any;
          console.error(`❌ [${provider}] Session ${sessionId}: ${errorData.message}`);
          return { success: false, error: errorData.message };
      }
    }
    
    return { success: true, response: assistantResponse };
  } catch (error) {
    console.error(`❌ [${provider}] Session ${sessionId} failed:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Show session status
 */
function showSessionStatus(agent: StandardAgent, provider: string) {
  console.log(`\n📊 [${provider}] Session Status:`);
  const sessions = agent.getSessions();
  const currentSessionId = agent.getCurrentSessionId();
  
  sessions.forEach((session, index) => {
    const isCurrent = session.id === currentSessionId;
    const indicator = isCurrent ? '👉' : '  ';
    console.log(`${indicator} ${index + 1}. ${session.title} (${session.id})`);
    console.log(`     Created: ${new Date(session.createdAt).toLocaleString()}`);
    console.log(`     Last Active: ${new Date(session.lastActiveAt).toLocaleString()}`);
    console.log(`     Messages: ${session.messageHistory.length}`);
    console.log(`     Tokens: ${session.tokenUsage.totalTokens}`);
  });
  
  console.log(`\nTotal Sessions: ${sessions.length}`);
  console.log(`Current Session: ${currentSessionId}`);
}

/**
 * Test session management with temperature comparisons
 */
async function testSessionManagement(
  provider: 'gemini' | 'openai'
): Promise<{ success: boolean; error?: string }> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Testing Session Management with ${provider.toUpperCase()}`);
  console.log(`${'='.repeat(70)}`);

  try {
    // Get API key
    let apiKey: string;
    let modelName: string;
    
    switch (provider) {
      case 'openai':
        apiKey = process.env.OPENAI_API_KEY || '';
        modelName = 'gpt-4o';
        if (!apiKey) {
          console.error('❌ OPENAI_API_KEY environment variable is not set');
          return { success: false, error: 'Missing OPENAI_API_KEY' };
        }
        break;
      case 'gemini':
      default:
        apiKey = process.env.GEMINI_API_KEY || '';
        modelName = 'gemini-2.0-flash';
        if (!apiKey) {
          console.error('❌ GEMINI_API_KEY environment variable is not set');
          return { success: false, error: 'Missing GEMINI_API_KEY' };
        }
        break;
    }

    // Create agent configuration
    const config: AllConfig & { chatProvider?: 'gemini' | 'openai' } = {
      chatProvider: provider,
      agentConfig: {
        model: modelName,
        workingDirectory: process.cwd(),
        apiKey: apiKey,
        maxHistoryTokens: 100000,
      },
      chatConfig: {
        apiKey: apiKey,
        modelName: modelName,
        tokenLimit: 100000,
        systemPrompt: `You are a helpful weather assistant with access to weather and calculation tools.

IMPORTANT: 
- Always use tools to get real weather data
- After getting data for both cities, calculate the temperature difference using the subtract tool  
- Provide a clear summary of your findings
- Be concise but informative in your responses`,
      },
      toolSchedulerConfig: {
        approvalMode: 'yolo', // Auto-approve for demo
      },
    };

    console.log('🔑 API Key configured: Yes');
    console.log('🤖 Model:', modelName);
    console.log('');

    // Create agent with tools
    const tools = [createWeatherTool(), createSubTool()];
    const agent = new StandardAgent(tools, config);
    
    console.log('🤖 Agent created with session management enabled');
    
    // Show initial session status
    showSessionStatus(agent, provider);

    // ========================================================================
    // Session 1: Beijing vs Shanghai temperature comparison
    // ========================================================================
    console.log(`\n${'─'.repeat(50)}`);
    console.log('📍 Session 1: Beijing vs Shanghai Temperature Comparison');
    console.log(`${'─'.repeat(50)}`);
    
    const session1Id = agent.createNewSession('Beijing vs Shanghai');
    console.log(`✅ Created Session 1: ${session1Id}`);
    
    const beijing_shanghai_query = `Compare the current temperature between Beijing (latitude: 39.9042, longitude: 116.4074) and Shanghai (latitude: 31.2304, longitude: 121.4737). Get the weather for both cities and calculate the temperature difference.`;
    
    const result1 = await processConversation(agent, beijing_shanghai_query, session1Id, provider);
    if (!result1.success) {
      return { success: false, error: `Session 1 failed: ${result1.error}` };
    }

    // ========================================================================
    // Session 2: Shanghai vs Guangzhou temperature comparison  
    // ========================================================================
    console.log(`\n${'─'.repeat(50)}`);
    console.log('📍 Session 2: Shanghai vs Guangzhou Temperature Comparison');
    console.log(`${'─'.repeat(50)}`);
    
    const session2Id = agent.createNewSession('Shanghai vs Guangzhou');
    console.log(`✅ Created Session 2: ${session2Id}`);
    
    const shanghai_guangzhou_query = `Compare the current temperature between Shanghai (latitude: 31.2304, longitude: 121.4737) and Guangzhou (latitude: 23.1291, longitude: 113.2644). Get the weather for both cities and calculate the temperature difference.`;
    
    const result2 = await processConversation(agent, shanghai_guangzhou_query, session2Id, provider);
    if (!result2.success) {
      return { success: false, error: `Session 2 failed: ${result2.error}` };
    }

    // ========================================================================
    // Switch back to Session 1: Guangzhou vs Shenzhen comparison
    // ========================================================================
    console.log(`\n${'─'.repeat(50)}`);
    console.log('📍 Back to Session 1: Guangzhou vs Shenzhen Temperature Comparison');
    console.log(`${'─'.repeat(50)}`);
    
    const switchSuccess = agent.switchToSession(session1Id);
    if (!switchSuccess) {
      return { success: false, error: 'Failed to switch back to Session 1' };
    }
    console.log(`✅ Switched back to Session 1: ${session1Id}`);
    
    const guangzhou_shenzhen_query = `Now compare the current temperature between Guangzhou (latitude: 23.1291, longitude: 113.2644) and Shenzhen (latitude: 22.5431, longitude: 114.0579). Get the weather for both cities and calculate the temperature difference.`;
    
    const result3 = await processConversation(agent, guangzhou_shenzhen_query, session1Id, provider);
    if (!result3.success) {
      return { success: false, error: `Session 1 continuation failed: ${result3.error}` };
    }

    // ========================================================================
    // Show final session status and conversation histories
    // ========================================================================
    console.log(`\n${'='.repeat(70)}`);
    console.log('📋 Final Session Status and Conversation Histories');
    console.log(`${'='.repeat(70)}`);
    
    showSessionStatus(agent, provider);
    
    // Show conversation history for each session
    const sessions = agent.getSessions();
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      console.log(`\n\n\n📜 Session ${i + 1} (${session.title} ) Conversation History:`);
      console.log(`${'─'.repeat(40)}`);
      
      // let history = agent.sessionManager.getSession(session.id)!.messageHistory;
      // Switch to session to get its history
      agent.switchToSession(session.id);
      const history = agent.getChat().getHistory();
      
      let messageCount = 0;
      for (const message of history) {
        
          messageCount++;
          console.log(`   ${message.role}: ${JSON.stringify(message.content, null, 2)}`);

      }
      
      if (messageCount === 0) {
        console.log('   (No conversation messages)');
      }
    }

    // Show token usage summary
    console.log(`\n📊 [${provider}] Token Usage Summary:`);
    const finalStatus = agent.getStatus();
    console.log(`   • Input tokens: ${finalStatus.tokenUsage.inputTokens}`);
    console.log(`   • Output tokens: ${finalStatus.tokenUsage.outputTokens}`);
    console.log(`   • Total tokens: ${finalStatus.tokenUsage.totalTokens}`);
    console.log(`   • Usage: ${finalStatus.tokenUsage.usagePercentage.toFixed(2)}%`);
    
    console.log(`\n✅ [${provider}] Session management test completed successfully!`);
    console.log('\n🎯 Demonstrated Features:');
    console.log('   • Created multiple isolated conversation sessions');
    console.log('   • Switched between sessions while preserving context');
    console.log('   • Each session maintained independent conversation history');
    console.log('   • Session metadata tracking (creation time, activity, token usage)');
    console.log('   • Session-aware weather comparisons across different city pairs');
    
    return { success: true };
    
  } catch (error) {
    console.error(`❌ [${provider}] Session management test failed:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Main demonstration function
 */
async function main() {
  console.log('🚀 Session Manager Example');
  console.log('===========================\n');
  console.log('This example demonstrates:');
  console.log('• Creating multiple conversation sessions');
  console.log('• Session-isolated weather comparisons:');
  console.log('  - Session 1: Beijing vs Shanghai');
  console.log('  - Session 2: Shanghai vs Guangzhou');  
  console.log('  - Back to Session 1: Guangzhou vs Shenzhen');
  console.log('• Session state management and history preservation\n');

  // Configure logger
  configureLogger({
    level: LogLevel.INFO,
    autoDetectContext: true,
    includeTimestamp: true,
    enableColors: true,
  });

  // Determine provider from environment or default to gemini
  const provider = (process.env.CHAT_PROVIDER as 'gemini' | 'openai') || 'openai';
  console.log(`🧪 Testing with provider: ${provider.toUpperCase()}`);
  
  // Run the session management test
  const result = await testSessionManagement(provider);
  
  if (result.success) {
    console.log('\n✅ Session Manager Example completed successfully!');
  } else {
    console.log(`\n❌ Session Manager Example failed: ${result.error}`);
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

export { main as runSessionManagerExample };