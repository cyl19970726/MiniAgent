# Alternative Report Styles for Sub-Agents

This document shows different ways agents can structure their reports. Choose the style that best fits your task and communication needs.

## Style 1: Narrative Journey
Best for: Complex debugging, investigation tasks

```markdown
# Agent Report: agent-dev

## The Mystery of the Missing Events

Started by examining the StandardAgent class where users reported events weren't firing...

### The Investigation Begins
First, I traced through the event emission flow. What I discovered was surprising - the events were actually being emitted, but they were getting lost in the async handler chain...

### The Plot Thickens
Diving deeper into BaseAgent, I found that our event system was using a synchronous emission pattern while our handlers were async. This created a race condition where...

### The Solution Emerges
After experimenting with several approaches, I settled on implementing a queue-based event system that...
```

## Style 2: Problem-Solution Pairs
Best for: Bug fixes, feature implementations

```markdown
# Agent Report: chat-dev

## Anthropic Provider Implementation

### Problem 1: Token Counting Mismatch
**Issue**: Anthropic's token counting differs from OpenAI's approach
**Solution**: Implemented custom token counter using Claude's tokenization rules
**Result**: Accurate token tracking with <2% variance

### Problem 2: Streaming Response Format
**Issue**: Anthropic uses different streaming chunk structure
**Solution**: Created adapter layer to normalize responses
**Result**: Seamless integration with existing stream handlers
```

## Style 3: Technical Deep Dive
Best for: Architecture decisions, complex implementations

```markdown
# Agent Report: system-architect

## Event Filtering Architecture Design

### Current State Analysis
```
BaseAgent
├── emit(event) → all listeners
└── on(event, handler) → registers globally
```

### Proposed Architecture
```
BaseAgent
├── emit(event, metadata) → filtered dispatch
├── on(event, handler, filter?) → conditional registration
└── EventFilter
    ├── matches(event, criteria)
    └── compile(filterExpr)
```

### Design Rationale
1. **Filter at Registration**: More efficient than filtering at emission
2. **Compiled Filters**: Pre-process filter expressions for performance
3. **Backward Compatible**: Existing code continues to work unchanged
```

## Style 4: Checklist Progress
Best for: Testing, validation tasks

```markdown
# Agent Report: tester

## AnthropicChat Provider Testing

### Test Coverage Progress
- [x] Basic initialization
- [x] API key validation
- [x] Single message completion
- [x] Streaming responses
- [x] Token counting accuracy
- [x] Error handling
  - [x] Network errors
  - [x] Rate limiting
  - [x] Invalid responses
- [x] Integration with StandardAgent
- [ ] Performance benchmarks (deferred to TASK-XXX)

### Issues Found & Fixed
1. ✅ Memory leak in stream handler - Fixed by proper cleanup
2. ✅ Token count drift over long conversations - Added periodic recalibration
3. ⚠️ Rate limit handling could be improved - Created follow-up task
```

## Style 5: Discovery Log
Best for: Research, exploration tasks

```markdown
# Agent Report: tool-dev

## Exploring Tool Composition Patterns

### Discovery 1: Tools Can Be Composed
While implementing the SearchAndSummarizeTool, I realized we could create composite tools by combining existing ones. This wasn't in the original design but emerges naturally from our interface.

### Discovery 2: Validation Can Be Shared
Found that many tools need similar validation (file paths, URLs, etc.). Created a shared validation utility that all tools can use.

### Discovery 3: Async Considerations
Tools that appear simple (like file reading) have complex async implications when used in chains. Need to carefully manage promise chains to avoid blocking.
```

## Style 6: Visual/Diagrammatic
Best for: System design, data flow explanations

```markdown
# Agent Report: system-architect

## Request Flow Architecture

### Current Flow
```
User Input
    ↓
StandardAgent.chat()
    ↓
Provider.complete()
    ↓
Response Stream
    ↓
Event Emission
    ↓
User Output
```

### With Tool Integration
```
User Input
    ↓
StandardAgent.chat()
    ↓
Tool Detection ←──→ Tool Registry
    ↓                    ↓
Provider.complete()   Tool.execute()
    ↓                    ↓
Response Stream ←────────┘
    ↓
Event Emission
    ↓
User Output
```
```

---

Remember: The best report is one that clearly communicates your work to the next person (which might be future you!). Don't feel constrained by any particular format - use what works best for your content.
