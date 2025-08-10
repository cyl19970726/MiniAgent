/**
 * @fileoverview MCP Schema Manager - Runtime Validation and Caching
 * 
 * Implements schema caching and validation using Zod for MCP tool parameters.
 * This enables runtime type checking and performance optimization through
 * schema caching during tool discovery.
 */

import { z, ZodSchema, ZodTypeAny, ZodError } from 'zod';
import { Schema } from '@google/genai';
import { 
  IToolSchemaManager, 
  SchemaCache, 
  SchemaValidationResult, 
  SchemaConverter 
} from './interfaces.js';

/**
 * Default implementation of the schema converter
 */
export class DefaultSchemaConverter implements SchemaConverter {
  /**
   * Convert JSON Schema to Zod schema
   * This is a simplified implementation - in production you'd want a more complete converter
   */
  jsonSchemaToZod(jsonSchema: Schema): ZodTypeAny {
    try {
      return this.convertSchemaRecursive(jsonSchema);
    } catch (error) {
      console.warn('Failed to convert JSON Schema to Zod, falling back to z.any():', error);
      return z.any();
    }
  }

  /**
   * Convert Zod schema to JSON Schema (simplified implementation)
   */
  zodToJsonSchema(zodSchema: ZodTypeAny): Schema {
    // This is a placeholder - in practice you'd use a library like zod-to-json-schema
    return {
      type: 'object' as const,
      properties: {},
      additionalProperties: true
    };
  }

  /**
   * Validate parameters against schema
   */
  validateParams<T>(params: unknown, schema: ZodSchema<T>): SchemaValidationResult<T> {
    try {
      const result = schema.safeParse(params);
      
      if (result.success) {
        return {
          success: true,
          data: result.data
        };
      } else {
        return {
          success: false,
          errors: result.error.issues.map(issue => 
            `${issue.path.join('.')}: ${issue.message}`
          ),
          zodError: result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error']
      };
    }
  }

  private convertSchemaRecursive(schema: any): ZodTypeAny {
    if (!schema || typeof schema !== 'object') {
      return z.any();
    }

    // Handle different schema types
    switch (schema.type) {
      case 'string':
        let stringSchema = z.string();
        if (schema.minLength !== undefined) {
          stringSchema = stringSchema.min(schema.minLength);
        }
        if (schema.maxLength !== undefined) {
          stringSchema = stringSchema.max(schema.maxLength);
        }
        if (schema.pattern) {
          stringSchema = stringSchema.regex(new RegExp(schema.pattern));
        }
        if (schema.enum) {
          return z.enum(schema.enum);
        }
        return stringSchema;

      case 'number':
      case 'integer':
        let numberSchema = schema.type === 'integer' ? z.number().int() : z.number();
        if (schema.minimum !== undefined) {
          numberSchema = numberSchema.min(schema.minimum);
        }
        if (schema.maximum !== undefined) {
          numberSchema = numberSchema.max(schema.maximum);
        }
        return numberSchema;

      case 'boolean':
        return z.boolean();

      case 'array':
        const itemSchema = schema.items ? this.convertSchemaRecursive(schema.items) : z.any();
        let arraySchema = z.array(itemSchema);
        if (schema.minItems !== undefined) {
          arraySchema = arraySchema.min(schema.minItems);
        }
        if (schema.maxItems !== undefined) {
          arraySchema = arraySchema.max(schema.maxItems);
        }
        return arraySchema;

      case 'object':
        if (schema.properties) {
          const shape: Record<string, ZodTypeAny> = {};
          
          for (const [key, propSchema] of Object.entries(schema.properties || {})) {
            shape[key] = this.convertSchemaRecursive(propSchema);
          }

          let objectSchema = z.object(shape);

          // Handle required fields
          if (schema.required && Array.isArray(schema.required)) {
            // Make non-required fields optional
            for (const key of Object.keys(shape)) {
              if (!schema.required.includes(key)) {
                shape[key] = shape[key].optional();
              }
            }
            objectSchema = z.object(shape);
          } else {
            // Make all fields optional if no required array
            for (const key of Object.keys(shape)) {
              shape[key] = shape[key].optional();
            }
            objectSchema = z.object(shape);
          }

          // Handle additional properties
          if (schema.additionalProperties === false) {
            objectSchema = objectSchema.strict();
          }

          return objectSchema;
        }
        return z.record(z.any());

      case 'null':
        return z.null();

      default:
        // Handle union types (oneOf, anyOf, allOf)
        if (schema.oneOf) {
          const unionSchemas = schema.oneOf.map((s: any) => this.convertSchemaRecursive(s));
          return z.union(unionSchemas as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
        }
        
        if (schema.anyOf) {
          const unionSchemas = schema.anyOf.map((s: any) => this.convertSchemaRecursive(s));
          return z.union(unionSchemas as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
        }

        // Default to any for unsupported types
        return z.any();
    }
  }
}

/**
 * MCP Schema Manager with caching and validation capabilities
 */
export class McpSchemaManager implements IToolSchemaManager {
  private readonly cache = new Map<string, SchemaCache>();
  private readonly converter: SchemaConverter;
  private readonly maxCacheSize: number;
  private readonly cacheTtlMs: number;
  private stats = {
    hits: 0,
    misses: 0,
    validationCount: 0
  };

  constructor(
    options?: {
      converter?: SchemaConverter;
      maxCacheSize?: number;
      cacheTtlMs?: number; // Time-to-live for cached schemas
    }
  ) {
    this.converter = options?.converter || new DefaultSchemaConverter();
    this.maxCacheSize = options?.maxCacheSize || 1000;
    this.cacheTtlMs = options?.cacheTtlMs || 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Cache a tool schema with Zod conversion
   */
  async cacheSchema(toolName: string, schema: Schema): Promise<void> {
    try {
      // Convert JSON Schema to Zod schema
      const zodSchema = this.converter.jsonSchemaToZod(schema);
      
      // Create version hash (simplified - in practice use a proper hash function)
      const version = this.createSchemaVersion(schema);

      const cacheEntry: SchemaCache = {
        zodSchema,
        jsonSchema: schema,
        timestamp: Date.now(),
        version
      };

      // Check cache size limit
      if (this.cache.size >= this.maxCacheSize) {
        this.evictOldestEntry();
      }

      this.cache.set(toolName, cacheEntry);
      
    } catch (error) {
      console.warn(`Failed to cache schema for tool ${toolName}:`, error);
      throw new Error(`Schema caching failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get cached schema for a tool
   */
  async getCachedSchema(toolName: string): Promise<SchemaCache | undefined> {
    const cached = this.cache.get(toolName);
    
    if (!cached) {
      this.stats.misses++;
      return undefined;
    }

    // Check if cache entry is still valid
    if (Date.now() - cached.timestamp > this.cacheTtlMs) {
      this.cache.delete(toolName);
      this.stats.misses++;
      return undefined;
    }

    this.stats.hits++;
    return cached;
  }

  /**
   * Validate tool parameters using cached schema
   */
  async validateToolParams<T = unknown>(
    toolName: string, 
    params: unknown
  ): Promise<SchemaValidationResult<T>> {
    this.stats.validationCount++;
    
    const cached = await this.getCachedSchema(toolName);
    
    if (!cached) {
      return {
        success: false,
        errors: [`No cached schema found for tool: ${toolName}`]
      };
    }

    try {
      const result = this.converter.validateParams(params, cached.zodSchema as ZodSchema<T>);
      return result;
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Validation failed']
      };
    }
  }

  /**
   * Clear schema cache (optionally for specific tool)
   */
  async clearCache(toolName?: string): Promise<void> {
    if (toolName) {
      this.cache.delete(toolName);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{ size: number; hits: number; misses: number }> {
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses
    };
  }

  /**
   * Get detailed cache information for debugging
   */
  getCacheInfo(): {
    entries: Array<{
      toolName: string;
      version: string;
      timestamp: number;
      age: number;
    }>;
    stats: {
      size: number;
      hits: number;
      misses: number;
      hitRate: number;
      validationCount: number;
    };
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([toolName, entry]) => ({
      toolName,
      version: entry.version,
      timestamp: entry.timestamp,
      age: now - entry.timestamp
    }));

    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      entries,
      stats: {
        size: this.cache.size,
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate,
        validationCount: this.stats.validationCount
      }
    };
  }

  /**
   * Validate a schema without caching (for testing)
   */
  async validateSchemaDirectly<T = unknown>(
    schema: Schema,
    params: unknown
  ): Promise<SchemaValidationResult<T>> {
    try {
      const zodSchema = this.converter.jsonSchemaToZod(schema);
      return this.converter.validateParams(params, zodSchema as ZodSchema<T>);
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Schema validation failed']
      };
    }
  }

  // Private helper methods

  private createSchemaVersion(schema: Schema): string {
    // Simple version hash based on schema content
    // In production, use a proper hash function like crypto.createHash
    return JSON.stringify(schema).length.toString(36) + 
           Date.now().toString(36).slice(-4);
  }

  private evictOldestEntry(): void {
    let oldest: string | undefined;
    let oldestTime = Date.now();

    for (const [toolName, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldest = toolName;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }
}