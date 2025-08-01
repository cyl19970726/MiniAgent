/**
 * @fileoverview MCP (Model Context Protocol) Integration Interfaces
 * 
 * This file defines type-safe interfaces for integrating MCP servers and tools
 * into the MiniAgent framework. It provides abstractions for server management,
 * tool execution, and configuration.
 */

import { ITool } from '../interfaces.js';
import { LogLevel } from '../logger.js';

// ============================================================================
// MCP SERVER CONFIGURATION
// ============================================================================

/**
 * Configuration for a single MCP server
 */
export interface MCPServerConfig {
  /** Unique server name identifier */
  name: string;
  /** Command to start the server */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables for the server process */
  env?: Record<string, string>;
  /** Working directory for the server process */
  cwd?: string;
  /** Whether this server is disabled */
  disabled?: boolean;
  /** Custom timeout for this server (ms) */
  timeout?: number;
  /** Custom retry attempts for this server */
  retryAttempts?: number;
}

/**
 * Global MCP configuration
 */
export interface MCPConfig {
  /** Array of MCP server configurations */
  servers: MCPServerConfig[];
  /** Default timeout for MCP operations (ms) */
  timeout?: number;
  /** Default number of retry attempts */
  retryAttempts?: number;
  /** Log level for MCP operations */
  logLevel?: LogLevel;
  /** Whether to auto-restart failed servers */
  autoRestart?: boolean;
  /** Maximum concurrent tool executions per server */
  maxConcurrentTools?: number;
}

// ============================================================================
// MCP TOOL INTERFACES
// ============================================================================

/**
 * MCP tool definition from server
 */
export interface MCPToolDefinition {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** JSON schema for tool parameters */
  inputSchema: any; // Use any for flexibility with MCP schema types
}

/**
 * MCP tool execution request
 */
export interface MCPToolRequest {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
}

/**
 * MCP tool execution response
 */
export interface MCPToolResponse {
  /** Tool execution content */
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  /** Whether the tool execution failed */
  isError?: boolean;
}

/**
 * MCP Tool adapter that implements ITool interface
 */
export interface MCPTool extends ITool {
  /** Name of the MCP server this tool belongs to */
  readonly serverName: string;
  /** Original MCP tool name */
  readonly mcpToolName: string;
  /** MCP tool definition */
  readonly mcpDefinition: MCPToolDefinition;
}

// ============================================================================
// MCP SERVER INTERFACES
// ============================================================================

/**
 * MCP server status
 */
export enum MCPServerStatus {
  /** Server is not started */
  Stopped = 'stopped',
  /** Server is starting */
  Starting = 'starting',
  /** Server is running and ready */
  Running = 'running',
  /** Server has failed */
  Failed = 'failed',
  /** Server is being stopped */
  Stopping = 'stopping',
}

/**
 * MCP server information
 */
export interface MCPServerInfo {
  /** Server name */
  name: string;
  /** Current status */
  status: MCPServerStatus;
  /** Configuration */
  config: MCPServerConfig;
  /** Available tools */
  tools: MCPToolDefinition[];
  /** Last error if any */
  lastError?: string;
  /** Start time */
  startTime?: number;
  /** Last activity time */
  lastActivity?: number;
  /** Process ID if running */
  pid?: number;
}

/**
 * MCP server interface
 */
export interface IMCPServer {
  /** Server name */
  readonly name: string;
  /** Server configuration */
  readonly config: MCPServerConfig;
  /** Current status */
  readonly status: MCPServerStatus;
  
  /**
   * Start the server
   */
  start(): Promise<void>;
  
  /**
   * Stop the server
   */
  stop(): Promise<void>;
  
  /**
   * Get available tools
   */
  getTools(): Promise<MCPToolDefinition[]>;
  
  /**
   * Execute a tool
   */
  executeTool(request: MCPToolRequest, signal?: AbortSignal): Promise<MCPToolResponse>;
  
  /**
   * Check if server is healthy
   */
  ping(): Promise<boolean>;
  
  /**
   * Get server information
   */
  getInfo(): MCPServerInfo;
}

// ============================================================================
// MCP SERVER MANAGER INTERFACES
// ============================================================================

/**
 * MCP server manager interface
 */
export interface IMCPServerManager {
  /**
   * Initialize the manager with configuration
   */
  initialize(config: MCPConfig): Promise<void>;
  
  /**
   * Start a specific server
   */
  startServer(serverName: string): Promise<void>;
  
  /**
   * Stop a specific server
   */
  stopServer(serverName: string): Promise<void>;
  
  /**
   * Restart a server
   */
  restartServer(serverName: string): Promise<void>;
  
  /**
   * Get all servers
   */
  getServers(): Map<string, IMCPServer>;
  
  /**
   * Get a specific server
   */
  getServer(serverName: string): IMCPServer | undefined;
  
  /**
   * Get all available tools from all servers
   */
  getAllTools(): Promise<MCPTool[]>;
  
  /**
   * Get tools from a specific server
   */
  getServerTools(serverName: string): Promise<MCPTool[]>;
  
  /**
   * Execute a tool on a specific server
   */
  executeServerTool(
    serverName: string,
    toolName: string,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<MCPToolResponse>;
  
  /**
   * Shutdown all servers
   */
  shutdown(): Promise<void>;
  
  /**
   * Get manager status
   */
  getStatus(): {
    totalServers: number;
    runningServers: number;
    failedServers: number;
    totalTools: number;
  };
}

// ============================================================================
// ERROR INTERFACES
// ============================================================================

/**
 * MCP error types
 */
export enum MCPErrorType {
  /** Server connection failed */
  ServerConnectionFailed = 'server_connection_failed',
  /** Server startup failed */
  ServerStartupFailed = 'server_startup_failed',
  /** Tool execution failed */
  ToolExecutionFailed = 'tool_execution_failed',
  /** Tool not found */
  ToolNotFound = 'tool_not_found',
  /** Invalid tool parameters */
  InvalidToolParameters = 'invalid_tool_parameters',
  /** Timeout occurred */
  Timeout = 'timeout',
  /** Configuration error */
  ConfigurationError = 'configuration_error',
  /** Protocol error */
  ProtocolError = 'protocol_error',
}

/**
 * MCP specific error class
 */
export class MCPError extends Error {
  override readonly message: string;
  
  constructor(
    public readonly type: MCPErrorType,
    message: string,
    public readonly serverName?: string,
    public readonly toolName?: string,
    public override readonly cause?: Error
  ) {
    super(message);
    this.message = message;
    this.name = 'MCPError';
  }
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  /** Whether configuration is valid */
  isValid: boolean;
  /** Validation errors if any */
  errors: string[];
  /** Validation warnings if any */
  warnings: string[];
}

/**
 * Tool execution context
 */
export interface MCPToolExecutionContext {
  /** Server name */
  serverName: string;
  /** Tool name */
  toolName: string;
  /** Execution start time */
  startTime: number;
  /** Abort signal */
  signal?: AbortSignal;
  /** Request ID for tracking */
  requestId: string;
}

/**
 * Type guard for MCPTool
 */
export function isMCPTool(obj: unknown): obj is MCPTool {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'serverName' in obj &&
    'mcpToolName' in obj &&
    'mcpDefinition' in obj &&
    typeof (obj as any).serverName === 'string' &&
    typeof (obj as any).mcpToolName === 'string'
  );
}

/**
 * Type guard for MCPServerConfig
 */
export function isMCPServerConfig(obj: unknown): obj is MCPServerConfig {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'command' in obj &&
    typeof (obj as any).name === 'string' &&
    typeof (obj as any).command === 'string'
  );
}