# Gemini Chat Delta Streaming Design

## Overview

This document outlines the design for handling streaming responses in GeminiChat with proper delta/complete event differentiation. This approach provides flexibility for clients to handle incremental updates (deltas) and complete responses differently.

## Problem Statement

The current GeminiChat implementation yields every chunk from the stream without differentiating between:
- **Delta events**: Incremental text/content that should be displayed as it arrives
- **Complete events**: The final accumulated response

This causes duplicate text display when clients concatenate all yielded responses.

## Solution Design

### Core Concept

Add a `delta` field to the `LLMResponse` interface to separate incremental updates from the complete accumulated content. This allows clients to:
1. Display streaming text using deltas
2. Access the complete response when needed
3. Handle different response types (text, function calls) appropriately

### Interface Changes

```typescript
// In interfaces.ts
export interface LLMResponse {
  id: string;
  content: ConversationContent;      // Complete accumulated content
  model: string;
  metadata?: Record<string, unknown>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  
  // New fields for streaming
  delta?: LLMResponseDelta;          // Incremental update
  streamState?: 'streaming' | 'done'; // Stream status
}

export interface LLMResponseDelta {
  text?: string;                     // Incremental text
  functionCall?: {                   // Incremental function call
    id?: string;
    name?: string;
    args?: string;                   // Partial JSON string
  };
  thought?: string;                  // Incremental thinking (for models that support it)
}
```

### Implementation Strategy

#### 1. Track Accumulated Content

```typescript
private async *processStreamResponse(
  streamResponse: AsyncGenerator<GenerateContentResponse>,
  inputContent: ConversationContent,
  promptId: string,
): AsyncGenerator<LLMResponse> {
  // Tracking structures
  const accumulatedParts: Map<string, ContentPart> = new Map();
  const accumulatedText: Map<number, string> = new Map();
  const accumulatedFunctionCalls: Map<string, any> = new Map();
  
  let responseId = 0;
  let chunkCount = 0;
  let lastResponse: LLMResponse | null = null;
  
  for await (const chunk of streamResponse) {
    chunkCount++;
    
    // Process chunk and calculate deltas
    const deltaResponse = this.processDelta(
      chunk, 
      accumulatedText, 
      accumulatedFunctionCalls,
      promptId,
      responseId++
    );
    
    if (deltaResponse) {
      lastResponse = deltaResponse;
      yield deltaResponse;
    }
  }
  
  // Yield final "done" event
  if (lastResponse) {
    yield {
      ...lastResponse,
      delta: undefined,
      streamState: 'done'
    };
  }
}
```

#### 2. Delta Calculation Logic

```typescript
private processDelta(
  chunk: GenerateContentResponse,
  accumulatedText: Map<number, string>,
  accumulatedFunctionCalls: Map<string, any>,
  promptId: string,
  responseId: number
): LLMResponse | null {
  const candidateIndex = 0;
  const candidate = chunk.candidates?.[candidateIndex];
  if (!candidate?.content?.parts) return null;
  
  const delta: LLMResponseDelta = {};
  const updatedParts: ContentPart[] = [];
  
  for (const part of candidate.content.parts) {
    if ('text' in part && part.text !== undefined) {
      // Calculate text delta
      const prevText = accumulatedText.get(candidateIndex) || '';
      const currentText = part.text;
      
      if (currentText.length > prevText.length) {
        delta.text = currentText.slice(prevText.length);
        accumulatedText.set(candidateIndex, currentText);
      }
      
      updatedParts.push({ type: 'text', text: currentText });
    }
    
    if ('functionCall' in part && part.functionCall) {
      // Handle function call deltas
      const callId = part.functionCall.id || `call_${Date.now()}`;
      const prevCall = accumulatedFunctionCalls.get(callId);
      
      if (!prevCall) {
        // New function call
        delta.functionCall = {
          id: callId,
          name: part.functionCall.name,
          args: JSON.stringify(part.functionCall.args)
        };
      } else {
        // Update existing call (for streaming args)
        const currentArgs = JSON.stringify(part.functionCall.args);
        if (currentArgs !== prevCall.args) {
          delta.functionCall = {
            id: callId,
            args: currentArgs
          };
        }
      }
      
      accumulatedFunctionCalls.set(callId, part.functionCall);
      updatedParts.push({
        type: 'function_call',
        functionCall: part.functionCall
      });
    }
    
    if ('thought' in part && part.thought) {
      // Handle thinking deltas (for supported models)
      delta.thought = part.thought;
      updatedParts.push({ type: 'thought', thought: part.thought });
    }
  }
  
  // Only yield if there's actual delta content
  if (Object.keys(delta).length === 0) return null;
  
  return {
    id: `${promptId}_${responseId}`,
    content: {
      role: 'assistant',
      parts: updatedParts,
      metadata: { timestamp: Date.now() }
    },
    model: this.chatConfig.modelName,
    delta,
    streamState: 'streaming',
    metadata: {
      promptId,
      chunkIndex: responseId
    }
  };
}
```

### Client Usage Examples

#### Example 1: Display Streaming Text

```typescript
const agent = new StandardAgent(tools, config);

for await (const event of agent.process(userInput, sessionId, signal)) {
  if (event.type === AgentEventType.Content) {
    const response = event.data as LLMResponse;
    
    // Handle streaming deltas
    if (response.streamState === 'streaming' && response.delta?.text) {
      process.stdout.write(response.delta.text); // Display incremental text
    }
    
    // Handle completion
    if (response.streamState === 'done') {
      console.log('\n[Response Complete]');
      // Access full response via response.content
    }
  }
}
```

#### Example 2: Collect Complete Response

```typescript
let completeText = '';

for await (const event of agent.process(userInput, sessionId, signal)) {
  if (event.type === AgentEventType.Content) {
    const response = event.data as LLMResponse;
    
    if (response.delta?.text) {
      completeText += response.delta.text;
    }
    
    if (response.streamState === 'done') {
      // Use completeText or response.content
      console.log('Full response:', completeText);
    }
  }
}
```

#### Example 3: Handle Function Calls

```typescript
for await (const event of agent.process(userInput, sessionId, signal)) {
  if (event.type === AgentEventType.Content) {
    const response = event.data as LLMResponse;
    
    if (response.delta?.functionCall) {
      console.log(`Function ${response.delta.functionCall.name} called`);
      
      if (response.streamState === 'done') {
        // Function call is complete, execute it
        const fullCall = response.content.parts.find(
          p => p.type === 'function_call'
        );
      }
    }
  }
}
```

## Benefits

1. **Flexibility**: Clients can choose to use deltas, complete content, or both
2. **Backward Compatibility**: Existing code using `content` continues to work
3. **Clear Semantics**: `delta` for incremental updates, `content` for accumulated state
4. **Streaming Control**: `streamState` clearly indicates when streaming is complete
5. **Extensibility**: Easy to add new delta types (thoughts, images, etc.)

## Migration Guide

### For Existing Clients

No changes required. Existing clients can continue using `response.content` which contains the complete accumulated response.

### For Enhanced Streaming

To take advantage of delta streaming:

1. Check for `response.delta` to get incremental updates
2. Use `response.streamState` to detect completion
3. For text streaming, concatenate `delta.text` values
4. For function calls, monitor `delta.functionCall` updates

## Future Enhancements

1. **Partial JSON Streaming**: Stream function call arguments as they're generated
2. **Thinking Support**: Handle thinking/reasoning traces for supported models
3. **Multi-Modal Deltas**: Support for image/audio streaming when available
4. **Backpressure Handling**: Allow clients to control streaming rate

## Implementation Timeline

1. **Phase 1**: Implement basic delta support for text
2. **Phase 2**: Add function call delta support
3. **Phase 3**: Add thinking/reasoning support
4. **Phase 4**: Optimize performance and memory usage