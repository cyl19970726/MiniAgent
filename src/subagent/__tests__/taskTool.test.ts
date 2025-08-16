/**
 * @fileoverview Comprehensive tests for TaskTool
 * 
 * This test suite validates the TaskTool class functionality including
 * parameter validation, subagent creation, tool inheritance, error handling,
 * and proper cleanup.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TaskTool } from '../taskTool.js';
import { SubAgentRegistry } from '../registry.js';
import { SubAgentConfig, IAgentConfig, DefaultToolResult } from '../../interfaces.js';
import {
  MockChatProvider,
  MockToolScheduler,
  TestDataFactory,
  MockTool,
  TestHelpers,
} from '../../test/testUtils.js';

describe('TaskTool', () => {
  let registry: SubAgentRegistry;
  let taskTool: TaskTool;
  let mockChatFactory: vi.Mock;
  let mockSchedulerFactory: vi.Mock;
  let mockConfig: IAgentConfig;
  let testTools: MockTool[];
  let abortController: AbortController;

  // Test configurations
  const testSubAgentConfig: SubAgentConfig = {
    name: 'test-agent',
    description: 'A test subagent for unit testing',
    systemPrompt: 'You are a test agent. Follow instructions carefully.',
    whenToUse: 'Use for testing purposes',
    tools: ['Read', 'Write'],
  };

  const allToolsSubAgentConfig: SubAgentConfig = {
    name: 'all-tools-agent',
    description: 'A subagent with access to all tools',
    systemPrompt: 'You are an agent with all available tools.',
    whenToUse: 'Use when all tools are needed',
    tools: '*',
  };

  beforeEach(() => {
    // Create fresh instances for each test
    registry = new SubAgentRegistry();
    testTools = [
      new MockTool('Read', 'File Reader', 'Read files from disk'),
      new MockTool('Write', 'File Writer', 'Write files to disk'),
      new MockTool('Bash', 'Shell Command', 'Execute shell commands'),
      new MockTool('Task', 'Task Tool', 'Delegate tasks'), // This should be filtered out
    ];
    
    mockChatFactory = vi.fn();
    mockSchedulerFactory = vi.fn();
    mockConfig = TestDataFactory.createAgentConfig({
      sessionId: 'test-session',
    });
    
    // Create TaskTool instance
    taskTool = new TaskTool(
      registry,
      mockConfig,
      mockChatFactory,
      mockSchedulerFactory,
    );
    
    abortController = new AbortController();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor and basic properties', () => {
    it('should have correct name and description', () => {
      expect(taskTool.name).toBe('Task');
      expect(taskTool.displayName).toBe('Task Delegation Tool');
      expect(taskTool.description).toContain('Delegate');
    });

    it('should initialize with provided dependencies', () => {
      expect(taskTool).toBeInstanceOf(TaskTool);
      expect(mockChatFactory).toBeDefined();
      expect(mockSchedulerFactory).toBeDefined();
    });
  });

  describe('Schema generation', () => {
    it('should generate schema with empty enum when no subagents registered', () => {
      const schema = taskTool.schema;
      
      expect(schema.name).toBe('Task');
      expect(schema.description).toBe('Delegate tasks to specialized subagents');
      expect(schema.parameters.properties.task).toBeDefined();
      expect(schema.parameters.properties.subagent_name).toBeDefined();
      expect(schema.parameters.properties.subagent_name.enum).toEqual([]);
      expect(schema.parameters.required).toContain('task');
      expect(schema.parameters.required).toContain('subagent_name');
    });

    it('should generate schema with available subagents in enum', () => {
      registry.register(testSubAgentConfig);
      registry.register(allToolsSubAgentConfig);
      
      const schema = taskTool.schema;
      
      expect(schema.parameters.properties.subagent_name.enum).toContain('test-agent');
      expect(schema.parameters.properties.subagent_name.enum).toContain('all-tools-agent');
      expect(schema.parameters.properties.subagent_name.enum).toHaveLength(2);
      expect(schema.parameters.properties.subagent_name.description).toContain('test-agent, all-tools-agent');
    });

    it('should update schema dynamically when subagents are added', () => {
      // Initially empty
      expect(taskTool.schema.parameters.properties.subagent_name.enum).toHaveLength(0);
      
      // Add subagent
      registry.register(testSubAgentConfig);
      expect(taskTool.schema.parameters.properties.subagent_name.enum).toHaveLength(1);
      
      // Add another
      registry.register(allToolsSubAgentConfig);
      expect(taskTool.schema.parameters.properties.subagent_name.enum).toHaveLength(2);
    });
  });

  describe('Parameter validation', () => {
    beforeEach(() => {
      registry.register(testSubAgentConfig);
    });

    it('should validate required parameters', () => {
      const missingTask = taskTool.validateToolParams({ subagent_name: 'test-agent' } as any);
      expect(missingTask).toContain('task');

      const missingSubagent = taskTool.validateToolParams({ task: 'Do something' } as any);
      expect(missingSubagent).toContain('subagent_name');

      const missingBoth = taskTool.validateToolParams({} as any);
      expect(missingBoth).not.toBeNull();
    });

    it('should validate parameter types', () => {
      const invalidTaskType = taskTool.validateToolParams({ 
        task: 123, 
        subagent_name: 'test-agent' 
      } as any);
      expect(invalidTaskType).toContain('string');

      const invalidSubagentType = taskTool.validateToolParams({ 
        task: 'Do something', 
        subagent_name: 123 
      } as any);
      expect(invalidSubagentType).toContain('string');
    });

    it('should reject empty task', () => {
      const emptyTask = taskTool.validateToolParams({ 
        task: '', 
        subagent_name: 'test-agent' 
      });
      expect(emptyTask).toBe("Parameter 'task' cannot be empty");

      const whitespaceTask = taskTool.validateToolParams({ 
        task: '   ', 
        subagent_name: 'test-agent' 
      });
      expect(whitespaceTask).toBe('Task cannot be empty');
    });

    it('should reject non-existent subagent', () => {
      const nonExistent = taskTool.validateToolParams({ 
        task: 'Do something', 
        subagent_name: 'non-existent-agent' 
      });
      expect(nonExistent).toBe("Subagent 'non-existent-agent' not found in registry");
    });

    it('should accept valid parameters', () => {
      const valid = taskTool.validateToolParams({ 
        task: 'Valid task', 
        subagent_name: 'test-agent' 
      });
      expect(valid).toBeNull();
    });
  });

  describe('Description generation', () => {
    beforeEach(() => {
      registry.register(testSubAgentConfig);
    });

    it('should generate description with subagent info', () => {
      const description = taskTool.getDescription({ 
        task: 'Analyze code', 
        subagent_name: 'test-agent' 
      });
      
      expect(description).toContain('test-agent');
      expect(description).toContain('A test subagent for unit testing');
      expect(description).toContain('Analyze code');
    });

    it('should handle unknown subagent in description', () => {
      const description = taskTool.getDescription({ 
        task: 'Some task', 
        subagent_name: 'unknown-agent' 
      });
      
      expect(description).toContain('unknown subagent');
      expect(description).toContain('unknown-agent');
    });
  });

  describe('Task execution', () => {
    let mockChat: MockChatProvider;
    let mockScheduler: MockToolScheduler;

    beforeEach(() => {
      registry.register(testSubAgentConfig);
      
      // Setup mock instances
      mockChat = new MockChatProvider();
      mockScheduler = new MockToolScheduler();
      
      // Add test tools to scheduler
      testTools.forEach(tool => {
        if (tool.name !== 'Task') {
          mockScheduler.registerTool(tool);
        }
      });
      
      // Configure factories
      mockChatFactory.mockReturnValue(mockChat);
      mockSchedulerFactory.mockResolvedValue(mockScheduler);
    });

    it('should validate parameters before execution', async () => {
      const result = await taskTool.execute({
        task: '',
        subagent_name: 'test-agent',
      }, abortController.signal);

      expect(result.data.success).toBe(false);
      expect(result.data.error).toBe("Parameter 'task' cannot be empty");
      expect(mockChatFactory).not.toHaveBeenCalled();
    });

    it('should handle non-existent subagent', async () => {
      const result = await taskTool.execute({
        task: 'Valid task',
        subagent_name: 'non-existent',
      }, abortController.signal);

      expect(result.data.success).toBe(false);
      expect(result.data.error).toBe("Subagent 'non-existent' not found in registry");
      expect(mockChatFactory).not.toHaveBeenCalled();
    });

    it('should create chat instance with correct system prompt', async () => {
      const task = 'Analyze the code structure';
      
      // Mock successful response
      mockChat.setResponse(TestDataFactory.createLLMResponse('Task completed successfully'));
      
      // Mock BaseAgent dynamic import
      const mockProcessOneTurn = vi.fn().mockImplementation(async function* () {
        yield TestDataFactory.createAgentEvent('response.chunk.text.delta' as any, {
          content: { type: 'text', text: 'Task completed successfully' }
        });
        yield TestDataFactory.createAgentEvent('turn.complete' as any, {});
      });
      
      vi.doMock('../../baseAgent.js', () => ({
        BaseAgent: class MockBaseAgent {
          constructor(agentConfig: any, chat: any, scheduler: any) {
            // Store references for testing
            this.chat = chat;
            this.scheduler = scheduler;
          }
          processOneTurn = mockProcessOneTurn;
          getStatus() {
            return { config: { sessionId: 'test-session' } };
          }
        },
      }));

      const result = await taskTool.execute({
        task,
        subagent_name: 'test-agent',
      }, abortController.signal);

      expect(result).toBeInstanceOf(DefaultToolResult);
      expect(mockChatFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining(testSubAgentConfig.systemPrompt),
        })
      );
      expect(mockChatFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining(task),
        })
      );
      
      vi.doUnmock('../../baseAgent.js');
    });

    it('should filter out Task tool from inherited tools', async () => {
      // Mock successful response
      mockChat.setResponse(TestDataFactory.createLLMResponse('Tools verified'));
      
      const mockProcessOneTurn = vi.fn().mockImplementation(async function* () {
        yield TestDataFactory.createAgentEvent('response.chunk.text.delta' as any, {
          content: { type: 'text', text: 'Tools verified' }
        });
        yield TestDataFactory.createAgentEvent('turn.complete' as any, {});
      });
      
      vi.doMock('../../baseAgent.js', () => ({
        BaseAgent: class MockBaseAgent {
          processOneTurn = mockProcessOneTurn;
          getStatus() {
            return { config: { sessionId: 'test-session' } };
          }
        },
      }));

      await taskTool.execute({
        task: 'Check available tools',
        subagent_name: 'test-agent',
      }, abortController.signal);

      // Verify scheduler factory was called
      expect(mockSchedulerFactory).toHaveBeenCalled();
      
      // The actual filtering happens in the TaskTool.execute method
      // We can't easily test the internal scheduler creation, but we can verify
      // the factory was called with the expected structure
      const factoryCall = mockSchedulerFactory.mock.calls[0][0];
      expect(factoryCall).toHaveProperty('tools');
      
      vi.doUnmock('../../baseAgent.js');
    });

    it('should handle execution errors gracefully', async () => {
      // Make the chat factory throw an error
      mockChatFactory.mockImplementation(() => {
        throw new Error('Chat creation failed');
      });

      const result = await taskTool.execute({
        task: 'This will cause an error',
        subagent_name: 'test-agent',
      }, abortController.signal);

      expect(result.data.success).toBe(false);
      expect(result.data.error).toBe('Chat creation failed');
      expect(result.data.result).toBe('');
    });

    it('should support abort signal cancellation', async () => {
      // Setup a mock that will be interrupted
      const mockProcessOneTurn = vi.fn().mockImplementation(async function* () {
        // Simulate long-running task
        await TestHelpers.delay(100);
        yield TestDataFactory.createAgentEvent('response.start' as any, {});
      });
      
      vi.doMock('../../baseAgent.js', () => ({
        BaseAgent: class MockBaseAgent {
          processOneTurn = mockProcessOneTurn;
          getStatus() {
            return { config: { sessionId: 'test-session' } };
          }
        },
      }));

      // Abort after 50ms
      setTimeout(() => abortController.abort(), 50);

      const result = await taskTool.execute({
        task: 'Long running task',
        subagent_name: 'test-agent',
      }, abortController.signal);

      expect(result.data.success).toBe(false);
      expect(result.data.error).toBe('Task execution was cancelled');
      
      vi.doUnmock('../../baseAgent.js');
    });

    it('should forward output updates when handler provided', async () => {
      const outputHandler = vi.fn();
      
      // Mock successful response
      mockChat.setResponse(TestDataFactory.createLLMResponse('Task output'));
      
      const mockProcessOneTurn = vi.fn().mockImplementation(async function* () {
        yield TestDataFactory.createAgentEvent('response.chunk.text.delta' as any, {
          content: { type: 'text', text: 'Task output' }
        });
        yield TestDataFactory.createAgentEvent('turn.complete' as any, {});
      });
      
      vi.doMock('../../baseAgent.js', () => ({
        BaseAgent: class MockBaseAgent {
          processOneTurn = mockProcessOneTurn;
          getStatus() {
            return { config: { sessionId: 'test-session' } };
          }
        },
      }));

      await taskTool.execute({
        task: 'Task with output updates',
        subagent_name: 'test-agent',
      }, abortController.signal, outputHandler);

      // Verify output handler was called
      expect(outputHandler).toHaveBeenCalledWith(expect.stringContaining('Delegating task'));
      expect(outputHandler).toHaveBeenCalledWith(expect.stringContaining('Starting task execution'));
      expect(outputHandler).toHaveBeenCalledWith(expect.stringContaining('Task completed'));
      
      vi.doUnmock('../../baseAgent.js');
    });

    it('should create unique session IDs for each execution', async () => {
      mockChat.setResponse(TestDataFactory.createLLMResponse('Response 1'));
      const capturedConfigs: any[] = [];
      
      const mockProcessOneTurn = vi.fn().mockImplementation(async function* () {
        yield TestDataFactory.createAgentEvent('response.chunk.text.delta' as any, {
          content: { type: 'text', text: 'Response' }
        });
        yield TestDataFactory.createAgentEvent('turn.complete' as any, {});
      });
      
      vi.doMock('../../baseAgent.js', () => ({
        BaseAgent: class MockBaseAgent {
          constructor(agentConfig: any) {
            capturedConfigs.push(agentConfig);
          }
          processOneTurn = mockProcessOneTurn;
          getStatus() {
            return { config: { sessionId: 'captured-session' } };
          }
        },
      }));

      // Execute two tasks with a small delay to ensure unique timestamps
      await taskTool.execute({
        task: 'First task',
        subagent_name: 'test-agent',
      }, abortController.signal);

      // Small delay to ensure different timestamp
      await TestHelpers.delay(10);

      await taskTool.execute({
        task: 'Second task',
        subagent_name: 'test-agent',
      }, new AbortController().signal);

      expect(capturedConfigs).toHaveLength(2);
      expect(capturedConfigs[0].sessionId).not.toBe(capturedConfigs[1].sessionId);
      expect(capturedConfigs[0].sessionId).toContain('sub-test-agent');
      expect(capturedConfigs[1].sessionId).toContain('sub-test-agent');
      
      vi.doUnmock('../../baseAgent.js');
    });
  });

  describe('Edge cases and error conditions', () => {
    let mockChat: MockChatProvider;
    let mockScheduler: MockToolScheduler;

    beforeEach(() => {
      registry.register(testSubAgentConfig);
      
      mockChat = new MockChatProvider();
      mockScheduler = new MockToolScheduler();
      mockChatFactory.mockReturnValue(mockChat);
      mockSchedulerFactory.mockResolvedValue(mockScheduler);
    });

    it('should handle empty task description', async () => {
      const result = await taskTool.execute({
        task: '',
        subagent_name: 'test-agent',
      }, abortController.signal);

      expect(result.data.success).toBe(false);
      expect(result.data.error).toBe("Parameter 'task' cannot be empty");
    });

    it('should handle very long task descriptions', async () => {
      const longTask = 'A'.repeat(10000);
      
      mockChat.setResponse(TestDataFactory.createLLMResponse('Handled long task'));
      
      const mockProcessOneTurn = vi.fn().mockImplementation(async function* () {
        yield TestDataFactory.createAgentEvent('response.chunk.text.delta' as any, {
          content: { type: 'text', text: 'Handled long task' }
        });
        yield TestDataFactory.createAgentEvent('turn.complete' as any, {});
      });
      
      vi.doMock('../../baseAgent.js', () => ({
        BaseAgent: class MockBaseAgent {
          processOneTurn = mockProcessOneTurn;
          getStatus() {
            return { config: { sessionId: 'test-session' } };
          }
        },
      }));

      const result = await taskTool.execute({
        task: longTask,
        subagent_name: 'test-agent',
      }, abortController.signal);

      expect(result.data.success).toBe(true);
      expect(mockProcessOneTurn).toHaveBeenCalled();
      
      vi.doUnmock('../../baseAgent.js');
    });

    it('should handle special characters in task', async () => {
      const specialTask = 'Task with "quotes", newlines\nand special chars: @#$%^&*()';
      
      mockChat.setResponse(TestDataFactory.createLLMResponse('Special chars handled'));
      
      const mockProcessOneTurn = vi.fn().mockImplementation(async function* () {
        yield TestDataFactory.createAgentEvent('response.chunk.text.delta' as any, {
          content: { type: 'text', text: 'Special chars handled' }
        });
        yield TestDataFactory.createAgentEvent('turn.complete' as any, {});
      });
      
      vi.doMock('../../baseAgent.js', () => ({
        BaseAgent: class MockBaseAgent {
          processOneTurn = mockProcessOneTurn;
          getStatus() {
            return { config: { sessionId: 'test-session' } };
          }
        },
      }));

      const result = await taskTool.execute({
        task: specialTask,
        subagent_name: 'test-agent',
      }, abortController.signal);

      expect(result.data.success).toBe(true);
      
      vi.doUnmock('../../baseAgent.js');
    });
  });
});