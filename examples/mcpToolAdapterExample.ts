/**
 * @fileoverview Example demonstrating McpToolAdapter usage with generic typing
 * 
 * This example shows how to use the McpToolAdapter to bridge MCP tools
 * with MiniAgent's BaseTool system, including:
 * - Generic type support with runtime validation
 * - Dynamic tool discovery and registration
 * - Flexible tool creation patterns
 */

import { z } from 'zod';
import { McpToolAdapter, createMcpToolAdapters, registerMcpTools, createTypedMcpToolAdapter } from '../src/mcp/index.js';
import { MockMcpClient } from './mocks/MockMcpClient.js';

// Example: Define a typed interface for a specific MCP tool
interface WeatherParams {
  location: string;
  units?: 'celsius' | 'fahrenheit';
}

const WeatherParamsSchema = z.object({
  location: z.string().min(1, 'Location is required'),
  units: z.enum(['celsius', 'fahrenheit']).optional()
});

async function demonstrateMcpToolAdapter() {
  // 1. Create a mock MCP client (in real usage, this would be your actual MCP client)
  const mcpClient = new MockMcpClient();
  
  // 2. Basic usage: Create adapter for a specific tool with generic typing
  console.log('=== Basic McpToolAdapter Usage ===');
  
  const weatherTool = await createTypedMcpToolAdapter<WeatherParams>(
    mcpClient,
    'get_weather',
    'weather-server',
    WeatherParamsSchema,
    { cacheSchema: true }
  );
  
  if (weatherTool) {
    // The tool now has typed parameters and validation
    const result = await weatherTool.execute(
      { location: 'New York', units: 'fahrenheit' },
      new AbortController().signal,
      (output) => console.log('Progress:', output)
    );
    
    console.log('Weather tool result:', result.data);
  }
  
  // 3. Dynamic tool discovery: Create adapters for all tools from a server
  console.log('\n=== Dynamic Tool Discovery ===');
  
  const adapters = await createMcpToolAdapters(
    mcpClient,
    'productivity-server',
    {
      toolFilter: (tool) => tool.name.startsWith('task_'), // Only task-related tools
      cacheSchemas: true,
      enableDynamicTyping: true // Support unknown parameter types
    }
  );
  
  console.log(`Discovered ${adapters.length} tools from productivity-server`);
  
  // 4. Tool registration: Register tools with a tool scheduler
  console.log('\n=== Tool Registration ===');
  
  const mockScheduler = {
    tools: [] as any[],
    registerTool: function(tool: any) {
      this.tools.push(tool);
      console.log(`Registered tool: ${tool.name}`);
    }
  };
  
  const registeredAdapters = await registerMcpTools(
    mockScheduler,
    mcpClient,
    'file-server',
    {
      cacheSchemas: true,
      enableDynamicTyping: false // Use strict typing for file operations
    }
  );
  
  console.log(`Registered ${registeredAdapters.length} tools with scheduler`);
  
  // 5. Advanced usage: Factory methods for different scenarios
  console.log('\n=== Advanced Factory Methods ===');
  
  // Create with custom schema conversion
  const customAdapter = await McpToolAdapter.create(
    mcpClient,
    {
      name: 'custom_tool',
      description: 'A custom tool with complex parameters',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string' },
          options: { type: 'object' }
        },
        required: ['data']
      }
    },
    'custom-server',
    {
      cacheSchema: true,
      schemaConverter: (jsonSchema) => {
        // Custom conversion logic from JSON Schema to Zod
        return z.object({
          data: z.string(),
          options: z.record(z.unknown()).optional()
        });
      }
    }
  );
  
  // Create dynamic adapter for runtime type resolution
  const dynamicAdapter = McpToolAdapter.createDynamic(
    mcpClient,
    {
      name: 'dynamic_tool',
      description: 'Tool with unknown parameter structure',
      inputSchema: { type: 'object' } // Minimal schema
    },
    'dynamic-server',
    {
      cacheSchema: false,
      validateAtRuntime: true
    }
  );
  
  // 6. Demonstration of error handling and validation
  console.log('\n=== Validation and Error Handling ===');
  
  try {
    // This will trigger validation error
    const invalidResult = await weatherTool?.execute(
      { location: '' }, // Invalid: empty location
      new AbortController().signal
    );
  } catch (error) {
    console.log('Validation error caught:', error.message);
  }
  
  // 7. Tool metadata access
  console.log('\n=== Tool Metadata ===');
  
  if (weatherTool) {
    const metadata = weatherTool.getMcpMetadata();
    console.log('Tool metadata:', {
      serverName: metadata.serverName,
      toolName: metadata.toolName,
      capabilities: metadata.capabilities,
      transportType: metadata.transportType
    });
    
    // Access tool schema and other properties
    console.log('Tool schema:', weatherTool.schema);
    console.log('Tool supports markdown output:', weatherTool.isOutputMarkdown);
    console.log('Tool supports streaming:', weatherTool.canUpdateOutput);
  }
}

// Example usage patterns for different scenarios
async function showcaseUsagePatterns() {
  const mcpClient = new MockMcpClient();
  
  console.log('\n=== Usage Patterns Showcase ===');
  
  // Pattern 1: Type-safe tool with known parameters
  interface FileOperationParams {
    path: string;
    operation: 'read' | 'write' | 'delete';
    content?: string;
  }
  
  const fileSchema = z.object({
    path: z.string().min(1),
    operation: z.enum(['read', 'write', 'delete']),
    content: z.string().optional()
  });
  
  const fileAdapter = await createTypedMcpToolAdapter<FileOperationParams>(
    mcpClient,
    'file_operation',
    'filesystem-server',
    fileSchema
  );
  
  // Pattern 2: Discovery and batch registration
  const allAdapters = await createMcpToolAdapters(
    mcpClient,
    'multi-tool-server',
    {
      toolFilter: (tool) => !tool.capabilities?.destructive, // Filter out destructive tools
      cacheSchemas: true,
      enableDynamicTyping: true
    }
  );
  
  // Pattern 3: Conditional tool creation based on capabilities
  const safeAdapters = allAdapters.filter(adapter => {
    const metadata = adapter.getMcpMetadata();
    return !metadata.capabilities?.destructive;
  });
  
  console.log(`Created ${safeAdapters.length} safe tools out of ${allAdapters.length} total tools`);
  
  // Pattern 4: Tool composition (combining multiple adapters)
  const toolSet = {
    fileOps: fileAdapter,
    utilities: safeAdapters.filter(a => a.name.includes('utility')),
    analysis: safeAdapters.filter(a => a.name.includes('analyze'))
  };
  
  console.log('Organized tools into categories:', Object.keys(toolSet));
}

/**
 * Helper function for running specific adapter examples
 */
export async function runAdapterExample(exampleName: string) {
  console.log(`🎯 Running adapter example: ${exampleName}\n`);
  
  switch (exampleName) {
    case 'basic':
    case 'adapter':
      await demonstrateMcpToolAdapter();
      break;
    case 'patterns':
    case 'usage':
      await showcaseUsagePatterns();
      break;
    case 'all':
      await demonstrateMcpToolAdapter();
      await showcaseUsagePatterns();
      break;
    default:
      console.log('❌ Unknown example. Available: basic, patterns, all');
  }
}

// Run the examples
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🛠️  MCP Tool Adapter Examples\n');
  console.log('These examples show how to use McpToolAdapter for bridging MCP tools with MiniAgent\n');
  
  demonstrateMcpToolAdapter()
    .then(() => showcaseUsagePatterns())
    .then(() => {
      console.log('\n✅ All McpToolAdapter examples completed successfully!');
      console.log('💡 Next steps:');
      console.log('   - Check out mcp-basic-example.ts for full MCP integration');
      console.log('   - See mcp-advanced-example.ts for advanced patterns');
      console.log('   - Read src/mcp/README.md for comprehensive documentation');
    })
    .catch(error => console.error('❌ Example failed:', error));
}

export {
  demonstrateMcpToolAdapter,
  showcaseUsagePatterns
};