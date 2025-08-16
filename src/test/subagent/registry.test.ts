/**
 * @fileoverview Tests for SubAgentRegistry
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { SubAgentRegistry } from '../../subagent/registry.js';
import { SubAgentConfig } from '../../interfaces.js';

describe('SubAgentRegistry', () => {
  let registry: SubAgentRegistry;

  beforeEach(() => {
    registry = new SubAgentRegistry();
  });

  describe('Constructor', () => {
    test('should initialize empty registry', () => {
      expect(registry.listSubAgents()).toEqual([]);
    });
  });

  describe('register', () => {
    test('should register valid subagent config', () => {
      const config: SubAgentConfig = {
        name: 'test-agent',
        description: 'A test subagent',
        systemPrompt: 'You are a test agent.',
        whenToUse: 'When testing is needed'
      };

      expect(() => registry.register(config)).not.toThrow();
      expect(registry.listSubAgents()).toHaveLength(1);
    });

    test('should throw error for duplicate names', () => {
      const config: SubAgentConfig = {
        name: 'duplicate',
        description: 'A test subagent',
        systemPrompt: 'You are a test agent.',
        whenToUse: 'When testing is needed'
      };

      registry.register(config);
      expect(() => registry.register(config)).toThrow(
        "SubAgent with name 'duplicate' is already registered"
      );
    });

    test('should throw error for empty name', () => {
      const config: SubAgentConfig = {
        name: '',
        description: 'A test subagent',
        systemPrompt: 'You are a test agent.',
        whenToUse: 'When testing is needed'
      };

      expect(() => registry.register(config)).toThrow(
        'SubAgent config must have a non-empty name'
      );
    });

    test('should throw error for empty description', () => {
      const config: SubAgentConfig = {
        name: 'test-agent',
        description: '',
        systemPrompt: 'You are a test agent.',
        whenToUse: 'When testing is needed'
      };

      expect(() => registry.register(config)).toThrow(
        'SubAgent config must have a non-empty description'
      );
    });

    test('should throw error for empty systemPrompt', () => {
      const config: SubAgentConfig = {
        name: 'test-agent',
        description: 'A test subagent',
        systemPrompt: '',
        whenToUse: 'When testing is needed'
      };

      expect(() => registry.register(config)).toThrow(
        'SubAgent config must have a non-empty systemPrompt'
      );
    });

    test('should throw error for empty whenToUse', () => {
      const config: SubAgentConfig = {
        name: 'test-agent',
        description: 'A test subagent',
        systemPrompt: 'You are a test agent.',
        whenToUse: ''
      };

      expect(() => registry.register(config)).toThrow(
        'SubAgent config must have a non-empty whenToUse field'
      );
    });

    test('should accept valid tools array', () => {
      const config: SubAgentConfig = {
        name: 'test-agent',
        description: 'A test subagent',
        systemPrompt: 'You are a test agent.',
        whenToUse: 'When testing is needed',
        tools: ['tool1', 'tool2']
      };

      expect(() => registry.register(config)).not.toThrow();
    });

    test('should accept asterisk for all tools', () => {
      const config: SubAgentConfig = {
        name: 'test-agent',
        description: 'A test subagent',
        systemPrompt: 'You are a test agent.',
        whenToUse: 'When testing is needed',
        tools: '*'
      };

      expect(() => registry.register(config)).not.toThrow();
    });

    test('should throw error for invalid tools', () => {
      const config: SubAgentConfig = {
        name: 'test-agent',
        description: 'A test subagent',
        systemPrompt: 'You are a test agent.',
        whenToUse: 'When testing is needed',
        tools: [] as any
      };

      expect(() => registry.register(config)).toThrow(
        'SubAgent config tools must be "*" or a non-empty array of tool names'
      );
    });

    test('should throw error for invalid name format', () => {
      const config: SubAgentConfig = {
        name: 'test agent!',
        description: 'A test subagent',
        systemPrompt: 'You are a test agent.',
        whenToUse: 'When testing is needed'
      };

      expect(() => registry.register(config)).toThrow(
        'SubAgent name must contain only letters, numbers, underscores, and hyphens'
      );
    });
  });

  describe('getConfig', () => {
    test('should return config for existing subagent', () => {
      const config: SubAgentConfig = {
        name: 'test-agent',
        description: 'A test subagent',
        systemPrompt: 'You are a test agent.',
        whenToUse: 'When testing is needed'
      };

      registry.register(config);
      const retrieved = registry.getConfig('test-agent');
      
      expect(retrieved).toEqual(config);
    });

    test('should return undefined for non-existent subagent', () => {
      const retrieved = registry.getConfig('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('listSubAgents', () => {
    test('should return empty array for empty registry', () => {
      expect(registry.listSubAgents()).toEqual([]);
    });

    test('should return all registered subagents', () => {
      const config1: SubAgentConfig = {
        name: 'agent1',
        description: 'First agent',
        systemPrompt: 'You are agent 1.',
        whenToUse: 'For first tasks'
      };

      const config2: SubAgentConfig = {
        name: 'agent2',
        description: 'Second agent',
        systemPrompt: 'You are agent 2.',
        whenToUse: 'For second tasks'
      };

      registry.register(config1);
      registry.register(config2);

      const agents = registry.listSubAgents();
      expect(agents).toHaveLength(2);
      expect(agents).toContain(config1);
      expect(agents).toContain(config2);
    });
  });

  describe('generateSystemPromptSnippet', () => {
    test('should return message for empty registry', () => {
      const snippet = registry.generateSystemPromptSnippet();
      expect(snippet).toBe('No specialized subagents are currently available.');
    });

    test('should generate correct snippet for single subagent', () => {
      const config: SubAgentConfig = {
        name: 'test-agent',
        description: 'A test subagent',
        systemPrompt: 'You are a test agent.',
        whenToUse: 'When testing is needed',
        tools: ['tool1', 'tool2']
      };

      registry.register(config);
      const snippet = registry.generateSystemPromptSnippet();

      expect(snippet).toContain('**test-agent**');
      expect(snippet).toContain('Description: A test subagent');
      expect(snippet).toContain('When to use: When testing is needed');
      expect(snippet).toContain('Available tools: tool1, tool2');
      expect(snippet).toContain('Use the Task tool to delegate work');
    });

    test('should generate correct snippet for subagent with all tools', () => {
      const config: SubAgentConfig = {
        name: 'all-tools-agent',
        description: 'Agent with all tools',
        systemPrompt: 'You have all tools.',
        whenToUse: 'When everything is needed',
        tools: '*'
      };

      registry.register(config);
      const snippet = registry.generateSystemPromptSnippet();

      expect(snippet).toContain('Available tools: All parent agent tools (except Task tool)');
    });

    test('should generate correct snippet for multiple subagents', () => {
      const config1: SubAgentConfig = {
        name: 'agent1',
        description: 'First agent',
        systemPrompt: 'You are agent 1.',
        whenToUse: 'For first tasks'
      };

      const config2: SubAgentConfig = {
        name: 'agent2',
        description: 'Second agent',
        systemPrompt: 'You are agent 2.',
        whenToUse: 'For second tasks'
      };

      registry.register(config1);
      registry.register(config2);

      const snippet = registry.generateSystemPromptSnippet();

      expect(snippet).toContain('**agent1**');
      expect(snippet).toContain('**agent2**');
      expect(snippet).toContain('Description: First agent');
      expect(snippet).toContain('Description: Second agent');
    });
  });
});