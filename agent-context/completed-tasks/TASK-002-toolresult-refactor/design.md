# ToolResult Interface Refactor - Design Document

## Current State Analysis

### Current ToolResult Interface
```typescript
// src/interfaces.ts (line 75-77)
export interface ToolResult {
  result: string; // success message or error message
}
```

### Current Usage Points

1. **Interface Definition**: `src/interfaces.ts`
   - Used as generic constraint in ITool<TParams, TResult extends ToolResult>
   - Referenced by tool implementations

2. **BaseAgent**: `src/baseAgent.ts` 
   - Line 344: `result: response.result` - extracts result for tool execution done event
   - Line 363: `result: response.result!` - adds to chat history as function_response

3. **CoreToolScheduler**: `src/coreToolScheduler.ts`
   - Line 444: `result: result.result` - stores in successful tool call response
   - Line 537: Sets cancelled result message
   - Line 564: Sets error result message

4. **Tool Implementations**:
   - `src/baseTool.ts` - Base class using ToolResult
   - `src/tools/todo.ts` - Returns ToolResult
   - `examples/tools.ts` - Example tools return ToolResult

## Proposed Design

### New ToolResult Interface
```typescript
export interface ToolResult {
  success: boolean;    // Indicates if tool execution was successful
  message: string;     // Success message or error description
}
```

### Implementation Strategy

#### 1. Interface Changes (`src/interfaces.ts`)
```typescript
// Line 75-77 becomes:
export interface ToolResult {
  success: boolean;
  message: string;
}
```

#### 2. BaseAgent Changes (`src/baseAgent.ts`)

**Tool Result in History (Line 355-367)**:
```typescript
// Current:
content: {
  type: 'function_response',
  functionResponse: {
    call_id: request.callId,
    name: request.name,
    result: response.result!,  // Currently just string
  },
}

// New:
content: {
  type: 'function_response', 
  functionResponse: {
    call_id: request.callId,
    name: request.name,
    result: JSON.stringify(response.result), // Serialize full TResult to JSON string
  },
}
```

**Tool Execution Done Event (Line 341-350)**:
```typescript
// Current:
result: response.result,

// New:
result: response.result, // Keep full object for event
```

#### 3. CoreToolScheduler Changes (`src/coreToolScheduler.ts`)

**Success Handler (Line 442-445)**:
```typescript
// Current:
response: {
  callId: scheduledCall.request.callId,
  result: result.result,
}

// New:
response: {
  callId: scheduledCall.request.callId,
  result: result, // Store full ToolResult object
}
```

**IToolCallResponseInfo Update**:
```typescript
// src/interfaces.ts (line 443)
export interface IToolCallResponseInfo {
  callId: string;
  result?: ToolResult; // Changed from string to ToolResult
  error?: Error;
}
```

**Cancel Handler (Line 535-539)**:
```typescript
// Current:
response: {
  callId: toolCall.request.callId,
  result: `Tool call cancelled: ${reason}`,
  error: new Error(reason),
}

// New:
response: {
  callId: toolCall.request.callId,
  result: { success: false, message: `Tool call cancelled: ${reason}` },
  error: new Error(reason),
}
```

**Error Handler (Line 562-566)**:
```typescript
// Current:
response: {
  callId: toolCall.request.callId,
  result: `Tool execution failed: ${errorMessage}`,
  error: error instanceof Error ? error : new Error(errorMessage),
}

// New:
response: {
  callId: toolCall.request.callId,
  result: { success: false, message: `Tool execution failed: ${errorMessage}` },
  error: error instanceof Error ? error : new Error(errorMessage),
}
```

#### 4. Tool Updates

All tool implementations need to return the new format:
```typescript
// Example for a successful execution:
return {
  success: true,
  message: "Operation completed successfully"
};

// Example for a failed execution:
return {
  success: false,
  message: "Error: Invalid parameters"
};
```

## Migration Strategy

### Phase 1: Core Interface Updates
1. Update ToolResult interface
2. Update IToolCallResponseInfo interface
3. Update generic constraints

### Phase 2: Scheduler Updates
1. Update CoreToolScheduler to handle new format
2. Ensure proper error/cancel result creation

### Phase 3: BaseAgent Updates
1. Update history rendering to use JSON.stringify
2. Maintain event data structure

### Phase 4: Tool Migration
1. Update BaseTool if needed
2. Update all tool implementations
3. Update examples

### Phase 5: Testing
1. Update all tests to expect new format
2. Add tests for JSON serialization in history
3. Verify backward compatibility

## Backward Compatibility Considerations

1. **Type Safety**: Since TResult extends ToolResult, existing tools that return the old format will cause TypeScript errors, forcing migration
2. **Runtime**: Need to handle both formats temporarily during migration
3. **History Format**: JSON stringification ensures any ToolResult format can be stored

## Benefits

1. **Clarity**: Explicit success/failure indication
2. **Consistency**: Standard error handling pattern
3. **Extensibility**: Easy to add more fields in future
4. **History**: JSON format preserves full result structure

## Risks & Mitigations

1. **Risk**: Breaking existing tools
   - **Mitigation**: TypeScript will catch at compile time

2. **Risk**: History format change
   - **Mitigation**: JSON.stringify ensures compatibility

3. **Risk**: Third-party tool compatibility
   - **Mitigation**: Clear migration guide and examples