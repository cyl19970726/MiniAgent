/**
 * @fileoverview StandardAgent Tests
 * 
 * Test suite for the StandardAgent implementation focusing on session management
 * and high-level functionality. Since StandardAgent extends BaseAgent, 
 * core functionality is tested in baseAgent.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the dependencies first (hoisted)
vi.mock('../chat/geminiChat.js', () => ({
  GeminiChat: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn().mockResolvedValue({ content: 'Mock response', role: 'assistant', finish_reason: 'stop' }),
    sendMessageStream: vi.fn().mockImplementation(async function*() {
      yield { type: 'response.start', content: '', role: 'assistant', finish_reason: null };
      yield { type: 'response.chunk.text.done', content: 'Mock response', role: 'assistant', finish_reason: 'stop' };
      yield { type: 'response.complete', content: 'Mock response', role: 'assistant', finish_reason: 'stop' };
    }),
    getHistory: vi.fn().mockReturnValue([]),
    addHistory: vi.fn(),
    clearHistory: vi.fn(),
    setSystemPrompt: vi.fn(),
    getSystemPrompt: vi.fn(),
    getTokenUsage: vi.fn().mockReturnValue({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
    getModelInfo: vi.fn().mockReturnValue({ model: 'test-model', maxTokens: 1000 }),
  })),
}));

vi.mock('../coreToolScheduler.js', () => ({
  CoreToolScheduler: vi.fn().mockImplementation(() => ({
    registerTool: vi.fn(),
    removeTool: vi.fn().mockReturnValue(true),
    getToolList: vi.fn().mockReturnValue([]),
    getTool: vi.fn(),
    schedule: vi.fn().mockResolvedValue([]),
    handleConfirmationResponse: vi.fn(),
  })),
}));

import { StandardAgent } from '../standardAgent.js';

describe('StandardAgent', () => {
  let agent: StandardAgent;

  beforeEach(() => {
    const tools: any[] = [];
    const config = {
      chatProvider: 'gemini' as const,
      agentConfig: {
        model: 'test-model',
        workingDirectory: '/tmp/test',
      },
      toolSchedulerConfig: {
        parallelism: 1,
      },
      chatConfig: {
        apiKey: 'test-key',
        modelName: 'test-model',
        tokenLimit: 1000,
      },
    };
    
    agent = new StandardAgent(tools, config);
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with correct configuration', () => {
      expect(agent).toBeDefined();
      expect(agent.getStatus()).toBeDefined();
    });

    it('should have session manager initialized', () => {
      const sessionManager = agent.getSessionManager();
      expect(sessionManager).toBeDefined();
    });

    it('should inherit BaseAgent functionality', () => {
      // Test that StandardAgent has BaseAgent methods
      expect(typeof agent.registerTool).toBe('function');
      expect(typeof agent.getToolList).toBe('function');
      expect(typeof agent.onEvent).toBe('function');
      expect(typeof agent.getTokenUsage).toBe('function');
    });

    it('should have correct initial state', () => {
      const status = agent.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.currentTurn).toBe(0);
    });
  });

  describe('Session Management', () => {
    it('should create new sessions', () => {
      const sessionId = agent.createNewSession('Test Session');
      
      expect(sessionId).toMatch(/^session_/);
      expect(sessionId.length).toBeGreaterThan(10);
      
      const session = agent.getSessionManager().getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.title).toBe('Test Session');
      expect(session?.id).toBe(sessionId);
    });

    it('should create sessions with auto-generated titles', () => {
      const sessionId = agent.createNewSession();
      const session = agent.getSessionManager().getSession(sessionId);
      
      expect(session?.title).toContain('Session');
      expect(session?.createdAt).toBeDefined();
      expect(session?.lastActiveAt).toBeDefined();
    });

    it('should list all sessions', () => {
      const session1Id = agent.createNewSession('Session 1');
      const session2Id = agent.createNewSession('Session 2');
      
      const sessions = agent.getSessions();
      
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      const sessionIds = sessions.map(s => s.id);
      expect(sessionIds).toContain(session1Id);
      expect(sessionIds).toContain(session2Id);
    });

    it('should delete sessions', () => {
      const sessionId = agent.createNewSession('Test Session');
      expect(agent.getSessionManager().getSession(sessionId)).toBeDefined();
      
      const deleted = agent.deleteSession(sessionId);
      expect(deleted).toBe(true);
      expect(agent.getSessionManager().getSession(sessionId)).toBeNull();
    });

    it('should return false when deleting non-existent session', () => {
      const deleted = agent.deleteSession('non-existent');
      expect(deleted).toBe(false);
    });

    it('should switch to existing sessions', () => {
      const sessionId = agent.createNewSession('Test Session');
      
      const switched = agent.switchToSession(sessionId);
      expect(switched).toBe(true);
      expect(agent.getCurrentSessionId()).toBe(sessionId);
    });

    it('should return false when switching to non-existent session', () => {
      const switched = agent.switchToSession('non-existent');
      expect(switched).toBe(false);
    });

    it('should handle session metadata correctly', () => {
      const sessionId = agent.createNewSession('Metadata Test');
      const session = agent.getSessionManager().getSession(sessionId);
      
      expect(session?.createdAt).toBeDefined();
      expect(session?.lastActiveAt).toBeDefined();
      expect(session?.messageHistory).toEqual([]);
      expect(session?.tokenUsage).toEqual({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
      });
      expect(session?.metadata).toEqual({});
    });

    it('should update session titles', () => {
      const sessionId = agent.createNewSession('Original Title');
      
      const updated = agent.updateSessionTitle(sessionId, 'New Title');
      expect(updated).toBe(true);
      
      const session = agent.getSessionManager().getSession(sessionId);
      expect(session?.title).toBe('New Title');
    });
  });

  describe('Session Status and Information', () => {
    it('should provide session status', () => {
      const sessionId = agent.createNewSession('Status Test');
      agent.switchToSession(sessionId);
      
      const status = agent.getSessionStatus();
      expect(status).toBeDefined();
      expect(status.sessionInfo).toBeDefined();
      expect(status.sessionInfo?.id).toBe(sessionId);
    });

    it('should provide session status for specific session', () => {
      const sessionId = agent.createNewSession('Specific Status Test');
      
      const status = agent.getSessionStatus(sessionId);
      expect(status).toBeDefined();
      expect(status.sessionInfo).toBeDefined();
      expect(status.sessionInfo?.id).toBe(sessionId);
    });
  });

  describe('Tool Management Integration', () => {
    it('should have access to BaseAgent tool management methods', () => {
      expect(typeof agent.registerTool).toBe('function');
      expect(typeof agent.removeTool).toBe('function');
      expect(typeof agent.getToolList).toBe('function');
      expect(typeof agent.getTool).toBe('function');
    });

    it('should initially have empty tool list', () => {
      const tools = agent.getToolList();
      expect(Array.isArray(tools)).toBe(true);
    });

    it('should provide tools for session context', () => {
      const sessionId = agent.createNewSession('Tool Test');
      const tools = agent.getToolsForSession(sessionId);
      
      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe('Event Management Integration', () => {
    it('should inherit event management from BaseAgent', () => {
      expect(typeof agent.onEvent).toBe('function');
      expect(typeof agent.offEvent).toBe('function');
    });

    it('should handle event registration', () => {
      const handler = vi.fn();
      
      // This should not throw
      expect(() => agent.onEvent('test', handler)).not.toThrow();
      expect(() => agent.offEvent('test')).not.toThrow();
    });
  });

  describe('System Configuration', () => {
    it('should have access to system prompt management', () => {
      expect(typeof agent.setSystemPrompt).toBe('function');
      expect(typeof agent.getSystemPrompt).toBe('function');
    });

    it('should have access to token usage information', () => {
      const tokenUsage = agent.getTokenUsage();
      expect(tokenUsage).toBeDefined();
      expect(typeof tokenUsage.promptTokens).toBe('number');
      expect(typeof tokenUsage.completionTokens).toBe('number');
      expect(typeof tokenUsage.totalTokens).toBe('number');
    });

    it('should provide status information', () => {
      const status = agent.getStatus();
      expect(status).toBeDefined();
      expect(typeof status.isRunning).toBe('boolean');
      expect(typeof status.currentTurn).toBe('number');
      expect(typeof status.lastUpdateTime).toBe('number');
    });
  });

  describe('Session ID Generation', () => {
    it('should generate unique session IDs', () => {
      const sessionId1 = agent.createNewSession('Session 1');
      const sessionId2 = agent.createNewSession('Session 2');
      
      expect(sessionId1).not.toBe(sessionId2);
      expect(sessionId1).toMatch(/^session_/);
      expect(sessionId2).toMatch(/^session_/);
    });

    it('should generate consistent session ID format', () => {
      const sessionIds = [];
      
      for (let i = 0; i < 10; i++) {
        const sessionId = agent.createNewSession(`Session ${i}`);
        sessionIds.push(sessionId);
      }
      
      // All should start with 'session_'
      sessionIds.forEach(id => {
        expect(id).toMatch(/^session_/);
        expect(id.length).toBeGreaterThan(10);
      });
      
      // All should be unique
      const uniqueIds = new Set(sessionIds);
      expect(uniqueIds.size).toBe(sessionIds.length);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid session operations gracefully', () => {
      // These operations should not throw
      expect(() => agent.getSessionManager().getSession('invalid')).not.toThrow();
      expect(() => agent.deleteSession('invalid')).not.toThrow();
      expect(() => agent.switchToSession('invalid')).not.toThrow();
      
      // They should return appropriate values
      expect(agent.getSessionManager().getSession('invalid')).toBeNull();
      expect(agent.deleteSession('invalid')).toBe(false);
      expect(agent.switchToSession('invalid')).toBe(false);
    });

    it('should handle empty and special characters in session titles', () => {
      const emptyTitleId = agent.createNewSession('');
      const specialCharsId = agent.createNewSession('!@#$%^&*()');
      const longTitleId = agent.createNewSession('A'.repeat(1000));
      
      // Empty title gets auto-generated title, not empty string
      const emptySession = agent.getSessionManager().getSession(emptyTitleId);
      expect(emptySession?.title).toContain('Session');
      
      // Special characters should be preserved
      expect(agent.getSessionManager().getSession(specialCharsId)?.title).toBe('!@#$%^&*()');
      
      // Long title should be preserved
      expect(agent.getSessionManager().getSession(longTitleId)?.title).toBe('A'.repeat(1000));
    });
  });

  describe('Integration with BaseAgent', () => {
    it('should properly extend BaseAgent', () => {
      // StandardAgent should be an instance of StandardAgent
      expect(agent).toBeInstanceOf(StandardAgent);
      
      // Should have BaseAgent methods
      const baseAgentMethods = [
        'registerTool',
        'removeTool', 
        'getToolList',
        'getTool',
        'onEvent',
        'offEvent',
        'getTokenUsage',
        'clearHistory',
        'setSystemPrompt',
        'getSystemPrompt',
        'getStatus'
      ];
      
      baseAgentMethods.forEach(method => {
        expect(typeof (agent as any)[method]).toBe('function');
      });
    });

    it('should have StandardAgent-specific methods', () => {
      const standardAgentMethods = [
        'createNewSession',
        'switchToSession',
        'getCurrentSessionId',
        'getSessions',
        'deleteSession',
        'updateSessionTitle',
        'getSessionManager',
        'getSessionStatus',
        'getToolsForSession',
        'processWithSession'
      ];
      
      standardAgentMethods.forEach(method => {
        expect(typeof (agent as any)[method]).toBe('function');
      });
    });
  });

  describe('Process Integration', () => {
    it('should have processWithSession method', () => {
      expect(typeof agent.processWithSession).toBe('function');
    });

    it('should accept string input in processWithSession', async () => {
      const sessionId = agent.createNewSession('Process Test');
      const abortController = new AbortController();
      
      // This should not throw
      expect(() => {
        agent.processWithSession('Hello', sessionId, abortController.signal);
      }).not.toThrow();
    });
  });
});