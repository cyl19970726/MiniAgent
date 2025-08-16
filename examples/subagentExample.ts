/**
 * SubAgent System Example
 * 
 * This example demonstrates how to use the SubAgent system with:
 * 1. Multiple specialized subagents (analyzer, tester, documenter)
 * 2. Real tool execution (shell commands)
 * 3. Temporary isolated working directories
 * 4. Parallel subagent execution
 * 
 * To run: npx tsx examples/subagentExample.ts
 */

import { 
  StandardAgent,
  AgentEventType,
  AgentEvent,
  AllConfig,
  SubAgentRegistry,
  TaskTool,
  BaseTool,
  Type,
  Schema,
  LogLevel,
  configureLogger,
  GeminiChat,
  OpenAIChat,
  CoreToolScheduler
} from '../src/index.js';
import { DefaultToolResult } from '../src/interfaces.js';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

/**
 * Shell Tool Implementation - following BaseTool pattern from tools.ts
 */
class ShellTool extends BaseTool<{ command: string }, { success: boolean; stdout: string; stderr: string; exitCode: number }> {
  constructor(private workingDir: string) {
    super(
      'shell',
      'Shell Command Tool', 
      'Execute shell commands in the working directory',
      {
        type: Type.OBJECT,
        properties: {
          command: {
            type: Type.STRING,
            description: 'Shell command to execute'
          }
        },
        required: ['command']
      },
      false, // isOutputMarkdown
      true   // canUpdateOutput
    );
  }

  override validateToolParams(params: { command: string }): string | null {
    const requiredError = this.validateRequiredParams(params, ['command']);
    if (requiredError) return requiredError;

    const typeError = this.validateParameterTypes(params, {
      command: 'string'
    });
    if (typeError) return typeError;

    // Security check - prevent dangerous commands
    const dangerous = ['rm -rf /', 'dd if=', 'mkfs', ':(){:|:&};:'];
    if (dangerous.some(cmd => params.command.includes(cmd))) {
      return 'Command contains potentially dangerous operations';
    }

    return null;
  }

  override getDescription(params: { command: string }): string {
    return `Execute: ${params.command}`;
  }

  protected async executeCore(params: { command: string }): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
    console.log(`   🔧 Executing: ${params.command}`);
    
    try {
      const { stdout, stderr } = await execAsync(params.command, {
        cwd: this.workingDir,
        timeout: 30000
      });

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0
      };
    } catch (error: any) {
      return {
        success: false,
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message,
        exitCode: error.code || 1
      };
    }
  }

  async execute(
    params: { command: string },
    abortSignal: AbortSignal,
    outputUpdateHandler?: (output: string) => void
  ): Promise<DefaultToolResult<{ success: boolean; stdout: string; stderr: string; exitCode: number }>> {
    if (outputUpdateHandler) {
      outputUpdateHandler(this.formatProgress('Executing', params.command, '🔧'));
    }

    try {
      this.checkAbortSignal(abortSignal, 'Shell command execution');
      
      const result = await this.executeCore(params);
      
      this.checkAbortSignal(abortSignal, 'Shell command execution');

      return new DefaultToolResult<{ success: boolean; stdout: string; stderr: string; exitCode: number }>(result);
    } catch (error) {
      const errorResult = {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1
      };
      
      return new DefaultToolResult<{ success: boolean; stdout: string; stderr: string; exitCode: number }>(errorResult);
    }
  }
}

/**
 * Create shell tool for command execution
 */
function createShellTool(workingDir: string): ShellTool {
  return new ShellTool(workingDir);
}

/**
 * Create and configure subagent registry
 */
function createSubAgentRegistry(): SubAgentRegistry {
  const registry = new SubAgentRegistry();
  
  // Code Analyzer SubAgent
  registry.register({
    name: 'code-analyzer',
    description: 'Analyze code structure, quality, and suggest improvements',
    systemPrompt: `You are a code analysis expert. Your responsibilities:
- Analyze code structure and organization
- Identify potential bugs and issues
- Assess code quality and best practices
- Suggest specific improvements
- Check for security vulnerabilities
When analyzing, be thorough but constructive. Focus on actionable feedback.`,
    whenToUse: 'Use when code needs to be reviewed or analyzed for quality'
  });

  // Test Writer SubAgent
  registry.register({
    name: 'test-writer',
    description: 'Write comprehensive unit and integration tests',
    systemPrompt: `You are a test writing specialist. Your responsibilities:
- Write comprehensive test suites
- Cover edge cases and error scenarios
- Use appropriate testing patterns (AAA - Arrange, Act, Assert)
- Ensure high code coverage
- Include both positive and negative test cases
Write tests using Jest/Vitest conventions. Make tests clear and maintainable.`,
    whenToUse: 'Use when tests need to be created or updated'
  });

  // Documentation Writer SubAgent
  registry.register({
    name: 'doc-writer',
    description: 'Create clear technical documentation',
    systemPrompt: `You are a documentation expert. Your responsibilities:
- Write clear, comprehensive documentation
- Include usage examples
- Document all parameters, return values, and exceptions
- Create both API docs and usage guides
- Use markdown format
Focus on clarity and completeness. Include code examples where helpful.`,
    whenToUse: 'Use when documentation needs to be written or updated'
  });

  // Debugger SubAgent
  registry.register({
    name: 'debugger',
    description: 'Debug issues and find root causes',
    systemPrompt: `You are a debugging specialist. Your responsibilities:
- Analyze error messages and stack traces
- Identify root causes of issues
- Suggest specific fixes
- Verify fixes work correctly
Be methodical in your debugging approach. Always test your solutions.`,
    whenToUse: 'Use when debugging errors or investigating issues'
  });

  return registry;
}

/**
 * Main test function
 */
async function runSubAgentExample() {
  const startTime = Date.now();
  
  console.log('🚀 SubAgent System Example');
  console.log('='.repeat(70));
  console.log('This example demonstrates delegating tasks to specialized subagents.\n');

  // Check for API key
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  const provider = process.env.GEMINI_API_KEY ? 'gemini' : 'openai';
  const model = provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4';
  
  if (!apiKey) {
    console.error('❌ Error: No API key found');
    console.log('Please set either GEMINI_API_KEY or OPENAI_API_KEY');
    process.exit(1);
  }

  // Create temporary working directory
  const tempDir = path.join(os.tmpdir(), `subagent-example-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`📁 Working directory: ${tempDir}\n`);

  try {
    // 1. Setup registry and configuration
    const registry = createSubAgentRegistry();
    const shellTool = createShellTool(tempDir);
    
    const config: AllConfig & { chatProvider: 'gemini' | 'openai' } = {
      chatProvider: provider as 'gemini' | 'openai',
      agentConfig: {
        model,
        workingDirectory: tempDir,
        apiKey,
        sessionId: `subagent-example-${Date.now()}`,
        maxHistoryTokens: 100000,
        debugMode: false,
      },
      chatConfig: {
        apiKey,
        modelName: model,
        tokenLimit: 100000,
        systemPrompt: `You are a helpful assistant with access to specialized subagents.

${registry.generateSystemPromptSnippet()}

When you receive tasks that match a subagent's expertise, delegate to them using the Task tool.
You can call multiple subagents in parallel for independent tasks.
After subagents complete their work, synthesize their results for the user.`
      },
      toolSchedulerConfig: {
        approvalMode: 'yolo',
        onAllToolCallsComplete: (calls) => {
          console.log(`\n✅ Completed ${calls.length} tool call(s)`);
        }
      }
    };

    // 2. Create agent with Task tool
    console.log('🤖 Initializing agent with subagent support...');
    const agent = new StandardAgent([shellTool], config);
    
    // Create TaskTool with proper factories
    const taskTool = new TaskTool(
      registry,
      config.agentConfig,
      (cfg) => provider === 'gemini' ? new GeminiChat(cfg) : new OpenAIChat(cfg),
      async (cfg) => new CoreToolScheduler({ 
        tools: [shellTool],
        ...config.toolSchedulerConfig 
      })
    );
    
    agent.registerTool(taskTool);
    console.log('✅ Agent initialized with', registry.listSubAgents().length, 'subagents\n');

    // 3. Create test file for analysis
    const sourceFile = path.join(tempDir, 'mathUtils.ts');
    fs.writeFileSync(sourceFile, `
// Mathematical utility functions
export class MathUtils {
  /**
   * Calculate the factorial of a number
   */
  static factorial(n: number): number {
    if (n < 0) {
      throw new Error('Factorial is not defined for negative numbers');
    }
    if (n === 0 || n === 1) {
      return 1;
    }
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  }

  /**
   * Check if a number is prime
   */
  static isPrime(n: number): boolean {
    if (n <= 1) return false;
    if (n <= 3) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    
    for (let i = 5; i * i <= n; i += 6) {
      if (n % i === 0 || n % (i + 2) === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Calculate the greatest common divisor
   */
  static gcd(a: number, b: number): number {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) {
      const temp = b;
      b = a % b;
      a = temp;
    }
    return a;
  }
}
`);
    console.log(`📝 Created source file: ${sourceFile}\n`);

    // 4. Execute task with subagent delegation
    console.log('💬 Sending task to agent...\n');
    const userMessage = `I have a TypeScript file at mathUtils.ts with mathematical utility functions.
Please:
1. Analyze the code quality and structure
2. Write comprehensive unit tests (save as mathUtils.test.ts)
3. Create API documentation (save as mathUtils.md)

Coordinate these tasks efficiently using the specialized subagents.`;

    const abortController = new AbortController();
    setTimeout(() => abortController.abort(), 120000); // 2 minute timeout

    // Track execution
    const subagentCalls: any[] = [];
    let mainAgentResponse = '';

    // Process events
    const events = agent.processUserMessages(
      [userMessage],
      config.agentConfig.sessionId!,
      abortController.signal
    );

    for await (const event of events) {
      switch (event.type) {
        case AgentEventType.ToolExecutionStart:
          const startData = event.data as any;
          if (startData.toolName === 'Task') {
            const args = typeof startData.args === 'string' 
              ? JSON.parse(startData.args) 
              : startData.args;
            console.log(`\n🤖 Delegating to ${args.subagent_name}`);
            console.log(`   📋 Task: "${args.task.substring(0, 100)}..."`);
            subagentCalls.push({ 
              name: args.subagent_name, 
              task: args.task,
              startTime: Date.now()
            });
          }
          break;

        case AgentEventType.ToolExecutionDone:
          const doneData = event.data as any;
          if (doneData.toolName === 'Task' && subagentCalls.length > 0) {
            const call = subagentCalls[subagentCalls.length - 1];
            call.duration = Date.now() - call.startTime;
            call.success = !doneData.error;
            console.log(`   ✅ Completed in ${call.duration}ms`);
          }
          break;

        case AgentEventType.ResponseChunkTextDelta:
          const deltaData = event.data as any;
          const text = deltaData.content?.text_delta || deltaData.delta || '';
          mainAgentResponse += text;
          process.stdout.write(text);
          break;

        case AgentEventType.TurnComplete:
          console.log('\n\n✅ Task completed');
          break;
      }
    }

    // 5. Verify results
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESULTS VERIFICATION');
    console.log('='.repeat(70));

    // Check subagent calls
    console.log('\n📤 SubAgent Calls:');
    for (const call of subagentCalls) {
      const status = call.success ? '✅' : '❌';
      console.log(`${status} ${call.name} (${call.duration}ms)`);
    }

    // Check created files
    console.log('\n📄 Generated Files:');
    const expectedFiles = ['mathUtils.test.ts', 'mathUtils.md'];
    let allFilesCreated = true;

    for (const fileName of expectedFiles) {
      const filePath = path.join(tempDir, fileName);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`✅ ${fileName} (${stats.size} bytes)`);
        
        // Show snippet of generated content
        const content = fs.readFileSync(filePath, 'utf-8');
        const snippet = content.substring(0, 200).replace(/\n/g, '\n   ');
        console.log(`   Preview: ${snippet}...`);
      } else {
        console.log(`❌ ${fileName} - NOT CREATED`);
        allFilesCreated = false;
      }
    }

    // Token usage
    const tokenUsage = agent.getTokenUsage();
    console.log('\n📈 Token Usage:');
    console.log(`   Input: ${tokenUsage.inputTokens}`);
    console.log(`   Output: ${tokenUsage.outputTokens}`);
    console.log(`   Total: ${tokenUsage.totalTokens}`);

    // Execution time
    const duration = Date.now() - startTime;
    console.log(`\n⏱️  Total execution time: ${(duration / 1000).toFixed(2)}s`);

    // Success determination
    const success = subagentCalls.length >= 2 && allFilesCreated;
    
    if (success) {
      console.log('\n✅ SubAgent example completed successfully!');
    } else {
      console.log('\n⚠️  SubAgent example completed with issues');
      if (subagentCalls.length < 2) {
        console.log('   - Expected at least 2 subagent calls');
      }
      if (!allFilesCreated) {
        console.log('   - Not all expected files were created');
      }
    }

    return { success, subagentCalls, tokenUsage };

  } finally {
    // Cleanup
    console.log(`\n🧹 Cleaning up ${tempDir}`);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal, shutting down...');
  process.exit(0);
});

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  runSubAgentExample()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

export { runSubAgentExample };