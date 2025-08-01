/**
 * @fileoverview MCP Server Implementation
 * 
 * This file implements the IMCPServer interface, providing a complete
 * MCP server wrapper that handles process management, tool execution,
 * and error handling.
 */

import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  IMCPServer,
  MCPServerConfig,
  MCPServerStatus,
  MCPServerInfo,
  MCPToolDefinition,
  MCPToolRequest,
  MCPToolResponse,
  MCPError,
  MCPErrorType,
} from './interfaces.js';
import { ILogger, createLogger, LogLevel } from '../logger.js';

/**
 * Implementation of IMCPServer interface
 * 
 * This class manages a single MCP server process and provides
 * type-safe methods for tool execution and server management.
 */
export class MCPServer implements IMCPServer {
  /** Server name */
  public readonly name: string;
  
  /** Server configuration */
  public readonly config: MCPServerConfig;
  
  /** Current server status */
  private _status: MCPServerStatus = MCPServerStatus.Stopped;
  
  /** Child process reference */
  private process: ChildProcess | null = null;
  
  /** MCP client instance */
  private client: Client | null = null;
  
  /** Transport for client communication */
  private transport: StdioClientTransport | null = null;
  
  /** Available tools cache */
  private toolsCache: MCPToolDefinition[] = [];
  
  /** Last error message */
  private lastError?: string;
  
  /** Start time */
  private startTime?: number | undefined;
  
  /** Last activity time */
  private lastActivity?: number;
  
  /** Logger instance */
  private logger: ILogger;
  
  /** Timeout for operations */
  private readonly timeout: number;
  
  /** Number of retry attempts */
  private readonly retryAttempts: number;

  constructor(
    config: MCPServerConfig,
    globalTimeout: number = 30000,
    globalRetryAttempts: number = 3,
    logLevel: LogLevel = LogLevel.INFO
  ) {
    this.name = config.name;
    this.config = config;
    this.timeout = config.timeout ?? globalTimeout;
    this.retryAttempts = config.retryAttempts ?? globalRetryAttempts;
    
    this.logger = createLogger(`MCPServer:${this.name}`, {
      level: logLevel,
    });
    
    this.logger.debug(`MCP Server initialized: ${this.name}`, 'MCPServer.constructor()');
  }

  /** Get current status */
  get status(): MCPServerStatus {
    return this._status;
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this._status === MCPServerStatus.Running) {
      this.logger.debug('Server already running', 'MCPServer.start()');
      return;
    }

    if (this._status === MCPServerStatus.Starting) {
      throw new MCPError(
        MCPErrorType.ServerStartupFailed,
        'Server is already starting',
        this.name
      );
    }

    this._status = MCPServerStatus.Starting;
    this.logger.info('Starting MCP server', 'MCPServer.start()');

    try {
      await this.startWithRetry();
      this._status = MCPServerStatus.Running;
      this.startTime = Date.now();
      this.lastActivity = Date.now();
      this.logger.info('MCP server started successfully', 'MCPServer.start()');
    } catch (error) {
      this._status = MCPServerStatus.Failed;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start MCP server: ${this.lastError}`, 'MCPServer.start()');
      throw error;
    }
  }

  /**
   * Start server with retry logic
   */
  private async startWithRetry(): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        this.logger.debug(`Start attempt ${attempt}/${this.retryAttempts}`, 'MCPServer.startWithRetry()');
        await this.startServer();
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Start attempt ${attempt} failed: ${lastError.message}`, 'MCPServer.startWithRetry()');
        
        if (attempt < this.retryAttempts) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise<void>(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new MCPError(
      MCPErrorType.ServerStartupFailed,
      `Failed to start server after ${this.retryAttempts} attempts: ${lastError?.message}`,
      this.name,
      undefined,
      lastError || undefined
    );
  }

  /**
   * Internal server startup logic
   */
  private async startServer(): Promise<void> {
    // Spawn the server process
    const env = {
      ...process.env,
      ...this.config.env,
    };

    this.process = spawn(this.config.command, this.config.args || [], {
      env,
      cwd: this.config.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!this.process.stdin || !this.process.stdout) {
      throw new MCPError(
        MCPErrorType.ServerStartupFailed,
        'Failed to create stdio streams',
        this.name
      );
    }

    // Set up error handling
    this.process.on('error', (error) => {
      this.logger.error(`Process error: ${error.message}`, 'MCPServer.startServer()');
      this.handleProcessError(error);
    });

    this.process.on('exit', (code, signal) => {
      this.logger.warn(`Process exited with code ${code}, signal ${signal}`, 'MCPServer.startServer()');
      this.handleProcessExit(code, signal);
    });

    // Create transport and client
    this.transport = new StdioClientTransport({
      reader: this.process.stdout,
      writer: this.process.stdin,
    } as any); // SDK type issue - reader/writer are correct parameters

    this.client = new Client(
      {
        name: `mini-agent-${this.name}`,
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    try {
      // Connect with timeout
      await Promise.race([
        this.client.connect(this.transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), this.timeout)
        ),
      ]);

      this.logger.debug('Client connected successfully', 'MCPServer.startServer()');

      // Load tools
      await this.loadTools();
    } catch (error) {
      await this.cleanup();
      throw new MCPError(
        MCPErrorType.ServerConnectionFailed,
        `Failed to connect to server: ${error instanceof Error ? error.message : String(error)}`,
        this.name,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (this._status === MCPServerStatus.Stopped) {
      this.logger.debug('Server already stopped', 'MCPServer.stop()');
      return;
    }

    if (this._status === MCPServerStatus.Stopping) {
      this.logger.debug('Server already stopping', 'MCPServer.stop()');
      return;
    }

    this._status = MCPServerStatus.Stopping;
    this.logger.info('Stopping MCP server', 'MCPServer.stop()');

    try {
      await this.cleanup();
      this._status = MCPServerStatus.Stopped;
      this.startTime = undefined;
      this.logger.info('MCP server stopped successfully', 'MCPServer.stop()');
    } catch (error) {
      this.logger.error(`Error stopping server: ${error instanceof Error ? error.message : String(error)}`, 'MCPServer.stop()');
      this._status = MCPServerStatus.Failed;
      throw error;
    }
  }

  /**
   * Get available tools from the server
   */
  async getTools(): Promise<MCPToolDefinition[]> {
    if (this._status !== MCPServerStatus.Running) {
      throw new MCPError(
        MCPErrorType.ServerConnectionFailed,
        'Server is not running',
        this.name
      );
    }

    if (this.toolsCache.length > 0) {
      return this.toolsCache;
    }

    return await this.loadTools();
  }

  /**
   * Execute a tool on the server
   */
  async executeTool(request: MCPToolRequest, signal?: AbortSignal): Promise<MCPToolResponse> {
    if (this._status !== MCPServerStatus.Running) {
      throw new MCPError(
        MCPErrorType.ServerConnectionFailed,
        'Server is not running',
        this.name,
        request.name
      );
    }

    if (!this.client) {
      throw new MCPError(
        MCPErrorType.ServerConnectionFailed,
        'Client not initialized',
        this.name,
        request.name
      );
    }

    this.logger.debug(`Executing tool: ${request.name}`, 'MCPServer.executeTool()');
    this.lastActivity = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeout = setTimeout(() => {
          reject(new MCPError(
            MCPErrorType.Timeout,
            `Tool execution timeout after ${this.timeout}ms`,
            this.name,
            request.name
          ));
        }, this.timeout);

        signal?.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new MCPError(
            MCPErrorType.ToolExecutionFailed,
            'Tool execution aborted',
            this.name,
            request.name
          ));
        });
      });

      const executionPromise = this.client.callTool({
        name: request.name,
        arguments: request.arguments,
      });

      const result = await Promise.race([executionPromise, timeoutPromise]);

      this.logger.debug(`Tool execution completed: ${request.name}`, 'MCPServer.executeTool()');

      return {
        content: result.content as Array<{
          type: 'text' | 'image' | 'resource';
          text?: string;
          data?: string;
          mimeType?: string;
        }>,
        isError: result.isError as boolean,
      };
    } catch (error) {
      this.logger.error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`, 'MCPServer.executeTool()');
      
      if (error instanceof MCPError) {
        throw error;
      }

      throw new MCPError(
        MCPErrorType.ToolExecutionFailed,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        this.name,
        request.name,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if server is healthy
   */
  async ping(): Promise<boolean> {
    if (this._status !== MCPServerStatus.Running) {
      return false;
    }

    if (!this.client) {
      return false;
    }

    try {
      // Simple ping operation - just try to list tools
      await Promise.race([
        this.client.listTools(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Ping timeout')), 5000)
        ),
      ]);
      
      this.lastActivity = Date.now();
      return true;
    } catch (error) {
      this.logger.warn(`Ping failed: ${error instanceof Error ? error.message : String(error)}`, 'MCPServer.ping()');
      return false;
    }
  }

  /**
   * Get server information
   */
  getInfo(): MCPServerInfo {
    const info: MCPServerInfo = {
      name: this.name,
      status: this._status,
      config: this.config,
      tools: this.toolsCache,
    };
    
    if (this.lastError !== undefined) {
      info.lastError = this.lastError;
    }
    if (this.startTime !== undefined) {
      info.startTime = this.startTime;
    }
    if (this.lastActivity !== undefined) {
      info.lastActivity = this.lastActivity;
    }
    if (this.process?.pid !== undefined) {
      info.pid = this.process.pid;
    }
    
    return info;
  }

  /**
   * Load tools from the server
   */
  private async loadTools(): Promise<MCPToolDefinition[]> {
    if (!this.client) {
      throw new MCPError(
        MCPErrorType.ServerConnectionFailed,
        'Client not initialized',
        this.name
      );
    }

    try {
      this.logger.debug('Loading tools from server', 'MCPServer.loadTools()');
      const result = await this.client.listTools();
      
      this.toolsCache = result.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema as any,
      }));

      this.logger.info(`Loaded ${this.toolsCache.length} tools`, 'MCPServer.loadTools()');
      return this.toolsCache;
    } catch (error) {
      this.logger.error(`Failed to load tools: ${error instanceof Error ? error.message : String(error)}`, 'MCPServer.loadTools()');
      throw new MCPError(
        MCPErrorType.ProtocolError,
        `Failed to load tools: ${error instanceof Error ? error.message : String(error)}`,
        this.name,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Handle process errors
   */
  private handleProcessError(error: Error): void {
    this.logger.error(`Process error: ${error.message}`, 'MCPServer.handleProcessError()');
    this._status = MCPServerStatus.Failed;
    this.lastError = error.message;
  }

  /**
   * Handle process exit
   */
  private handleProcessExit(code: number | null, signal: string | null): void {
    this.logger.info(`Process exited: code=${code}, signal=${signal}`, 'MCPServer.handleProcessExit()');
    
    if (this._status === MCPServerStatus.Stopping) {
      this._status = MCPServerStatus.Stopped;
    } else {
      this._status = MCPServerStatus.Failed;
      this.lastError = `Process exited unexpectedly: code=${code}, signal=${signal}`;
    }

    this.cleanup().catch(error => {
      this.logger.error(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`, 'MCPServer.handleProcessExit()');
    });
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    this.logger.debug('Cleaning up server resources', 'MCPServer.cleanup()');

    // Close client connection
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        this.logger.warn(`Error closing client: ${error instanceof Error ? error.message : String(error)}`, 'MCPServer.cleanup()');
      }
      this.client = null;
    }

    // Close transport
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        this.logger.warn(`Error closing transport: ${error instanceof Error ? error.message : String(error)}`, 'MCPServer.cleanup()');
      }
      this.transport = null;
    }

    // Kill process if still running
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      
      // Wait for graceful shutdown, then force kill
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.logger.warn('Force killing process', 'MCPServer.cleanup()');
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }

    this.process = null;
    this.toolsCache = [];
  }
}