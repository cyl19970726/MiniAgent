/**
 * @fileoverview Comprehensive tests for Schema Manager
 * Tests schema caching, TTL expiration, validation, and memory management
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { Schema } from '@google/genai';
import { McpSchemaManager, DefaultSchemaConverter } from '../SchemaManager.js';
import { SchemaCache, SchemaValidationResult } from '../interfaces.js';

describe('DefaultSchemaConverter', () => {
  let converter: DefaultSchemaConverter;

  beforeEach(() => {
    converter = new DefaultSchemaConverter();
  });

  describe('JSON Schema to Zod conversion', () => {
    it('should convert string schema correctly', () => {
      const jsonSchema: Schema = {
        type: 'string',
        minLength: 3,
        maxLength: 10
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      const result = zodSchema.safeParse('hello');
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
    });

    it('should handle string schema with pattern', () => {
      const jsonSchema: Schema = {
        type: 'string',
        pattern: '^[a-z]+$'
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      
      expect(zodSchema.safeParse('hello').success).toBe(true);
      expect(zodSchema.safeParse('Hello').success).toBe(false);
      expect(zodSchema.safeParse('123').success).toBe(false);
    });

    it('should convert string enum schema correctly', () => {
      const jsonSchema: Schema = {
        type: 'string',
        enum: ['red', 'green', 'blue']
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      
      expect(zodSchema.safeParse('red').success).toBe(true);
      expect(zodSchema.safeParse('yellow').success).toBe(false);
    });

    it('should convert number schema with constraints', () => {
      const jsonSchema: Schema = {
        type: 'number',
        minimum: 0,
        maximum: 100
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      
      expect(zodSchema.safeParse(50).success).toBe(true);
      expect(zodSchema.safeParse(-1).success).toBe(false);
      expect(zodSchema.safeParse(101).success).toBe(false);
    });

    it('should convert integer schema correctly', () => {
      const jsonSchema: Schema = {
        type: 'integer',
        minimum: 1
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      
      expect(zodSchema.safeParse(5).success).toBe(true);
      expect(zodSchema.safeParse(5.5).success).toBe(false);
      expect(zodSchema.safeParse(0).success).toBe(false);
    });

    it('should convert boolean schema correctly', () => {
      const jsonSchema: Schema = {
        type: 'boolean'
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      
      expect(zodSchema.safeParse(true).success).toBe(true);
      expect(zodSchema.safeParse(false).success).toBe(true);
      expect(zodSchema.safeParse('true').success).toBe(false);
    });

    it('should convert array schema with item constraints', () => {
      const jsonSchema: Schema = {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 3
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      
      expect(zodSchema.safeParse(['hello']).success).toBe(true);
      expect(zodSchema.safeParse(['a', 'b', 'c']).success).toBe(true);
      expect(zodSchema.safeParse([]).success).toBe(false);
      expect(zodSchema.safeParse(['a', 'b', 'c', 'd']).success).toBe(false);
      expect(zodSchema.safeParse([1, 2]).success).toBe(false);
    });

    it('should convert object schema with required fields', () => {
      const jsonSchema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          email: { type: 'string' }
        },
        required: ['name', 'age']
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      
      expect(zodSchema.safeParse({ name: 'John', age: 30 }).success).toBe(true);
      expect(zodSchema.safeParse({ name: 'John', age: 30, email: 'john@test.com' }).success).toBe(true);
      expect(zodSchema.safeParse({ name: 'John' }).success).toBe(false);
      expect(zodSchema.safeParse({ age: 30 }).success).toBe(false);
    });

    it('should handle object schema with strict mode', () => {
      const jsonSchema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        additionalProperties: false
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      
      expect(zodSchema.safeParse({ name: 'John' }).success).toBe(true);
      expect(zodSchema.safeParse({ name: 'John', extra: 'field' }).success).toBe(false);
    });

    it('should convert union schemas (oneOf)', () => {
      const jsonSchema: Schema = {
        oneOf: [
          { type: 'string' },
          { type: 'number' }
        ]
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      
      expect(zodSchema.safeParse('hello').success).toBe(true);
      expect(zodSchema.safeParse(123).success).toBe(true);
      expect(zodSchema.safeParse(true).success).toBe(false);
    });

    it('should handle nested object schemas', () => {
      const jsonSchema: Schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              profile: {
                type: 'object',
                properties: {
                  bio: { type: 'string' }
                }
              }
            },
            required: ['name']
          }
        },
        required: ['user']
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      
      const validData = {
        user: {
          name: 'John',
          profile: {
            bio: 'Developer'
          }
        }
      };

      expect(zodSchema.safeParse(validData).success).toBe(true);
      expect(zodSchema.safeParse({ user: {} }).success).toBe(false);
    });

    it('should fallback to z.any() for unsupported schemas', () => {
      const jsonSchema: Schema = {
        type: 'unknown_type' as any
      };

      const zodSchema = converter.jsonSchemaToZod(jsonSchema);
      
      expect(zodSchema.safeParse(123).success).toBe(true);
      expect(zodSchema.safeParse('anything').success).toBe(true);
      expect(zodSchema.safeParse(null).success).toBe(true);
    });

    it('should handle schema conversion errors gracefully', () => {
      const invalidSchema = null as any;
      
      const zodSchema = converter.jsonSchemaToZod(invalidSchema);
      
      expect(zodSchema.safeParse('anything').success).toBe(true);
    });
  });

  describe('parameter validation', () => {
    it('should validate parameters successfully', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().min(0)
      });

      const result = converter.validateParams({ name: 'John', age: 30 }, schema);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'John', age: 30 });
      expect(result.errors).toBeUndefined();
    });

    it('should return validation errors for invalid parameters', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().min(0)
      });

      const result = converter.validateParams({ name: 123, age: -1 }, schema);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.zodError).toBeDefined();
    });

    it('should handle validation exceptions', () => {
      const mockSchema = {
        safeParse: vi.fn().mockImplementation(() => {
          throw new Error('Validation error');
        })
      } as any;

      const result = converter.validateParams({ test: 'data' }, mockSchema);
      
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['Validation error']);
    });
  });
});

describe('McpSchemaManager', () => {
  let manager: McpSchemaManager;
  let converter: DefaultSchemaConverter;

  beforeEach(() => {
    vi.useFakeTimers();
    converter = new DefaultSchemaConverter();
    manager = new McpSchemaManager({
      converter,
      maxCacheSize: 10,
      cacheTtlMs: 5000 // 5 seconds for testing
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('schema caching', () => {
    it('should cache schema successfully', async () => {
      const schema: Schema = {
        type: 'string',
        minLength: 1
      };

      await manager.cacheSchema('test_tool', schema);
      
      const cached = await manager.getCachedSchema('test_tool');
      expect(cached).toBeDefined();
      expect(cached!.jsonSchema).toEqual(schema);
      expect(cached!.zodSchema).toBeDefined();
    });

    it('should generate version hash for cached schemas', async () => {
      const schema: Schema = { type: 'string' };
      
      await manager.cacheSchema('test_tool', schema);
      
      const cached = await manager.getCachedSchema('test_tool');
      expect(cached!.version).toBeDefined();
      expect(typeof cached!.version).toBe('string');
      expect(cached!.version.length).toBeGreaterThan(0);
    });

    it('should handle cache size limits', async () => {
      // Cache 10 schemas to fill the cache (at limit)
      for (let i = 0; i < 10; i++) {
        const schema: Schema = { type: 'string', description: `Schema ${i}` };
        await manager.cacheSchema(`tool_${i}`, schema);
        vi.advanceTimersByTime(10); // Ensure different timestamps for eviction
      }

      // Cache should be at limit
      let stats = await manager.getCacheStats();
      expect(stats.size).toBe(10);

      // The 11th schema should trigger eviction
      const newSchema: Schema = { type: 'string', description: 'New Schema' };
      await manager.cacheSchema('new_tool', newSchema);

      stats = await manager.getCacheStats();
      // After eviction and addition, should maintain the limit
      expect(stats.size).toBe(10);
    });

    it('should evict oldest entry when cache is full', async () => {
      // Cache 10 schemas
      for (let i = 0; i < 10; i++) {
        const schema: Schema = { type: 'string', description: `Schema ${i}` };
        await manager.cacheSchema(`tool_${i}`, schema);
        vi.advanceTimersByTime(100); // Ensure different timestamps
      }

      // Add one more to trigger eviction
      const newSchema: Schema = { type: 'number' };
      await manager.cacheSchema('new_tool', newSchema);

      // First cached tool should be evicted
      const firstCached = await manager.getCachedSchema('tool_0');
      expect(firstCached).toBeUndefined();

      // New tool should be cached
      const newCached = await manager.getCachedSchema('new_tool');
      expect(newCached).toBeDefined();
    });

    it('should handle caching errors gracefully', async () => {
      const mockConverter = {
        jsonSchemaToZod: vi.fn().mockImplementation(() => {
          throw new Error('Conversion failed');
        })
      } as any;

      const managerWithBadConverter = new McpSchemaManager({ converter: mockConverter });
      
      await expect(managerWithBadConverter.cacheSchema('test_tool', { type: 'string' }))
        .rejects.toThrow('Schema caching failed');
    });
  });

  describe('cache TTL (Time-To-Live)', () => {
    it('should return valid cached schema within TTL', async () => {
      const schema: Schema = { type: 'string' };
      
      await manager.cacheSchema('test_tool', schema);
      
      // Advance time by 4 seconds (within 5 second TTL)
      vi.advanceTimersByTime(4000);
      
      const cached = await manager.getCachedSchema('test_tool');
      expect(cached).toBeDefined();
    });

    it('should expire cached schema after TTL', async () => {
      const schema: Schema = { type: 'string' };
      
      await manager.cacheSchema('test_tool', schema);
      
      // Advance time by 6 seconds (beyond 5 second TTL)
      vi.advanceTimersByTime(6000);
      
      const cached = await manager.getCachedSchema('test_tool');
      expect(cached).toBeUndefined();
    });

    it('should update cache statistics on TTL expiration', async () => {
      const schema: Schema = { type: 'string' };
      
      await manager.cacheSchema('test_tool', schema);
      
      let stats = await manager.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);

      // Valid cache hit
      await manager.getCachedSchema('test_tool');
      stats = await manager.getCacheStats();
      expect(stats.hits).toBe(1);

      // Expire and try again
      vi.advanceTimersByTime(6000);
      await manager.getCachedSchema('test_tool');
      
      stats = await manager.getCacheStats();
      expect(stats.size).toBe(0); // Expired entry removed
      expect(stats.misses).toBe(1); // Miss recorded
    });
  });

  describe('parameter validation', () => {
    it('should validate parameters using cached schema', async () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          count: { type: 'number' }
        },
        required: ['name']
      };

      await manager.cacheSchema('test_tool', schema);
      
      const result = await manager.validateToolParams('test_tool', {
        name: 'test',
        count: 5
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test', count: 5 });
    });

    it('should return error for validation against non-cached schema', async () => {
      const result = await manager.validateToolParams('nonexistent_tool', {});
      
      expect(result.success).toBe(false);
      expect(result.errors).toContain('No cached schema found for tool: nonexistent_tool');
    });

    it('should increment validation count on each validation', async () => {
      const schema: Schema = { type: 'string' };
      await manager.cacheSchema('test_tool', schema);
      
      const info = manager.getCacheInfo();
      const initialCount = info.stats.validationCount;
      
      await manager.validateToolParams('test_tool', 'test');
      await manager.validateToolParams('test_tool', 'test2');
      
      const finalInfo = manager.getCacheInfo();
      expect(finalInfo.stats.validationCount).toBe(initialCount + 2);
    });

    it('should validate schema directly without caching', async () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          message: { type: 'string' }
        }
      };

      const result = await manager.validateSchemaDirectly(schema, { message: 'hello' });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ message: 'hello' });
    });

    it('should handle direct validation errors', async () => {
      const mockConverter = {
        jsonSchemaToZod: vi.fn().mockImplementation(() => {
          throw new Error('Schema conversion failed');
        }),
        validateParams: vi.fn()
      } as any;

      const managerWithBadConverter = new McpSchemaManager({ converter: mockConverter });
      
      const result = await managerWithBadConverter.validateSchemaDirectly({ type: 'string' }, 'test');
      
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['Schema conversion failed']);
    });
  });

  describe('cache management', () => {
    it('should clear specific tool cache', async () => {
      const schema: Schema = { type: 'string' };
      
      await manager.cacheSchema('tool1', schema);
      await manager.cacheSchema('tool2', schema);
      
      await manager.clearCache('tool1');
      
      expect(await manager.getCachedSchema('tool1')).toBeUndefined();
      expect(await manager.getCachedSchema('tool2')).toBeDefined();
    });

    it('should clear entire cache', async () => {
      const schema: Schema = { type: 'string' };
      
      await manager.cacheSchema('tool1', schema);
      await manager.cacheSchema('tool2', schema);
      
      await manager.clearCache();
      
      const stats = await manager.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should provide accurate cache statistics', async () => {
      const schema: Schema = { type: 'string' };
      
      await manager.cacheSchema('tool1', schema);
      await manager.cacheSchema('tool2', schema);
      
      // Generate some hits and misses
      await manager.getCachedSchema('tool1'); // hit
      await manager.getCachedSchema('tool1'); // hit
      await manager.getCachedSchema('nonexistent'); // miss
      
      const stats = await manager.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('should provide detailed cache information', async () => {
      const schema1: Schema = { type: 'string' };
      const schema2: Schema = { type: 'number' };
      
      await manager.cacheSchema('tool1', schema1);
      vi.advanceTimersByTime(1000);
      await manager.cacheSchema('tool2', schema2);
      
      const info = manager.getCacheInfo();
      
      expect(info.entries).toHaveLength(2);
      expect(info.entries[0].toolName).toBe('tool1');
      expect(info.entries[1].toolName).toBe('tool2');
      expect(info.entries[1].age).toBeLessThan(info.entries[0].age);
      
      expect(info.stats.size).toBe(2);
      expect(info.stats.hitRate).toBe(0);
    });

    it('should calculate hit rate correctly', async () => {
      const schema: Schema = { type: 'string' };
      
      await manager.cacheSchema('test_tool', schema);
      
      // 2 hits, 1 miss
      await manager.getCachedSchema('test_tool');
      await manager.getCachedSchema('test_tool');
      await manager.getCachedSchema('nonexistent');
      
      const info = manager.getCacheInfo();
      expect(info.stats.hitRate).toBeCloseTo(2/3, 2);
    });
  });

  describe('memory management', () => {
    it('should respect maximum cache size', async () => {
      const smallManager = new McpSchemaManager({
        maxCacheSize: 3,
        cacheTtlMs: 60000
      });

      // Add 5 schemas
      for (let i = 0; i < 5; i++) {
        await smallManager.cacheSchema(`tool_${i}`, { type: 'string', description: `${i}` });
        vi.advanceTimersByTime(100);
      }

      const stats = await smallManager.getCacheStats();
      expect(stats.size).toBe(3);
    });

    it('should handle concurrent cache operations', async () => {
      const promises: Promise<void>[] = [];
      
      // Simulate concurrent caching
      for (let i = 0; i < 5; i++) {
        promises.push(manager.cacheSchema(`tool_${i}`, { type: 'string' }));
      }

      await Promise.all(promises);
      
      const stats = await manager.getCacheStats();
      expect(stats.size).toBe(5);
    });

    it('should maintain cache integrity during eviction', async () => {
      // Fill cache to limit
      for (let i = 0; i < 10; i++) {
        await manager.cacheSchema(`tool_${i}`, { type: 'string' });
        vi.advanceTimersByTime(10);
      }

      // Add one more to trigger eviction
      await manager.cacheSchema('new_tool', { type: 'number' });

      // Verify cache size is still within limit
      const stats = await manager.getCacheStats();
      expect(stats.size).toBe(10);

      // Verify newest entry is present
      const newest = await manager.getCachedSchema('new_tool');
      expect(newest).toBeDefined();
      expect(newest!.jsonSchema.type).toBe('number');
    });
  });

  describe('error handling', () => {
    it('should handle malformed JSON schemas', async () => {
      const malformedSchema = { invalidField: 'value' } as any;
      
      // Should not throw, but create a fallback schema
      await expect(manager.cacheSchema('test_tool', malformedSchema)).resolves.not.toThrow();
      
      const cached = await manager.getCachedSchema('test_tool');
      expect(cached).toBeDefined();
    });

    it('should handle validation errors gracefully', async () => {
      const schema: Schema = { type: 'string' };
      await manager.cacheSchema('test_tool', schema);
      
      const mockConverter = {
        validateParams: vi.fn().mockImplementation(() => {
          throw new Error('Validation error');
        })
      } as any;

      // Replace converter temporarily
      (manager as any).converter = mockConverter;
      
      const result = await manager.validateToolParams('test_tool', 'test');
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['Validation error']);
    });

    it('should handle empty cache operations', async () => {
      // Operations on empty cache should not throw
      expect(await manager.getCachedSchema('nonexistent')).toBeUndefined();
      await expect(manager.clearCache('nonexistent')).resolves.not.toThrow();
      
      const stats = await manager.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
    });
  });
});