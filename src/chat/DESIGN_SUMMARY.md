# IChat Framework Design Summary

## 🎯 Core Philosophy

**"Providers adapt to our design, not the other way around"**

We've established a universal chat framework where every LLM provider must implement our standardized interface, ensuring consistency, maintainability, and developer experience across all AI providers.

## 🏗️ Key Design Principles

### 1. **Unified Event Streaming**
```typescript
LLMStart → LLMChunk* → LLMChunkDone → LLMComplete
```
Every provider maps their events to our standardized `LLMResponse` union type.

### 2. **ContentPart Normalization**
All AI content is normalized to a single `ContentPart` structure:
```typescript
interface ContentPart {
  type: 'text' | 'function_call' | 'thinking' | ...
  text?: string              // Complete content
  text_delta?: string        // Streaming increments
  functionCall?: {...}       // Function calls
  // ... other content types
}
```

### 3. **Automatic History Management** 
**Critical Rule**: `addHistory()` is automatically called for all `*Done` events:

```typescript
// ✅ Correct Pattern
yield textDoneChunk;
this.addHistory(this.convertFromChunkItems(textDoneChunk, 'assistant'));
```

### 4. **Atomic Messages**
```typescript
interface MessageItem {
  role: 'user' | 'assistant';
  content: ContentPart;  // Single atomic content
}
```
One message = one purpose. No complex multi-part messages.

### 5. **Streaming-First Architecture**
```typescript
async sendMessageStream(): Promise<AsyncGenerator<LLMResponse>> {
  return this.createStreamingResponse(); // Immediate return
}
```

## 🔄 Standard Event Flow

### OpenAI Implementation Example

| OpenAI Event | Our Event | Auto History |
|--------------|-----------|--------------|
| `response.output_text.delta` | `LLMChunkTextDelta` | ❌ |
| `response.output_text.done` | `LLMChunkTextDone` | ✅ |
| `response.reasoning_summary.done` | `LLMChunkThinking` | ✅ |
| `response.function_call.done` | `LLMFunctionCallDone` | ✅ |
| `response.completed` | `LLMComplete` | ❌ |

### Implementation Pattern
```typescript
for await (const event of providerStream) {
  const ourChunk = this.mapProviderEvent(event);
  
  // Auto history for done events
  if (ourChunk.type.endsWith('.done')) {
    this.addHistory(this.convertFromChunkItems(ourChunk, 'assistant'));
  }
  
  yield ourChunk;
}
```

## 📝 When to Call `addHistory()`

### ✅ Always Call For:
- `LLMChunkTextDone` - Complete text content
- `LLMChunkThinking` (done) - Complete reasoning
- `LLMFunctionCallDone` - Complete function calls
- Any chunk with complete content

### ❌ Never Call For:
- Delta/streaming events (`*Delta`)
- Start events (`LLMStart`)
- Metadata events (`LLMChunk`)
- Completion events (`LLMComplete`)

## 🔢 Token Usage Management

### Critical Rule: Avoid Double-Counting Tokens

Many LLM providers return **cumulative token usage** in each streaming chunk. This can lead to severe over-counting if not handled correctly.

```typescript
// ❌ WRONG - Will multiply count tokens
for await (const chunk of stream) {
  if (chunk.usageMetadata) {
    tokenTracker.updateUsage({
      inputTokens: chunk.usageMetadata.inputTokens,  // Cumulative!
      outputTokens: chunk.usageMetadata.outputTokens // Cumulative!
    });
  }
}

// ✅ CORRECT - Only update once per response
let finalUsage: TokenUsage | null = null;
for await (const chunk of stream) {
  if (chunk.usageMetadata) {
    finalUsage = chunk.usageMetadata; // Store latest
  }
}
// Update only with final cumulative usage
if (finalUsage) {
  tokenTracker.updateUsage(finalUsage);
}
```

### Token Update Strategies

| Strategy | When to Use | Implementation |
|----------|-------------|----------------|
| **Final Only** | Provider returns cumulative usage | Update in `LLMComplete` event only |
| **Delta Tracking** | Provider returns incremental usage | Track previous count, update with delta |
| **Chunk-based** | Provider returns per-chunk usage | Safe to update per chunk |

### Provider Token Patterns

| Provider | Usage Pattern | Strategy |
|----------|---------------|----------|
| **OpenAI** | Final usage in `response.completed` | ✅ Final Only |
| **Gemini** | Cumulative in each chunk | ⚠️ Final Only |
| **Anthropic** | TBD | 🔄 Analyze when implementing |

## 🛠️ Implementation Checklist

When adding a new LLM provider:

### Event Mapping ✅
- [ ] Map all provider events to `LLMResponse` types
- [ ] Separate streaming (delta) from complete (done) events
- [ ] Preserve provider metadata in `ContentPart.metadata`

### Content Structure ✅
- [ ] Normalize all content to `ContentPart`
- [ ] Use appropriate fields (`text`, `text_delta`, `thinking`, etc.)
- [ ] Include `id` and `call_id` for function calls

### History Management ✅
- [ ] Auto `addHistory()` for all done events
- [ ] Implement `convertFromChunkItems()`
- [ ] Maintain `MessageItem[]` history format

### Error Handling ✅
- [ ] Graceful error handling
- [ ] Proper cleanup in finally blocks
- [ ] No broken streaming on errors

## 🎭 Provider Comparison

| Provider | Text Streaming | Thinking | Function Calls | Status |
|----------|---------------|----------|---------------|---------|
| OpenAI | ✅ Delta/Done | ✅ Reasoning Summary | ✅ Full Support | ✅ Complete |
| Gemini | 🔄 Planned | 🔄 Planned | 🔄 Planned | 🚧 Next |
| Anthropic | 🔄 Planned | 🔄 Planned | 🔄 Planned | 🚧 Future |

## 🚀 Implementation Example

```typescript
export class NewProviderChat implements IChat<ProviderMessage> {
  
  async sendMessageStream(message: MessageItem, promptId: string) {
    return this.createStreamingResponse(message, promptId);
  }
  
  private async *createStreamingResponse(message: MessageItem, promptId: string) {
    const providerMessage = this.convertToProviderMessage(message);
    const stream = await this.provider.stream(providerMessage);
    
    for await (const event of stream) {
      const chunk = this.mapToOurEvents(event);
      
      // Auto history for done events  
      if (chunk.type.endsWith('.done')) {
        this.addHistory(this.convertFromChunkItems(chunk, 'assistant'));
      }
      
      yield chunk;
    }
  }
  
  convertFromChunkItems(chunk: ChunkItem, role: 'user' | 'assistant'): MessageItem {
    return { role, content: chunk.content };
  }
}
```

## 🎯 Benefits Achieved

1. **Consistency** - Same interface across all providers
2. **Simplicity** - Learn once, use everywhere  
3. **Maintainability** - Single source of truth
4. **Extensibility** - Easy to add new providers
5. **Performance** - Streaming-first architecture
6. **Reliability** - Automatic history synchronization

## 🔮 Next Steps

1. **Refactor GeminiChat** to follow our standard
2. **Add Anthropic support** using our framework
3. **Performance optimizations** in the base framework
4. **Advanced features** (multi-modal, tool chaining)

---

**Remember: Our design is the standard. Providers adapt to us. 🎯** 