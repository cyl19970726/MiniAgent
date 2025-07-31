# Agent Framework Examples

This directory contains examples demonstrating how to use the Agent framework with multiple chat providers and advanced features.

## Examples

1. **basicExample.ts** - Core agent functionality with multiple chat providers
2. **sessionManagerExample.ts** - Advanced session management and conversation isolation
3. **providerComparison.ts** - Performance comparison between different chat providers
4. **tools.ts** - Reusable tool definitions for weather and calculation functions

## Running basicExample.ts

The basic example demonstrates core agent functionality with support for multiple chat providers (Gemini, OpenAI, OpenAI Response API).

### Command Line Usage

```bash
# Show help
npx tsx examples/basicExample.ts --help

# Test specific providers
npm run example:gemini                    # Test Gemini only
npm run example:openai-basic             # Test OpenAI Chat Completions
npm run example:openai-response          # Test OpenAI Response API
npm run example:all                      # Test all providers

# Direct command line usage
npx tsx examples/basicExample.ts --gemini
npx tsx examples/basicExample.ts --openai --openairep
npx tsx examples/basicExample.ts --all
```

### API Keys Required

- `GEMINI_API_KEY`: Required for Gemini provider
- `OPENAI_API_KEY`: Required for OpenAI providers

Set your API keys:
```bash
export GEMINI_API_KEY="your-gemini-key-here"
export OPENAI_API_KEY="your-openai-key-here"
```

### Command Line Arguments

- `--help, -h`: Show help message
- `--gemini`: Test Gemini provider
- `--openai`: Test OpenAI Chat Completions
- `--openairep`: Test OpenAI Response API
- `--all`: Test all available providers

## Running sessionManagerExample.ts

The session manager example demonstrates advanced session management capabilities including:

- **Multi-Session Conversations**: Creating and managing multiple isolated conversation sessions
- **Session Switching**: Seamlessly switching between sessions while preserving context
- **Weather Comparisons**: Temperature comparisons across different city pairs in separate sessions:
  - Session 1: Beijing vs Shanghai temperature comparison
  - Session 2: Shanghai vs Guangzhou temperature comparison  
  - Back to Session 1: Guangzhou vs Shenzhen temperature comparison
- **Session State Management**: Automatic session history preservation and restoration

### Usage

```bash
# Run with Gemini (default)
npx tsx examples/sessionManagerExample.ts

# Run with OpenAI 
CHAT_PROVIDER=openai npx tsx examples/sessionManagerExample.ts

# With API key
GEMINI_API_KEY="your-key" npx tsx examples/sessionManagerExample.ts
OPENAI_API_KEY="your-key" CHAT_PROVIDER=openai npx tsx examples/sessionManagerExample.ts
```

### What You'll See

1. **Session Creation**: Two separate conversation sessions are created
2. **Weather Comparisons**: Each session handles different city temperature comparisons
3. **Session Switching**: Demonstrates switching back to the first session for additional queries
4. **History Preservation**: Each session maintains its own conversation history
5. **Session Status**: Final summary showing all sessions, their metadata, and conversation histories

### Key Features Demonstrated

- `createNewSession()`: Create new conversation sessions with custom titles
- `switchToSession()`: Switch between existing sessions
- `processWithSession()`: Process user input within a specific session context
- `getSessions()`: Retrieve all session metadata
- Session isolation: Each session maintains independent conversation history and context