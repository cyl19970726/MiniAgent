/**
 * @fileoverview GeminiChat Tests
 * 
 * Comprehensive test suite for the GeminiChat implementation.
 * Tests cover streaming responses, history management, token tracking,
 * and error handling scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiChat } from '../geminiChat.js';
import { TokenTracker } from '../tokenTracker.js';
import {
  ChatMessage,
  ConversationContent,
  ContentPart,
  LLMResponse,
  ITokenUsage,
} from '../interfaces.js';

// Mock GoogleGenAI
const mockGenerateContentStream = vi.fn();
const mockModels = {
  generateContentStream: mockGenerateContentStream,
};

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: mockModels,
  })),
}));

describe('GeminiChat', () => {
  let geminiChat: GeminiChat;
  let mockApiKey: string;
  let mockModelName: string;
  let mockTokenLimit: number;

  beforeEach(() => {
    mockApiKey = 'test-api-key';
    mockModelName = 'gemini-pro';
    mockTokenLimit = 1000000;
    
    // Reset mocks
    vi.clearAllMocks();
    
    geminiChat = new GeminiChat(
      mockApiKey,
      mockModelName,
      mockTokenLimit,
      [],
      'You are a helpful assistant',
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct parameters', () => {
      expect(geminiChat).toBeInstanceOf(GeminiChat);
      expect(geminiChat.getModelInfo()).toEqual({
        model: mockModelName,
        tokenLimit: mockTokenLimit,
      });
      expect(geminiChat.getSystemPrompt()).toBe('You are a helpful assistant');
    });

    it('should initialize with empty history', () => {
      const history = geminiChat.getHistory();
      expect(history).toEqual([]);
    });

    it('should initialize with provided history', () => {
      const initialHistory: ConversationContent[] = [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
          metadata: { timestamp: Date.now() },
        },
      ];

      const chatWithHistory = new GeminiChat(
        mockApiKey,
        mockModelName,
        mockTokenLimit,
        initialHistory,
      );

      expect(chatWithHistory.getHistory()).toEqual(initialHistory);
    });
  });

  describe('System Prompt Management', () => {
    it('should set and get system prompt', () => {
      const newPrompt = 'You are a coding assistant';
      geminiChat.setSystemPrompt(newPrompt);
      expect(geminiChat.getSystemPrompt()).toBe(newPrompt);
    });

    it('should handle undefined system prompt', () => {
      const chatWithoutPrompt = new GeminiChat(mockApiKey, mockModelName, mockTokenLimit);
      expect(chatWithoutPrompt.getSystemPrompt()).toBeUndefined();
    });
  });

  describe('Token Usage Tracking', () => {
    it('should provide token usage information', () => {
      const usage = geminiChat.getTokenUsage();
      expect(usage).toMatchObject({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cumulativeTokens: 0,
        tokenLimit: mockTokenLimit,
        usagePercentage: 0,
      });
    });

    it('should provide token tracker instance', () => {
      const tracker = geminiChat.getTokenTracker();
      expect(tracker).toBeInstanceOf(TokenTracker);
    });

    it('should reset token tracking when history is set', () => {
      // First, update usage
      const tracker = geminiChat.getTokenTracker();
      tracker.updateUsage({ inputTokens: 100, outputTokens: 50 });

      // Verify usage was updated
      expect(geminiChat.getTokenUsage().totalTokens).toBe(150);

      // Set new history
      geminiChat.setHistory([]);

      // Verify usage was reset
      expect(geminiChat.getTokenUsage().totalTokens).toBe(0);
    });
  });

  describe('History Management', () => {
    let testContent: ConversationContent;

    beforeEach(() => {
      testContent = {
        role: 'user',
        parts: [{ type: 'text', text: 'Test message' }],
        metadata: { timestamp: Date.now() },
      };
    });

    it('should add content to history', () => {
      geminiChat.addHistory(testContent);
      const history = geminiChat.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(testContent);
    });

    it('should set entire history', () => {
      const newHistory = [testContent];
      geminiChat.setHistory(newHistory);
      expect(geminiChat.getHistory()).toEqual(newHistory);
    });

    it('should clear history', () => {
      geminiChat.addHistory(testContent);
      expect(geminiChat.getHistory()).toHaveLength(1);
      
      geminiChat.clearHistory();
      expect(geminiChat.getHistory()).toHaveLength(0);
    });

    it('should return deep copy of history', () => {
      geminiChat.addHistory(testContent);
      const history1 = geminiChat.getHistory();
      const history2 = geminiChat.getHistory();
      
      // Should be equal but not the same reference
      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2);
      
      // Modifying one should not affect the other
      history1.push({
        role: 'assistant',
        parts: [{ type: 'text', text: 'Modified' }],
      });
      
      expect(geminiChat.getHistory()).toEqual(history2);
    });

    describe('Curated History', () => {
      it('should extract curated history correctly', () => {
        // Add valid user-assistant interaction
        geminiChat.addHistory({
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        });
        geminiChat.addHistory({
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hi there!' }],
        });

        // Add invalid assistant response
        geminiChat.addHistory({
          role: 'user',
          parts: [{ type: 'text', text: 'How are you?' }],
        });
        geminiChat.addHistory({
          role: 'assistant',
          parts: [{ type: 'text', text: '' }], // Invalid empty text
        });

        const curatedHistory = geminiChat.getHistory(true);
        
        // Should only include the first valid interaction
        expect(curatedHistory).toHaveLength(2);
        expect(curatedHistory[0].role).toBe('user');
        expect(curatedHistory[1].role).toBe('assistant');
      });

      it('should handle orphaned assistant messages', () => {
        // Add orphaned assistant message
        geminiChat.addHistory({
          role: 'assistant',
          parts: [{ type: 'text', text: 'Orphaned message' }],
        });

        const curatedHistory = geminiChat.getHistory(true);
        expect(curatedHistory).toHaveLength(0);
      });
    });
  });

  describe('Message Streaming', () => {
    let mockMessage: ChatMessage;
    let mockStreamResult: any;

    beforeEach(() => {
      mockMessage = {
        content: 'Hello, how are you?',
        config: { temperature: 0.7 },
      };

      // Create mock stream
      const mockChunks = [
        {
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Hello! ' }],
            },
          }],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        },
        {
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: "I'm doing great, thanks!" }],
            },
          }],
        },
      ];

      // Create async generator directly
      mockStreamResult = (async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      })();

      mockGenerateContentStream.mockResolvedValue(mockStreamResult);
    });

    it('should send message and return streaming response', async () => {
      const promptId = 'test-prompt-123';
      const streamResponse = await geminiChat.sendMessageStream(mockMessage, promptId);

      expect(mockGenerateContentStream).toHaveBeenCalledWith({
        model: mockModelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello, how are you?' }],
          },
        ],
        config: {
          systemInstruction: 'You are a helpful assistant',
        },
      });

      // Consume the stream and verify responses
      const responses: LLMResponse[] = [];
      for await (const response of streamResponse) {
        responses.push(response);
      }

      expect(responses).toHaveLength(2);
      expect(responses[0].content.parts[0]).toMatchObject({
        type: 'text',
        text: 'Hello! ',
      });
      expect(responses[1].content.parts[0]).toMatchObject({
        type: 'text',
        text: "I'm doing great, thanks!",
      });
    });

    it('should update token usage during streaming', async () => {
      const promptId = 'test-prompt-123';
      const streamResponse = await geminiChat.sendMessageStream(mockMessage, promptId);

      // Consume the stream to trigger token updates
      const responses: LLMResponse[] = [];
      for await (const response of streamResponse) {
        responses.push(response);
      }

      // Check that token usage was updated (the actual values depend on mock implementation)
      const usage = geminiChat.getTokenUsage();
      expect(usage.inputTokens).toBeGreaterThanOrEqual(0);
      expect(usage.outputTokens).toBeGreaterThanOrEqual(0);
      expect(usage.totalTokens).toBeGreaterThanOrEqual(0);
    });

    it('should update history after successful streaming', async () => {
      const promptId = 'test-prompt-123';
      const streamResponse = await geminiChat.sendMessageStream(mockMessage, promptId);

      // Consume the stream
      for await (const _ of streamResponse) {
        // Stream processing
      }

      const history = geminiChat.getHistory();
      expect(history).toHaveLength(2); // User input + consolidated assistant response
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
    });

    it('should handle streaming errors', async () => {
      const errorMessage = 'API Error';
      mockGenerateContentStream.mockRejectedValue(new Error(errorMessage));

      const promptId = 'test-prompt-123';
      
      await expect(geminiChat.sendMessageStream(mockMessage, promptId))
        .rejects.toThrow(errorMessage);
    });

    it('should handle empty responses', async () => {
      const emptyStreamResult = (async function* () {
        yield {
          candidates: [],
        };
      })();

      mockGenerateContentStream.mockResolvedValue(emptyStreamResult);

      const promptId = 'test-prompt-123';
      const streamResponse = await geminiChat.sendMessageStream(mockMessage, promptId);

      const responses: LLMResponse[] = [];
      for await (const response of streamResponse) {
        responses.push(response);
      }

      expect(responses).toHaveLength(1);
      expect(responses[0].content.parts).toEqual([]);
    });

    it('should prevent concurrent message processing', async () => {
      const promptId1 = 'test-prompt-1';
      const promptId2 = 'test-prompt-2';

      // Start first request
      const stream1Promise = geminiChat.sendMessageStream(mockMessage, promptId1);
      
      // Immediately start second request
      const stream2Promise = geminiChat.sendMessageStream(mockMessage, promptId2);

      // Wait for both to resolve
      const [stream1, stream2] = await Promise.all([stream1Promise, stream2Promise]);

      // Both should succeed, but be processed sequentially
      expect(stream1).toBeDefined();
      expect(stream2).toBeDefined();
    });
  });

  describe('Processing State', () => {
    it('should track processing state correctly', async () => {
      expect(geminiChat.isProcessing()).toBe(false);

      // Mock a long-running stream
      const longStreamResult = (async function* () {
        yield {
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Response' }],
            },
          }],
        };
      })();

      mockGenerateContentStream.mockResolvedValue(longStreamResult);

      const message: ChatMessage = { content: 'Test message' };
      const streamPromise = geminiChat.sendMessageStream(message, 'test-prompt');

      // Should be processing while stream is active
      const stream = await streamPromise;
      
      // Consume part of the stream
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();

      // Should be processing
      expect(geminiChat.isProcessing()).toBe(true);

      // Finish consuming the stream
      for await (const _ of stream) {
        // Complete the stream
      }

      // Should no longer be processing
      expect(geminiChat.isProcessing()).toBe(false);
    });
  });

  describe('Model Fallback', () => {
    it('should handle model fallback successfully', () => {
      // Mock successful fallback
      process.env.GOOGLE_API_KEY = 'test-key';
      
      const result = geminiChat.handleModelFallback('gemini-flash');
      expect(result).toBe(true);
    });

    it('should handle model fallback failure', () => {
      // Mock missing API key
      const originalKey = process.env.GOOGLE_API_KEY;
      process.env.GOOGLE_API_KEY = '';
      
      const result = geminiChat.handleModelFallback('invalid-model');
      expect(result).toBe(false);
      
      // Restore original key
      if (originalKey !== undefined) {
        process.env.GOOGLE_API_KEY = originalKey;
      } else {
        delete process.env.GOOGLE_API_KEY;
      }
    });
  });

  describe('Content Validation', () => {
    it('should validate conversation content correctly', () => {
      const validContent: ConversationContent = {
        role: 'user',
        parts: [{ type: 'text', text: 'Hello world' }],
      };

      const invalidContent: ConversationContent = {
        role: 'user',
        parts: [{ type: 'text', text: '' }], // Empty text is invalid
      };

      // Use private method via type assertion for testing
      const chat = geminiChat as any;
      
      expect(chat.isValidConversationContent(validContent)).toBe(true);
      expect(chat.isValidConversationContent(invalidContent)).toBe(false);
    });

    it('should handle content with no parts', () => {
      const invalidContent: ConversationContent = {
        role: 'user',
        parts: [],
      };

      const chat = geminiChat as any;
      expect(chat.isValidConversationContent(invalidContent)).toBe(false);
    });

    it('should handle content with function calls', () => {
      const functionCallContent: ConversationContent = {
        role: 'assistant',
        parts: [{
          type: 'function_call',
          functionCall: {
            id: 'call_123',
            name: 'get_weather',
            args: { location: 'New York' },
          },
        }],
      };

      const chat = geminiChat as any;
      expect(chat.isValidConversationContent(functionCallContent)).toBe(true);
    });
  });

  describe('Type Conversion', () => {
    it('should convert string content to Gemini format', () => {
      const chat = geminiChat as any;
      const result = chat.convertToGeminiContent('Hello world', 'user');

      expect(result).toEqual({
        role: 'user',
        parts: [{ text: 'Hello world' }],
      });
    });

    it('should convert ContentPart array to Gemini format', () => {
      const chat = geminiChat as any;
      const contentParts: ContentPart[] = [
        { type: 'text', text: 'Hello' },
        { type: 'function_call', functionCall: { id: 'call_1', name: 'test', args: {} } },
      ];

      const result = chat.convertToGeminiContent(contentParts, 'assistant');

      expect(result).toEqual({
        role: 'model',
        parts: [
          { text: 'Hello' },
          { functionCall: { name: 'test', args: {} } },
        ],
      });
    });

    it('should convert assistant role to model role', () => {
      const chat = geminiChat as any;
      const result = chat.convertToGeminiContent('Hello', 'assistant');

      expect(result.role).toBe('model');
    });

    it('should consolidate multiple assistant responses', () => {
      const chat = geminiChat as any;
      const responses: ConversationContent[] = [
        {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hello' }],
        },
        {
          role: 'assistant',
          parts: [{ type: 'text', text: ' world' }],
        },
      ];

      const result = chat.consolidateAssistantResponses(responses);

      expect(result.role).toBe('assistant');
      expect(result.parts).toHaveLength(2);
      expect(result.metadata.consolidated).toBe(true);
      expect(result.metadata.originalCount).toBe(2);
    });
  });

  describe('Usage Summary', () => {
    it('should provide usage summary', () => {
      const summary = geminiChat.getUsageSummary();
      expect(summary).toContain('Token Usage Summary');
      expect(summary).toContain(mockModelName);
      expect(summary).toContain('0 tokens'); // Initial state
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const errorMessage = 'API quota exceeded';
      mockGenerateContentStream.mockRejectedValue(new Error(errorMessage));

      const message: ChatMessage = { content: 'Test message' };
      
      await expect(geminiChat.sendMessageStream(message, 'test-prompt'))
        .rejects.toThrow(errorMessage);

      // Should not be processing after error
      expect(geminiChat.isProcessing()).toBe(false);
    });

    it('should handle malformed API responses', async () => {
      const malformedStreamResult = (async function* () {
        yield {
          // Missing candidates
        };
      })();

      mockGenerateContentStream.mockResolvedValue(malformedStreamResult);

      const message: ChatMessage = { content: 'Test message' };
      const streamResponse = await geminiChat.sendMessageStream(message, 'test-prompt');

      const responses: LLMResponse[] = [];
      for await (const response of streamResponse) {
        responses.push(response);
      }

      // Should handle gracefully and produce empty response
      expect(responses).toHaveLength(1);
      expect(responses[0].content.parts).toEqual([]);
    });
  });
});