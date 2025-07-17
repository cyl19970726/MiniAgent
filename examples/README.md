# Agent Framework Examples

This directory contains example implementations demonstrating how to use the Agent framework with various tools and configurations.

## Available Examples

### 1. Basic Example (`basicExample.ts`)
- Demonstrates core agent functionality with a simple calculator tool
- Shows how to set up GeminiChat, TokenTracker, and CoreToolScheduler
- Includes event handling and real-time token usage monitoring
- **Requires API key**: Set `GEMINI_API_KEY` environment variable

**Usage:**
```bash
export GEMINI_API_KEY="your-api-key-here"
npm run example:basic
```

### 2. Demo Example (`demoExample.ts`) 
- Runs without requiring an API key (uses mock responses)
- Demonstrates the complete framework architecture
- Shows streaming responses and tool execution
- Perfect for testing and learning the framework

**Usage:**
```bash
npm run demo
```

### 3. Weather Example (`weatherExample.ts`)
- Advanced example with WeatherTool and SubTool
- Shows how to create custom tools using BaseTool framework
- Demonstrates real weather API integration
- Includes mathematical operations with subtraction tool
- **Requires API key**: Set `GEMINI_API_KEY` environment variable

**Usage:**
```bash
export GEMINI_API_KEY="your-api-key-here"
npm run example:weather
```

## Available Tools (`tools.ts`)

### WeatherTool
- Fetches current weather data from Open-Meteo API
- Accepts latitude and longitude coordinates
- Returns temperature in Celsius
- Includes comprehensive parameter validation
- Supports 30+ cities worldwide with predefined coordinates

**Features:**
- Real-time weather data from open-meteo.com
- Coordinate validation (lat: -90 to 90, lon: -180 to 180)
- Error handling for API failures
- Streaming output support
- Abort signal handling

**Usage:**
```typescript
import { WeatherTool, getCityCoordinates } from './tools.js';

const weatherTool = new WeatherTool();
const coordinates = getCityCoordinates('北京'); // Beijing coordinates
const result = await weatherTool.execute(coordinates, abortSignal);
```

### SubTool
- Performs subtraction operations between two numbers
- Comprehensive parameter validation
- Supports positive, negative, and decimal numbers
- Provides detailed calculation information

**Features:**
- Finite number validation
- Detailed result descriptions
- Error handling for invalid inputs
- Streaming output support

**Usage:**
```typescript
import { SubTool } from './tools.js';

const subTool = new SubTool();
const result = await subTool.execute(
  { minuend: 10, subtrahend: 3 },
  abortSignal
);
```

### City Coordinates
The tools include predefined coordinates for 30+ cities worldwide:

**Chinese Cities:**
- 北京 (Beijing), 上海 (Shanghai), 广州 (Guangzhou), 深圳 (Shenzhen)
- 成都 (Chengdu), 杭州 (Hangzhou), 西安 (Xi'an), 武汉 (Wuhan)
- 南京 (Nanjing), 重庆 (Chongqing), 天津 (Tianjin), 苏州 (Suzhou)
- 青岛 (Qingdao), 大连 (Dalian), 厦门 (Xiamen)

**International Cities:**
- 东京 (Tokyo), 纽约 (New York), 伦敦 (London), 巴黎 (Paris)
- 洛杉矶 (Los Angeles), 悉尼 (Sydney), 新加坡 (Singapore)
- 首尔 (Seoul), 曼谷 (Bangkok), 迪拜 (Dubai), 多伦多 (Toronto)
- 柏林 (Berlin), 罗马 (Rome), 马德里 (Madrid), 莫斯科 (Moscow)

**Utility Functions:**
```typescript
import { 
  getCityCoordinates, 
  getWeatherForCity, 
  getAvailableCities,
  findCitiesByName 
} from './tools.js';

// Get coordinates for a city
const coords = getCityCoordinates('北京');

// Get weather for a city (handles API calls)
const weather = await getWeatherForCity('北京');

// List all available cities
const cities = getAvailableCities();

// Find cities by partial name
const matches = findCitiesByName('北');
```

## Running the Examples

### Prerequisites
- Node.js >= 18.0.0
- TypeScript >= 5.0.0
- For weather and basic examples: Valid Gemini API key

### Installation
```bash
npm install
npm run build
```

### Running Examples
```bash
# Demo (no API key needed)
npm run demo

# Basic example (requires API key)
export GEMINI_API_KEY="your-api-key-here"
npm run example:basic

# Weather example (requires API key)
export GEMINI_API_KEY="your-api-key-here"
npm run example:weather
```

### Running Tests
```bash
# Run all tests
npm test

# Run specific tool tests
npm run test:tools

# Run tests with coverage
npm run test:coverage
```

## Creating Custom Tools

To create your own tools, extend the `BaseTool` class:

```typescript
import { BaseTool, ToolResult } from '../src/index.js';
import { Type } from '@google/genai';

class MyCustomTool extends BaseTool<{ input: string }> {
  constructor() {
    super(
      'my_tool',
      'My Custom Tool',
      'Description of what this tool does',
      {
        type: Type.OBJECT,
        properties: {
          input: {
            type: Type.STRING,
            description: 'Input parameter description'
          }
        },
        required: ['input']
      },
      false, // isOutputMarkdown
      true   // canUpdateOutput
    );
  }

  validateToolParams(params: { input: string }): string | null {
    // Custom validation logic
    if (!params.input || params.input.trim() === '') {
      return 'Input cannot be empty';
    }
    return null;
  }

  getDescription(params: { input: string }): string {
    return `Process input: ${params.input}`;
  }

  async execute(
    params: { input: string },
    abortSignal: AbortSignal,
    outputUpdateHandler?: (output: string) => void
  ): Promise<ToolResult> {
    // Your tool implementation
    const result = params.input.toUpperCase();
    
    return this.createResult(
      result,
      `✅ Processed: ${result}`,
      `Converted to uppercase`
    );
  }
}
```

## Framework Architecture

The examples demonstrate key framework components:

1. **BaseAgent**: Core agent implementation that coordinates all components
2. **GeminiChat**: Chat interface with streaming support and token tracking
3. **CoreToolScheduler**: Tool execution scheduler with approval workflows
4. **TokenTracker**: Real-time token usage monitoring
5. **AgentEvent**: Event system for monitoring agent activity
6. **BaseTool**: Abstract base class for creating custom tools

## Environment Variables

- `GEMINI_API_KEY`: Required for basic and weather examples
- `NODE_ENV`: Set to 'development' for debug logging

## Troubleshooting

### Common Issues
1. **API Key Not Found**: Set `GEMINI_API_KEY` environment variable
2. **Network Errors**: Check internet connection for weather API
3. **Build Errors**: Run `npm run build` to check TypeScript compilation
4. **Test Failures**: Run `npm test` to verify all functionality

### Getting Help
- Check the main README.md for framework documentation
- Review the test files for usage examples
- Examine the source code in `src/` for implementation details

## License
Apache 2.0