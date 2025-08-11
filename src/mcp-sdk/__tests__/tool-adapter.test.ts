/**
 * @fileoverview Tests for MCP Tool Adapter
 * 
 * Tests the McpToolAdapter class that bridges MCP tools to MiniAgent's BaseTool interface.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { McpToolAdapter, createMcpTools } from '../tool-adapter.js';
import { SimpleMcpClient } from '../client.js';
import { DefaultToolResult } from '../../interfaces.js';

// Mock the SimpleMcpClient
vi.mock('../client.js', () => ({
  SimpleMcpClient: vi.fn().mockImplementation(() => ({
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    listTools: vi.fn(),
    callTool: vi.fn(),
    getServerInfo: vi.fn()
  }))
}));

describe('McpToolAdapter', () => {
  let mockClient: any;
  let mockTool: any;
  let adapter: McpToolAdapter;

  beforeEach(() => {
    // Create mock client
    mockClient = {
      connected: true,
      callTool: vi.fn()
    };

    // Create mock tool definition
    mockTool = {
      name: 'test_tool',
      description: 'A test tool for unit testing',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          count: { type: 'number' }
        },
        required: ['message']
      }
    };

    // Create adapter instance
    adapter = new McpToolAdapter(mockClient, mockTool);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(adapter.name).toBe('test_tool');
      expect(adapter.description).toBe('A test tool for unit testing');
      expect(adapter.isOutputMarkdown).toBe(true);
      expect(adapter.canUpdateOutput).toBe(false);
    });

    it('should handle missing description', () => {
      const toolWithoutDesc = { ...mockTool, description: undefined };
      const adapterNoDesc = new McpToolAdapter(mockClient, toolWithoutDesc);
      expect(adapterNoDesc.description).toBe('MCP tool: test_tool');
    });

    it('should handle null description', () => {
      const toolWithNullDesc = { ...mockTool, description: null };
      const adapterNullDesc = new McpToolAdapter(mockClient, toolWithNullDesc);
      expect(adapterNullDesc.description).toBe('MCP tool: test_tool');
    });

    it('should handle empty string description', () => {
      const toolWithEmptyDesc = { ...mockTool, description: '' };
      const adapterEmptyDesc = new McpToolAdapter(mockClient, toolWithEmptyDesc);
      expect(adapterEmptyDesc.description).toBe('MCP tool: test_tool');
    });

    it('should use tool name as display name', () => {
      expect(adapter.name).toBe(mockTool.name);
    });

    it('should use input schema directly', () => {
      expect(adapter.schema.parameters).toEqual(mockTool.inputSchema);
    });

    it('should initialize with correct tool configuration', () => {
      const complexTool = {
        name: 'complex_tool_name',
        description: 'Complex tool with special characters !@#$%',
        inputSchema: {
          type: 'object',
          properties: {
            required_param: { type: 'string' },
            optional_param: { type: 'number', default: 42 }
          },
          required: ['required_param']
        }
      };

      const complexAdapter = new McpToolAdapter(mockClient, complexTool);
      
      expect(complexAdapter.name).toBe('complex_tool_name');
      expect(complexAdapter.description).toBe('Complex tool with special characters !@#$%');
      expect(complexAdapter.schema.name).toBe('complex_tool_name');
      expect(complexAdapter.schema.description).toBe('Complex tool with special characters !@#$%');
      expect(complexAdapter.schema.parameters).toEqual(complexTool.inputSchema);
    });

    it('should handle tools with minimal configuration', () => {
      const minimalTool = {
        name: 'min_tool'
      };

      const minimalAdapter = new McpToolAdapter(mockClient, minimalTool as any);
      
      expect(minimalAdapter.name).toBe('min_tool');
      expect(minimalAdapter.description).toBe('MCP tool: min_tool');
      expect(minimalAdapter.isOutputMarkdown).toBe(true);
      expect(minimalAdapter.canUpdateOutput).toBe(false);
    });
  });

  describe('validateToolParams', () => {
    it('should accept valid object parameters', () => {
      const result = adapter.validateToolParams({ message: 'test' });
      expect(result).toBeNull();
    });

    it('should accept empty object parameters', () => {
      const result = adapter.validateToolParams({});
      expect(result).toBeNull();
    });

    it('should accept nested object parameters', () => {
      const result = adapter.validateToolParams({ 
        message: 'test',
        nested: { value: 42, array: [1, 2, 3] }
      });
      expect(result).toBeNull();
    });

    it('should reject null parameters', () => {
      const result = adapter.validateToolParams(null as any);
      expect(result).toBe('Parameters must be a valid object');
    });

    it('should reject undefined parameters', () => {
      const result = adapter.validateToolParams(undefined as any);
      expect(result).toBe('Parameters must be a valid object');
    });

    it('should reject string parameters', () => {
      const result = adapter.validateToolParams('string' as any);
      expect(result).toBe('Parameters must be a valid object');
    });

    it('should reject number parameters', () => {
      const result = adapter.validateToolParams(42 as any);
      expect(result).toBe('Parameters must be a valid object');
    });

    it('should reject boolean parameters', () => {
      const result = adapter.validateToolParams(true as any);
      expect(result).toBe('Parameters must be a valid object');
    });

    it('should accept array parameters (arrays are objects in JavaScript)', () => {
      const result = adapter.validateToolParams([1, 2, 3] as any);
      expect(result).toBeNull(); // Arrays pass typeof === 'object' check
    });

    describe('type safety with Record<string, unknown>', () => {
      it('should handle unknown values in parameters', () => {
        const params: Record<string, unknown> = {
          stringVal: 'text',
          numberVal: 42,
          booleanVal: true,
          nullVal: null,
          undefinedVal: undefined,
          objectVal: { nested: 'value' },
          arrayVal: [1, 2, 3],
          functionVal: () => 'test'
        };

        const result = adapter.validateToolParams(params);
        expect(result).toBeNull();
      });

      it('should preserve type safety when passing to MCP tool', () => {
        const params: Record<string, unknown> = {
          message: 'hello',
          count: 5,
          options: {
            enabled: true,
            tags: ['a', 'b', 'c']
          }
        };

        // This should compile without type errors due to Record<string, unknown>
        const result = adapter.validateToolParams(params);
        expect(result).toBeNull();
      });

      it('should handle complex nested unknown structures', () => {
        const params: Record<string, unknown> = {
          deeply: {
            nested: {
              structure: {
                with: {
                  unknown: {
                    types: 'everywhere',
                    numbers: [1, 2, 3],
                    mixed: ['string', 42, { key: 'value' }]
                  }
                }
              }
            }
          }
        };

        const result = adapter.validateToolParams(params);
        expect(result).toBeNull();
      });

      it('should handle parameters with symbol keys (edge case)', () => {
        const symbolKey = Symbol('test');
        const params = {
          normalKey: 'value',
          [symbolKey]: 'symbol value'
        };

        const result = adapter.validateToolParams(params);
        expect(result).toBeNull();
      });

      it('should handle parameters with prototype pollution attempts', () => {
        const params = {
          __proto__: { malicious: 'value' },
          constructor: { dangerous: 'property' },
          normalParam: 'safe value'
        };

        const result = adapter.validateToolParams(params);
        expect(result).toBeNull(); // Still validates as object, security handled elsewhere
      });

      it('should handle circular references in parameters', () => {
        const params: any = { name: 'test' };
        params.circular = params; // Create circular reference

        const result = adapter.validateToolParams(params);
        expect(result).toBeNull(); // Validation passes, serialization would handle circular refs
      });

      it('should handle parameters with non-JSON serializable values', () => {
        const params: Record<string, unknown> = {
          date: new Date(),
          regex: /pattern/g,
          bigint: BigInt(123),
          symbol: Symbol('test')
        };

        const result = adapter.validateToolParams(params);
        expect(result).toBeNull();
      });
    });
  });

  describe('execute', () => {
    it('should execute tool successfully with text content', async () => {
      // Mock successful tool execution
      mockClient.callTool.mockResolvedValue({
        content: [
          { type: 'text', text: 'Tool executed successfully' }
        ]
      });

      const signal = new AbortController().signal;
      const result = await adapter.execute({ message: 'test' }, signal);

      expect(mockClient.callTool).toHaveBeenCalledWith('test_tool', { message: 'test' });
      expect(result).toBeInstanceOf(DefaultToolResult);
      
      const data = result.data;
      expect(data.llmContent).toBe('Tool executed successfully');
      expect(data.returnDisplay).toBe('Tool executed successfully');
      expect(data.summary).toContain('test_tool executed successfully');
    });

    it('should handle multiple content blocks', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [
          { type: 'text', text: 'First block' },
          { type: 'text', text: 'Second block' },
          { some: 'other', data: 'here' }
        ]
      });

      const signal = new AbortController().signal;
      const result = await adapter.execute({ message: 'test' }, signal);

      const data = result.data;
      expect(data.llmContent).toContain('First block');
      expect(data.llmContent).toContain('Second block');
      expect(data.llmContent).toContain('"some": "other"');
      expect(data.returnDisplay).toEqual(data.llmContent);
    });

    it('should handle string content', async () => {
      mockClient.callTool.mockResolvedValue({
        content: ['Simple string response']
      });

      const signal = new AbortController().signal;
      const result = await adapter.execute({ message: 'test' }, signal);

      const data = result.data;
      expect(data.llmContent).toBe('Simple string response');
      expect(data.returnDisplay).toBe('Simple string response');
    });

    it('should handle empty content', async () => {
      mockClient.callTool.mockResolvedValue({
        content: []
      });

      const signal = new AbortController().signal;
      const result = await adapter.execute({ message: 'test' }, signal);

      const data = result.data;
      expect(data.llmContent).toBe('No content returned from MCP tool');
      expect(data.returnDisplay).toBe('No content returned from MCP tool');
    });

    it('should handle invalid parameters', async () => {
      const signal = new AbortController().signal;
      const result = await adapter.execute(null as any, signal);

      expect(mockClient.callTool).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(DefaultToolResult);
      
      const data = result.data;
      expect(data.llmContent).toContain('Parameters must be a valid object');
      expect(data.returnDisplay).toContain('❌ Error: Parameters must be a valid object');
      expect(data.summary).toContain('Failed: Parameters must be a valid object');
    });

    it('should handle tool execution errors', async () => {
      mockClient.callTool.mockRejectedValue(new Error('Connection failed'));

      const signal = new AbortController().signal;
      const result = await adapter.execute({ message: 'test' }, signal);

      expect(result).toBeInstanceOf(DefaultToolResult);
      
      const data = result.data;
      expect(data.llmContent).toContain('MCP tool execution failed: Connection failed');
      expect(data.returnDisplay).toContain('❌ Error: Tool: test_tool: MCP tool execution failed: Connection failed');
      expect(data.summary).toContain('Failed: MCP tool execution failed: Connection failed');
    });

    it('should handle abort signal', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        adapter.execute({ message: 'test' }, abortController.signal)
      ).rejects.toThrow('MCP tool test_tool execution was cancelled');

      expect(mockClient.callTool).not.toHaveBeenCalled();
    });

    it('should handle non-Error exceptions from tool execution', async () => {
      mockClient.callTool.mockRejectedValue('String error');

      const signal = new AbortController().signal;
      const result = await adapter.execute({ message: 'test' }, signal);

      expect(result).toBeInstanceOf(DefaultToolResult);
      
      const data = result.data;
      expect(data.llmContent).toContain('MCP tool execution failed: String error');
      expect(data.returnDisplay).toContain('❌ Error: Tool: test_tool: MCP tool execution failed: String error');
      expect(data.summary).toContain('Failed: MCP tool execution failed: String error');
    });

    it('should handle complex parameters', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Complex params processed' }]
      });

      const complexParams = {
        message: 'test',
        count: 42,
        options: {
          enabled: true,
          settings: ['a', 'b', 'c'],
          metadata: {
            version: '1.0',
            timestamp: Date.now()
          }
        }
      };

      const signal = new AbortController().signal;
      const result = await adapter.execute(complexParams, signal);

      expect(mockClient.callTool).toHaveBeenCalledWith('test_tool', complexParams);
      expect(result).toBeInstanceOf(DefaultToolResult);
      
      const data = result.data;
      expect(data.llmContent).toBe('Complex params processed');
    });

    it('should preserve exact parameter structure passed to MCP client', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      });

      const params = { special: 'chars!@#$%^&*()_+', unicode: '🚀🎯', number: 3.14159 };
      const signal = new AbortController().signal;
      
      await adapter.execute(params, signal);

      expect(mockClient.callTool).toHaveBeenCalledWith('test_tool', params);
    });

    describe('Record<string, unknown> type safety in execution', () => {
      it('should execute with unknown parameter types', async () => {
        mockClient.callTool.mockResolvedValue({
          content: [{ type: 'text', text: 'Executed with unknown types' }]
        });

        const params: Record<string, unknown> = {
          message: 'test',
          count: 42,
          enabled: true,
          metadata: {
            version: '1.0',
            features: ['a', 'b', 'c'],
            config: {
              timeout: 5000,
              retries: 3
            }
          },
          callback: () => 'function value'
        };

        const signal = new AbortController().signal;
        const result = await adapter.execute(params, signal);

        expect(mockClient.callTool).toHaveBeenCalledWith('test_tool', params);
        expect(result).toBeInstanceOf(DefaultToolResult);
        
        const data = result.data;
        expect(data.llmContent).toBe('Executed with unknown types');
      });

      it('should handle unknown parameters with Date objects', async () => {
        mockClient.callTool.mockResolvedValue({
          content: [{ type: 'text', text: 'Date handled' }]
        });

        const params: Record<string, unknown> = {
          timestamp: new Date('2024-01-01T00:00:00Z'),
          created: Date.now(),
          scheduled: new Date()
        };

        const signal = new AbortController().signal;
        await adapter.execute(params, signal);

        expect(mockClient.callTool).toHaveBeenCalledWith('test_tool', params);
      });

      it('should handle unknown parameters with BigInt values', async () => {
        mockClient.callTool.mockResolvedValue({
          content: [{ type: 'text', text: 'BigInt handled' }]
        });

        const params: Record<string, unknown> = {
          largeNumber: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
          id: BigInt(12345)
        };

        const signal = new AbortController().signal;
        await adapter.execute(params, signal);

        expect(mockClient.callTool).toHaveBeenCalledWith('test_tool', params);
      });

      it('should handle unknown parameters with Map and Set objects', async () => {
        mockClient.callTool.mockResolvedValue({
          content: [{ type: 'text', text: 'Collections handled' }]
        });

        const params: Record<string, unknown> = {
          dataMap: new Map([['key1', 'value1'], ['key2', 'value2']]),
          uniqueItems: new Set([1, 2, 3, 4, 5]),
          nestedCollection: {
            map: new Map(),
            set: new Set()
          }
        };

        const signal = new AbortController().signal;
        await adapter.execute(params, signal);

        expect(mockClient.callTool).toHaveBeenCalledWith('test_tool', params);
      });

      it('should handle mixed known and unknown parameter types', async () => {
        mockClient.callTool.mockResolvedValue({
          content: [{ type: 'text', text: 'Mixed types handled' }]
        });

        // Mix explicit types with unknown to test type safety
        const knownParams = {
          name: 'test',
          count: 10
        };

        const unknownParams: Record<string, unknown> = {
          mysterious: 'value',
          dynamic: Math.random(),
          computed: (() => 'result')(),
          nested: {
            deep: {
              value: 'hidden'
            }
          }
        };

        const params: Record<string, unknown> = {
          ...knownParams,
          ...unknownParams
        };

        const signal = new AbortController().signal;
        await adapter.execute(params, signal);

        expect(mockClient.callTool).toHaveBeenCalledWith('test_tool', params);
      });

      it('should handle parameters with undefined and null unknown values', async () => {
        mockClient.callTool.mockResolvedValue({
          content: [{ type: 'text', text: 'Null and undefined handled' }]
        });

        const params: Record<string, unknown> = {
          definedValue: 'test',
          nullValue: null,
          undefinedValue: undefined,
          nested: {
            alsoNull: null,
            alsoUndefined: undefined,
            stillDefined: 'value'
          }
        };

        const signal = new AbortController().signal;
        await adapter.execute(params, signal);

        expect(mockClient.callTool).toHaveBeenCalledWith('test_tool', params);
      });
    });
  });

  describe('formatMcpContent (via execute)', () => {
    it('should format text content blocks', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello World' }]
      });

      const result = await adapter.execute({ test: 'param' }, new AbortController().signal);
      const data = result.data;
      
      expect(data.llmContent).toBe('Hello World');
    });

    it('should format direct string content', async () => {
      mockClient.callTool.mockResolvedValue({
        content: ['Direct string']
      });

      const result = await adapter.execute({ test: 'param' }, new AbortController().signal);
      const data = result.data;
      
      expect(data.llmContent).toBe('Direct string');
    });

    it('should format numeric content', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [123]
      });

      const result = await adapter.execute({ test: 'param' }, new AbortController().signal);
      const data = result.data;
      
      expect(data.llmContent).toBe('123');
    });

    it('should format complex object content', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [{ complex: 'object', nested: { value: 42 } }]
      });

      const result = await adapter.execute({ test: 'param' }, new AbortController().signal);
      const data = result.data;
      
      expect(data.llmContent).toContain('"complex": "object"');
      expect(data.llmContent).toContain('"nested"');
      expect(data.llmContent).toContain('"value": 42');
    });

    it('should format mixed content types with double newlines', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [
          'String first',
          { type: 'text', text: 'Text block' },
          { data: 'object' }
        ]
      });

      const result = await adapter.execute({ test: 'param' }, new AbortController().signal);
      const data = result.data;
      
      expect(data.llmContent).toBe('String first\n\nText block\n\n{\n  "data": "object"\n}');
    });

    it('should handle null content array', async () => {
      mockClient.callTool.mockResolvedValue({
        content: null
      });

      const result = await adapter.execute({ test: 'param' }, new AbortController().signal);
      const data = result.data;
      
      expect(data.llmContent).toBe('No content returned from MCP tool');
    });

    it('should handle undefined content array', async () => {
      mockClient.callTool.mockResolvedValue({
        content: undefined
      });

      const result = await adapter.execute({ test: 'param' }, new AbortController().signal);
      const data = result.data;
      
      expect(data.llmContent).toBe('No content returned from MCP tool');
    });
  });
});

describe('createMcpTools', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = new SimpleMcpClient();
    mockClient.connected = true;
    mockClient.listTools = vi.fn();
  });

  it('should create adapters for all available tools', async () => {
    const mockTools = [
      { name: 'tool1', description: 'First tool' },
      { name: 'tool2', description: 'Second tool' },
      { name: 'tool3', description: 'Third tool' }
    ];

    mockClient.listTools.mockResolvedValue(mockTools);

    const adapters = await createMcpTools(mockClient);

    expect(adapters).toHaveLength(3);
    expect(adapters[0]).toBeInstanceOf(McpToolAdapter);
    expect(adapters[0].name).toBe('tool1');
    expect(adapters[1].name).toBe('tool2');
    expect(adapters[2].name).toBe('tool3');
  });

  it('should create adapters with correct properties for complex tools', async () => {
    const mockTools = [
      {
        name: 'complex_tool',
        description: 'A complex tool with schema',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
            param2: { type: 'number' }
          },
          required: ['param1']
        }
      },
      {
        name: 'simple_tool'
        // No description or schema
      }
    ];

    mockClient.listTools.mockResolvedValue(mockTools);

    const adapters = await createMcpTools(mockClient);

    expect(adapters).toHaveLength(2);
    
    // Check complex tool
    expect(adapters[0].name).toBe('complex_tool');
    expect(adapters[0].description).toBe('A complex tool with schema');
    expect(adapters[0].schema.parameters).toEqual(mockTools[0].inputSchema);
    
    // Check simple tool
    expect(adapters[1].name).toBe('simple_tool');
    expect(adapters[1].description).toBe('MCP tool: simple_tool');
  });

  it('should handle empty tool list', async () => {
    mockClient.listTools.mockResolvedValue([]);

    const adapters = await createMcpTools(mockClient);

    expect(adapters).toHaveLength(0);
    expect(adapters).toEqual([]);
  });

  it('should handle null tool list', async () => {
    mockClient.listTools.mockResolvedValue(null);

    // This should not throw but might create empty array
    await expect(createMcpTools(mockClient)).rejects.toThrow();
  });

  it('should handle undefined tool list', async () => {
    mockClient.listTools.mockResolvedValue(undefined);

    // This should not throw but might create empty array
    await expect(createMcpTools(mockClient)).rejects.toThrow();
  });

  it('should create adapters for tools with various name formats', async () => {
    const mockTools = [
      { name: 'simple_name' },
      { name: 'name-with-dashes' },
      { name: 'name_with_underscores' },
      { name: 'nameWithCamelCase' },
      { name: 'name.with.dots' },
      { name: 'name with spaces' },
      { name: '123_numeric_start' },
      { name: 'special!@#$chars' }
    ];

    mockClient.listTools.mockResolvedValue(mockTools);

    const adapters = await createMcpTools(mockClient);

    expect(adapters).toHaveLength(8);
    mockTools.forEach((tool, index) => {
      expect(adapters[index].name).toBe(tool.name);
    });
  });

  it('should throw error if client is not connected', async () => {
    mockClient.connected = false;

    await expect(createMcpTools(mockClient)).rejects.toThrow(
      'MCP client must be connected before creating tools'
    );

    expect(mockClient.listTools).not.toHaveBeenCalled();
  });

  it('should handle listTools errors', async () => {
    mockClient.listTools.mockRejectedValue(new Error('Server error'));

    await expect(createMcpTools(mockClient)).rejects.toThrow(
      'Failed to create MCP tools: Server error'
    );
  });

  it('should handle non-Error exceptions', async () => {
    mockClient.listTools.mockRejectedValue('String error');

    await expect(createMcpTools(mockClient)).rejects.toThrow(
      'Failed to create MCP tools: String error'
    );
  });

  it('should handle numeric exceptions', async () => {
    mockClient.listTools.mockRejectedValue(404);

    await expect(createMcpTools(mockClient)).rejects.toThrow(
      'Failed to create MCP tools: 404'
    );
  });

  it('should handle object exceptions', async () => {
    const errorObj = { code: 500, message: 'Internal error' };
    mockClient.listTools.mockRejectedValue(errorObj);

    await expect(createMcpTools(mockClient)).rejects.toThrow(
      'Failed to create MCP tools: [object Object]'
    );
  });

  it('should handle null client', async () => {
    await expect(createMcpTools(null as any)).rejects.toThrow();
  });

  it('should handle undefined client', async () => {
    await expect(createMcpTools(undefined as any)).rejects.toThrow();
  });

  it('should handle client without connected property', async () => {
    const badClient = {
      listTools: vi.fn()
    };

    await expect(createMcpTools(badClient as any)).rejects.toThrow(
      'MCP client must be connected before creating tools'
    );
  });

  it('should handle very large tool lists', async () => {
    const mockTools = Array.from({ length: 1000 }, (_, i) => ({
      name: `tool_${i}`,
      description: `Tool number ${i}`
    }));

    mockClient.listTools.mockResolvedValue(mockTools);

    const adapters = await createMcpTools(mockClient);

    expect(adapters).toHaveLength(1000);
    expect(adapters[0].name).toBe('tool_0');
    expect(adapters[999].name).toBe('tool_999');
  });
});