# Universal IChat Framework Design

## Design Philosophy

**Core Principle**: We define the standard - LLM providers adapt to our design, not the other way around.

Instead of creating different interfaces for each LLM provider, we establish a unified, opinionated framework that all providers must implement. This approach ensures:

- **Consistency**: Same interface across all LLM providers
- **Maintainability**: Single source of truth for chat behavior  
- **Extensibility**: Easy to add new providers without changing consumer code
- **Simplicity**: Developers learn one interface, use everywhere

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        IChat<T> Interface                       │
├─────────────────────────────────────────────────────────────────┤
│  sendMessageStream() → AsyncGenerator<LLMResponse>              │
│  convertFromChunkItems() → MessageItem                          │
│  addHistory() → void                                            │
└─────────────────────────────────────────────────────────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
         ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
         │ OpenAIChat  │  │ GeminiChat  │  │AnthropicChat│
         │     <T>     │  │     <T>     │  │     <T>     │
         └─────────────┘  └─────────────┘  └─────────────┘
```

## Event Flow System

### Standard Event Sequence

Every LLM provider must map their events to this standardized sequence:

```
1. LLMStart          → Response begins
2. LLMChunk*         → Chunk metadata (added/done)
3. LLMChunk*Delta    → Streaming content (text/thinking/function)
4. LLMChunk*Done     → Complete content + AUTO addHistory()
5. LLMComplete       → Response ends with all chunks + metadata
```

### Event Types & Responsibilities

| Event Type | Purpose | Auto History | Content Structure |
|------------|---------|--------------|-------------------|
| `LLMStart` | Signal response start | ❌ | Metadata only |
| `LLMChunkTextDelta` | Stream text incrementally | ❌ | `content.text_delta` |
| `LLMChunkTextDone` | Complete text chunk | ✅ | `content.text` |
| `LLMChunkThinking` | AI reasoning transparency | ✅ | `content.thinking` |
| `LLMFunctionCallDone` | Tool usage | ✅ | `content.functionCall` |
| `LLMComplete` | Response completion | ❌ | All chunks + usage |

## Content Structure Standards

### ContentPart - Universal Content Atom

Every piece of AI communication is normalized to `ContentPart`:

```typescript
interface ContentPart {
  type: 'text' | 'function_call' | 'function_response' | 'thinking' | ...
  
  // Text variations (choose appropriate field)
  text?: string              // Complete text
  text_delta?: string        // Streaming text increment  
  thinking?: string          // Complete reasoning
  thinking_delta?: string    // Streaming reasoning increment
  
  // Function calling
  functionCall?: {
    id?: string              // Output item ID (optional)
    call_id: string          // Call correlation ID (required)
    name: string             // Function name
    args: string             // JSON string of arguments
  }
  
  // Media, metadata, etc.
}
```

### MessageItem - History Unit

Conversation history consists of atomic `MessageItem` objects:

```typescript
interface MessageItem {
  role: 'user' | 'assistant'    // Simple binary roles
  content: ContentPart          // Single atomic content
}
```

**Design Rationale**: 
- One message = one content = one purpose
- No complex multi-part messages
- Easy to reason about and process
- If you need multiple parts, create multiple messages

## Implementation Guidelines

### 1. Provider Event Mapping

Each provider must map their streaming events to our standard:

```typescript
// Example: OpenAI → Our Events
'response.output_text.delta'        → LLMChunkTextDelta
'response.output_text.done'         → LLMChunkTextDone + addHistory()
'response.reasoning_summary.done'   → LLMChunkThinking + addHistory()
'response.function_call.done'       → LLMFunctionCallDone + addHistory()
'response.completed'                → LLMComplete
```

### 2. Auto History Management Rules

**Critical Rule**: `addHistory()` is called automatically for ALL `*Done` events.

```typescript
// ✅ CORRECT - Auto history on done events
yield textDoneChunk;
this.addHistory(this.convertFromChunkItems(textDoneChunk, 'assistant'));

// ❌ WRONG - Manual history management
yield textDoneChunk; // Missing addHistory() call

// ❌ WRONG - History on delta events  
yield textDeltaChunk;
this.addHistory(...); // Don't add history for deltas
```

**When to call `addHistory()`**:
- ✅ Text done events
- ✅ Thinking done events  
- ✅ Function call done events
- ✅ Any complete content chunk
- ❌ Never on delta/streaming events
- ❌ Never on start/metadata events

### 3. Content Normalization

All provider-specific content must be normalized to `ContentPart`:

```typescript
// Provider format → ContentPart
convertProviderContent(providerContent: ProviderType): ContentPart {
  // Normalize provider-specific structure to ContentPart
  return {
    type: 'text',
    text: providerContent.message || providerContent.content || '',
    metadata: { originalFormat: providerContent }
  };
}
```

### 4. Streaming Implementation Pattern

```typescript
async *sendMessageStream(message: MessageItem, promptId: string) {
  // 1. Immediately return generator (no await here)
  return this.createStreamingResponse(message, promptId);
}

private async *createStreamingResponse(message: MessageItem, promptId: string) {
  try {
    // 2. Initialize connection inside generator
    const stream = await this.provider.createStream(...);
    
    // 3. Process provider events
    for await (const event of stream) {
      // 4. Map to our event types
      const ourEvent = this.mapProviderEvent(event);
      
      // 5. Auto history for done events
      if (this.isDoneEvent(ourEvent)) {
        this.addHistory(this.convertFromChunkItems(ourEvent, 'assistant'));
      }
      
      // 6. Yield our standardized event
      yield ourEvent;
    }
  } catch (error) {
    // Handle errors...
  }
}
```

## Provider Implementation Checklist

When implementing a new LLM provider, ensure:

### ✅ Event Mapping
- [ ] All provider events mapped to `LLMResponse` types
- [ ] Streaming events separated into delta/done pairs
- [ ] Provider metadata preserved in `ContentPart.metadata`

### ✅ Content Normalization  
- [ ] All content types mapped to `ContentPart` structure
- [ ] Text content uses appropriate field (`text`, `text_delta`, etc.)
- [ ] Function calls include both `id` and `call_id`
- [ ] Binary data properly encoded

### ✅ History Management
- [ ] `addHistory()` called for all done events
- [ ] `convertFromChunkItems()` properly implemented
- [ ] History maintained in `MessageItem[]` format
- [ ] No history for delta/streaming events

### ✅ Error Handling
- [ ] Network errors gracefully handled
- [ ] Invalid responses don't break streaming
- [ ] Proper cleanup in finally blocks

### ✅ Token Tracking
- [ ] Token usage updated per chunk/response
- [ ] Usage metadata included in `LLMComplete`
- [ ] Rate limiting respected

## Testing Strategy

### Unit Tests
- Event mapping accuracy
- Content normalization correctness  
- History management behavior
- Error scenarios

### Integration Tests
- End-to-end streaming flow
- Cross-provider compatibility
- Token tracking accuracy
- Performance benchmarks

## Best Practices

### Do's ✅
- Always implement streaming-first
- Use auto history management
- Normalize all content to `ContentPart`
- Handle provider errors gracefully
- Maintain event order consistency
- Include proper metadata

### Don'ts ❌
- Don't adapt our interface to provider quirks
- Don't skip auto history for done events
- Don't yield non-standard events
- Don't block on provider initialization
- Don't leak provider-specific types
- Don't manually manage history

## Example: Adding a New Provider

```typescript
export class NewProviderChat implements IChat<NewProviderMessage> {
  
  async sendMessageStream(message: MessageItem, promptId: string) {
    return this.createStreamingResponse(message, promptId);
  }
  
  private async *createStreamingResponse(message: MessageItem, promptId: string) {
    // 1. Convert to provider format
    const providerMessage = this.convertToProviderMessage(message);
    
    // 2. Initialize provider stream
    const stream = await this.provider.stream(providerMessage);
    
    // 3. Process events
    for await (const event of stream) {
      const chunk = this.mapToOurEvents(event);
      
      // 4. Auto history for done events
      if (chunk.type.endsWith('.done')) {
        this.addHistory(this.convertFromChunkItems(chunk, 'assistant'));
      }
      
      yield chunk;
    }
  }
  
  convertFromChunkItems(chunk: ChunkItem, role: 'user' | 'assistant'): MessageItem {
    return {
      role,
      content: chunk.content  // Unified content structure
    };
  }
  
  convertToProviderMessage(message: MessageItem): NewProviderMessage {
    // Map our format to provider format
  }
}
```

## Conclusion

This framework enforces consistency across all LLM providers while maintaining flexibility for provider-specific optimizations. By establishing clear standards for event flows, content structure, and history management, we ensure a predictable, maintainable chat system that scales across any number of providers.

The key insight: **Don't adapt to providers - make providers adapt to a superior design.** 