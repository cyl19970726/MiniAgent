# MCP SDK Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing the complete MCP SDK architecture as designed in `complete-sdk-architecture.md`. The implementation follows a phased approach to ensure stability and testability.

## Implementation Phases

### Phase 1: Core SDK Integration Foundation
### Phase 2: Tool Integration & Schema Management  
### Phase 3: Advanced Features & Connection Management
### Phase 4: Integration & Testing

---

## Phase 1: Core SDK Integration Foundation

### Step 1.1: Create SDK Client Adapter

**File: `src/mcp/sdk/McpSdkClientAdapter.ts`**

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { 
  Implementation, 
  ClientCapabilities, 
  ServerCapabilities,
  ListToolsRequest,
  CallToolRequest,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

export interface McpSdkClientConfig {
  serverName: string;
  clientInfo: Implementation;
  capabilities?: ClientCapabilities;
  transport: McpSdkTransportConfig;
  timeouts?: {
    connection?: number;
    request?: number;
  };
}

export type McpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'disposed';

export interface McpConnectionStatus {
  state: McpConnectionState;
  serverName: string;
  connectedAt?: Date;
  lastActivity?: Date;
  serverCapabilities?: ServerCapabilities;
  serverVersion?: Implementation;
  errorCount: number;
  lastError?: Error;
}

export class McpSdkClientAdapter extends EventTarget {
  private client?: Client;
  private transport?: Transport;
  private connectionStatus: McpConnectionStatus;
  private disposed = false;

  constructor(private config: McpSdkClientConfig) {
    super();
    this.connectionStatus = {
      state: 'disconnected',
      serverName: config.serverName,
      errorCount: 0
    };
  }

  async connect(): Promise<void> {
    if (this.disposed) {
      throw new Error('Client has been disposed');
    }
    
    if (this.connectionStatus.state === 'connected') {
      return;
    }

    if (this.connectionStatus.state === 'connecting') {
      throw new Error('Connection already in progress');
    }

    this.updateConnectionState('connecting');
    
    try {
      // Create SDK client
      this.client = new Client(this.config.clientInfo, {
        capabilities: this.config.capabilities || {}
      });

      // Create transport
      this.transport = this.createTransport();
      this.setupEventHandlers();

      // Connect using SDK methods
      await this.client.connect(this.transport);

      // Update connection status
      this.connectionStatus = {
        ...this.connectionStatus,
        state: 'connected',
        connectedAt: new Date(),
        lastActivity: new Date(),
        serverCapabilities: this.client.getServerCapabilities(),
        serverVersion: this.client.getServerVersion(),
        errorCount: 0,
        lastError: undefined
      };

      this.dispatchEvent(new CustomEvent('connected', {
        detail: { serverName: this.config.serverName }
      }));

    } catch (error) {
      this.handleConnectionError(error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectionStatus.state === 'disconnected') {
      return;
    }

    try {
      if (this.client) {
        await this.client.close();
      }
      if (this.transport) {
        await this.transport.close();
      }
    } catch (error) {
      console.warn('Error during disconnect:', error);
    } finally {
      this.client = undefined;
      this.transport = undefined;
      this.updateConnectionState('disconnected');
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.disconnect();
  }

  isConnected(): boolean {
    return this.connectionStatus.state === 'connected';
  }

  getConnectionStatus(): McpConnectionStatus {
    return { ...this.connectionStatus };
  }

  async listTools(): Promise<Tool[]> {
    this.ensureConnected();
    
    try {
      const response = await this.client!.listTools({});
      this.connectionStatus.lastActivity = new Date();
      return response.tools;
    } catch (error) {
      this.handleOperationError(error, 'listTools');
      throw error;
    }
  }

  async callTool(name: string, args: any): Promise<any> {
    this.ensureConnected();

    try {
      const response = await this.client!.callTool({
        name,
        arguments: args
      });
      this.connectionStatus.lastActivity = new Date();
      return response;
    } catch (error) {
      this.handleOperationError(error, 'callTool');
      throw error;
    }
  }

  private createTransport(): Transport {
    return TransportFactory.create(this.config.transport);
  }

  private setupEventHandlers(): void {
    if (!this.transport) return;

    this.transport.onerror = (error: Error) => {
      this.handleConnectionError(error);
    };

    this.transport.onclose = () => {
      if (this.connectionStatus.state === 'connected') {
        this.updateConnectionState('disconnected');
        this.dispatchEvent(new CustomEvent('disconnected', {
          detail: { serverName: this.config.serverName, reason: 'Transport closed' }
        }));
      }
    };
  }

  private updateConnectionState(state: McpConnectionState): void {
    const previousState = this.connectionStatus.state;
    this.connectionStatus.state = state;
    
    if (state !== previousState) {
      this.dispatchEvent(new CustomEvent('stateChange', {
        detail: { serverName: this.config.serverName, from: previousState, to: state }
      }));
    }
  }

  private handleConnectionError(error: unknown): void {
    this.connectionStatus.errorCount++;
    this.connectionStatus.lastError = error instanceof Error ? error : new Error(String(error));
    this.updateConnectionState('error');
    
    this.dispatchEvent(new CustomEvent('error', {
      detail: { serverName: this.config.serverName, error: this.connectionStatus.lastError }
    }));
  }

  private handleOperationError(error: unknown, operation: string): void {
    this.connectionStatus.errorCount++;
    this.connectionStatus.lastError = error instanceof Error ? error : new Error(String(error));
    
    this.dispatchEvent(new CustomEvent('operationError', {
      detail: { 
        serverName: this.config.serverName, 
        operation, 
        error: this.connectionStatus.lastError 
      }
    }));
  }

  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new Error(`Client not connected (state: ${this.connectionStatus.state})`);
    }
  }
}
```

### Step 1.2: Create Transport Factory

**File: `src/mcp/sdk/TransportFactory.ts`**

```typescript
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface McpSdkTransportConfig {
  type: 'stdio' | 'sse' | 'websocket' | 'streamable-http';
  // Transport-specific options
  [key: string]: any;
}

export interface StdioTransportOptions {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface SSETransportOptions {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface WebSocketTransportOptions {
  type: 'websocket';
  url: string;
}

export interface StreamableHttpTransportOptions {
  type: 'streamable-http';
  url: string;
  headers?: Record<string, string>;
}

export type McpSdkTransportConfig = 
  | StdioTransportOptions
  | SSETransportOptions
  | WebSocketTransportOptions
  | StreamableHttpTransportOptions;

export class TransportFactory {
  static create(config: McpSdkTransportConfig): Transport {
    switch (config.type) {
      case 'stdio':
        return TransportFactory.createStdioTransport(config);
      case 'sse':
        return TransportFactory.createSSETransport(config);
      case 'websocket':
        return TransportFactory.createWebSocketTransport(config);
      case 'streamable-http':
        return TransportFactory.createStreamableHttpTransport(config);
      default:
        throw new Error(`Unsupported transport type: ${(config as any).type}`);
    }
  }

  private static createStdioTransport(config: StdioTransportOptions): StdioClientTransport {
    return new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: config.env,
      cwd: config.cwd
    });
  }

  private static createSSETransport(config: SSETransportOptions): SSEClientTransport {
    return new SSEClientTransport(new URL(config.url), {
      headers: config.headers
    });
  }

  private static createWebSocketTransport(config: WebSocketTransportOptions): WebSocketClientTransport {
    return new WebSocketClientTransport(new URL(config.url));
  }

  private static createStreamableHttpTransport(config: StreamableHttpTransportOptions): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(new URL(config.url), {
      headers: config.headers
    });
  }
}
```

### Step 1.3: Create Basic Error Types

**File: `src/mcp/sdk/McpSdkError.ts`**

```typescript
export enum McpErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  
  // MCP-specific error codes
  ConnectionError = -32001,
  TimeoutError = -32002,
  ToolNotFound = -32006,
}

export class McpSdkError extends Error {
  constructor(
    message: string,
    public readonly code: McpErrorCode,
    public readonly serverName: string,
    public readonly operation?: string,
    public readonly originalError?: unknown,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'McpSdkError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, McpSdkError);
    }
  }

  static fromError(
    error: unknown, 
    serverName: string, 
    operation?: string,
    context?: Record<string, unknown>
  ): McpSdkError {
    if (error instanceof McpSdkError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    
    // Try to determine error code from SDK errors
    let code = McpErrorCode.InternalError;
    if (message.includes('timeout')) {
      code = McpErrorCode.TimeoutError;
    } else if (message.includes('connection')) {
      code = McpErrorCode.ConnectionError;
    }

    return new McpSdkError(message, code, serverName, operation, error, context);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      serverName: this.serverName,
      operation: this.operation,
      context: this.context,
      stack: this.stack
    };
  }
}
```

---

## Phase 2: Tool Integration & Schema Management

### Step 2.1: Create Schema Management

**File: `src/mcp/sdk/SchemaManager.ts`**

```typescript
import { z, ZodSchema, ZodTypeAny } from 'zod';
import LRUCache from 'lru-cache';

export interface SchemaCache {
  jsonSchema: any;
  zodSchema: ZodTypeAny;
  hash: string;
  timestamp: number;
}

export class SchemaManager {
  private cache = new LRUCache<string, SchemaCache>({ max: 1000 });
  private hits = 0;
  private misses = 0;

  getCachedZodSchema(toolName: string, serverName: string, jsonSchema: any): ZodTypeAny {
    const cacheKey = `${serverName}:${toolName}`;
    const schemaHash = this.hashSchema(jsonSchema);
    
    const cached = this.cache.get(cacheKey);
    if (cached && cached.hash === schemaHash) {
      this.hits++;
      return cached.zodSchema;
    }

    this.misses++;
    const zodSchema = this.convertJsonSchemaToZod(jsonSchema);
    
    this.cache.set(cacheKey, {
      jsonSchema,
      zodSchema,
      hash: schemaHash,
      timestamp: Date.now()
    });

    return zodSchema;
  }

  validateParameters<T = any>(schema: ZodSchema<T>, params: unknown): { success: true; data: T } | { success: false; errors: string[] } {
    try {
      const data = schema.parse(params);
      return { success: true, data };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        };
      }
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Validation failed']
      };
    }
  }

  getCacheStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  private convertJsonSchemaToZod(jsonSchema: any): ZodTypeAny {
    if (!jsonSchema || typeof jsonSchema !== 'object') {
      return z.any();
    }

    switch (jsonSchema.type) {
      case 'object':
        return this.convertObjectSchema(jsonSchema);
      case 'array':
        return this.convertArraySchema(jsonSchema);
      case 'string':
        return z.string();
      case 'number':
        return z.number();
      case 'boolean':
        return z.boolean();
      case 'null':
        return z.null();
      default:
        return z.any();
    }
  }

  private convertObjectSchema(jsonSchema: any): ZodTypeAny {
    const shape: Record<string, ZodTypeAny> = {};
    
    if (jsonSchema.properties) {
      for (const [key, value] of Object.entries(jsonSchema.properties)) {
        let fieldSchema = this.convertJsonSchemaToZod(value);
        
        // Make field optional if not in required array
        if (!jsonSchema.required || !jsonSchema.required.includes(key)) {
          fieldSchema = fieldSchema.optional();
        }
        
        shape[key] = fieldSchema;
      }
    }

    return z.object(shape);
  }

  private convertArraySchema(jsonSchema: any): ZodTypeAny {
    const itemSchema = jsonSchema.items 
      ? this.convertJsonSchemaToZod(jsonSchema.items)
      : z.any();
      
    return z.array(itemSchema);
  }

  private hashSchema(schema: any): string {
    return JSON.stringify(schema);
  }
}
```

### Step 2.2: Create Tool Adapter

**File: `src/mcp/sdk/McpSdkToolAdapter.ts`**

```typescript
import { BaseTool } from '../../baseTool.js';
import { DefaultToolResult, ITool } from '../../interfaces.js';
import { Type, TSchema } from '@sinclair/typebox';
import { McpSdkClientAdapter } from './McpSdkClientAdapter.js';
import { SchemaManager } from './SchemaManager.js';
import { McpSdkError } from './McpSdkError.js';

export interface McpSdkToolMetadata {
  serverName: string;
  originalSchema?: any;
  toolCapabilities?: {
    streaming?: boolean;
    requiresConfirmation?: boolean;
    destructive?: boolean;
  };
}

export class McpSdkToolAdapter extends BaseTool implements ITool {
  private schemaManager = new SchemaManager();
  private zodSchema: any;

  constructor(
    private client: McpSdkClientAdapter,
    private toolDef: any, // Tool from SDK
    private serverName: string,
    private metadata: McpSdkToolMetadata = { serverName }
  ) {
    // Convert JSON Schema to TypeBox for BaseTool compatibility
    const typeBoxSchema = McpSdkToolAdapter.convertJsonSchemaToTypeBox(toolDef.inputSchema);
    
    super(
      toolDef.name,
      toolDef.name,
      toolDef.description || `MCP tool from ${serverName}`,
      typeBoxSchema,
      metadata.toolCapabilities?.requiresConfirmation || false
    );

    // Cache Zod schema for validation
    this.zodSchema = this.schemaManager.getCachedZodSchema(
      toolDef.name,
      serverName,
      toolDef.inputSchema
    );
  }

  async execute(
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: (output: string) => void
  ): Promise<DefaultToolResult> {
    try {
      // Validate parameters
      const validation = this.schemaManager.validateParameters(this.zodSchema, params);
      if (!validation.success) {
        return new DefaultToolResult({
          success: false,
          error: `Parameter validation failed: ${validation.errors.join(', ')}`
        });
      }

      // Ensure client is connected
      if (!this.client.isConnected()) {
        throw new McpSdkError(
          'Client not connected',
          McpSdkError.ConnectionError,
          this.serverName,
          'execute'
        );
      }

      onUpdate?.(`Executing ${this.name} on ${this.serverName}...`);

      // Call tool using SDK client
      const result = await this.client.callTool(this.name, validation.data);

      onUpdate?.('Tool execution completed');

      // Convert SDK result to MiniAgent format
      return this.convertSdkResult(result);

    } catch (error) {
      const mcpError = McpSdkError.fromError(error, this.serverName, 'execute', {
        toolName: this.name,
        params
      });

      onUpdate?.(`Tool execution failed: ${mcpError.message}`);

      return new DefaultToolResult({
        success: false,
        error: `Tool execution failed: ${mcpError.message}`,
        data: { mcpError: mcpError.toJSON() }
      });
    }
  }

  getMcpMetadata(): McpSdkToolMetadata {
    return this.metadata;
  }

  getSchemaManager(): SchemaManager {
    return this.schemaManager;
  }

  private convertSdkResult(sdkResult: any): DefaultToolResult {
    // Extract content from SDK result format
    if (sdkResult.content && Array.isArray(sdkResult.content)) {
      const textContent = sdkResult.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n');

      const hasError = sdkResult.isError || false;

      return new DefaultToolResult({
        success: !hasError,
        data: {
          content: textContent,
          fullResponse: sdkResult,
          serverName: this.serverName,
          toolName: this.name
        },
        error: hasError ? textContent : undefined
      });
    }

    // Fallback for non-standard result format
    return new DefaultToolResult({
      success: true,
      data: {
        fullResponse: sdkResult,
        serverName: this.serverName,
        toolName: this.name
      }
    });
  }

  private static convertJsonSchemaToTypeBox(jsonSchema: any): TSchema {
    if (!jsonSchema || typeof jsonSchema !== 'object') {
      return Type.Any();
    }

    switch (jsonSchema.type) {
      case 'object':
        const properties: Record<string, TSchema> = {};
        if (jsonSchema.properties) {
          for (const [key, value] of Object.entries(jsonSchema.properties)) {
            properties[key] = McpSdkToolAdapter.convertJsonSchemaToTypeBox(value);
          }
        }
        return Type.Object(properties);

      case 'array':
        return Type.Array(
          jsonSchema.items 
            ? McpSdkToolAdapter.convertJsonSchemaToTypeBox(jsonSchema.items)
            : Type.Any()
        );

      case 'string':
        return Type.String();
      case 'number':
        return Type.Number();
      case 'boolean':
        return Type.Boolean();
      case 'null':
        return Type.Null();
      default:
        return Type.Any();
    }
  }
}
```

### Step 2.3: Create Tool Factory Functions

**File: `src/mcp/sdk/ToolAdapterFactory.ts`**

```typescript
import { McpSdkClientAdapter } from './McpSdkClientAdapter.js';
import { McpSdkToolAdapter } from './McpSdkToolAdapter.js';
import { McpSdkError } from './McpSdkError.js';

export interface CreateToolAdaptersOptions {
  cacheSchemas?: boolean;
  toolFilter?: (tool: any) => boolean;
  enableDynamicTyping?: boolean;
}

export async function createMcpSdkToolAdapters(
  client: McpSdkClientAdapter,
  serverName: string,
  options: CreateToolAdaptersOptions = {}
): Promise<McpSdkToolAdapter[]> {
  try {
    const tools = await client.listTools();
    
    const filteredTools = options.toolFilter 
      ? tools.filter(options.toolFilter)
      : tools;

    return filteredTools.map(tool => 
      new McpSdkToolAdapter(client, tool, serverName, {
        serverName,
        originalSchema: tool.inputSchema,
        toolCapabilities: {
          streaming: false, // SDK doesn't expose this directly
          requiresConfirmation: false, // Could be inferred from tool name/description
          destructive: tool.name.includes('delete') || tool.name.includes('remove')
        }
      })
    );

  } catch (error) {
    throw McpSdkError.fromError(error, serverName, 'createToolAdapters');
  }
}

export async function createTypedMcpSdkToolAdapter(
  client: McpSdkClientAdapter,
  toolName: string,
  serverName: string
): Promise<McpSdkToolAdapter | null> {
  try {
    const tools = await client.listTools();
    const tool = tools.find(t => t.name === toolName);

    if (!tool) {
      return null;
    }

    return new McpSdkToolAdapter(client, tool, serverName, {
      serverName,
      originalSchema: tool.inputSchema
    });

  } catch (error) {
    throw McpSdkError.fromError(error, serverName, 'createTypedToolAdapter');
  }
}
```

---

## Phase 3: Advanced Features & Connection Management

### Step 3.1: Create Connection Manager

**File: `src/mcp/sdk/McpSdkConnectionManager.ts`**

```typescript
import { McpSdkClientAdapter, McpSdkClientConfig } from './McpSdkClientAdapter.js';
import { McpSdkError } from './McpSdkError.js';

export interface McpServerConfig extends McpSdkClientConfig {
  autoConnect?: boolean;
  healthCheckInterval?: number;
  retry?: {
    maxAttempts: number;
    delayMs: number;
    maxDelayMs: number;
  };
}

export interface McpServerStatus {
  name: string;
  state: string;
  lastConnected?: Date;
  lastError?: string;
  toolCount?: number;
  serverCapabilities?: any;
}

export type McpServerStatusHandler = (status: McpServerStatus) => void;

export class McpSdkConnectionManager extends EventTarget {
  private clients = new Map<string, McpSdkClientAdapter>();
  private configs = new Map<string, McpServerConfig>();
  private statusHandlers = new Set<McpServerStatusHandler>();
  private healthCheckTimers = new Map<string, NodeJS.Timeout>();
  private disposed = false;

  async addServer(config: McpServerConfig): Promise<void> {
    if (this.disposed) {
      throw new Error('Connection manager disposed');
    }

    const { serverName } = config;
    
    if (this.configs.has(serverName)) {
      throw new Error(`Server ${serverName} already exists`);
    }

    this.configs.set(serverName, config);

    if (config.autoConnect) {
      await this.connectServer(serverName);
    }

    if (config.healthCheckInterval && config.healthCheckInterval > 0) {
      this.startHealthCheck(serverName, config.healthCheckInterval);
    }
  }

  async removeServer(serverName: string): Promise<void> {
    await this.disconnectServer(serverName);
    this.configs.delete(serverName);
    
    const timer = this.healthCheckTimers.get(serverName);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(serverName);
    }
  }

  async connectServer(serverName: string): Promise<void> {
    const config = this.configs.get(serverName);
    if (!config) {
      throw new Error(`Server ${serverName} not found`);
    }

    let client = this.clients.get(serverName);
    if (!client) {
      client = new McpSdkClientAdapter(config);
      this.setupClientEventHandlers(client, serverName);
      this.clients.set(serverName, client);
    }

    if (!client.isConnected()) {
      await this.connectWithRetry(client, config);
    }
  }

  async disconnectServer(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverName);
    }
  }

  getClient(serverName: string): McpSdkClientAdapter | undefined {
    return this.clients.get(serverName);
  }

  getServerStatus(serverName: string): McpServerStatus | undefined {
    const client = this.clients.get(serverName);
    if (!client) {
      return undefined;
    }

    const status = client.getConnectionStatus();
    return {
      name: serverName,
      state: status.state,
      lastConnected: status.connectedAt,
      lastError: status.lastError?.message,
      toolCount: undefined, // Would need to cache this
      serverCapabilities: status.serverCapabilities
    };
  }

  getAllServerStatuses(): Map<string, McpServerStatus> {
    const statuses = new Map<string, McpServerStatus>();
    
    for (const serverName of this.configs.keys()) {
      const status = this.getServerStatus(serverName);
      if (status) {
        statuses.set(serverName, status);
      }
    }

    return statuses;
  }

  async discoverTools(): Promise<Array<{ serverName: string; tool: any }>> {
    const allTools: Array<{ serverName: string; tool: any }> = [];

    for (const [serverName, client] of this.clients) {
      if (client.isConnected()) {
        try {
          const tools = await client.listTools();
          for (const tool of tools) {
            allTools.push({ serverName, tool });
          }
        } catch (error) {
          console.warn(`Failed to list tools from ${serverName}:`, error);
        }
      }
    }

    return allTools;
  }

  async refreshServer(serverName: string): Promise<void> {
    await this.disconnectServer(serverName);
    await this.connectServer(serverName);
  }

  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    const checks = Array.from(this.clients.entries()).map(async ([serverName, client]) => {
      try {
        if (client.isConnected()) {
          // Use listTools as a health check
          await client.listTools();
          results.set(serverName, true);
        } else {
          results.set(serverName, false);
        }
      } catch (error) {
        results.set(serverName, false);
      }
    });

    await Promise.allSettled(checks);
    return results;
  }

  onServerStatusChange(handler: McpServerStatusHandler): void {
    this.statusHandlers.add(handler);
  }

  async cleanup(): Promise<void> {
    this.disposed = true;

    // Clear all health check timers
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }
    this.healthCheckTimers.clear();

    // Disconnect all clients
    const disconnectPromises = Array.from(this.clients.values()).map(client => 
      client.dispose()
    );
    await Promise.allSettled(disconnectPromises);

    this.clients.clear();
    this.configs.clear();
    this.statusHandlers.clear();
  }

  private async connectWithRetry(client: McpSdkClientAdapter, config: McpServerConfig): Promise<void> {
    const retry = config.retry || { maxAttempts: 3, delayMs: 1000, maxDelayMs: 10000 };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      try {
        await client.connect();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < retry.maxAttempts) {
          const delay = Math.min(retry.delayMs * Math.pow(2, attempt - 1), retry.maxDelayMs);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Connection failed after retries');
  }

  private setupClientEventHandlers(client: McpSdkClientAdapter, serverName: string): void {
    client.addEventListener('connected', () => {
      this.notifyStatusChange(serverName);
    });

    client.addEventListener('disconnected', () => {
      this.notifyStatusChange(serverName);
    });

    client.addEventListener('error', (event: any) => {
      this.notifyStatusChange(serverName);
      
      this.dispatchEvent(new CustomEvent('serverError', {
        detail: { serverName, error: event.detail.error }
      }));
    });
  }

  private startHealthCheck(serverName: string, intervalMs: number): void {
    const timer = setInterval(async () => {
      const client = this.clients.get(serverName);
      if (client && client.isConnected()) {
        try {
          await client.listTools();
        } catch (error) {
          this.dispatchEvent(new CustomEvent('healthCheckFailed', {
            detail: { serverName, error }
          }));
        }
      }
    }, intervalMs);

    this.healthCheckTimers.set(serverName, timer);
  }

  private notifyStatusChange(serverName: string): void {
    const status = this.getServerStatus(serverName);
    if (status) {
      for (const handler of this.statusHandlers) {
        try {
          handler(status);
        } catch (error) {
          console.error('Error in status handler:', error);
        }
      }
    }
  }
}
```

### Step 3.2: Create Integration Helpers

**File: `src/mcp/sdk/integrationHelpers.ts`**

```typescript
import { IToolScheduler } from '../../interfaces.js';
import { McpSdkClientAdapter } from './McpSdkClientAdapter.js';
import { createMcpSdkToolAdapters, CreateToolAdaptersOptions } from './ToolAdapterFactory.js';

export interface RegisterMcpToolsOptions extends CreateToolAdaptersOptions {
  prefix?: string; // Add prefix to tool names to avoid conflicts
  category?: string; // Category for tool organization
}

export async function registerMcpToolsWithScheduler(
  scheduler: IToolScheduler,
  client: McpSdkClientAdapter,
  serverName: string,
  options: RegisterMcpToolsOptions = {}
): Promise<void> {
  const adapters = await createMcpSdkToolAdapters(client, serverName, options);

  for (const adapter of adapters) {
    const toolName = options.prefix ? `${options.prefix}${adapter.name}` : adapter.name;
    
    // Register with scheduler using the appropriate method
    // This depends on the IToolScheduler interface
    await scheduler.addTool(toolName, adapter);
  }
}

export function createMcpClientFromConfig(config: any): McpSdkClientAdapter {
  // Convert legacy config format to SDK format if needed
  const sdkConfig = convertLegacyConfig(config);
  return new McpSdkClientAdapter(sdkConfig);
}

function convertLegacyConfig(config: any): any {
  // Handle backwards compatibility with existing MCP configurations
  return {
    serverName: config.serverName || config.name,
    clientInfo: config.clientInfo || {
      name: 'miniagent-mcp',
      version: '1.0.0'
    },
    transport: config.transport,
    capabilities: config.capabilities,
    timeouts: config.timeouts
  };
}
```

---

## Phase 4: Integration & Testing

### Step 4.1: Create Main Export File

**File: `src/mcp/sdk/index.ts`**

```typescript
// Core classes
export { McpSdkClientAdapter } from './McpSdkClientAdapter.js';
export { McpSdkToolAdapter } from './McpSdkToolAdapter.js';
export { McpSdkConnectionManager } from './McpSdkConnectionManager.js';

// Factory functions
export { 
  createMcpSdkToolAdapters, 
  createTypedMcpSdkToolAdapter,
  type CreateToolAdaptersOptions 
} from './ToolAdapterFactory.js';

// Transport factory
export { TransportFactory, type McpSdkTransportConfig } from './TransportFactory.js';

// Schema management
export { SchemaManager } from './SchemaManager.js';

// Error handling
export { McpSdkError, McpErrorCode } from './McpSdkError.js';

// Integration helpers
export { 
  registerMcpToolsWithScheduler, 
  createMcpClientFromConfig,
  type RegisterMcpToolsOptions 
} from './integrationHelpers.js';

// Type exports
export type {
  McpSdkClientConfig,
  McpConnectionState,
  McpConnectionStatus
} from './McpSdkClientAdapter.js';

export type {
  McpServerConfig,
  McpServerStatus,
  McpServerStatusHandler
} from './McpSdkConnectionManager.js';

export type { McpSdkToolMetadata } from './McpSdkToolAdapter.js';

// Re-export useful SDK types
export type {
  Implementation,
  ClientCapabilities,
  ServerCapabilities,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
```

### Step 4.2: Update Main MCP Index

**File: `src/mcp/index.ts`**

```typescript
// Legacy exports (for backwards compatibility)
export * from './interfaces.js';
export * from './mcpClient.js';
export * from './mcpConnectionManager.js';
export * from './mcpToolAdapter.js';

// New SDK exports
export * from './sdk/index.js';

// Export factory function for easy migration
export { createMcpClientFromConfig as createMcpClient } from './sdk/index.js';
```

### Step 4.3: Create Basic Tests

**File: `src/mcp/sdk/__tests__/McpSdkClientAdapter.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpSdkClientAdapter } from '../McpSdkClientAdapter.js';
import { TransportFactory } from '../TransportFactory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Mock the SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js');
vi.mock('../TransportFactory.js');

describe('McpSdkClientAdapter', () => {
  let adapter: McpSdkClientAdapter;
  let mockClient: any;
  let mockTransport: any;

  beforeEach(() => {
    mockClient = {
      connect: vi.fn(),
      close: vi.fn(),
      listTools: vi.fn(),
      callTool: vi.fn(),
      getServerCapabilities: vi.fn(),
      getServerVersion: vi.fn()
    };

    mockTransport = {
      start: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
      onerror: undefined,
      onclose: undefined,
      onmessage: undefined
    };

    (Client as any).mockImplementation(() => mockClient);
    (TransportFactory.create as any).mockReturnValue(mockTransport);

    adapter = new McpSdkClientAdapter({
      serverName: 'test-server',
      clientInfo: { name: 'test', version: '1.0.0' },
      transport: { type: 'stdio', command: 'test' }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should connect using SDK client', async () => {
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.getServerCapabilities.mockReturnValue({ tools: {} });
    mockClient.getServerVersion.mockReturnValue({ name: 'test', version: '1.0.0' });

    await adapter.connect();

    expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);
    expect(adapter.isConnected()).toBe(true);
  });

  it('should handle connection errors', async () => {
    const error = new Error('Connection failed');
    mockClient.connect.mockRejectedValue(error);

    await expect(adapter.connect()).rejects.toThrow('Connection failed');
    expect(adapter.getConnectionStatus().state).toBe('error');
  });

  it('should list tools through SDK', async () => {
    const tools = [
      { name: 'tool1', description: 'Test tool 1', inputSchema: {} },
      { name: 'tool2', description: 'Test tool 2', inputSchema: {} }
    ];

    // First connect
    mockClient.connect.mockResolvedValue(undefined);
    await adapter.connect();

    // Then list tools
    mockClient.listTools.mockResolvedValue({ tools });

    const result = await adapter.listTools();
    expect(result).toEqual(tools);
    expect(mockClient.listTools).toHaveBeenCalledWith({});
  });

  it('should call tools through SDK', async () => {
    const toolResult = {
      content: [{ type: 'text', text: 'Tool result' }]
    };

    // Connect first
    mockClient.connect.mockResolvedValue(undefined);
    await adapter.connect();

    // Call tool
    mockClient.callTool.mockResolvedValue(toolResult);

    const result = await adapter.callTool('test-tool', { param: 'value' });
    
    expect(mockClient.callTool).toHaveBeenCalledWith({
      name: 'test-tool',
      arguments: { param: 'value' }
    });
    expect(result).toEqual(toolResult);
  });
});
```

### Step 4.4: Create Integration Test

**File: `src/mcp/sdk/__tests__/integration.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpSdkClientAdapter } from '../McpSdkClientAdapter.js';
import { McpSdkConnectionManager } from '../McpSdkConnectionManager.js';
import { createMcpSdkToolAdapters } from '../ToolAdapterFactory.js';

describe('MCP SDK Integration', () => {
  let connectionManager: McpSdkConnectionManager;

  beforeAll(() => {
    connectionManager = new McpSdkConnectionManager();
  });

  afterAll(async () => {
    await connectionManager.cleanup();
  });

  it('should complete full integration flow', async () => {
    // This would require a mock MCP server
    // For now, just test the basic flow without actual connection

    const config = {
      serverName: 'test-server',
      clientInfo: { name: 'test', version: '1.0.0' },
      transport: { type: 'stdio' as const, command: 'echo' },
      autoConnect: false
    };

    // Add server to manager
    await connectionManager.addServer(config);

    // Get client
    const client = connectionManager.getClient('test-server');
    expect(client).toBeInstanceOf(McpSdkClientAdapter);

    // Check initial status
    const status = connectionManager.getServerStatus('test-server');
    expect(status?.name).toBe('test-server');
  });
});
```

---

## Implementation Checklist

### Phase 1: Core SDK Integration ✅
- [ ] **McpSdkClientAdapter**: Basic wrapper around SDK Client
- [ ] **TransportFactory**: Factory for SDK transport instances  
- [ ] **McpSdkError**: Enhanced error handling for SDK errors
- [ ] **Basic connection management**: Connect, disconnect, state tracking
- [ ] **Event handling**: Wire up SDK transport events

### Phase 2: Tool Integration ✅
- [ ] **SchemaManager**: JSON Schema to Zod conversion and caching
- [ ] **McpSdkToolAdapter**: Bridge to MiniAgent BaseTool interface
- [ ] **Parameter validation**: Runtime validation with Zod
- [ ] **Result transformation**: SDK results to MiniAgent format
- [ ] **ToolAdapterFactory**: Factory functions for tool creation

### Phase 3: Advanced Features ✅
- [ ] **McpSdkConnectionManager**: Multi-server connection management
- [ ] **Health checking**: Periodic connection health monitoring  
- [ ] **Reconnection logic**: Automatic reconnection with exponential backoff
- [ ] **Integration helpers**: Helper functions for MiniAgent integration
- [ ] **Performance optimization**: Connection pooling, schema caching

### Phase 4: Integration & Testing ✅
- [ ] **Main exports**: Clean public API surface
- [ ] **Backwards compatibility**: Maintain existing interface contracts
- [ ] **Unit tests**: Test individual components
- [ ] **Integration tests**: Test full workflow
- [ ] **Documentation**: Update documentation and examples

---

## Next Steps

1. **Implement Phase 1** components first, focusing on basic SDK integration
2. **Test each phase** thoroughly before moving to the next
3. **Create mock servers** for testing without external dependencies  
4. **Add comprehensive error handling** throughout the implementation
5. **Optimize performance** with caching and connection pooling
6. **Update existing examples** to use the new SDK-based implementation
7. **Create migration guide** for users upgrading from legacy implementation

This implementation guide provides a complete blueprint for building the MCP SDK integration as designed in the architecture document. The phased approach ensures stability and allows for iterative testing and refinement.