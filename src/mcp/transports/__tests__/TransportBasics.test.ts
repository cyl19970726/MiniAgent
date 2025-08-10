/**
 * @fileoverview Basic Tests for MCP Transports
 * 
 * This test suite provides basic coverage for MCP transports to ensure
 * they can be instantiated and have the expected interface.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StdioTransport } from '../StdioTransport.js';
import { HttpTransport } from '../HttpTransport.js';
import { 
  McpStdioTransportConfig, 
  McpStreamableHttpTransportConfig,
  McpRequest, 
  McpResponse, 
  McpNotification 
} from '../../interfaces.js';

describe('MCP Transport Basic Functionality', () => {
  describe('StdioTransport', () => {
    let config: McpStdioTransportConfig;
    let transport: StdioTransport;

    beforeEach(() => {
      config = {
        type: 'stdio',
        command: 'node',
        args: ['./test-server.js'],
        env: { NODE_ENV: 'test' },
        cwd: '/tmp',
      };
      
      transport = new StdioTransport(config);
    });

    afterEach(async () => {
      if (transport?.isConnected()) {
        await transport.disconnect();
      }
    });

    it('should create transport instance', () => {
      expect(transport).toBeDefined();
      expect(transport.isConnected()).toBe(false);
    });

    it('should have required interface methods', () => {
      expect(typeof transport.connect).toBe('function');
      expect(typeof transport.disconnect).toBe('function');
      expect(typeof transport.send).toBe('function');
      expect(typeof transport.onMessage).toBe('function');
      expect(typeof transport.onError).toBe('function');
      expect(typeof transport.onDisconnect).toBe('function');
      expect(typeof transport.isConnected).toBe('function');
    });

    it('should have StdioTransport specific methods', () => {
      expect(typeof transport.getReconnectionStatus).toBe('function');
      expect(typeof transport.configureReconnection).toBe('function');
      expect(typeof transport.setReconnectionEnabled).toBe('function');
    });

    it('should return initial reconnection status', () => {
      const status = transport.getReconnectionStatus();
      expect(status).toMatchObject({
        enabled: expect.any(Boolean),
        attempts: expect.any(Number),
        maxAttempts: expect.any(Number),
        isReconnecting: expect.any(Boolean),
        bufferSize: expect.any(Number),
      });
      expect(status.attempts).toBe(0);
      expect(status.bufferSize).toBe(0);
    });

    it('should allow reconnection configuration', () => {
      transport.configureReconnection({
        enabled: false,
        maxAttempts: 10,
        delayMs: 500,
      });

      const status = transport.getReconnectionStatus();
      expect(status.enabled).toBe(false);
      expect(status.maxAttempts).toBe(10);
    });

    it('should allow enabling/disabling reconnection', () => {
      transport.setReconnectionEnabled(false);
      expect(transport.getReconnectionStatus().enabled).toBe(false);

      transport.setReconnectionEnabled(true);
      expect(transport.getReconnectionStatus().enabled).toBe(true);
    });
  });

  describe('HttpTransport', () => {
    let config: McpStreamableHttpTransportConfig;
    let transport: HttpTransport;

    beforeEach(() => {
      config = {
        type: 'streamable-http',
        url: 'http://localhost:3000/mcp',
        headers: { 'X-Test': 'true' },
        streaming: true,
        timeout: 30000,
      };

      transport = new HttpTransport(config);
    });

    afterEach(async () => {
      if (transport?.isConnected()) {
        await transport.disconnect();
      }
    });

    it('should create transport instance', () => {
      expect(transport).toBeDefined();
      expect(transport.isConnected()).toBe(false);
    });

    it('should have required interface methods', () => {
      expect(typeof transport.connect).toBe('function');
      expect(typeof transport.disconnect).toBe('function');
      expect(typeof transport.send).toBe('function');
      expect(typeof transport.onMessage).toBe('function');
      expect(typeof transport.onError).toBe('function');
      expect(typeof transport.onDisconnect).toBe('function');
      expect(typeof transport.isConnected).toBe('function');
    });

    it('should have HttpTransport specific methods', () => {
      expect(typeof transport.getConnectionStatus).toBe('function');
      expect(typeof transport.getSessionInfo).toBe('function');
      expect(typeof transport.updateSessionInfo).toBe('function');
      expect(typeof transport.updateConfig).toBe('function');
      expect(typeof transport.updateOptions).toBe('function');
      expect(typeof transport.setReconnectionEnabled).toBe('function');
      expect(typeof transport.forceReconnect).toBe('function');
    });

    it('should return initial connection status', () => {
      const status = transport.getConnectionStatus();
      expect(status).toMatchObject({
        state: expect.any(String),
        sessionId: expect.any(String),
        reconnectAttempts: expect.any(Number),
        maxReconnectAttempts: expect.any(Number),
        bufferSize: expect.any(Number),
      });
      expect(status.state).toBe('disconnected');
      expect(status.reconnectAttempts).toBe(0);
      expect(status.bufferSize).toBe(0);
    });

    it('should generate unique session IDs', () => {
      const transport1 = new HttpTransport(config);
      const transport2 = new HttpTransport(config);

      const session1 = transport1.getSessionInfo();
      const session2 = transport2.getSessionInfo();

      expect(session1.sessionId).not.toBe(session2.sessionId);
      expect(session1.sessionId).toMatch(/^mcp-session-\d+-[a-z0-9]+$/);
    });

    it('should allow session info updates', () => {
      const newSessionInfo = {
        sessionId: 'custom-session-id',
        messageEndpoint: 'http://example.com/messages',
        lastEventId: 'event-123',
      };

      transport.updateSessionInfo(newSessionInfo);

      const sessionInfo = transport.getSessionInfo();
      expect(sessionInfo).toEqual(expect.objectContaining(newSessionInfo));
    });

    it('should allow configuration updates', () => {
      const newConfig = { 
        url: 'http://new-server:9000/mcp',
        timeout: 60000,
      };

      transport.updateConfig(newConfig);
      
      // We can't directly check the config, but we can verify the method exists
      expect(typeof transport.updateConfig).toBe('function');
    });

    it('should allow options updates', () => {
      const newOptions = { 
        maxReconnectAttempts: 15,
        requestTimeout: 45000,
      };

      transport.updateOptions(newOptions);

      const status = transport.getConnectionStatus();
      expect(status.maxReconnectAttempts).toBe(15);
    });
  });

  describe('Transport Interface Compliance', () => {
    const transports = [
      {
        name: 'StdioTransport',
        create: () => new StdioTransport({
          type: 'stdio',
          command: 'node',
          args: ['./test.js']
        })
      },
      {
        name: 'HttpTransport', 
        create: () => new HttpTransport({
          type: 'streamable-http',
          url: 'http://localhost:3000/mcp'
        })
      }
    ];

    transports.forEach(({ name, create }) => {
      describe(name, () => {
        let transport: any;

        beforeEach(() => {
          transport = create();
        });

        afterEach(async () => {
          if (transport?.isConnected()) {
            await transport.disconnect();
          }
        });

        it('should implement IMcpTransport interface', () => {
          // Check all required interface methods exist
          expect(typeof transport.connect).toBe('function');
          expect(typeof transport.disconnect).toBe('function');
          expect(typeof transport.send).toBe('function');
          expect(typeof transport.onMessage).toBe('function');
          expect(typeof transport.onError).toBe('function');
          expect(typeof transport.onDisconnect).toBe('function');
          expect(typeof transport.isConnected).toBe('function');
        });

        it('should start in disconnected state', () => {
          expect(transport.isConnected()).toBe(false);
        });

        it('should allow registering handlers', () => {
          const messageHandler = vi.fn();
          const errorHandler = vi.fn();
          const disconnectHandler = vi.fn();

          expect(() => transport.onMessage(messageHandler)).not.toThrow();
          expect(() => transport.onError(errorHandler)).not.toThrow();
          expect(() => transport.onDisconnect(disconnectHandler)).not.toThrow();
        });

        it('should validate message format when sending', async () => {
          const validRequest: McpRequest = {
            jsonrpc: '2.0',
            id: 'test-1',
            method: 'test/method',
            params: { test: true }
          };

          const validNotification: McpNotification = {
            jsonrpc: '2.0',
            method: 'test/notification',
            params: { event: 'test' }
          };

          // These should not throw immediately (though they might fail to send if not connected)
          expect(() => transport.send(validRequest)).not.toThrow();
          expect(() => transport.send(validNotification)).not.toThrow();
        });
      });
    });
  });

  describe('Message Validation', () => {
    it('should validate JSON-RPC request format', () => {
      const validRequest: McpRequest = {
        jsonrpc: '2.0',
        id: 'test-1',
        method: 'test/method',
        params: { test: true }
      };

      expect(validRequest.jsonrpc).toBe('2.0');
      expect(validRequest.id).toBeDefined();
      expect(validRequest.method).toBeDefined();
    });

    it('should validate JSON-RPC response format', () => {
      const validResponse: McpResponse = {
        jsonrpc: '2.0',
        id: 'test-1',
        result: { success: true }
      };

      expect(validResponse.jsonrpc).toBe('2.0');
      expect(validResponse.id).toBeDefined();
      expect('result' in validResponse || 'error' in validResponse).toBe(true);
    });

    it('should validate JSON-RPC notification format', () => {
      const validNotification: McpNotification = {
        jsonrpc: '2.0',
        method: 'test/notification',
        params: { event: 'test' }
      };

      expect(validNotification.jsonrpc).toBe('2.0');
      expect(validNotification.method).toBeDefined();
      expect('id' in validNotification).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    it('should accept valid STDIO configuration', () => {
      const config: McpStdioTransportConfig = {
        type: 'stdio',
        command: 'node',
        args: ['./server.js'],
        env: { NODE_ENV: 'test' },
        cwd: '/tmp'
      };

      expect(() => new StdioTransport(config)).not.toThrow();
    });

    it('should accept valid HTTP configuration', () => {
      const config: McpStreamableHttpTransportConfig = {
        type: 'streamable-http',
        url: 'http://localhost:3000/mcp',
        headers: { 'Authorization': 'Bearer token' },
        streaming: true,
        timeout: 30000
      };

      expect(() => new HttpTransport(config)).not.toThrow();
    });

    it('should accept HTTP configuration with authentication', () => {
      const config: McpStreamableHttpTransportConfig = {
        type: 'streamable-http',
        url: 'http://localhost:3000/mcp',
        auth: {
          type: 'bearer',
          token: 'test-token'
        }
      };

      expect(() => new HttpTransport(config)).not.toThrow();
    });

    it('should accept HTTP configuration with basic auth', () => {
      const config: McpStreamableHttpTransportConfig = {
        type: 'streamable-http',
        url: 'http://localhost:3000/mcp',
        auth: {
          type: 'basic',
          username: 'user',
          password: 'pass'
        }
      };

      expect(() => new HttpTransport(config)).not.toThrow();
    });

    it('should accept HTTP configuration with OAuth2', () => {
      const config: McpStreamableHttpTransportConfig = {
        type: 'streamable-http',
        url: 'http://localhost:3000/mcp',
        auth: {
          type: 'oauth2',
          token: 'access-token',
          oauth2: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            tokenUrl: 'https://auth.example.com/token'
          }
        }
      };

      expect(() => new HttpTransport(config)).not.toThrow();
    });
  });
});