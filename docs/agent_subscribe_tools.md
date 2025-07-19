# Agent Tool Subscription and Callbacks

This document explains how to subscribe to tool execution events when creating an agent and understand the complete callback flow.

## Creating an Agent with Tool Callbacks

When creating a `StandardAgent`, you can configure callbacks through the `toolSchedulerConfig` property:

### Basic Example

```typescript
import { StandardAgent } from './standardAgent';
import { AllConfig, IToolCall, ICompletedToolCall } from './interfaces';

// Define your tools
const tools = [
  new FileReadTool(),
  new FileWriteTool(),
  new CommandExecuteTool(),
];

// Configure the agent with callbacks
const config: AllConfig = {
  agentConfig: {
    // agent configuration
  },
  chatConfig: {
    // chat configuration
  },
  toolSchedulerConfig: {
    // 1. Tool state updates - called whenever any tool changes state
    onToolCallsUpdate: (toolCalls: IToolCall[]) => {
      console.log('Tool calls updated:', toolCalls.length);
      toolCalls.forEach(call => {
        console.log(`- ${call.request.name}: ${call.status}`);
      });
    },
    
    // 2. Real-time output - called during tool execution
    outputUpdateHandler: (callId: string, output: string) => {
      console.log(`[${callId}] Output:`, output);
    },
    
    // 3. All complete - called once when all tools finish
    onAllToolCallsComplete: (completedCalls: ICompletedToolCall[]) => {
      console.log('All tools completed!');
      completedCalls.forEach(call => {
        console.log(`- ${call.request.name}: ${call.status}`);
      });
    },
    
    // Optional: Set approval mode
    approvalMode: 'default', // 'default' | 'always' | 'yolo'
  }
};

// Create the agent
const agent = new StandardAgent(tools, config);
```

## Practical Example: Tool Execution Monitor

Here's a more practical example that monitors tool execution:

```typescript
class ToolExecutionMonitor {
  private toolStates = new Map<string, string>();
  private toolOutputs = new Map<string, string[]>();
  
  createAgentConfig(): AllConfig {
    return {
      agentConfig: {
        // your agent config
      },
      chatConfig: {
        // your chat config
      },
      toolSchedulerConfig: {
        onToolCallsUpdate: this.handleToolUpdate.bind(this),
        outputUpdateHandler: this.handleOutput.bind(this),
        onAllToolCallsComplete: this.handleComplete.bind(this),
      }
    };
  }
  
  private handleToolUpdate(toolCalls: IToolCall[]) {
    toolCalls.forEach(call => {
      const previousState = this.toolStates.get(call.request.callId);
      const currentState = call.status;
      
      if (previousState !== currentState) {
        console.log(`[${call.request.name}] ${previousState || 'new'} → ${currentState}`);
        this.toolStates.set(call.request.callId, currentState);
        
        // Handle specific state transitions
        switch (currentState) {
          case 'awaiting_approval':
            console.log(`⚠️  Tool "${call.request.name}" needs approval`);
            break;
          case 'executing':
            console.log(`▶️  Tool "${call.request.name}" started`);
            break;
          case 'success':
            console.log(`✅ Tool "${call.request.name}" completed`);
            break;
          case 'error':
            console.log(`❌ Tool "${call.request.name}" failed`);
            break;
        }
      }
    });
  }
  
  private handleOutput(callId: string, output: string) {
    if (!this.toolOutputs.has(callId)) {
      this.toolOutputs.set(callId, []);
    }
    this.toolOutputs.get(callId)!.push(output);
    
    // Display output (could be sent to UI, logged, etc.)
    console.log(`[Output] ${output}`);
  }
  
  private handleComplete(completedCalls: ICompletedToolCall[]) {
    console.log('\n=== Execution Summary ===');
    completedCalls.forEach(call => {
      const outputs = this.toolOutputs.get(call.request.callId) || [];
      console.log(`\n${call.request.name}:`);
      console.log(`  Status: ${call.status}`);
      console.log(`  Duration: ${call.durationMs}ms`);
      if (outputs.length > 0) {
        console.log(`  Output lines: ${outputs.length}`);
      }
    });
    
    // Clean up
    this.toolStates.clear();
    this.toolOutputs.clear();
  }
}

// Usage
const monitor = new ToolExecutionMonitor();
const agent = new StandardAgent(tools, monitor.createAgentConfig());
```

## Complete Callback Flow

Here's the complete flow of callbacks during tool execution:

### 1. Tool Scheduling Phase
```
User: "Read the config file and update the version"
     ↓
Agent schedules tools: [ReadFileTool, WriteFileTool]
     ↓
onToolCallsUpdate([
  { id: "1", name: "ReadFile", status: "validating" },
  { id: "2", name: "WriteFile", status: "validating" }
])
```

### 2. Validation and Confirmation Phase
```
Tool validation completes
     ↓
onToolCallsUpdate([
  { id: "1", name: "ReadFile", status: "scheduled" },
  { id: "2", name: "WriteFile", status: "awaiting_approval" }
])
     ↓
User approves WriteFile
     ↓
onToolCallsUpdate([
  { id: "1", name: "ReadFile", status: "scheduled" },
  { id: "2", name: "WriteFile", status: "scheduled" }
])
```

### 3. Execution Phase
```
ReadFile starts executing
     ↓
onToolCallsUpdate([
  { id: "1", name: "ReadFile", status: "executing" },
  { id: "2", name: "WriteFile", status: "scheduled" }
])
     ↓
outputUpdateHandler("1", "Reading config.json...")
outputUpdateHandler("1", "File content: {...}")
     ↓
onToolCallsUpdate([
  { id: "1", name: "ReadFile", status: "success" },
  { id: "2", name: "WriteFile", status: "executing" }
])
     ↓
outputUpdateHandler("2", "Writing updated config...")
     ↓
onToolCallsUpdate([
  { id: "1", name: "ReadFile", status: "success" },
  { id: "2", name: "WriteFile", status: "success" }
])
```

### 4. Completion Phase
```
All tools finished
     ↓
onAllToolCallsComplete([
  { id: "1", name: "ReadFile", status: "success", durationMs: 50 },
  { id: "2", name: "WriteFile", status: "success", durationMs: 30 }
])
```

## Handling Tool Confirmations

When tools require user confirmation, you'll need to handle the approval flow:

```typescript
const config: AllConfig = {
  // ... other config
  toolSchedulerConfig: {
    onToolCallsUpdate: async (toolCalls) => {
      // Check for tools awaiting approval
      const waitingTools = toolCalls.filter(
        tc => tc.status === 'awaiting_approval'
      );
      
      for (const tool of waitingTools) {
        // Show confirmation UI
        const approved = await showConfirmationDialog(tool);
        
        if (approved) {
          // Get the agent's tool scheduler and approve
          agent.toolScheduler.handleConfirmationResponse(
            tool.request.callId,
            ToolConfirmationOutcome.ProceedOnce
          );
        } else {
          // Cancel the tool
          agent.toolScheduler.handleConfirmationResponse(
            tool.request.callId,
            ToolConfirmationOutcome.Cancel
          );
        }
      }
    }
  }
};
```

## Real-World Example: Chat Interface Integration

```typescript
class ChatInterface {
  private agent: StandardAgent;
  private messageHistory: any[] = [];
  
  constructor() {
    this.agent = new StandardAgent(tools, {
      agentConfig: { /* ... */ },
      chatConfig: { /* ... */ },
      toolSchedulerConfig: {
        onToolCallsUpdate: this.updateToolStatus.bind(this),
        outputUpdateHandler: this.appendToolOutput.bind(this),
        onAllToolCallsComplete: this.showToolSummary.bind(this),
      }
    });
  }
  
  private updateToolStatus(toolCalls: IToolCall[]) {
    // Update UI to show tool status
    toolCalls.forEach(tc => {
      this.updateToolCard(tc.request.callId, {
        name: tc.request.name,
        status: tc.status,
        isWaitingApproval: tc.status === 'awaiting_approval'
      });
    });
  }
  
  private appendToolOutput(callId: string, output: string) {
    // Append output to tool's output area in UI
    this.appendToToolOutput(callId, output);
  }
  
  private showToolSummary(completedCalls: ICompletedToolCall[]) {
    // Show summary in chat
    const summary = completedCalls.map(tc => 
      `${tc.request.name}: ${tc.status} (${tc.durationMs}ms)`
    ).join('\n');
    
    this.addMessage({
      role: 'system',
      content: `Tools completed:\n${summary}`
    });
  }
  
  async sendMessage(text: string) {
    this.addMessage({ role: 'user', content: text });
    
    try {
      const response = await this.agent.runSingleTurn(text);
      this.addMessage({ role: 'assistant', content: response });
    } catch (error) {
      this.addMessage({ role: 'error', content: error.message });
    }
  }
}
```

## Key Points

1. **All callbacks are optional** - Only configure the ones you need
2. **onToolCallsUpdate** is called frequently - Keep the handler efficient
3. **outputUpdateHandler** is real-time - Use for streaming output to UI
4. **onAllToolCallsComplete** is called once - Use for cleanup and summaries
5. **Callbacks run synchronously** - Don't block them with heavy operations
6. **Tool approval requires additional handling** - Monitor for `awaiting_approval` status

## Best Practices

1. **Use callbacks for UI updates**, not business logic
2. **Keep callback handlers lightweight** - offload heavy work to background tasks
3. **Handle all tool states** - including error and cancelled states
4. **Clean up resources** in the completion callback
5. **Use structured logging** to track tool execution flow
6. **Consider buffering output** updates if they're too frequent

## Debugging Tool Execution

Enable detailed logging to understand the callback flow:

```typescript
const debugConfig: AllConfig = {
  // ... other config
  toolSchedulerConfig: {
    onToolCallsUpdate: (toolCalls) => {
      console.group('Tool Update');
      console.table(toolCalls.map(tc => ({
        id: tc.request.callId,
        tool: tc.request.name,
        status: tc.status,
        hasOutput: 'liveOutput' in tc
      })));
      console.groupEnd();
    },
    outputUpdateHandler: (callId, output) => {
      console.log(`[${new Date().toISOString()}] ${callId}: ${output}`);
    },
    onAllToolCallsComplete: (completed) => {
      console.group('Execution Complete');
      console.table(completed.map(tc => ({
        tool: tc.request.name,
        status: tc.status,
        duration: `${tc.durationMs}ms`,
        error: tc.response?.error?.message
      })));
      console.groupEnd();
    }
  }
};
```

This debugging setup helps you understand exactly when and why callbacks are triggered during tool execution.