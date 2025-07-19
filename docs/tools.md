# Tools System Documentation

## Overview

The tools system in the Gemini CLI agent provides a comprehensive framework for executing actions on behalf of the AI. It includes built-in safety mechanisms through confirmation workflows, real-time execution monitoring, and flexible state management.

## Architecture

### Core Components

1. **Tool Interface (`ITool`)**: Defines the contract that all tools must implement
2. **Tool Scheduler (`CoreToolScheduler`)**: Manages tool lifecycle and execution
3. **Tool Registry**: Stores and provides access to available tools
4. **Confirmation System**: Handles user approval for potentially dangerous operations

### Tool Lifecycle States

Tools progress through the following states during execution:

```
Validating → AwaitingApproval → Scheduled → Executing → Success/Error/Cancelled
                    ↓                           ↓
                 Cancelled                  Cancelled
```

- **Validating**: Initial state when tool is being validated
- **AwaitingApproval**: Tool requires user confirmation before execution
- **Scheduled**: Tool is approved and ready to execute
- **Executing**: Tool is currently running
- **Success/Error/Cancelled**: Terminal states

## Tool Scheduler Implementation

The `CoreToolScheduler` manages the complete lifecycle of tool execution:

### Initialization

```typescript
const scheduler = new CoreToolScheduler({
  toolRegistry: toolRegistryPromise,
  approvalMode: 'default', // 'default' | 'always' | 'yolo'
  outputUpdateHandler: (callId, output) => {
    // Handle real-time output updates
  },
  onToolCallsUpdate: (toolCalls) => {
    // Handle state changes
  },
  onAllToolCallsComplete: (completedCalls) => {
    // Handle completion
  }
});
```

### Execution Flow

1. **Schedule Phase**: Tool calls are scheduled for execution
2. **Validation Phase**: Parameters are validated and tools are resolved
3. **Confirmation Phase**: Tools requiring approval wait for user input
4. **Execution Phase**: Approved tools are executed
5. **Completion Phase**: Results are collected and callbacks triggered

## Implementing User Confirmation

The confirmation system allows tools to request user approval before executing potentially dangerous operations.

### Client-Side Implementation

To implement user confirmation in your client application:

#### 1. Monitor Tool State Updates

```typescript
class ToolSchedulerClient {
  private scheduler: CoreToolScheduler;
  private pendingConfirmations = new Map<string, IWaitingToolCall>();
  
  constructor(config: IToolSchedulerConfig) {
    this.scheduler = new CoreToolScheduler({
      ...config,
      onToolCallsUpdate: this.handleToolCallsUpdate.bind(this),
    });
  }
  
  private handleToolCallsUpdate(toolCalls: IToolCall[]) {
    // Check for tools awaiting approval
    for (const call of toolCalls) {
      if (call.status === ToolCallStatus.AwaitingApproval) {
        const waitingCall = call as IWaitingToolCall;
        
        if (!this.pendingConfirmations.has(call.request.callId)) {
          this.pendingConfirmations.set(call.request.callId, waitingCall);
          this.showConfirmation(waitingCall);
        }
      } else {
        // Clean up processed confirmations
        this.pendingConfirmations.delete(call.request.callId);
      }
    }
  }
}
```

#### 2. Display Confirmation UI

```typescript
private showConfirmation(toolCall: IWaitingToolCall) {
  const { confirmationDetails } = toolCall;
  
  // Show different UI based on confirmation type
  switch (confirmationDetails.type) {
    case 'destructive':
      this.showDestructiveConfirmation(toolCall);
      break;
    case 'edit':
      this.showEditConfirmation(toolCall);
      break;
    default:
      this.showGenericConfirmation(toolCall);
  }
}
```

#### 3. Handle User Responses

```typescript
// Approve execution
async approve(callId: string) {
  await this.scheduler.handleConfirmationResponse(
    callId,
    ToolConfirmationOutcome.ProceedOnce
  );
}

// Cancel execution
async cancel(callId: string) {
  await this.scheduler.handleConfirmationResponse(
    callId,
    ToolConfirmationOutcome.Cancel
  );
}

// Approve with modifications
async approveWithModification(callId: string, newContent: string) {
  await this.scheduler.handleConfirmationResponse(
    callId,
    ToolConfirmationOutcome.ModifyWithEditor,
    { newContent }
  );
}
```

### React Component Example

```tsx
function ToolConfirmationDialog({ toolCall, scheduler }) {
  const [isModifying, setIsModifying] = useState(false);
  const [modifiedContent, setModifiedContent] = useState(
    toolCall.confirmationDetails.currentContent || ''
  );
  
  const handleApprove = async () => {
    await scheduler.handleConfirmationResponse(
      toolCall.request.callId,
      ToolConfirmationOutcome.ProceedOnce
    );
  };
  
  const handleCancel = async () => {
    await scheduler.handleConfirmationResponse(
      toolCall.request.callId,
      ToolConfirmationOutcome.Cancel
    );
  };
  
  const handleModifyAndApprove = async () => {
    await scheduler.handleConfirmationResponse(
      toolCall.request.callId,
      ToolConfirmationOutcome.ModifyWithEditor,
      { newContent: modifiedContent }
    );
  };
  
  return (
    <Dialog open={true}>
      <DialogTitle>Confirm: {toolCall.request.name}</DialogTitle>
      
      <DialogContent>
        <Typography>{toolCall.confirmationDetails.message}</Typography>
        
        {toolCall.confirmationDetails.type === 'edit' && (
          <>
            {!isModifying ? (
              <CodeBlock>{toolCall.confirmationDetails.currentContent}</CodeBlock>
            ) : (
              <TextField
                multiline
                fullWidth
                value={modifiedContent}
                onChange={(e) => setModifiedContent(e.target.value)}
              />
            )}
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        {toolCall.confirmationDetails.type === 'edit' && (
          <Button onClick={() => setIsModifying(!isModifying)}>
            {isModifying ? 'View Original' : 'Modify'}
          </Button>
        )}
        <Button 
          onClick={isModifying ? handleModifyAndApprove : handleApprove}
          variant="contained"
        >
          {isModifying ? 'Save & Execute' : 'Approve'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

## Confirmation Types

Tools can request different types of confirmations:

### 1. Destructive Operations

For operations that might delete or modify important data:

```typescript
confirmationDetails: {
  type: 'destructive',
  title: 'Delete File',
  message: 'This will permanently delete the file. Are you sure?',
}
```

### 2. Edit Operations

For operations where the user might want to review or modify content:

```typescript
confirmationDetails: {
  type: 'edit',
  title: 'Write File',
  message: 'Review the content before writing to disk',
  currentContent: 'File content here...',
  filePath: '/path/to/file',
}
```

### 3. Generic Confirmations

For any other operations requiring user consent:

```typescript
confirmationDetails: {
  type: 'generic',
  title: 'Run Command',
  message: 'Execute npm install?',
}
```

## Approval Modes

The scheduler supports three approval modes:

1. **`default`**: Uses tool-specific confirmation logic
2. **`always`**: Always requires confirmation for every tool
3. **`yolo`**: Auto-approves all tools (dangerous, use with caution)

## Real-time Output Updates

Tools can provide real-time output during execution:

```typescript
const scheduler = new CoreToolScheduler({
  outputUpdateHandler: (callId, output) => {
    // Update UI with live output
    console.log(`Tool ${callId}: ${output}`);
  }
});
```

## Error Handling

The scheduler provides comprehensive error handling:

1. **Validation Errors**: Caught during the validation phase
2. **Execution Errors**: Caught during tool execution
3. **Timeout Errors**: Tools are cancelled after 60 seconds
4. **User Cancellation**: Tools can be cancelled via AbortSignal

## Best Practices

1. **Always validate parameters** before executing tools
2. **Request confirmation** for destructive or sensitive operations
3. **Provide clear messages** in confirmation dialogs
4. **Handle all confirmation outcomes** appropriately
5. **Clean up resources** when tools are cancelled
6. **Use real-time output** for long-running operations
7. **Implement proper error handling** for all tool operations

## Example: Complete Client Implementation

```typescript
class ToolExecutionClient {
  private scheduler: CoreToolScheduler;
  private ui: UIManager;
  
  constructor() {
    this.scheduler = new CoreToolScheduler({
      toolRegistry: this.loadTools(),
      approvalMode: 'default',
      
      onToolCallsUpdate: (calls) => {
        this.handleToolUpdates(calls);
      },
      
      outputUpdateHandler: (callId, output) => {
        this.ui.appendOutput(callId, output);
      },
      
      onAllToolCallsComplete: (completed) => {
        this.ui.showCompletionSummary(completed);
      }
    });
  }
  
  private handleToolUpdates(calls: IToolCall[]) {
    calls.forEach(call => {
      switch (call.status) {
        case ToolCallStatus.AwaitingApproval:
          this.ui.showConfirmationDialog(call as IWaitingToolCall);
          break;
        case ToolCallStatus.Executing:
          this.ui.showProgressIndicator(call.request.callId);
          break;
        case ToolCallStatus.Success:
        case ToolCallStatus.Error:
        case ToolCallStatus.Cancelled:
          this.ui.hideProgressIndicator(call.request.callId);
          break;
      }
    });
  }
  
  async executeTool(request: IToolCallRequestInfo) {
    try {
      await this.scheduler.schedule(request, new AbortController().signal);
    } catch (error) {
      this.ui.showError(`Tool execution failed: ${error.message}`);
    }
  }
}
```

## Conclusion

The tools system provides a robust framework for safe and controlled tool execution. By implementing proper confirmation workflows and monitoring tool states, you can ensure that potentially dangerous operations are handled safely while maintaining a smooth user experience.