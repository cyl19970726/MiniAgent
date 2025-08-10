/**
 * @fileoverview STDIO Transport Implementation for MCP
 * 
 * This module provides STDIO transport for communicating with local MCP servers
 * via child processes using stdin/stdout for JSON-RPC communication.
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import { 
  IMcpTransport, 
  McpStdioTransportConfig, 
  McpRequest, 
  McpResponse, 
  McpNotification 
} from '../interfaces.js';

/**
 * Reconnection configuration
 */
interface ReconnectionConfig {
  enabled: boolean;
  maxAttempts: number;
  delayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Default reconnection configuration
 */
const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  enabled: true,
  maxAttempts: 5,
  delayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * STDIO transport for local MCP servers
 * 
 * Spawns MCP server as a child process and uses stdin/stdout
 * for JSON-RPC communication. Ideal for local integrations.
 * 
 * Features:
 * - Process lifecycle management with graceful shutdown
 * - Automatic reconnection with exponential backoff
 * - Message buffering and backpressure handling
 * - Comprehensive error handling and cleanup
 */
export class StdioTransport implements IMcpTransport {
  private process?: ChildProcess;
  private readline?: Interface;
  private connected: boolean = false;
  private messageHandlers: Array<(message: McpResponse | McpNotification) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private disconnectHandlers: Array<() => void> = [];
  
  // Reconnection state
  private reconnectionConfig: ReconnectionConfig;
  private reconnectAttempts: number = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private isReconnecting: boolean = false;
  private shouldReconnect: boolean = true;
  
  // Message buffering for backpressure handling
  private messageBuffer: Array<McpRequest | McpNotification> = [];
  private maxBufferSize: number = 1000;
  private drainPromise?: Promise<void>;
  private drainResolve?: () => void;

  constructor(
    private config: McpStdioTransportConfig,
    reconnectionConfig?: Partial<ReconnectionConfig>
  ) {
    this.reconnectionConfig = { ...DEFAULT_RECONNECTION_CONFIG, ...reconnectionConfig };
  }

  /**
   * Connect to the MCP server by spawning child process
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    // Clear any existing reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    try {
      await this.doConnect();
      
      // Reset reconnection state on successful connection
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      
      // Process any buffered messages
      await this.flushMessageBuffer();
      
    } catch (error) {
      this.cleanup();
      
      // Attempt reconnection if enabled and not explicitly disconnecting
      if (this.reconnectionConfig.enabled && 
          this.shouldReconnect && 
          this.reconnectAttempts < this.reconnectionConfig.maxAttempts) {
        
        await this.scheduleReconnection();
        return;
      }
      
      throw new Error(`Failed to start MCP server after ${this.reconnectAttempts} attempts: ${error}`);
    }
  }

  /**
   * Internal connection method
   */
  private async doConnect(): Promise<void> {
    // Spawn the MCP server process
    this.process = spawn(this.config.command, this.config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...this.config.env,
      },
      cwd: this.config.cwd,
    });

    // Set up error handling
    this.process.on('error', this.handleProcessError.bind(this));
    this.process.on('exit', this.handleProcessExit.bind(this));

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Failed to get process stdio streams');
    }

    // Set up readline for reading JSON-RPC messages
    this.readline = createInterface({
      input: this.process.stdout,
      output: undefined,
    });

    this.readline.on('line', this.handleLine.bind(this));
    this.readline.on('error', this.handleReadlineError.bind(this));

    // Set up stderr logging
    if (this.process.stderr) {
      this.process.stderr.on('data', (data) => {
        console.error(`MCP Server (${this.config.command}) stderr:`, data.toString());
      });
    }

    this.connected = true;

    // Wait a brief moment for the process to start up
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the process is still running
    if (!this.process || this.process.killed) {
      throw new Error('MCP server process failed to start or exited immediately');
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    // Disable reconnection when explicitly disconnecting
    this.shouldReconnect = false;
    
    // Clear reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.cleanup();

    // Give the process a chance to exit gracefully
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      
      // Wait up to 5 seconds for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        if (this.process) {
          this.process.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });
    }

    this.connected = false;
  }

  /**
   * Send a message to the MCP server
   */
  async send(message: McpRequest | McpNotification): Promise<void> {
    // If not connected, buffer the message if reconnection is possible
    if (!this.connected) {
      if (this.reconnectionConfig.enabled && this.shouldReconnect) {
        await this.bufferMessage(message);
        return;
      } else {
        throw new Error('Transport not connected and reconnection disabled');
      }
    }

    if (!this.process?.stdin) {
      if (this.reconnectionConfig.enabled && this.shouldReconnect) {
        await this.bufferMessage(message);
        return;
      } else {
        throw new Error('Process stdin not available');
      }
    }

    // Check if we need to wait for drain
    if (this.drainPromise) {
      await this.drainPromise;
    }

    const messageStr = JSON.stringify(message) + '\n';
    
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Process stdin not available'));
        return;
      }

      const canWriteMore = this.process.stdin.write(messageStr, 'utf8', (error) => {
        if (error) {
          reject(new Error(`Failed to write message: ${error}`));
        } else {
          resolve();
        }
      });

      // Handle backpressure
      if (!canWriteMore) {
        this.drainPromise = new Promise((drainResolve) => {
          this.drainResolve = drainResolve;
          this.process?.stdin?.once('drain', () => {
            this.drainPromise = undefined;
            this.drainResolve = undefined;
            drainResolve();
          });
        });
      }
    });
  }

  /**
   * Register message handler
   */
  onMessage(handler: (message: McpResponse | McpNotification) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Register error handler
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Register disconnect handler
   */
  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }

  /**
   * Check if transport is connected
   */
  isConnected(): boolean {
    return this.connected && !!this.process && !this.process.killed;
  }

  /**
   * Handle incoming lines from the MCP server
   */
  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    try {
      const message = JSON.parse(line);
      
      // Basic validation of JSON-RPC message structure
      if (typeof message !== 'object' || message.jsonrpc !== '2.0') {
        throw new Error('Invalid JSON-RPC message format');
      }

      this.messageHandlers.forEach(handler => {
        try {
          handler(message as McpResponse | McpNotification);
        } catch (error) {
          console.error('Error in message handler:', error);
        }
      });
    } catch (error) {
      this.emitError(new Error(`Failed to parse message: ${error}. Raw line: ${line}`));
    }
  }

  /**
   * Handle process errors
   */
  private handleProcessError(error: Error): void {
    this.emitError(new Error(`MCP server process error: ${error.message}`));
    this.handleDisconnect();
  }

  /**
   * Handle process exit
   */
  private handleProcessExit(code: number | null, signal: string | null): void {
    const reason = signal 
      ? `killed by signal ${signal}` 
      : `exited with code ${code}`;
    
    if (this.connected) {
      this.emitError(new Error(`MCP server process ${reason}`));
    }
    
    this.handleDisconnect();
  }

  /**
   * Handle readline errors
   */
  private handleReadlineError(error: Error): void {
    this.emitError(new Error(`Readline error: ${error.message}`));
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    if (!this.connected) {
      return;
    }

    this.cleanup();
    this.connected = false;

    // Notify disconnect handlers
    this.disconnectHandlers.forEach(handler => {
      try {
        handler();
      } catch (error) {
        console.error('Error in disconnect handler:', error);
      }
    });

    // Attempt reconnection if enabled and not explicitly disconnecting
    if (this.reconnectionConfig.enabled && 
        this.shouldReconnect && 
        this.reconnectAttempts < this.reconnectionConfig.maxAttempts) {
      
      this.scheduleReconnection().catch(error => {
        console.error('Reconnection failed:', error);
        this.emitError(new Error(`Reconnection failed: ${error}`));
      });
    }
  }

  /**
   * Emit error to handlers
   */
  private emitError(error: Error): void {
    this.errorHandlers.forEach(handler => {
      try {
        handler(error);
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
      }
    });
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.readline) {
      this.readline.close();
      this.readline = undefined;
    }

    if (this.process) {
      this.process.removeAllListeners();
      if (this.process.stdin) {
        this.process.stdin.removeAllListeners();
      }
      if (this.process.stdout) {
        this.process.stdout.removeAllListeners();
      }
      if (this.process.stderr) {
        this.process.stderr.removeAllListeners();
      }
    }

    // Clean up drain promise if exists
    if (this.drainResolve) {
      this.drainResolve();
      this.drainPromise = undefined;
      this.drainResolve = undefined;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private async scheduleReconnection(): Promise<void> {
    if (this.isReconnecting || !this.shouldReconnect) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = Math.min(
      this.reconnectionConfig.delayMs * Math.pow(this.reconnectionConfig.backoffMultiplier, this.reconnectAttempts - 1),
      this.reconnectionConfig.maxDelayMs
    );

    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.reconnectionConfig.maxAttempts} in ${delay}ms`);

    return new Promise((resolve, reject) => {
      this.reconnectTimer = setTimeout(async () => {
        try {
          await this.connect();
          resolve();
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  }

  /**
   * Buffer message when disconnected
   */
  private async bufferMessage(message: McpRequest | McpNotification): Promise<void> {
    if (this.messageBuffer.length >= this.maxBufferSize) {
      // Remove oldest message to make room
      this.messageBuffer.shift();
      console.warn('Message buffer full, dropping oldest message');
    }

    this.messageBuffer.push(message);
    console.log(`Buffered message (${this.messageBuffer.length}/${this.maxBufferSize})`);
  }

  /**
   * Flush buffered messages after reconnection
   */
  private async flushMessageBuffer(): Promise<void> {
    if (this.messageBuffer.length === 0) {
      return;
    }

    console.log(`Flushing ${this.messageBuffer.length} buffered messages`);
    
    const messages = [...this.messageBuffer];
    this.messageBuffer = [];

    for (const message of messages) {
      try {
        await this.send(message);
      } catch (error) {
        console.error('Failed to send buffered message:', error);
        // Re-buffer the message if send fails
        await this.bufferMessage(message);
        break; // Stop processing if one fails
      }
    }
  }

  /**
   * Get reconnection status
   */
  public getReconnectionStatus(): {
    enabled: boolean;
    attempts: number;
    maxAttempts: number;
    isReconnecting: boolean;
    bufferSize: number;
  } {
    return {
      enabled: this.reconnectionConfig.enabled,
      attempts: this.reconnectAttempts,
      maxAttempts: this.reconnectionConfig.maxAttempts,
      isReconnecting: this.isReconnecting,
      bufferSize: this.messageBuffer.length,
    };
  }

  /**
   * Configure reconnection settings
   */
  public configureReconnection(config: Partial<ReconnectionConfig>): void {
    this.reconnectionConfig = { ...this.reconnectionConfig, ...config };
  }

  /**
   * Enable/disable reconnection
   */
  public setReconnectionEnabled(enabled: boolean): void {
    this.shouldReconnect = enabled;
    this.reconnectionConfig.enabled = enabled;
    
    if (!enabled && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}