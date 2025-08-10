/**
 * @fileoverview MCP (Model Context Protocol) Integration Interfaces - Refined Architecture
 * 
 * This module defines the refined interfaces for integrating MCP servers and tools
 * into the MiniAgent framework. The architecture has been updated based on official
 * SDK insights to support modern patterns and flexible tool parameter typing.
 * 
 * Key Updates:
 * - Streamable HTTP transport (replaces SSE)
 * - Generic tool parameters with runtime validation (Zod)
 * - Schema caching mechanism for tool discovery
 * - Flexible typing with delayed type resolution
 * - Maintained MiniAgent's minimal philosophy
 * 
 * Design Principles:
 * - Type safety with flexible generic parameters
 * - Clean separation between MCP protocol and MiniAgent interfaces
 * - Support for Streamable HTTP and STDIO transport methods
 * - Runtime validation using Zod schemas
 * - Schema caching for performance optimization
 * - Optional integration that doesn't affect existing functionality
 */

import { z, ZodSchema, ZodTypeAny } from 'zod';
import { Schema } from '@google/genai';
import { IToolResult } from '../interfaces.js';

// ============================================================================
// MCP PROTOCOL TYPES
// ============================================================================

/**
 * MCP protocol version supported
 */
export const MCP_VERSION = '2024-11-05';

/**
 * MCP JSON-RPC request message
 */
export interface McpRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

/**
 * MCP JSON-RPC response message
 */
export interface McpResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: McpError;
}

/**
 * MCP JSON-RPC notification message
 */
export interface McpNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

/**
 * MCP error object
 */
export interface McpError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP error codes following JSON-RPC 2.0 specification
 */
export enum McpErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  
  // MCP-specific error codes
  ServerError = -32000,
  ConnectionError = -32001,
  TimeoutError = -32002,
  AuthenticationError = -32003,
  AuthorizationError = -32004,
  ResourceNotFound = -32005,
  ToolNotFound = -32006,
}

// ============================================================================
// MCP CAPABILITY TYPES
// ============================================================================

/**
 * MCP server capabilities
 */
export interface McpServerCapabilities {
  /** Server supports tool execution */
  tools?: {
    listChanged?: boolean;
  };
  /** Server supports resource access */
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  /** Server supports prompt templates */
  prompts?: {
    listChanged?: boolean;
  };
  /** Server supports logging */
  logging?: Record<string, unknown>;
  /** Experimental capabilities */
  experimental?: Record<string, unknown>;
}

/**
 * MCP client capabilities
 */
export interface McpClientCapabilities {
  /** Client can receive notifications */
  notifications?: {
    tools?: {
      listChanged?: boolean;
    };
    resources?: {
      subscribe?: boolean;
      listChanged?: boolean;
    };
    prompts?: {
      listChanged?: boolean;
    };
  };
  /** Experimental capabilities */
  experimental?: Record<string, unknown>;
}

// ============================================================================
// MCP TOOL TYPES
// ============================================================================

/**
 * MCP tool definition with generic parameter support
 */
export interface McpTool<T = unknown> {
  /** Tool name (unique within server) */
  name: string;
  /** Optional display name for UI */
  displayName?: string;
  /** Tool description */
  description: string;
  /** JSON Schema for tool parameters */
  inputSchema: Schema;
  /** Zod schema for runtime validation (cached during discovery) */
  zodSchema?: ZodSchema<T>;
  /** Tool capability metadata */
  capabilities?: {
    /** Tool supports streaming output */
    streaming?: boolean;
    /** Tool requires confirmation */
    requiresConfirmation?: boolean;
    /** Tool is potentially destructive */
    destructive?: boolean;
  };
}

/**
 * MCP tool call request with generic parameters
 */
export interface McpToolCall<T = unknown> {
  /** Tool name to execute */
  name: string;
  /** Tool arguments with flexible typing */
  arguments?: T;
}

/**
 * MCP content block
 */
export interface McpContent {
  /** Content type */
  type: 'text' | 'image' | 'resource';
  /** Text content (for type: 'text') */
  text?: string;
  /** Image data (for type: 'image') */
  data?: string;
  mimeType?: string;
  /** Resource reference (for type: 'resource') */
  resource?: {
    uri: string;
    mimeType?: string;
    text?: string;
  };
}

/**
 * MCP tool call result
 */
export interface McpToolResult {
  /** Result content blocks */
  content: McpContent[];
  /** Whether this is an error result */
  isError?: boolean;
  /** Server that executed the tool (for MiniAgent integration) */
  serverName?: string;
  /** Tool that was executed (for MiniAgent integration) */
  toolName?: string;
  /** Execution time in milliseconds (for MiniAgent integration) */
  executionTime?: number;
}

/**
 * MCP tool result for MiniAgent integration
 */
export interface McpToolResultData {
  /** Original MCP result */
  mcpResult: McpToolResult;
  /** Server that executed the tool */
  serverName: string;
  /** Tool that was executed */
  toolName: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Additional metadata */
  metadata?: {
    requestId: string;
    timestamp: number;
  };
}

/**
 * MCP tool result wrapper for MiniAgent
 */
export class McpToolResultWrapper implements IToolResult {
  constructor(private data: McpToolResultData) {}

  toHistoryStr(): string {
    // Convert MCP content to string format for chat history
    const contentStr = this.data.mcpResult.content
      .map(content => {
        switch (content.type) {
          case 'text':
            return content.text || '';
          case 'resource':
            return content.resource?.text || `[Resource: ${content.resource?.uri}]`;
          case 'image':
            return `[Image: ${content.mimeType || 'unknown'}]`;
          default:
            return '[Unknown content type]';
        }
      })
      .join('\n');

    if (this.data.mcpResult.isError) {
      return `Error from ${this.data.serverName}.${this.data.toolName}: ${contentStr}`;
    }

    return contentStr;
  }

  /**
   * Get the underlying MCP result data
   */
  getMcpData(): McpToolResultData {
    return this.data;
  }

  /**
   * Get formatted result for display
   */
  getDisplayContent(): string {
    return this.toHistoryStr();
  }
}

// ============================================================================
// MCP RESOURCE TYPES (Future capability)
// ============================================================================

/**
 * MCP resource definition
 */
export interface McpResource {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name: string;
  /** Resource description */
  description?: string;
  /** Resource MIME type */
  mimeType?: string;
}

/**
 * MCP resource content
 */
export interface McpResourceContent {
  /** Resource URI */
  uri: string;
  /** Resource MIME type */
  mimeType?: string;
  /** Resource text content */
  text?: string;
  /** Resource blob content */
  blob?: string;
}

// ============================================================================
// TRANSPORT INTERFACES
// ============================================================================

/**
 * Base transport interface for MCP communication
 */
export interface IMcpTransport {
  /** Connect to the MCP server */
  connect(): Promise<void>;
  
  /** Disconnect from the MCP server */
  disconnect(): Promise<void>;
  
  /** Send a message to the server */
  send(message: McpRequest | McpNotification): Promise<void>;
  
  /** Register message handler */
  onMessage(handler: (message: McpResponse | McpNotification) => void): void;
  
  /** Register error handler */
  onError(handler: (error: Error) => void): void;
  
  /** Register disconnect handler */
  onDisconnect(handler: () => void): void;
  
  /** Check if transport is connected */
  isConnected(): boolean;
}

/**
 * STDIO transport configuration
 */
export interface McpStdioTransportConfig {
  type: 'stdio';
  /** Command to execute for the MCP server */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
}

/**
 * Streamable HTTP transport configuration (replaces deprecated SSE)
 * Uses HTTP POST for requests with optional streaming responses
 */
export interface McpStreamableHttpTransportConfig {
  type: 'streamable-http';
  /** Server URL for JSON-RPC endpoint */
  url: string;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** Authentication configuration */
  auth?: McpAuthConfig;
  /** Whether to use streaming for responses */
  streaming?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Connection keep-alive */
  keepAlive?: boolean;
}

/**
 * Legacy HTTP transport configuration (deprecated)
 * @deprecated Use McpStreamableHttpTransportConfig instead
 */
export interface McpHttpTransportConfig {
  type: 'http';
  /** Server URL */
  url: string;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** Authentication configuration */
  auth?: McpAuthConfig;
}

/**
 * Authentication configuration
 */
export interface McpAuthConfig {
  type: 'bearer' | 'basic' | 'oauth2';
  /** Bearer token (for type: 'bearer') */
  token?: string;
  /** Username (for type: 'basic') */
  username?: string;
  /** Password (for type: 'basic') */
  password?: string;
  /** OAuth2 configuration (for type: 'oauth2') */
  oauth2?: {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
    scope?: string;
  };
}

/**
 * Transport configuration union type
 */
export type McpTransportConfig = McpStdioTransportConfig | McpStreamableHttpTransportConfig | McpHttpTransportConfig;

// ============================================================================
// SCHEMA CACHING AND VALIDATION
// ============================================================================

/**
 * Schema cache entry for tool discovery optimization
 */
export interface SchemaCache {
  /** Cached Zod schema for validation */
  zodSchema: ZodTypeAny;
  /** Original JSON schema */
  jsonSchema: Schema;
  /** Cache timestamp */
  timestamp: number;
  /** Schema version/hash for cache invalidation */
  version: string;
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult<T = unknown> {
  /** Whether validation succeeded */
  success: boolean;
  /** Parsed and validated data (if success) */
  data?: T;
  /** Validation errors (if failed) */
  errors?: string[];
  /** Raw error details from Zod */
  zodError?: z.ZodError;
}

/**
 * Schema conversion utilities
 */
export interface SchemaConverter {
  /** Convert JSON Schema to Zod schema */
  jsonSchemaToZod(jsonSchema: Schema): ZodTypeAny;
  /** Convert Zod schema to JSON Schema */
  zodToJsonSchema(zodSchema: ZodTypeAny): Schema;
  /** Validate parameters against schema */
  validateParams<T>(params: unknown, schema: ZodSchema<T>): SchemaValidationResult<T>;
}

/**
 * Tool schema manager for caching and validation
 */
export interface IToolSchemaManager {
  /** Cache a tool schema */
  cacheSchema(toolName: string, schema: Schema): Promise<void>;
  /** Get cached schema */
  getCachedSchema(toolName: string): Promise<SchemaCache | undefined>;
  /** Validate tool parameters */
  validateToolParams<T = unknown>(toolName: string, params: unknown): Promise<SchemaValidationResult<T>>;
  /** Clear schema cache */
  clearCache(toolName?: string): Promise<void>;
  /** Get cache statistics */
  getCacheStats(): Promise<{ size: number; hits: number; misses: number }>;
}

// ============================================================================
// MCP CLIENT INTERFACES
// ============================================================================

/**
 * MCP client configuration
 */
export interface McpClientConfig {
  /** Server name (unique identifier) */
  serverName: string;
  /** Transport configuration */
  transport: McpTransportConfig;
  /** Client capabilities */
  capabilities?: McpClientCapabilities;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Request timeout in milliseconds */
  requestTimeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * MCP client interface
 */
export interface IMcpClient {
  /** Initialize the client with configuration */
  initialize(config: McpClientConfig): Promise<void>;
  
  /** Connect to the MCP server */
  connect(): Promise<void>;
  
  /** Disconnect from the MCP server */
  disconnect(): Promise<void>;
  
  /** Check if client is connected */
  isConnected(): boolean;
  
  /** Get server information */
  getServerInfo(): Promise<{
    name: string;
    version: string;
    capabilities: McpServerCapabilities;
  }>;
  
  /** List available tools */
  listTools<T = unknown>(cacheSchemas?: boolean): Promise<McpTool<T>[]>;
  
  /** Call a tool */
  callTool<TParams = unknown>(
    name: string, 
    args: TParams,
    options?: {
      /** Validate parameters before call */
      validate?: boolean;
      /** Request timeout override */
      timeout?: number;
    }
  ): Promise<McpToolResult>;
  
  /** Get schema manager for tool validation */
  getSchemaManager(): IToolSchemaManager;
  
  /** List available resources (future capability) */
  listResources?(): Promise<McpResource[]>;
  
  /** Get resource content (future capability) */
  getResource?(uri: string): Promise<McpResourceContent>;
  
  /** Register error handler */
  onError(handler: (error: McpClientError) => void): void;
  
  /** Register disconnect handler */
  onDisconnect(handler: () => void): void;
  
  /** Register tool list change handler */
  onToolsChanged?(handler: () => void): void;
}

/**
 * MCP client error
 */
export class McpClientError extends Error {
  constructor(
    message: string,
    public readonly code: McpErrorCode,
    public readonly serverName?: string,
    public readonly toolName?: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'McpClientError';
  }
}

// ============================================================================
// CONNECTION MANAGER INTERFACES
// ============================================================================

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  /** Server name (unique identifier) */
  name: string;
  /** Transport configuration */
  transport: McpTransportConfig;
  /** Whether to auto-connect on startup */
  autoConnect?: boolean;
  /** Health check interval in milliseconds */
  healthCheckInterval?: number;
  /** Client capabilities for this server */
  capabilities?: McpClientCapabilities;
  /** Connection timeout */
  timeout?: number;
  /** Request timeout */
  requestTimeout?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    delayMs: number;
    maxDelayMs: number;
  };
}

/**
 * MCP server status
 */
export interface McpServerStatus {
  /** Server name */
  name: string;
  /** Connection status */
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Last connection attempt */
  lastConnected?: Date;
  /** Last error */
  lastError?: string;
  /** Server capabilities */
  capabilities?: McpServerCapabilities;
  /** Number of available tools */
  toolCount?: number;
}

/**
 * Server status change handler
 */
export type McpServerStatusHandler = (status: McpServerStatus) => void;

/**
 * MCP connection manager interface
 */
export interface IMcpConnectionManager {
  /** Add a new MCP server */
  addServer(config: McpServerConfig): Promise<void>;
  
  /** Remove an MCP server */
  removeServer(serverName: string): Promise<void>;
  
  /** Get server status */
  getServerStatus(serverName: string): McpServerStatus | undefined;
  
  /** Get all server statuses */
  getAllServerStatuses(): Map<string, McpServerStatus>;
  
  /** Connect to a specific server */
  connectServer(serverName: string): Promise<void>;
  
  /** Disconnect from a specific server */
  disconnectServer(serverName: string): Promise<void>;
  
  /** Discover and return all available tools */
  discoverTools(): Promise<Array<{ serverName: string; tool: McpTool }>>;
  
  /** Refresh tools from a specific server */
  refreshServer(serverName: string): Promise<void>;
  
  /** Perform health check on all servers */
  healthCheck(): Promise<Map<string, boolean>>;
  
  /** Get MCP client for a server */
  getClient(serverName: string): IMcpClient | undefined;
  
  /** Register server status change handler */
  onServerStatusChange(handler: McpServerStatusHandler): void;
  
  /** Cleanup all connections */
  cleanup(): Promise<void>;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Global MCP configuration
 */
export interface McpConfiguration {
  /** Whether MCP integration is enabled */
  enabled: boolean;
  
  /** List of MCP servers */
  servers: McpServerConfig[];
  
  /** Whether to auto-discover tools on startup */
  autoDiscoverTools?: boolean;
  
  /** Global connection timeout */
  connectionTimeout?: number;
  
  /** Global request timeout */
  requestTimeout?: number;
  
  /** Maximum number of concurrent connections */
  maxConnections?: number;
  
  /** Global retry policy */
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
    maxBackoffMs: number;
  };
  
  /** Health check configuration */
  healthCheck?: {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
  };
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Type guard for MCP transport config
 */
export function isMcpStdioTransport(config: McpTransportConfig): config is McpStdioTransportConfig {
  return config.type === 'stdio';
}

/**
 * Type guard for MCP HTTP transport config (legacy)
 */
export function isMcpHttpTransport(config: McpTransportConfig): config is McpHttpTransportConfig {
  return config.type === 'http';
}

/**
 * Type guard for MCP Streamable HTTP transport config
 */
export function isMcpStreamableHttpTransport(config: McpTransportConfig): config is McpStreamableHttpTransportConfig {
  return config.type === 'streamable-http';
}

/**
 * Type guard for MCP client error
 */
export function isMcpClientError(error: unknown): error is McpClientError {
  return error instanceof McpClientError;
}

/**
 * Type guard for MCP tool result
 */
export function isMcpToolResult(result: unknown): result is McpToolResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'content' in result &&
    Array.isArray((result as McpToolResult).content)
  );
}