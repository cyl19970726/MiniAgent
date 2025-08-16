# SubAgent System Architecture for MiniAgent

## 1. Design Goals

### 1.1 Primary Goals
- **Modularity**: Enable complex tasks to be broken down into specialized subtasks handled by focused subagents
- **Scalability**: Support parallel execution of multiple subagents for improved performance
- **Simplicity**: Maintain MiniAgent's lightweight philosophy - no heavy orchestration frameworks
- **Reusability**: Subagents should be reusable components that can be composed in different workflows
- **Type Safety**: Leverage TypeScript for compile-time safety across the subagent system

### 1.2 Technical Goals
- **Context Isolation**: Each subagent operates in its own context without interference
- **Resource Management**: Efficient token usage and memory management across subagents
- **Error Resilience**: Graceful handling of subagent failures without affecting the parent agent
- **Observability**: Clear event streams and logging for debugging multi-agent workflows
- **Backward Compatibility**: Seamless integration with existing BaseAgent and StandardAgent

## 2. Design Principles

### 2.1 Single Responsibility Principle
Each subagent should have a single, well-defined purpose and expertise area. This enables:
- Clear task boundaries
- Easier testing and maintenance
- Better prompt engineering per subagent
- Predictable behavior

### 2.2 Autonomous Execution
Subagents should be able to complete their tasks independently once provided with context:
- No back-and-forth communication during execution
- All necessary context passed upfront
- Self-contained task completion
- Clear success/failure criteria

### 2.3 Stateless Design
Subagents should be stateless between task executions:
- No persistent state between tasks
- Clean context for each execution
- Predictable and reproducible results
- Easy horizontal scaling

### 2.4 Tool Unification
Subagents should be accessible as tools to maintain consistency:
- Implement ITool interface for seamless integration
- Work with existing tool scheduler
- Support tool confirmation flows
- Enable LLM to naturally invoke subagents

### 2.5 Progressive Enhancement
The subagent system should enhance, not replace, existing functionality:
- BaseAgent and StandardAgent continue to work unchanged
- Subagent features are opt-in
- Gradual adoption path
- No breaking changes to existing APIs

### 2.6 Event Stream Flexibility
Parent agents should have control over subagent event consumption:
- Option to ignore subagent internal events
- Option to aggregate and forward events
- Option to fully stream subagent events
- Clear event namespacing

### 2.7 Subagent Isolation
Subagents operate in complete isolation to ensure predictability:
- **No Inter-Subagent Communication**: Subagents cannot communicate with each other directly
- **No Task Tool Access**: Subagents cannot have the Task tool to prevent multi-layer nesting
- **Lifecycle Bound to Task**: Subagent instances exist only for the duration of their task execution
- **Inherit Parent Tools**: Subagents use "*" to inherit all tools from parent agent (except Task tool)

## 3. Architecture Design

### 3.1 Core Components Overview (Simplified)

```
┌─────────────────────────────────────────────────────────────┐
│                        Main Agent                            │
│  (BaseAgent/StandardAgent with Task Tool)                    │
│                                                               │
│  System Prompt includes:                                     │
│  "Available subagent types:                                  │
│   - code-reviewer: Review code for best practices            │
│   - test-writer: Write comprehensive tests                   │
│   - researcher: Research and gather information"             │
└─────────────┬─────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│                       Task Tool                               │
│  Parameters: { task, subagent_name }                          │
│  - Gets subagent config from registry                         │
│  - Creates temporary agent instance                           │
│  - Executes task                                              │
│  - Returns result                                             │
│  - Destroys agent instance                                    │
└─────────────┬─────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│                    SubAgent Registry                          │
│  - Stores subagent configurations (name, description, prompt) │
│  - Provides list for system prompt generation                 │
│  - No persistent instances (stateless)                        │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Core Interfaces (Simplified)

```typescript
// Simple task definition based on your design
export interface SubAgentTask {
  // Core fields (from your design)
  name: string;
  description: string;
}

// Simple result definition based on your design  
export interface SubAgentResult {
  // Core field (from your design)
  result: string;
  
  // Basic metadata
  success: boolean;
  error?: string;
}
```

### 3.3 SubAgent Configuration

```typescript
// SubAgent configuration stored in registry
export interface SubAgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[];  // Default: "*" - inherit all parent tools (except Task tool)
  whenToUse?: string;  // Optional: guidance on when to use this subagent
}
```

### 3.4 SubAgent Registry

```typescript
export class SubAgentRegistry {
  private configs = new Map<string, SubAgentConfig>();
  
  // Register a subagent configuration
  register(config: SubAgentConfig): void {
    this.configs.set(config.name, config);
  }
  
  // Get subagent configuration
  getConfig(name: string): SubAgentConfig | undefined {
    return this.configs.get(name);
  }
  
  // List all registered subagents for system prompt
  listSubAgents(): Array<{ name: string; description: string; whenToUse?: string }> {
    return Array.from(this.configs.values()).map(config => ({
      name: config.name,
      description: config.description,
      whenToUse: config.whenToUse
    }));
  }
  
  // Generate system prompt snippet for available subagents
  generateSystemPromptSnippet(): string {
    const subagents = this.listSubAgents();
    if (subagents.length === 0) return '';
    
    return `Available subagent types:
${subagents.map(s => `- ${s.name}: ${s.whenToUse || s.description}`).join('\n')}

When using the Task tool, you must specify a subagent_name parameter to select which subagent type to use.`;
  }
}
```

### 3.5 Task Tool Implementation

```typescript
export interface TaskToolParams {
  task: string;           // Task description
  subagent_name: string;  // Which subagent to use
}

export class TaskTool extends BaseTool<TaskToolParams, DefaultToolResult> {
  constructor(
    private registry: SubAgentRegistry,
    private parentConfig: IAgentConfig,
    private chatFactory: (config: IAgentConfig) => IChat,
    private toolSchedulerFactory: (config: IToolSchedulerConfig) => IToolScheduler
  ) {
    super();
  }
  
  get name(): string {
    return 'Task';
  }
  
  get description(): string {
    const subagents = this.registry.listSubAgents();
    
    return `Launch a new agent to handle complex, multi-step tasks autonomously.

Available agent types and the tools they have access to:
${subagents.map(s => `- ${s.name}: ${s.whenToUse || s.description} (Tools: *)`).join('\n')}

When using the Task tool, you must specify a subagent_name parameter to select which agent type to use.

When NOT to use the Task tool:
- If you want to read a specific file path, use the Read or Glob tool instead of the Task tool
- If you are searching for a specific class definition like "class Foo", use the Glob tool instead
- If you are searching for code within a specific file or set of 2-3 files, use the Read tool instead
- Simple operations that can be done with a single tool call
- Tasks that don't match any registered subagent's expertise

Usage notes:
1. Launch multiple agents concurrently whenever possible to maximize performance
2. When the agent is done, it will return a single message back to you
3. Each agent invocation is stateless - no information persists between calls
4. The agent's outputs should generally be trusted
5. Clearly tell the agent whether you expect it to write code or just to do research
6. Subagents inherit all parent tools except the Task tool (no nesting allowed)

Example usage:
<example>
User: "Please review this code and write tests for it"
Assistant: I'll use the Task tool to delegate these specialized tasks:

1. First, I'll have the code-reviewer subagent review the code
2. Then, I'll have the test-writer subagent create comprehensive tests

[Calls Task tool with subagent_name: "code-reviewer"]
[Calls Task tool with subagent_name: "test-writer"]
</example>`;
  }
  
  get schema(): ToolDeclaration {
    return {
      name: 'Task',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The task for the agent to perform'
          },
          subagent_name: {
            type: 'string',
            description: 'The type of specialized agent to use for this task',
            enum: this.registry.listSubAgents().map(s => s.name)
          }
        },
        required: ['task', 'subagent_name']
      }
    };
  }
  
  async execute(
    params: TaskToolParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<DefaultToolResult> {
    const config = this.registry.getConfig(params.subagent_name);
    
    if (!config) {
      throw new Error(`SubAgent '${params.subagent_name}' not found`);
    }
    
    // Create temporary agent with subagent's system prompt
    const agentConfig: IAgentConfig = {
      ...this.parentConfig,
      sessionId: `subagent-${Date.now()}`, // Unique session for isolation
    };
    
    const chat = this.chatFactory(agentConfig);
    const toolScheduler = this.toolSchedulerFactory({ 
      tools: this.getToolsForSubAgent(config) 
    });
    
    // Create temporary agent instance
    const agent = new BaseAgent(agentConfig, chat, toolScheduler);
    
    try {
      // Set the subagent's system prompt
      agent.setSystemPrompt(config.systemPrompt);
      
      // Process the task
      const messages: MessageItem[] = [{
        role: 'user',
        content: [{ type: 'text', text: params.task }]
      }];
      
      let result = '';
      for await (const event of agent.processOneTurn(
        agentConfig.sessionId!,
        messages,
        signal
      )) {
        // Optionally forward progress updates
        if (updateOutput && event.type === AgentEventType.ResponseChunkTextDelta) {
          const chunk = (event as any).data;
          if (chunk?.delta) {
            updateOutput(chunk.delta);
          }
        }
        
        // Collect final result
        if (event.type === AgentEventType.ResponseComplete) {
          const response = (event as any).data;
          if (response?.messages?.[0]?.content) {
            result = response.messages[0].content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('');
          }
        }
      }
      
      return new DefaultToolResult({
        result,
        success: true,
        subagent: params.subagent_name
      });
      
    } finally {
      // Clean up - agent instance will be garbage collected
      agent.clearHistory();
    }
  }
  
  private getToolsForSubAgent(config: SubAgentConfig): ITool[] {
    // Get tools from parent's tool scheduler
    const parentTools = this.parentToolScheduler.getToolList();
    
    // Default to "*" - inherit all parent tools except Task tool
    if (!config.tools || config.tools.includes('*')) {
      return parentTools.filter(tool => tool.name !== 'Task');
    }
    
    // Filter specific tools if specified
    return parentTools.filter(tool => 
      config.tools!.includes(tool.name) && tool.name !== 'Task'
    );
  }
}
```

## 4. Integration Strategy

### 4.1 Integration with BaseAgent/StandardAgent
```typescript
// Enhanced agent initialization with subagent support
const registry = new SubAgentRegistry();

// Register subagents
registry.register({
  name: 'code-reviewer',
  description: 'Review code for best practices and security issues',
  systemPrompt: 'You are a code review expert...',
  whenToUse: 'Use after writing significant code'
  // tools defaults to "*" - all parent tools except Task
});

registry.register({
  name: 'test-writer',
  description: 'Write comprehensive unit and integration tests',
  systemPrompt: 'You are a test writing expert...',
  whenToUse: 'Use when tests need to be created or updated'
  // tools defaults to "*" - all parent tools except Task
});

// Create Task tool and register it
const taskTool = new TaskTool(
  registry,
  agentConfig,
  (config) => new GeminiChat(config),
  (config) => new CoreToolScheduler(config)
);

agent.registerTool(taskTool);

// Update agent's system prompt to include available subagents
const currentPrompt = agent.getSystemPrompt() || '';
agent.setSystemPrompt(
  currentPrompt + '\n\n' + registry.generateSystemPromptSnippet()
);
```

### 4.2 Integration with Existing Tool System
- Task Tool is just another tool managed by IToolScheduler
- Supports parallel execution when multiple Task tools are called
- Works with tool confirmation system
- Proper error handling and cancellation support

## 5. Example Usage Patterns

### 5.1 LLM-Driven Delegation
```typescript
// User: "Review this code and write tests for it"

// LLM automatically calls Task tool twice (in parallel via tool scheduler):
// 1. Task { task: "Review the code for...", subagent_name: "code-reviewer" }
// 2. Task { task: "Write tests for...", subagent_name: "test-writer" }

// Results are returned to LLM for synthesis
```

### 5.2 Programmatic Usage
```typescript
// Direct tool invocation
const result = await taskTool.execute(
  {
    task: 'Research TypeScript decorators and provide examples',
    subagent_name: 'researcher'
  },
  abortSignal
);

console.log(result.data.result);
```

### 5.3 Example SubAgent Configurations
```typescript
// Example subagent configurations
const subagentConfigs: SubAgentConfig[] = [
  {
    name: 'researcher',
    description: 'Research and gather information',
    systemPrompt: `You are a research specialist. Your role is to:
- Search for relevant information
- Summarize findings clearly
- Provide sources when available
- Focus on accuracy and completeness`,
    whenToUse: 'Use when information needs to be gathered or researched'
    // tools: "*" by default - inherits all parent tools except Task
  },
  {
    name: 'architect',
    description: 'Design system architecture and technical solutions',
    systemPrompt: `You are a system architect. Your role is to:
- Design scalable solutions
- Consider trade-offs
- Document architectural decisions
- Ensure type safety and best practices`,
    whenToUse: 'Use when designing new features or systems'
    // tools: "*" by default - inherits all parent tools except Task
  },
  {
    name: 'debugger',
    description: 'Debug issues and find root causes',
    systemPrompt: `You are a debugging specialist. Your role is to:
- Analyze error messages
- Trace execution flow
- Identify root causes
- Suggest fixes with explanations`,
    whenToUse: 'Use when debugging errors or investigating issues'
    // tools: "*" by default - inherits all parent tools except Task
  }
];
```

## 6. Implementation Roadmap

### Phase 1: Core Implementation
1. Define SubAgentTask and SubAgentResult interfaces in `src/interfaces.ts`
2. Create `src/subagent/registry.ts` with SubAgentRegistry class
3. Create `src/subagent/taskTool.ts` with TaskTool implementation

### Phase 2: Integration
1. Update BaseAgent to support subagent registry in constructor
2. Modify StandardAgent to auto-register Task tool when registry provided
3. Update system prompt generation to include available subagents

### Phase 3: Examples & Testing
1. Create example subagent configurations
2. Write tests for SubAgentRegistry
3. Write tests for TaskTool
4. Create usage examples

## 7. Key Benefits of This Design

1. **Simplicity**: No complex scheduler needed - leverages existing tool system
2. **Stateless**: Each subagent invocation is independent
3. **Type-Safe**: Full TypeScript support with proper interfaces
4. **Lightweight**: Minimal overhead, agents created on-demand and destroyed after use
5. **Flexible**: Subagents can have different tool access and prompts
6. **Natural Integration**: Works seamlessly with LLM's tool calling
7. **Parallel Support**: Multiple subagents can run in parallel via existing tool scheduler

## 8. Summary

This simplified subagent architecture:
- Uses a single `Task` tool with `{ task, subagent_name }` parameters
- Stores subagent configurations (name, description, systemPrompt, tools) in a registry
- Creates temporary agent instances on-demand for each task
- Destroys agents after task completion (stateless)
- Integrates subagent list into main agent's system prompt
- Leverages existing IToolScheduler for orchestration (no new scheduler needed)

The design maintains MiniAgent's lightweight philosophy while enabling powerful multi-agent workflows through the existing tool system.

## 9. Acceptance Criteria and Validation

### 9.1 Acceptance Standard
The subagent system implementation will be considered complete when ALL tests defined in `/agent-context/active-tasks/TASK-010/test-detail.md` pass successfully.

### 9.2 Test Categories Required for Acceptance

#### Unit Tests (Section 1 of test-detail.md)
- ✅ SubAgentRegistry Tests: All 7 test cases must pass
- ✅ TaskTool Tests: All 10 test cases must pass

#### Integration Tests (Section 2 of test-detail.md)
- ✅ BaseAgent Integration: All 4 test cases must pass
- ✅ StandardAgent Integration: All 4 test cases must pass
- ✅ Tool Scheduler Integration: All 4 test cases must pass

#### Real-World Example Tests (Section 3 of test-detail.md)
- ✅ SubAgent Example (subagentExample.ts): Must run successfully with real LLM calls
  - Creates temporary directory
  - Delegates to at least 3 different subagents
  - Generates expected output files
  - Cleans up resources properly

#### Performance Tests (Section 4 of test-detail.md)
- ✅ Subagent Creation Overhead: < 100ms per instance
- ✅ Memory Usage: < 10MB per subagent instance
- ✅ No memory leaks after execution

### 9.3 Functional Requirements Checklist
All items in Section 5.1 of test-detail.md must be verified:
- [ ] Task tool can delegate to any registered subagent
- [ ] Subagents inherit all parent tools except Task tool
- [ ] Subagents cannot communicate with each other
- [ ] Subagent lifecycle is bound to task execution
- [ ] System prompt includes available subagents
- [ ] Multiple subagents can run in parallel

### 9.4 Non-Functional Requirements Checklist
All items in Section 5.2 of test-detail.md must be met:
- [ ] Subagent creation overhead < 100ms
- [ ] Memory per subagent < 10MB
- [ ] No memory leaks after execution
- [ ] Type-safe interfaces with TypeScript
- [ ] 80% test coverage minimum
- [ ] Zero breaking changes to existing API

### 9.5 Integration Requirements Checklist
All items in Section 5.3 of test-detail.md must be satisfied:
- [ ] Works with BaseAgent
- [ ] Works with StandardAgent
- [ ] Integrates with existing tool scheduler
- [ ] Compatible with all chat providers (Gemini, OpenAI)
- [ ] Supports abort signals
- [ ] Handles errors gracefully

### 9.6 Validation Process

1. **Run Unit Tests**: `npm test src/subagent/`
2. **Run Integration Tests**: `npm test:integration`
3. **Run Real Example**: `npx tsx examples/subagentExample.ts`
4. **Verify Coverage**: `npm run test:coverage` (must be ≥ 80%)
5. **Performance Validation**: Run performance benchmarks
6. **Memory Profiling**: Verify no memory leaks with heap snapshots

### 9.7 Definition of Done

The TASK-010 SubAgent implementation is COMPLETE when:
1. ✅ All test suites in test-detail.md pass
2. ✅ Code coverage is ≥ 80%
3. ✅ Real-world example (subagentExample.ts) runs successfully
4. ✅ Performance benchmarks meet targets (< 100ms overhead, < 10MB memory)
5. ✅ No breaking changes to existing MiniAgent APIs
6. ✅ Documentation is complete and accurate
7. ✅ Code review completed and approved

**Reference Document**: All detailed test specifications and acceptance criteria are defined in `/agent-context/active-tasks/TASK-010/test-detail.md`. This document serves as the authoritative source for validation requirements.