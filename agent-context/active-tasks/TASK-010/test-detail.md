# SubAgent System Test Plan

## Test Objectives
Define comprehensive tests to validate the subagent system meets all design requirements and integration goals.

## 1. Unit Tests

### 1.1 SubAgentRegistry Tests
```typescript
describe('SubAgentRegistry', () => {
  it('should register subagent configurations');
  it('should retrieve registered configurations by name');
  it('should list all registered subagents');
  it('should generate correct system prompt snippet');
  it('should handle non-existent subagent lookups');
  it('should prevent duplicate registrations');
  it('should handle empty registry');
});
```

### 1.2 TaskTool Tests
```typescript
describe('TaskTool', () => {
  it('should have correct name and description');
  it('should generate schema with available subagents');
  it('should validate required parameters');
  it('should create temporary agent instance');
  it('should set subagent system prompt correctly');
  it('should inherit parent tools excluding Task tool');
  it('should clean up agent after task completion');
  it('should handle subagent execution errors');
  it('should support abort signal cancellation');
  it('should forward output updates when provided');
});
```

## 2. Integration Tests

### 2.1 BaseAgent Integration
```typescript
describe('BaseAgent with SubAgent support', () => {
  it('should register Task tool when registry provided');
  it('should include subagents in system prompt');
  it('should execute Task tool through tool scheduler');
  it('should handle multiple Task tool calls in parallel');
});
```

### 2.2 StandardAgent Integration
```typescript
describe('StandardAgent with SubAgent support', () => {
  it('should auto-register Task tool on initialization');
  it('should maintain session isolation for subagents');
  it('should track subagent token usage');
  it('should handle subagent errors gracefully');
});
```

### 2.3 Tool Scheduler Integration
```typescript
describe('Tool Scheduler with Task Tool', () => {
  it('should schedule Task tool like any other tool');
  it('should support parallel Task tool execution');
  it('should handle Task tool confirmation if needed');
  it('should cancel Task tool on abort signal');
});
```

## 3. Real-World Example Tests (No Mocks)

### 3.1 SubAgent Example - Similar to basicExample.ts
```typescript
/**
 * SubAgent Example - Real world test without mocks
 * This example demonstrates the subagent system with actual LLM calls
 */

import { 
  StandardAgent,
  AgentEventType,
  AllConfig,
  SubAgentRegistry,
  TaskTool
} from '../src/index.js';

async function testSubAgentSystem() {
  console.log('🚀 SubAgent System Example');
  console.log('================================\n');

  // 0. Create temporary working directory for subagents
  const tempDir = path.join(os.tmpdir(), `subagent-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`📁 Created temp directory: ${tempDir}\n`);

  // 1. Create SubAgent Registry and register real subagents
  const registry = new SubAgentRegistry();
  
  registry.register({
    name: 'code-analyzer',
    description: 'Analyze code structure and quality',
    systemPrompt: `You are a code analysis expert. Your role is to:
- Analyze code structure and organization
- Identify potential issues or improvements
- Assess code quality and best practices
- Provide specific, actionable feedback
Always be constructive and specific in your analysis.`,
    whenToUse: 'Use when code needs to be analyzed or reviewed'
  });

  registry.register({
    name: 'test-writer',
    description: 'Write comprehensive unit and integration tests',
    systemPrompt: `You are a test writing specialist. Your role is to:
- Write comprehensive test cases
- Cover edge cases and error scenarios
- Use appropriate testing patterns
- Ensure high code coverage
Always write tests that are maintainable and clear.`,
    whenToUse: 'Use when tests need to be created or updated'
  });

  registry.register({
    name: 'documentation-writer',
    description: 'Write clear and comprehensive documentation',
    systemPrompt: `You are a documentation expert. Your role is to:
- Write clear, concise documentation
- Include usage examples
- Document parameters and return values
- Explain complex concepts simply
Always focus on clarity and completeness.`,
    whenToUse: 'Use when documentation needs to be written'
  });

  // 2. Create main agent configuration
  const config: AllConfig = {
    chatProvider: 'gemini', // or 'openai'
    agentConfig: {
      model: 'gemini-2.0-flash',
      workingDirectory: tempDir, // Use temp directory
      apiKey: process.env.GEMINI_API_KEY!,
      sessionId: `subagent-demo-${Date.now()}`,
      maxHistoryTokens: 100000,
    },
    chatConfig: {
      apiKey: process.env.GEMINI_API_KEY!,
      modelName: 'gemini-2.0-flash',
      tokenLimit: 100000,
      systemPrompt: `You are a helpful assistant with access to specialized subagents.
${registry.generateSystemPromptSnippet()}

When you receive complex tasks, delegate them to the appropriate subagents using the Task tool.
You can call multiple subagents in parallel when tasks are independent.`
    },
    toolSchedulerConfig: {
      approvalMode: 'yolo',
      onAllToolCallsComplete: (calls) => {
        console.log(`✅ ${calls.length} tool(s) completed`);
      }
    }
  };

  // 3. Create shell tool for subagents (following BaseTool pattern from tools.ts)
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
      return `Execute command: ${params.command}`;
    }

    async execute(
      params: { command: string },
      abortSignal: AbortSignal,
      outputUpdateHandler?: (output: string) => void
    ): Promise<DefaultToolResult> {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      if (outputUpdateHandler) {
        outputUpdateHandler(this.formatProgress('Executing', params.command, '🔧'));
      }

      try {
        this.checkAbortSignal(abortSignal, 'Shell command execution');

        const { stdout, stderr } = await execAsync(params.command, {
          cwd: this.workingDir,
          timeout: 30000,
          signal: abortSignal
        });

        return new DefaultToolResult({
          success: true,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: 0
        });
      } catch (error: any) {
        return new DefaultToolResult({
          success: false,
          stdout: error.stdout?.trim() || '',
          stderr: error.stderr?.trim() || error.message,
          exitCode: error.code || 1
        });
      }
    }
  }

  const shellTool = new ShellTool(tempDir);

  // 4. Create main agent with Task tool and essential tools
  const agent = new StandardAgent([], config);
  
  // Create task tool with proper factory functions
  const taskTool = new TaskTool(
    registry,
    config.agentConfig,
    (cfg) => new GeminiChat(cfg),
    (cfg) => new CoreToolScheduler({ 
      tools: [shellTool], // Only shell tool for subagents
      ...config.toolSchedulerConfig 
    })
  );
  
  agent.registerTool(taskTool);
  agent.registerTool(shellTool); // Main agent also has shell access

  // 5. Write test file to temp directory for analysis
  const testFilePath = path.join(tempDir, 'calculateDiscount.ts');
  fs.writeFileSync(testFilePath, `
export function calculateDiscount(
  price: number,
  discountPercent: number,
  maxDiscount?: number
): number {
  if (price <= 0) {
    throw new Error('Price must be positive');
  }
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error('Discount must be between 0 and 100');
  }
  
  const discount = price * (discountPercent / 100);
  const finalDiscount = maxDiscount ? Math.min(discount, maxDiscount) : discount;
  return price - finalDiscount;
}
`);
  console.log(`📝 Created test file: ${testFilePath}\n`);

  // 6. Test conversation with subagent delegation
  console.log('💬 Starting conversation with subagent delegation...\n');
  
  const userMessage = `I have a TypeScript function in ${testFilePath}. Please:
1. Analyze the code quality and structure
2. Write comprehensive tests for it
3. Create documentation

The function calculates discounts with optional maximum limits. Please create test file as calculateDiscount.test.ts and documentation as calculateDiscount.md in the same directory.`;

  const abortController = new AbortController();
  const events = agent.processUserMessages(
    [userMessage],
    config.agentConfig.sessionId!,
    abortController.signal
  );

  // Track subagent calls
  const subagentCalls: { name: string; task: string; result?: string }[] = [];

  for await (const event of events) {
    switch (event.type) {
      case AgentEventType.ToolExecutionStart:
        const startData = event.data as any;
        if (startData.toolName === 'Task') {
          const args = JSON.parse(startData.args);
          console.log(`\n🤖 Delegating to ${args.subagent_name}:`);
          console.log(`   Task: ${args.task.substring(0, 100)}...`);
          subagentCalls.push({ 
            name: args.subagent_name, 
            task: args.task 
          });
        }
        break;

      case AgentEventType.ToolExecutionDone:
        const doneData = event.data as any;
        if (doneData.toolName === 'Task') {
          const lastCall = subagentCalls[subagentCalls.length - 1];
          if (lastCall) {
            lastCall.result = doneData.result?.result || 'No result';
            console.log(`✅ ${lastCall.name} completed`);
          }
        }
        break;

      case AgentEventType.ResponseChunkTextDelta:
        // Print main agent's response
        const deltaData = event.data as any;
        process.stdout.write(deltaData.content?.text_delta || '');
        break;

      case AgentEventType.TurnComplete:
        console.log('\n\n🛞 Turn complete');
        break;
    }
  }

  // 5. Verify results
  console.log('\n\n📊 Subagent Execution Summary:');
  console.log('================================');
  
  let allSuccessful = true;
  for (const call of subagentCalls) {
    const status = call.result ? '✅' : '❌';
    console.log(`${status} ${call.name}:`);
    console.log(`   Task: ${call.task.substring(0, 80)}...`);
    if (!call.result) allSuccessful = false;
  }

  // 6. Check that expected subagents were called
  const expectedSubagents = ['code-analyzer', 'test-writer', 'documentation-writer'];
  const calledSubagents = subagentCalls.map(c => c.name);
  
  console.log('\n📋 Verification:');
  for (const expected of expectedSubagents) {
    if (calledSubagents.includes(expected)) {
      console.log(`✅ ${expected} was called`);
    } else {
      console.log(`⚠️  ${expected} was NOT called`);
      allSuccessful = false;
    }
  }

  // 7. Verify created files
  console.log('\n📄 File Verification:');
  const expectedFiles = [
    'calculateDiscount.test.ts',
    'calculateDiscount.md'
  ];
  
  for (const file of expectedFiles) {
    const filePath = path.join(tempDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`✅ ${file} created (${stats.size} bytes)`);
    } else {
      console.log(`❌ ${file} NOT created`);
      allSuccessful = false;
    }
  }

  // 8. Clean up temp directory
  console.log(`\n🧹 Cleaning up temp directory: ${tempDir}`);
  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    success: allSuccessful,
    subagentCalls,
    tokenUsage: agent.getTokenUsage()
  };
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  testSubAgentSystem()
    .then(result => {
      console.log('\n✅ SubAgent example completed successfully!');
      console.log(`   Total tokens used: ${result.tokenUsage.totalTokens}`);
      if (!result.success) {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ SubAgent example failed:', error);
      process.exit(1);
    });
}
```

### 3.2 Complete SubAgent Example File (examples/subagentExample.ts)
```typescript
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
  DefaultToolResult,
  Type,
  Schema,
  LogLevel,
  configureLogger,
  GeminiChat,
  OpenAIChat,
  CoreToolScheduler
} from '../src/index.js';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

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
  ): Promise<DefaultToolResult> {
    if (outputUpdateHandler) {
      outputUpdateHandler(this.formatProgress('Executing', params.command, '🔧'));
    }

    try {
      this.checkAbortSignal(abortSignal, 'Shell command execution');
      
      const result = await this.executeCore(params);
      
      this.checkAbortSignal(abortSignal, 'Shell command execution');

      return new DefaultToolResult(result);
    } catch (error) {
      const errorResult = {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1
      };
      
      return new DefaultToolResult(errorResult);
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
  console.log('=' .repeat(70));
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
    
    const config: AllConfig = {
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
      (cfg) => new CoreToolScheduler({ 
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
```

### 3.2 Parallel SubAgent Execution Test
```typescript
test('Parallel execution of multiple subagents', async () => {
  // Setup registry with multiple subagents
  const registry = new SubAgentRegistry();
  registry.register(codeReviewerConfig);
  registry.register(testWriterConfig);
  
  // Create main agent
  const agent = new StandardAgent(config);
  
  // Simulate LLM calling multiple Task tools
  const messages = [{
    role: 'assistant',
    content: [{
      type: 'function_call',
      functionCall: {
        name: 'Task',
        args: JSON.stringify({ 
          task: 'Review this code', 
          subagent_name: 'code-reviewer' 
        })
      }
    }, {
      type: 'function_call',
      functionCall: {
        name: 'Task',
        args: JSON.stringify({ 
          task: 'Write tests', 
          subagent_name: 'test-writer' 
        })
      }
    }]
  }];
  
  // Both tasks should execute in parallel
  const startTime = Date.now();
  const results = await processMessages(agent, messages);
  const duration = Date.now() - startTime;
  
  // Assert parallel execution (should be faster than sequential)
  expect(results).toHaveLength(2);
  expect(duration).toBeLessThan(SEQUENTIAL_THRESHOLD);
});
```

### 3.3 Tool Inheritance Test
```typescript
test('Subagent inherits parent tools except Task', async () => {
  // Setup parent with various tools
  const parentTools = [
    new MockTool('Read'),
    new MockTool('Write'),
    new MockTool('Bash'),
    new TaskTool(...) // This should NOT be inherited
  ];
  
  const agent = new StandardAgent(config);
  parentTools.forEach(tool => agent.registerTool(tool));
  
  // Create subagent
  const subagentTools = getToolsForSubAgent({ name: 'test', tools: '*' });
  
  // Assert
  expect(subagentTools).toHaveLength(3); // All except Task
  expect(subagentTools.find(t => t.name === 'Task')).toBeUndefined();
  expect(subagentTools.find(t => t.name === 'Read')).toBeDefined();
});
```

### 3.4 Lifecycle Management Test
```typescript
test('Subagent lifecycle bound to task execution', async () => {
  const registry = new SubAgentRegistry();
  registry.register(testSubagentConfig);
  
  let agentInstances = 0;
  const originalFactory = chatFactory;
  const instrumentedFactory = (config) => {
    agentInstances++;
    return originalFactory(config);
  };
  
  const taskTool = new TaskTool(registry, config, instrumentedFactory, schedulerFactory);
  
  // Execute multiple tasks
  for (let i = 0; i < 3; i++) {
    await taskTool.execute({
      task: `Task ${i}`,
      subagent_name: 'test-subagent'
    }, new AbortController().signal);
  }
  
  // Each execution should create a new instance
  expect(agentInstances).toBe(3);
  
  // No persistent instances should remain
  expect(getCurrentAgentCount()).toBe(1); // Only parent agent
});
```

### 3.5 Error Handling Test
```typescript
test('Subagent error handling', async () => {
  const registry = new SubAgentRegistry();
  registry.register({
    name: 'error-subagent',
    description: 'Subagent that errors',
    systemPrompt: 'You must throw an error',
    whenToUse: 'Testing error handling'
  });
  
  const taskTool = new TaskTool(registry, config, chatFactory, schedulerFactory);
  
  // Should handle error gracefully
  const result = await taskTool.execute({
    task: 'Cause an error',
    subagent_name: 'error-subagent'
  }, new AbortController().signal);
  
  expect(result.data.success).toBe(false);
  expect(result.data.error).toBeDefined();
});
```

### 3.6 System Prompt Integration Test
```typescript
test('System prompt includes available subagents', async () => {
  const registry = new SubAgentRegistry();
  registry.register({
    name: 'researcher',
    description: 'Research specialist',
    systemPrompt: '...',
    whenToUse: 'For research tasks'
  });
  registry.register({
    name: 'coder',
    description: 'Coding expert',
    systemPrompt: '...',
    whenToUse: 'For coding tasks'
  });
  
  const agent = new StandardAgent(config);
  const taskTool = new TaskTool(registry, config, chatFactory, schedulerFactory);
  agent.registerTool(taskTool);
  
  const systemPrompt = agent.getSystemPrompt();
  
  expect(systemPrompt).toContain('Available subagent types:');
  expect(systemPrompt).toContain('- researcher: For research tasks');
  expect(systemPrompt).toContain('- coder: For coding tasks');
  expect(systemPrompt).toContain('When using the Task tool, you must specify a subagent_name');
});
```

### 3.7 No Nested Task Tools Test
```typescript
test('Subagents cannot access Task tool (no nesting)', async () => {
  const registry = new SubAgentRegistry();
  registry.register({
    name: 'parent-subagent',
    description: 'Parent subagent',
    systemPrompt: 'Try to use Task tool',
    whenToUse: 'Testing'
  });
  
  const parentAgent = new StandardAgent(config);
  const taskTool = new TaskTool(registry, config, chatFactory, schedulerFactory);
  parentAgent.registerTool(taskTool);
  parentAgent.registerTool(new MockTool('Read'));
  
  // Execute subagent
  const result = await taskTool.execute({
    task: 'Try to delegate to another subagent',
    subagent_name: 'parent-subagent'
  }, new AbortController().signal);
  
  // Verify subagent had no access to Task tool
  const subagentTools = getLastSubagentTools();
  expect(subagentTools.find(t => t.name === 'Task')).toBeUndefined();
  expect(subagentTools.find(t => t.name === 'Read')).toBeDefined();
});
```

## 4. Performance Tests

### 4.1 Subagent Creation Overhead
```typescript
test('Subagent creation overhead < 100ms', async () => {
  const registry = new SubAgentRegistry();
  registry.register(minimalSubagentConfig);
  
  const taskTool = new TaskTool(registry, config, chatFactory, schedulerFactory);
  
  const startTime = performance.now();
  await taskTool.execute({
    task: 'Minimal task',
    subagent_name: 'minimal'
  }, new AbortController().signal);
  const duration = performance.now() - startTime;
  
  expect(duration).toBeLessThan(100);
});
```

### 4.2 Memory Usage Test
```typescript
test('Memory cleanup after subagent execution', async () => {
  const registry = new SubAgentRegistry();
  registry.register(testSubagentConfig);
  
  const taskTool = new TaskTool(registry, config, chatFactory, schedulerFactory);
  
  const memBefore = process.memoryUsage().heapUsed;
  
  // Execute 10 tasks
  for (let i = 0; i < 10; i++) {
    await taskTool.execute({
      task: `Task ${i}`,
      subagent_name: 'test'
    }, new AbortController().signal);
  }
  
  // Force garbage collection
  global.gc();
  
  const memAfter = process.memoryUsage().heapUsed;
  const memIncrease = (memAfter - memBefore) / 1024 / 1024; // MB
  
  expect(memIncrease).toBeLessThan(10); // Less than 10MB increase
});
```

## 5. Acceptance Criteria

### 5.1 Functional Requirements
- [ ] Task tool can delegate to any registered subagent
- [ ] Subagents inherit all parent tools except Task tool
- [ ] Subagents cannot communicate with each other
- [ ] Subagent lifecycle is bound to task execution
- [ ] System prompt includes available subagents
- [ ] Multiple subagents can run in parallel

### 5.2 Non-Functional Requirements
- [ ] Subagent creation overhead < 100ms
- [ ] Memory per subagent < 10MB
- [ ] No memory leaks after execution
- [ ] Type-safe interfaces with TypeScript
- [ ] 80% test coverage minimum
- [ ] Zero breaking changes to existing API

### 5.3 Integration Requirements
- [ ] Works with BaseAgent
- [ ] Works with StandardAgent
- [ ] Integrates with existing tool scheduler
- [ ] Compatible with all chat providers (Gemini, OpenAI)
- [ ] Supports abort signals
- [ ] Handles errors gracefully

## 6. Test Execution Strategy

### Phase 1: Unit Tests (Day 1)
- Implement and run all unit tests
- Ensure 100% coverage of new code

### Phase 2: Integration Tests (Day 2)
- Test integration with existing components
- Verify no breaking changes

### Phase 3: E2E Tests (Day 3)
- Complete end-to-end scenarios
- Performance validation
- Memory leak testing

### Phase 4: Acceptance Testing (Day 4)
- Verify all acceptance criteria
- Documentation review
- Final integration test

## 7. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Test Coverage | ≥ 80% | Via coverage report |
| Subagent Overhead | < 100ms | Performance test |
| Memory Usage | < 10MB/instance | Memory profiling |
| Parallel Execution | Works correctly | E2E test validation |
| API Compatibility | 100% backward compatible | No existing tests fail |
| Type Safety | 100% typed | TypeScript strict mode |

## 8. Risk Mitigation

### Risk: Memory Leaks
**Mitigation**: Explicit cleanup in finally blocks, memory profiling tests

### Risk: Infinite Nesting
**Mitigation**: Task tool explicitly excluded from subagent tools

### Risk: Performance Degradation
**Mitigation**: Performance benchmarks, lazy initialization

### Risk: Breaking Changes
**Mitigation**: Comprehensive backward compatibility tests