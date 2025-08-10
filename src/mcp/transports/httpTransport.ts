/**
 * @fileoverview HTTP Transport Implementation with SSE Support for MCP
 * 
 * This module provides Streamable HTTP transport for communicating with remote MCP servers
 * using the official SDK pattern: HTTP POST for client-to-server messages and 
 * Server-Sent Events (SSE) for server-to-client messages.
 * 
 * Features:
 * - Dual-endpoint architecture (SSE stream + message posting)
 * - Session management with unique session IDs
 * - Automatic reconnection with exponential backoff
 * - Last-Event-ID support for resumption after disconnection
 * - Authentication support (Bearer tokens, API keys, OAuth2)
 * - Message queuing during disconnection periods
 * - Robust error handling and connection resilience
 * 
 * The Streamable HTTP pattern:
 * 1. Initial connection via GET to establish SSE stream
 * 2. Server sends endpoint URL via SSE for message posting
 * 3. Bidirectional communication: POST requests + SSE responses
 * 4. Session persistence across reconnections
 */

import { 
  IMcpTransport, 
  McpStreamableHttpTransportConfig, 
  McpRequest, 
  McpResponse, 
  McpNotification,
  McpAuthConfig 
} from '../interfaces.js';

/**
 * SSE Event interface for parsing server-sent events
 */
interface SSEEvent {
  id?: string;
  event?: string;
  data?: string;
  retry?: number;
}

/**
 * HTTP Transport configuration options
 */
interface HttpTransportOptions {
  /** Maximum number of reconnection attempts */
  maxReconnectAttempts?: number;
  /** Initial reconnection delay in milliseconds */
  initialReconnectDelay?: number;
  /** Maximum reconnection delay in milliseconds */
  maxReconnectDelay?: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier?: number;
  /** Maximum message buffer size */
  maxBufferSize?: number;
  /** Request timeout in milliseconds */
  requestTimeout?: number;
  /** SSE connection timeout in milliseconds */
  sseTimeout?: number;
}

/**
 * Default HTTP transport options
 */
const DEFAULT_HTTP_OPTIONS: Required<HttpTransportOptions> = {
  maxReconnectAttempts: 5,
  initialReconnectDelay: 1000,
  maxReconnectDelay: 30000,
  backoffMultiplier: 2,
  maxBufferSize: 1000,
  requestTimeout: 30000,
  sseTimeout: 60000,
};

/**
 * Connection state for the HTTP transport
 */
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * Session information for persistence across reconnections
 */
interface SessionInfo {
  sessionId: string;
  messageEndpoint?: string;
  lastEventId?: string;
}

/**
 * HTTP Transport for remote MCP servers using Streamable HTTP pattern
 * 
 * Implements bidirectional communication via:
 * - SSE stream for server-to-client messages
 * - HTTP POST for client-to-server messages
 * - Session management for connection persistence
 * - Authentication and security headers
 */
export class HttpTransport implements IMcpTransport {
  private config: McpStreamableHttpTransportConfig;
  private options: Required<HttpTransportOptions>;
  private state: ConnectionState = 'disconnected';
  
  // Connection management
  private eventSource?: EventSource;
  private abortController?: AbortController;
  private session: SessionInfo;
  
  // Reconnection state
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private shouldReconnect = true;
  
  // Message handling
  private messageHandlers: Array<(message: McpResponse | McpNotification) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private disconnectHandlers: Array<() => void> = [];
  
  // Message buffering during disconnection
  private messageBuffer: Array<McpRequest | McpNotification> = [];
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }>();
  
  constructor(
    config: McpStreamableHttpTransportConfig,
    options?: Partial<HttpTransportOptions>
  ) {
    this.config = config;
    this.options = { ...DEFAULT_HTTP_OPTIONS, ...options };
    
    // Initialize session with unique ID
    this.session = {
      sessionId: this.generateSessionId(),
    };
  }

  /**
   * Connect to the MCP server via SSE stream
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.state = 'connecting';
    this.shouldReconnect = true;
    
    // Clear any existing reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    try {
      await this.doConnect();
      this.state = 'connected';
      this.reconnectAttempts = 0;
      
      // Flush any buffered messages
      await this.flushMessageBuffer();
      
    } catch (error) {
      this.state = 'error';
      await this.cleanup();
      
      // Attempt reconnection if enabled
      if (this.shouldReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
        await this.scheduleReconnection();
        return;
      }
      
      throw new Error(`Failed to connect to MCP server after ${this.reconnectAttempts} attempts: ${error}`);
    }
  }

  /**
   * Internal connection method
   */
  private async doConnect(): Promise<void> {
    // Create abort controller for this connection attempt
    this.abortController = new AbortController();
    
    // Prepare SSE URL with session information
    const sseUrl = new URL(this.config.url);
    sseUrl.searchParams.set('session', this.session.sessionId);
    
    // Add Last-Event-ID for resumption if available
    if (this.session.lastEventId) {
      sseUrl.searchParams.set('lastEventId', this.session.lastEventId);
    }
    
    // Prepare headers with authentication
    const headers = this.buildHeaders();
    
    // Establish SSE connection
    this.eventSource = new EventSource(sseUrl.toString());
    
    // Set up SSE event handlers
    this.setupSSEEventHandlers();
    
    // Wait for SSE connection to be established
    await this.waitForSSEConnection();
    
    // If server provides message endpoint, store it
    // This would typically be sent via an SSE event
    if (!this.session.messageEndpoint) {
      this.session.messageEndpoint = this.config.url;
    }
  }

  /**
   * Set up SSE event handlers
   */
  private setupSSEEventHandlers(): void {
    if (!this.eventSource) return;

    this.eventSource.onopen = () => {
      console.log('SSE connection established');
    };

    this.eventSource.onmessage = (event) => {
      try {
        // Update last event ID for resumption
        if (event.lastEventId) {
          this.session.lastEventId = event.lastEventId;
        }
        
        const message = JSON.parse(event.data);
        
        // Handle special server messages
        if (this.handleServerMessage(message)) {
          return;
        }
        
        // Validate JSON-RPC message format
        if (typeof message !== 'object' || message.jsonrpc !== '2.0') {
          throw new Error('Invalid JSON-RPC message format');
        }

        // Emit to message handlers
        this.messageHandlers.forEach(handler => {
          try {
            handler(message as McpResponse | McpNotification);
          } catch (error) {
            console.error('Error in message handler:', error);
          }
        });
      } catch (error) {
        this.emitError(new Error(`Failed to parse SSE message: ${error}`));
      }
    };

    this.eventSource.onerror = (event) => {
      console.error('SSE error:', event);
      this.handleDisconnect();
    };

    // Handle custom SSE events
    this.eventSource.addEventListener('endpoint', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (data.messageEndpoint) {
          this.session.messageEndpoint = data.messageEndpoint;
          console.log('Message endpoint updated:', data.messageEndpoint);
        }
      } catch (error) {
        console.error('Failed to parse endpoint event:', error);
      }
    });

    this.eventSource.addEventListener('session', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (data.sessionId) {
          this.session.sessionId = data.sessionId;
          console.log('Session ID updated:', data.sessionId);
        }
      } catch (error) {
        console.error('Failed to parse session event:', error);
      }
    });
  }

  /**
   * Wait for SSE connection to be established
   */
  private async waitForSSEConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.eventSource) {
        reject(new Error('EventSource not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('SSE connection timeout'));
      }, this.options.sseTimeout);

      const onOpen = () => {
        clearTimeout(timeout);
        resolve();
      };

      const onError = () => {
        clearTimeout(timeout);
        reject(new Error('SSE connection failed'));
      };

      this.eventSource.addEventListener('open', onOpen, { once: true });
      this.eventSource.addEventListener('error', onError, { once: true });
    });
  }

  /**
   * Handle special server messages
   */
  private handleServerMessage(message: any): boolean {
    // Handle server control messages
    if (message.type === 'endpoint' && message.url) {
      this.session.messageEndpoint = message.url;
      return true;
    }
    
    if (message.type === 'session' && message.sessionId) {
      this.session.sessionId = message.sessionId;
      return true;
    }
    
    return false;
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.state === 'disconnected') {
      return;
    }

    this.shouldReconnect = false;
    this.state = 'disconnected';
    
    // Clear reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    await this.cleanup();
  }

  /**
   * Send a message to the MCP server via HTTP POST
   */
  async send(message: McpRequest | McpNotification): Promise<void> {
    // If not connected, buffer the message if reconnection is possible
    if (this.state !== 'connected') {
      if (this.shouldReconnect) {
        await this.bufferMessage(message);
        return;
      } else {
        throw new Error('Transport not connected and reconnection disabled');
      }
    }

    if (!this.session.messageEndpoint) {
      throw new Error('Message endpoint not available');
    }

    try {
      const response = await this.sendHttpMessage(message);
      
      // Handle HTTP response if it contains MCP data
      if (response.ok) {
        const responseData = await response.json();
        if (responseData && typeof responseData === 'object') {
          // This might be a direct response to a request
          this.messageHandlers.forEach(handler => {
            try {
              handler(responseData as McpResponse);
            } catch (error) {
              console.error('Error in message handler:', error);
            }
          });
        }
      }
    } catch (error) {
      // If send fails and reconnection is possible, buffer the message
      if (this.shouldReconnect) {
        await this.bufferMessage(message);
      } else {
        throw new Error(`Failed to send message: ${error}`);
      }
    }
  }

  /**
   * Send HTTP message to server
   */
  private async sendHttpMessage(message: McpRequest | McpNotification): Promise<Response> {
    if (!this.session.messageEndpoint) {
      throw new Error('Message endpoint not available');
    }

    const headers = this.buildHeaders();
    headers.set('Content-Type', 'application/json');
    
    // Add session information
    headers.set('X-Session-ID', this.session.sessionId);

    const response = await fetch(this.session.messageEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  /**
   * Build HTTP headers with authentication
   */
  private buildHeaders(): Headers {
    const headers = new Headers(this.config.headers || {});
    
    // Add authentication headers
    if (this.config.auth) {
      this.addAuthHeaders(headers, this.config.auth);
    }
    
    // Add MCP-specific headers
    headers.set('Accept', 'text/event-stream, application/json');
    headers.set('Cache-Control', 'no-cache');
    
    return headers;
  }

  /**
   * Add authentication headers based on auth configuration
   */
  private addAuthHeaders(headers: Headers, auth: McpAuthConfig): void {
    switch (auth.type) {
      case 'bearer':
        if (auth.token) {
          headers.set('Authorization', `Bearer ${auth.token}`);
        }
        break;
        
      case 'basic':
        if (auth.username && auth.password) {
          const credentials = btoa(`${auth.username}:${auth.password}`);
          headers.set('Authorization', `Basic ${credentials}`);
        }
        break;
        
      case 'oauth2':
        // OAuth2 would typically require a separate token acquisition flow
        // For now, we'll assume the token is provided directly
        if (auth.token) {
          headers.set('Authorization', `Bearer ${auth.token}`);
        }
        break;
    }
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
    return this.state === 'connected' && 
           !!this.eventSource && 
           this.eventSource.readyState === EventSource.OPEN;
  }

  /**
   * Handle disconnection
   */
  private async handleDisconnect(): Promise<void> {
    if (this.state === 'disconnected') {
      return;
    }

    const previousState = this.state;
    this.state = 'disconnected';
    
    await this.cleanup();

    // Notify disconnect handlers
    this.disconnectHandlers.forEach(handler => {
      try {
        handler();
      } catch (error) {
        console.error('Error in disconnect handler:', error);
      }
    });

    // Attempt reconnection if enabled and not explicitly disconnecting
    if (this.shouldReconnect && 
        this.reconnectAttempts < this.options.maxReconnectAttempts &&
        previousState !== 'error') {
      
      await this.scheduleReconnection();
    }
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    // Close EventSource
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    
    // Abort any ongoing requests
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
    
    // Clear pending request timeouts
    this.pendingRequests.forEach((pending, id) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    });
    this.pendingRequests.clear();
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
   * Schedule reconnection with exponential backoff
   */
  private async scheduleReconnection(): Promise<void> {
    if (this.state === 'reconnecting' || !this.shouldReconnect) {
      return;
    }

    this.state = 'reconnecting';
    this.reconnectAttempts++;

    const delay = Math.min(
      this.options.initialReconnectDelay * Math.pow(this.options.backoffMultiplier, this.reconnectAttempts - 1),
      this.options.maxReconnectDelay
    );

    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${delay}ms`);

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
    if (this.messageBuffer.length >= this.options.maxBufferSize) {
      // Remove oldest message to make room
      this.messageBuffer.shift();
      console.warn('Message buffer full, dropping oldest message');
    }

    this.messageBuffer.push(message);
    console.log(`Buffered message (${this.messageBuffer.length}/${this.options.maxBufferSize})`);
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
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `mcp-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current connection status
   */
  public getConnectionStatus(): {
    state: ConnectionState;
    sessionId: string;
    messageEndpoint?: string;
    lastEventId?: string;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
    bufferSize: number;
  } {
    return {
      state: this.state,
      sessionId: this.session.sessionId,
      messageEndpoint: this.session.messageEndpoint,
      lastEventId: this.session.lastEventId,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.options.maxReconnectAttempts,
      bufferSize: this.messageBuffer.length,
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<McpStreamableHttpTransportConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Update transport options
   */
  public updateOptions(updates: Partial<HttpTransportOptions>): void {
    this.options = { ...this.options, ...updates };
  }

  /**
   * Enable/disable reconnection
   */
  public setReconnectionEnabled(enabled: boolean): void {
    this.shouldReconnect = enabled;
    
    if (!enabled && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Force reconnection (if currently connected)
   */
  public async forceReconnect(): Promise<void> {
    if (this.state === 'connected') {
      await this.cleanup();
      this.state = 'disconnected';
      await this.connect();
    }
  }

  /**
   * Get session information
   */
  public getSessionInfo(): SessionInfo {
    return { ...this.session };
  }

  /**
   * Update session information (for resuming connections)
   */
  public updateSessionInfo(sessionInfo: Partial<SessionInfo>): void {
    this.session = { ...this.session, ...sessionInfo };
  }
}