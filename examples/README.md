# Agent Framework Examples

This directory contains the basicExample.ts which demonstrates how to use the Agent framework with multiple chat providers.

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