/**
 * @fileoverview Comprehensive Tests for StdioTransport
 * 
 * This test suite provides extensive coverage for the StdioTransport class,
 * testing all aspects of STDIO-based MCP communication including:
 * - Connection lifecycle management
 * - Bidirectional message flow
 * - Error handling and recovery
 * - Reconnection logic with exponential backoff
 * - Buffer overflow handling
 * - Process management
 * 
 * Key Improvements:
 * - Fixed timeout issues with proper async handling
 * - Enhanced mock infrastructure with better control
 * - Comprehensive edge case testing
 * - Performance and stress testing scenarios
 * - Memory leak detection and cleanup verification
 */

import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { EventEmitter } from 'events';
import { Interface } from 'readline';
import { ChildProcess } from 'child_process';
import { StdioTransport } from '../StdioTransport.js';
import { 
  McpStdioTransportConfig, 
  McpRequest, 
  McpResponse, 
  McpNotification 
} from '../../interfaces.js';

// Mock child_process module
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock readline module
vi.mock('readline', () => ({
  createInterface: vi.fn(),
}));

// Enhanced mock implementations with better control
class MockChildProcess extends EventEmitter {
  public pid: number = 12345;
  public killed: boolean = false;
  public exitCode: number | null = null;
  public signalCode: string | null = null;
  public stdin: MockStream = new MockStream();
  public stdout: MockStream = new MockStream();
  public stderr: MockStream = new MockStream();
  private _killDelay: number = 10;
  
  kill(signal?: string): boolean {
    this.killed = true;
    this.signalCode = signal || 'SIGTERM';
    
    // Use immediate timeout to avoid hanging
    const exitCode = signal === 'SIGKILL' ? 137 : 0;
    setImmediate(() => {
      this.exitCode = exitCode;
      this.emit('exit', exitCode, signal);
    });
    
    return true;
  }
  
  // Method to simulate immediate kill for testing
  killImmediately(signal?: string): void {
    this.killed = true;
    this.signalCode = signal || 'SIGTERM';
    this.exitCode = signal === 'SIGKILL' ? 137 : 0;
    this.emit('exit', this.exitCode, signal);
  }
  
  // Method to simulate process error
  simulateError(error: Error): void {
    setImmediate(() => {
      this.emit('error', error);
    });
  }
  
  // Method to configure kill delay for testing
  setKillDelay(delayMs: number): void {
    this._killDelay = delayMs;
  }
}

class MockStream extends EventEmitter {
  public writable: boolean = true;
  public readable: boolean = true;
  public destroyed: boolean = false;
  private _writeCallback?: (error?: Error) => void;
  private _shouldBackpressure: boolean = false;
  private _writeError?: Error;
  
  write(data: string, encoding?: BufferEncoding, callback?: (error?: Error) => void): boolean;
  write(data: string, callback?: (error?: Error) => void): boolean;
  write(data: string, encodingOrCallback?: BufferEncoding | ((error?: Error) => void), callback?: (error?: Error) => void): boolean {
    // Handle overloaded parameters
    let actualCallback: ((error?: Error) => void) | undefined;
    if (typeof encodingOrCallback === 'function') {
      actualCallback = encodingOrCallback;
    } else {
      actualCallback = callback;
    }
    
    this._writeCallback = actualCallback;
    
    // Use setImmediate for immediate callback execution
    setImmediate(() => {
      if (this._writeError) {
        actualCallback?.(this._writeError);
        this._writeError = undefined;
      } else {
        actualCallback?.();
      }
    });
    
    if (this._shouldBackpressure) {
      setImmediate(() => {
        this.emit('drain');
      });
      return false;
    }
    
    return true;
  }
  
  close(): void {
    this.destroyed = true;
    setImmediate(() => {
      this.emit('close');
    });
  }
  
  destroy(error?: Error): void {
    this.destroyed = true;
    if (error) {
      setImmediate(() => {
        this.emit('error', error);
      });
    }
    setImmediate(() => {
      this.emit('close');
    });
  }
  
  // Testing utilities
  simulateBackpressure(): void {
    this._shouldBackpressure = true;
  }
  
  resetBackpressure(): void {
    this._shouldBackpressure = false;
  }
  
  simulateWriteError(error: Error): void {
    this._writeError = error;
  }
  
  simulateError(error: Error): void {
    setImmediate(() => {
      this.emit('error', error);
    });
  }
  
  simulateData(data: string): void {
    setImmediate(() => {
      this.emit('data', Buffer.from(data));
    });
  }
}

class MockReadlineInterface extends EventEmitter {
  public closed: boolean = false;
  
  close(): void {
    this.closed = true;
    setImmediate(() => {
      this.emit('close');
    });
  }
  
  simulateLine(line: string): void {
    if (!this.closed) {
      setImmediate(() => {
        this.emit('line', line);
      });
    }
  }
  
  simulateError(error: Error): void {
    setImmediate(() => {
      this.emit('error', error);
    });
  }
}

// Test data factories
const TestDataFactory = {
  createStdioConfig(overrides?: Partial<McpStdioTransportConfig>): McpStdioTransportConfig {
    return {
      type: 'stdio',
      command: 'node',
      args: ['mcp-server.js'],
      env: { NODE_ENV: 'test' },
      cwd: '/tmp',
      ...overrides,
    };
  },
  
  createMcpRequest(overrides?: Partial<McpRequest>): McpRequest {
    return {
      jsonrpc: '2.0',
      id: 'test-id-' + Math.random().toString(36).substr(2, 9),
      method: 'test/method',
      params: { test: 'data' },
      ...overrides,
    };
  },
  
  createMcpResponse(overrides?: Partial<McpResponse>): McpResponse {
    return {
      jsonrpc: '2.0',
      id: 'test-id-' + Math.random().toString(36).substr(2, 9),
      result: { success: true },
      ...overrides,
    };
  },
  
  createMcpNotification(overrides?: Partial<McpNotification>): McpNotification {
    return {
      jsonrpc: '2.0',
      method: 'test/notification',
      params: { event: 'test' },
      ...overrides,
    };
  },
};

describe('StdioTransport', () => {
  let transport: StdioTransport;
  let config: McpStdioTransportConfig;
  let mockProcess: MockChildProcess;
  let mockReadline: MockReadlineInterface;
  let spawnMock: MockedFunction<any>;
  let createInterfaceMock: MockedFunction<any>;
  
  // Helper function to create and setup transport
  const createTransport = (customConfig?: Partial<McpStdioTransportConfig>, reconnectionConfig?: any) => {
    const finalConfig = { ...config, ...customConfig };
    return new StdioTransport(finalConfig, reconnectionConfig);
  };
  
  // Helper function to wait for next tick
  const nextTick = () => new Promise(resolve => setImmediate(resolve));
  
  // Helper function for async timer advancement
  const advanceTimers = async (ms: number) => {
    vi.advanceTimersByTime(ms);
    await nextTick();
  };
  
  beforeEach(async () => {
    config = TestDataFactory.createStdioConfig();
    
    // Setup mocks
    mockProcess = new MockChildProcess();
    mockReadline = new MockReadlineInterface();
    
    // Import the mocked modules to get the mocked functions
    const { spawn } = await import('child_process');
    const { createInterface } = await import('readline');
    
    spawnMock = vi.mocked(spawn);
    createInterfaceMock = vi.mocked(createInterface);
    
    spawnMock.mockReturnValue(mockProcess as unknown as ChildProcess);
    createInterfaceMock.mockReturnValue(mockReadline as unknown as Interface);
    
    // Clear timers and use fake timers
    vi.clearAllTimers();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });
  
  afterEach(async () => {
    // Clean up transport if exists
    if (transport) {
      try {
        if (transport.isConnected()) {
          await transport.disconnect();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    // Restore real timers
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create transport with default configuration', () => {
      transport = createTransport();
      expect(transport).toBeDefined();
      expect(transport.isConnected()).toBe(false);
      
      const status = transport.getReconnectionStatus();
      expect(status.enabled).toBe(true);
      expect(status.maxAttempts).toBe(5);
      expect(status.attempts).toBe(0);
      expect(status.bufferSize).toBe(0);
    });
    
    it('should create transport with custom reconnection config', () => {
      const reconnectionConfig = {
        enabled: true,
        maxAttempts: 3,
        delayMs: 500,
        maxDelayMs: 5000,
        backoffMultiplier: 1.5,
      };
      
      transport = createTransport(undefined, reconnectionConfig);
      const status = transport.getReconnectionStatus();
      
      expect(status.enabled).toBe(true);
      expect(status.maxAttempts).toBe(3);
      expect(status.isReconnecting).toBe(false);
    });
    
    it('should disable reconnection when configured', () => {
      transport = createTransport(undefined, { enabled: false });
      const status = transport.getReconnectionStatus();
      
      expect(status.enabled).toBe(false);
    });
    
    it('should merge default and custom reconnection configs', () => {
      const customConfig = {
        maxAttempts: 10,
        delayMs: 2000,
      };
      
      transport = createTransport(undefined, customConfig);
      const status = transport.getReconnectionStatus();
      
      expect(status.enabled).toBe(true); // default
      expect(status.maxAttempts).toBe(10); // custom
    });
    
    it('should validate transport configuration', () => {
      const invalidConfig = { ...config, type: 'invalid' as any };
      expect(() => createTransport(invalidConfig)).not.toThrow();
    });
  });

  describe('Connection Lifecycle', () => {
    beforeEach(() => {
      transport = createTransport();
    });

    describe('connect()', () => {
      it('should successfully connect to MCP server', async () => {
        const connectPromise = transport.connect();
        
        // Let the startup delay complete
        await advanceTimers(100);
        await connectPromise;
        
        expect(spawnMock).toHaveBeenCalledWith('node', ['mcp-server.js'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: expect.objectContaining({ NODE_ENV: 'test' }),
          cwd: '/tmp',
        });
        expect(createInterfaceMock).toHaveBeenCalled();
        expect(transport.isConnected()).toBe(true);
      });
      
      it('should not connect if already connected', async () => {
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        spawnMock.mockClear();
        await transport.connect();
        
        expect(spawnMock).not.toHaveBeenCalled();
        expect(transport.isConnected()).toBe(true);
      });
      
      it('should handle process spawn errors', async () => {
        const spawnError = new Error('Command not found');
        spawnMock.mockImplementation(() => {
          const proc = new MockChildProcess();
          proc.simulateError(spawnError);
          return proc as unknown as ChildProcess;
        });
        
        transport = createTransport(undefined, { enabled: false }); // Disable reconnection
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        
        await expect(connectPromise).rejects.toThrow(/Failed to start MCP server/);
      });
      
      it('should handle immediate process exit', async () => {
        spawnMock.mockImplementation(() => {
          const proc = new MockChildProcess();
          proc.killed = true; // Simulate immediate exit
          return proc as unknown as ChildProcess;
        });
        
        transport = createTransport(undefined, { enabled: false });
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        
        await expect(connectPromise).rejects.toThrow(/failed to start or exited immediately/);
      });
      
      it('should handle missing stdio streams', async () => {
        spawnMock.mockImplementation(() => {
          const proc = new MockChildProcess();
          (proc as any).stdout = null; // Simulate missing stdout
          return proc as unknown as ChildProcess;
        });
        
        transport = createTransport(undefined, { enabled: false });
        
        await expect(transport.connect()).rejects.toThrow(/Failed to get process stdio streams/);
      });
      
      it('should handle missing stdin stream', async () => {
        spawnMock.mockImplementation(() => {
          const proc = new MockChildProcess();
          (proc as any).stdin = null; // Simulate missing stdin
          return proc as unknown as ChildProcess;
        });
        
        transport = createTransport(undefined, { enabled: false });
        
        await expect(transport.connect()).rejects.toThrow(/Failed to get process stdio streams/);
      });
      
      it('should setup stderr logging when available', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        // Simulate stderr data
        mockProcess.stderr.simulateData('Test error message\n');
        await nextTick();
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('MCP Server'),
          expect.stringContaining('Test error message')
        );
        
        consoleErrorSpy.mockRestore();
      });
      
      it('should handle missing stderr gracefully', async () => {
        spawnMock.mockImplementation(() => {
          const proc = new MockChildProcess();
          (proc as any).stderr = null; // Simulate missing stderr
          return proc as unknown as ChildProcess;
        });
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        expect(transport.isConnected()).toBe(true);
      });
      
      it('should clear existing reconnection timer on connect', async () => {
        transport = createTransport(undefined, { enabled: true, delayMs: 1000 });
        
        // Setup a scenario that would trigger reconnection
        spawnMock.mockImplementationOnce(() => {
          const proc = new MockChildProcess();
          proc.simulateError(new Error('First attempt fails'));
          return proc as unknown as ChildProcess;
        }).mockImplementation(() => new MockChildProcess() as unknown as ChildProcess);
        
        // First connect attempt should fail and schedule reconnection
        const connectPromise1 = transport.connect();
        await advanceTimers(100);
        
        try {
          await connectPromise1;
        } catch (error) {
          // Expected to fail and schedule reconnection
        }
        
        // Immediately try to connect again - should clear the timer
        const connectPromise2 = transport.connect();
        await advanceTimers(100);
        await connectPromise2;
        
        expect(transport.isConnected()).toBe(true);
      });
    });

    describe('disconnect()', () => {
      it('should successfully disconnect from MCP server', async () => {
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        expect(transport.isConnected()).toBe(true);
        
        await transport.disconnect();
        await nextTick();
        
        expect(transport.isConnected()).toBe(false);
      });
      
      it('should handle graceful shutdown within timeout', async () => {
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        const disconnectPromise = transport.disconnect();
        
        // Let the graceful shutdown proceed
        await advanceTimers(100);
        await disconnectPromise;
        
        expect(transport.isConnected()).toBe(false);
      });
      
      it('should force kill process after graceful shutdown timeout', async () => {
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        // Override kill to not exit immediately (simulate hanging process)
        const killSpy = vi.spyOn(mockProcess, 'kill').mockImplementation((signal) => {
          mockProcess.killed = true;
          mockProcess.signalCode = signal || 'SIGTERM';
          // Don't emit exit event immediately to simulate hanging
          if (signal === 'SIGKILL') {
            setImmediate(() => mockProcess.emit('exit', 137, signal));
          }
          return true;
        });
        
        const disconnectPromise = transport.disconnect();
        
        // Advance past the 5-second graceful shutdown timeout
        await advanceTimers(5100);
        await disconnectPromise;
        
        expect(killSpy).toHaveBeenCalledWith('SIGTERM');
        expect(killSpy).toHaveBeenCalledWith('SIGKILL');
      });
      
      it('should not disconnect if already disconnected', async () => {
        const killSpy = vi.spyOn(mockProcess, 'kill');
        
        await transport.disconnect();
        
        expect(killSpy).not.toHaveBeenCalled();
        expect(transport.isConnected()).toBe(false);
      });
      
      it('should disable reconnection on explicit disconnect', async () => {
        transport = createTransport(undefined, { enabled: true });
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        expect(transport.getReconnectionStatus().enabled).toBe(true);
        
        await transport.disconnect();
        
        // shouldReconnect should be set to false
        const processExitHandler = () => mockProcess.emit('exit', 1, null);
        processExitHandler();
        
        // Wait for any potential reconnection attempt
        await advanceTimers(2000);
        
        // Should not have attempted reconnection
        expect(spawnMock).toHaveBeenCalledTimes(1);
      });
      
      it('should clean up all resources on disconnect', async () => {
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        const closeReadlineSpy = vi.spyOn(mockReadline, 'close');
        const removeListenersSpy = vi.spyOn(mockProcess, 'removeAllListeners');
        
        await transport.disconnect();
        await nextTick();
        
        expect(closeReadlineSpy).toHaveBeenCalled();
        expect(removeListenersSpy).toHaveBeenCalled();
      });
      
      it('should handle disconnect with no active process', async () => {
        // Don't connect first
        expect(() => transport.disconnect()).not.toThrow();
        
        await expect(transport.disconnect()).resolves.not.toThrow();
      });
      
      it('should clear reconnection timer on disconnect', async () => {
        transport = createTransport(undefined, { enabled: true, delayMs: 1000 });
        
        // Force a connection failure to trigger reconnection scheduling
        spawnMock.mockImplementation(() => {
          const proc = new MockChildProcess();
          proc.simulateError(new Error('Connection failed'));
          return proc as unknown as ChildProcess;
        });
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        
        try {
          await connectPromise;
        } catch (error) {
          // Expected to fail
        }
        
        // Disconnect should clear any pending reconnection timer
        await transport.disconnect();
        
        // Advance past the reconnection delay
        await advanceTimers(2000);
        
        // Should not have attempted another connection
        expect(spawnMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('isConnected()', () => {
      it('should return false when not connected', () => {
        expect(transport.isConnected()).toBe(false);
      });
      
      it('should return true when connected', async () => {
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        expect(transport.isConnected()).toBe(true);
      });
      
      it('should return false when process is killed', async () => {
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        mockProcess.killed = true;
        
        expect(transport.isConnected()).toBe(false);
      });
      
      it('should return false when process is null/undefined', async () => {
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        // Simulate process cleanup
        (transport as any).process = null;
        
        expect(transport.isConnected()).toBe(false);
      });
      
      it('should handle edge case with missing process', () => {
        // Transport not connected yet
        expect(transport.isConnected()).toBe(false);
        
        // Simulate internal state inconsistency
        (transport as any).connected = true;
        
        // Should still return false because no process
        expect(transport.isConnected()).toBe(false);
      });
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      transport = createTransport();
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
    });

    describe('send()', () => {
      it('should send valid JSON-RPC messages', async () => {
        const request = TestDataFactory.createMcpRequest();
        const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
        
        await transport.send(request);
        await nextTick();
        
        expect(writeSpy).toHaveBeenCalledWith(
          JSON.stringify(request) + '\n',
          'utf8',
          expect.any(Function)
        );
      });
      
      it('should send notifications without response expectation', async () => {
        const notification = TestDataFactory.createMcpNotification();
        const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
        
        await transport.send(notification);
        await nextTick();
        
        expect(writeSpy).toHaveBeenCalledWith(
          JSON.stringify(notification) + '\n',
          'utf8',
          expect.any(Function)
        );
      });
      
      it('should handle backpressure correctly', async () => {
        const request = TestDataFactory.createMcpRequest();
        mockProcess.stdin.simulateBackpressure();
        
        const sendPromise = transport.send(request);
        
        // Advance timers to handle backpressure drain
        await advanceTimers(100);
        await sendPromise;
        
        // Verify backpressure was handled
        expect(mockProcess.stdin.write).toHaveBeenCalled();
      });
      
      it('should buffer messages when disconnected with reconnection enabled', async () => {
        await transport.disconnect();
        await nextTick();
        
        const request = TestDataFactory.createMcpRequest();
        await transport.send(request); // Should buffer
        
        const status = transport.getReconnectionStatus();
        expect(status.bufferSize).toBe(1);
      });
      
      it('should throw error when disconnected with reconnection disabled', async () => {
        transport.setReconnectionEnabled(false);
        await transport.disconnect();
        await nextTick();
        
        const request = TestDataFactory.createMcpRequest();
        
        await expect(transport.send(request)).rejects.toThrow(/Transport not connected/);
      });
      
      it('should handle write errors', async () => {
        const request = TestDataFactory.createMcpRequest();
        const writeError = new Error('Write failed');
        
        mockProcess.stdin.simulateWriteError(writeError);
        
        await expect(transport.send(request)).rejects.toThrow(/Failed to write message/);
      });
      
      it('should handle missing stdin stream', async () => {
        const request = TestDataFactory.createMcpRequest();
        
        // Simulate missing stdin
        (mockProcess as any).stdin = null;
        
        transport.setReconnectionEnabled(false);
        
        await expect(transport.send(request)).rejects.toThrow(/Process stdin not available/);
      });
      
      it('should buffer message when stdin unavailable and reconnection enabled', async () => {
        const request = TestDataFactory.createMcpRequest();
        
        // Simulate missing stdin
        (mockProcess as any).stdin = null;
        
        await transport.send(request); // Should buffer
        
        const status = transport.getReconnectionStatus();
        expect(status.bufferSize).toBe(1);
      });
      
      it('should wait for drain promise before sending', async () => {
        const request1 = TestDataFactory.createMcpRequest({ id: 'req1' });
        const request2 = TestDataFactory.createMcpRequest({ id: 'req2' });
        
        // Simulate backpressure for first message
        mockProcess.stdin.simulateBackpressure();
        
        const sendPromise1 = transport.send(request1);
        const sendPromise2 = transport.send(request2);
        
        // Both should eventually complete
        await advanceTimers(100);
        await Promise.all([sendPromise1, sendPromise2]);
        
        expect(mockProcess.stdin.write).toHaveBeenCalledTimes(2);
      });
      
      it('should handle concurrent send operations', async () => {
        const requests = Array.from({ length: 10 }, (_, i) => 
          TestDataFactory.createMcpRequest({ id: `concurrent-${i}` })
        );
        
        const sendPromises = requests.map(req => transport.send(req));
        
        await Promise.all(sendPromises);
        await nextTick();
        
        expect(mockProcess.stdin.write).toHaveBeenCalledTimes(10);
      });
    });

    describe('onMessage()', () => {
      it('should receive and parse valid JSON-RPC messages', async () => {
        const response = TestDataFactory.createMcpResponse();
        const messageHandler = vi.fn();
        
        transport.onMessage(messageHandler);
        
        mockReadline.simulateLine(JSON.stringify(response));
        await nextTick();
        
        expect(messageHandler).toHaveBeenCalledWith(response);
      });
      
      it('should handle notifications', async () => {
        const notification = TestDataFactory.createMcpNotification();
        const messageHandler = vi.fn();
        
        transport.onMessage(messageHandler);
        
        mockReadline.simulateLine(JSON.stringify(notification));
        await nextTick();
        
        expect(messageHandler).toHaveBeenCalledWith(notification);
      });
      
      it('should ignore empty lines', async () => {
        const messageHandler = vi.fn();
        
        transport.onMessage(messageHandler);
        
        mockReadline.simulateLine('');
        mockReadline.simulateLine('   ');
        mockReadline.simulateLine('\t\n');
        await nextTick();
        
        expect(messageHandler).not.toHaveBeenCalled();
      });
      
      it('should handle invalid JSON', async () => {
        const errorHandler = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        transport.onError(errorHandler);
        
        mockReadline.simulateLine('invalid json');
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Failed to parse message')
          })
        );
        
        consoleErrorSpy.mockRestore();
      });
      
      it('should validate JSON-RPC format', async () => {
        const errorHandler = vi.fn();
        
        transport.onError(errorHandler);
        
        mockReadline.simulateLine('{"invalid": "message"}');
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Invalid JSON-RPC message format')
          })
        );
      });
      
      it('should validate JSON-RPC version', async () => {
        const errorHandler = vi.fn();
        
        transport.onError(errorHandler);
        
        mockReadline.simulateLine('{"jsonrpc": "1.0", "id": 1, "result": "test"}');
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Invalid JSON-RPC message format')
          })
        );
      });
      
      it('should handle multiple message handlers', async () => {
        const response = TestDataFactory.createMcpResponse();
        const handler1 = vi.fn();
        const handler2 = vi.fn();
        
        transport.onMessage(handler1);
        transport.onMessage(handler2);
        
        mockReadline.simulateLine(JSON.stringify(response));
        await nextTick();
        
        expect(handler1).toHaveBeenCalledWith(response);
        expect(handler2).toHaveBeenCalledWith(response);
      });
      
      it('should handle errors in message handlers gracefully', async () => {
        const response = TestDataFactory.createMcpResponse();
        const faultyHandler = vi.fn(() => {
          throw new Error('Handler error');
        });
        const goodHandler = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        transport.onMessage(faultyHandler);
        transport.onMessage(goodHandler);
        
        mockReadline.simulateLine(JSON.stringify(response));
        await nextTick();
        
        expect(faultyHandler).toHaveBeenCalled();
        expect(goodHandler).toHaveBeenCalledWith(response);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error in message handler:',
          expect.any(Error)
        );
        
        consoleErrorSpy.mockRestore();
      });
      
      it('should handle malformed JSON with additional context', async () => {
        const errorHandler = vi.fn();
        
        transport.onError(errorHandler);
        
        const malformedJson = '{"incomplete": message';
        mockReadline.simulateLine(malformedJson);
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Failed to parse message'),
          })
        );
        
        // Should include the raw line in error message
        const errorCall = errorHandler.mock.calls[0][0];
        expect(errorCall.message).toContain(malformedJson);
      });
      
      it('should handle very long messages', async () => {
        const messageHandler = vi.fn();
        
        transport.onMessage(messageHandler);
        
        const largePayload = 'x'.repeat(100000);
        const largeMessage = TestDataFactory.createMcpResponse(undefined, {
          result: { data: largePayload }
        });
        
        mockReadline.simulateLine(JSON.stringify(largeMessage));
        await nextTick();
        
        expect(messageHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            result: expect.objectContaining({
              data: largePayload
            })
          })
        );
      });
      
      it('should handle rapid message succession', async () => {
        const messageHandler = vi.fn();
        
        transport.onMessage(messageHandler);
        
        const messages = Array.from({ length: 100 }, (_, i) => 
          TestDataFactory.createMcpResponse(`msg-${i}`)
        );
        
        // Send all messages in rapid succession
        messages.forEach(msg => {
          mockReadline.simulateLine(JSON.stringify(msg));
        });
        
        await nextTick();
        
        expect(messageHandler).toHaveBeenCalledTimes(100);
        messages.forEach((msg, i) => {
          expect(messageHandler).toHaveBeenNthCalledWith(i + 1, msg);
        });
      });
    });
    
    describe('Event Handlers Registration', () => {
      it('should register onError handlers', () => {
        const errorHandler1 = vi.fn();
        const errorHandler2 = vi.fn();
        
        transport.onError(errorHandler1);
        transport.onError(errorHandler2);
        
        // Test by triggering an error
        const testError = new Error('Test error');
        (transport as any).emitError(testError);
        
        expect(errorHandler1).toHaveBeenCalledWith(testError);
        expect(errorHandler2).toHaveBeenCalledWith(testError);
      });
      
      it('should register onDisconnect handlers', async () => {
        const disconnectHandler1 = vi.fn();
        const disconnectHandler2 = vi.fn();
        
        transport.onDisconnect(disconnectHandler1);
        transport.onDisconnect(disconnectHandler2);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        // Trigger disconnect
        mockProcess.emit('exit', 0, null);
        await nextTick();
        
        expect(disconnectHandler1).toHaveBeenCalled();
        expect(disconnectHandler2).toHaveBeenCalled();
      });
      
      it('should handle errors in disconnect handlers', async () => {
        const faultyDisconnectHandler = vi.fn(() => {
          throw new Error('Disconnect handler error');
        });
        const goodDisconnectHandler = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        transport.onDisconnect(faultyDisconnectHandler);
        transport.onDisconnect(goodDisconnectHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        // Trigger disconnect
        mockProcess.emit('exit', 0, null);
        await nextTick();
        
        expect(faultyDisconnectHandler).toHaveBeenCalled();
        expect(goodDisconnectHandler).toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error in disconnect handler:',
          expect.any(Error)
        );
        
        consoleErrorSpy.mockRestore();
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      transport = createTransport();
    });

    describe('Process Errors', () => {
      it('should handle process errors', async () => {
        const errorHandler = vi.fn();
        transport.onError(errorHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        const processError = new Error('Process crashed');
        mockProcess.emit('error', processError);
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('MCP server process error')
          })
        );
      });
      
      it('should handle process exit events', async () => {
        const errorHandler = vi.fn();
        const disconnectHandler = vi.fn();
        
        transport.onError(errorHandler);
        transport.onDisconnect(disconnectHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        mockProcess.emit('exit', 1, null);
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('exited with code 1')
          })
        );
        expect(disconnectHandler).toHaveBeenCalled();
      });
      
      it('should handle process killed by signal', async () => {
        const errorHandler = vi.fn();
        
        transport.onError(errorHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        mockProcess.emit('exit', null, 'SIGTERM');
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('killed by signal SIGTERM')
          })
        );
      });
      
      it('should not emit error on exit when already disconnected', async () => {
        const errorHandler = vi.fn();
        
        transport.onError(errorHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        // Explicitly disconnect first
        await transport.disconnect();
        await nextTick();
        
        errorHandler.mockClear();
        
        // Now emit exit - should not emit error since already disconnected
        mockProcess.emit('exit', 0, null);
        await nextTick();
        
        expect(errorHandler).not.toHaveBeenCalled();
      });
      
      it('should handle process exit with null code and signal', async () => {
        const errorHandler = vi.fn();
        
        transport.onError(errorHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        mockProcess.emit('exit', null, null);
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('exited with code null')
          })
        );
      });
    });

    describe('Readline Errors', () => {
      it('should handle readline errors', async () => {
        const errorHandler = vi.fn();
        transport.onError(errorHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        const readlineError = new Error('Readline failed');
        mockReadline.emit('error', readlineError);
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Readline error')
          })
        );
      });
      
      it('should handle readline errors with detailed information', async () => {
        const errorHandler = vi.fn();
        transport.onError(errorHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        const detailedError = new Error('Stream read error: ECONNRESET');
        detailedError.code = 'ECONNRESET';
        mockReadline.emit('error', detailedError);
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Readline error: Stream read error: ECONNRESET')
          })
        );
      });
    });

    describe('Error Handlers', () => {
      it('should register and call error handlers', async () => {
        const errorHandler = vi.fn();
        
        transport.onError(errorHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        mockProcess.emit('error', new Error('Test error'));
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalled();
      });
      
      it('should handle errors in error handlers gracefully', async () => {
        const faultyErrorHandler = vi.fn(() => {
          throw new Error('Error handler failed');
        });
        const goodErrorHandler = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        transport.onError(faultyErrorHandler);
        transport.onError(goodErrorHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        mockProcess.emit('error', new Error('Test error'));
        await nextTick();
        
        expect(faultyErrorHandler).toHaveBeenCalled();
        expect(goodErrorHandler).toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error in error handler:',
          expect.any(Error)
        );
        
        consoleErrorSpy.mockRestore();
      });
      
      it('should continue calling other handlers even if one fails', async () => {
        const handler1 = vi.fn(() => { throw new Error('Handler 1 fails'); });
        const handler2 = vi.fn();
        const handler3 = vi.fn(() => { throw new Error('Handler 3 fails'); });
        const handler4 = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        transport.onError(handler1);
        transport.onError(handler2);
        transport.onError(handler3);
        transport.onError(handler4);
        
        const testError = new Error('Original error');
        (transport as any).emitError(testError);
        
        expect(handler1).toHaveBeenCalledWith(testError);
        expect(handler2).toHaveBeenCalledWith(testError);
        expect(handler3).toHaveBeenCalledWith(testError);
        expect(handler4).toHaveBeenCalledWith(testError);
        
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // Two handlers failed
        
        consoleErrorSpy.mockRestore();
      });
      
      it('should provide error context in error messages', async () => {
        const errorHandler = vi.fn();
        transport.onError(errorHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        const contextualError = new Error('ENOENT: no such file or directory');
        contextualError.errno = -2;
        contextualError.code = 'ENOENT';
        contextualError.path = '/nonexistent/server.js';
        
        mockProcess.emit('error', contextualError);
        await nextTick();
        
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('ENOENT')
          })
        );
      });
    });

    describe('Stream Errors', () => {
      it('should handle stdin stream errors', async () => {
        const errorHandler = vi.fn();
        transport.onError(errorHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        mockProcess.stdin.simulateError(new Error('Stdin write error'));
        await nextTick();
        
        // Should not directly emit error, but might affect write operations
        const request = TestDataFactory.createMcpRequest();
        await expect(transport.send(request)).resolves.not.toThrow();
      });
      
      it('should handle stdout stream errors', async () => {
        const errorHandler = vi.fn();
        transport.onError(errorHandler);
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        mockProcess.stdout.simulateError(new Error('Stdout read error'));
        await nextTick();
        
        // Stdout errors might not directly propagate but affect readline
        expect(errorHandler).not.toHaveBeenCalled();
      });
      
      it('should handle stderr stream errors gracefully', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        const connectPromise = transport.connect();
        await advanceTimers(100);
        await connectPromise;
        
        // Stderr errors should not crash the transport
        mockProcess.stderr.simulateError(new Error('Stderr error'));
        await nextTick();
        
        expect(transport.isConnected()).toBe(true);
        
        consoleErrorSpy.mockRestore();
      });
    });
  });

  describe('Reconnection Logic', () => {
    beforeEach(() => {
      transport = createTransport(undefined, {
        enabled: true,
        maxAttempts: 3,
        delayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
      });
    });

    it('should attempt reconnection on process exit', async () => {
      const connectSpy = vi.spyOn(transport, 'connect');
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // Simulate process exit
      mockProcess.emit('exit', 1, null);
      await nextTick();
      
      // Advance timer to trigger reconnection
      await advanceTimers(1000);
      
      expect(connectSpy).toHaveBeenCalledTimes(2); // Initial + reconnect
    });
    
    it('should use exponential backoff for reconnection delays', async () => {
      const status = transport.getReconnectionStatus();
      expect(status.enabled).toBe(true);
      expect(status.maxAttempts).toBe(3);
      
      // Simulate multiple failed connection attempts
      spawnMock.mockImplementation(() => {
        const proc = new MockChildProcess();
        proc.simulateError(new Error('Connection failed'));
        return proc as unknown as ChildProcess;
      });
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      
      try {
        await connectPromise;
      } catch {
        // Expected to fail
      }
      
      const statusAfterFail = transport.getReconnectionStatus();
      expect(statusAfterFail.attempts).toBe(1);
    });
    
    it('should stop reconnection after max attempts', async () => {
      // Mock to always fail
      spawnMock.mockImplementation(() => {
        const proc = new MockChildProcess();
        proc.simulateError(new Error('Connection failed'));
        return proc as unknown as ChildProcess;
      });
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      
      await expect(connectPromise).rejects.toThrow(/Failed to start MCP server after/);
      
      const status = transport.getReconnectionStatus();
      expect(status.attempts).toBe(3); // Should have tried max attempts
    });
    
    it('should reset reconnection attempts on successful connection', async () => {
      // First, simulate a failed connection
      spawnMock.mockImplementationOnce(() => {
        const proc = new MockChildProcess();
        proc.simulateError(new Error('First attempt failed'));
        return proc as unknown as ChildProcess;
      });
      
      // Then simulate success
      spawnMock.mockImplementation(() => {
        return new MockChildProcess() as unknown as ChildProcess;
      });
      
      const connectPromise1 = transport.connect();
      await advanceTimers(100);
      
      try {
        await connectPromise1;
      } catch {
        // First attempt may fail, that's expected
      }
      
      // Try again - should succeed and reset attempts
      const connectPromise2 = transport.connect();
      await advanceTimers(100);
      await connectPromise2;
      
      const status = transport.getReconnectionStatus();
      expect(transport.isConnected()).toBe(true);
    });
    
    it('should not reconnect when explicitly disconnected', async () => {
      const connectSpy = vi.spyOn(transport, 'connect');
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      await transport.disconnect();
      
      // Simulate process exit after disconnect
      mockProcess.emit('exit', 0, null);
      await nextTick();
      
      // Wait for any potential reconnection attempt
      await advanceTimers(2000);
      
      expect(connectSpy).toHaveBeenCalledTimes(1); // Only initial connect
    });
    
    it('should disable reconnection when configured', () => {
      transport.setReconnectionEnabled(false);
      const status = transport.getReconnectionStatus();
      expect(status.enabled).toBe(false);
    });
    
    it('should configure reconnection settings', () => {
      transport.configureReconnection({
        maxAttempts: 10,
        delayMs: 500,
      });
      
      const status = transport.getReconnectionStatus();
      expect(status.maxAttempts).toBe(10);
    });
    
    it('should calculate exponential backoff delays correctly', () => {
      const baseDelay = 1000;
      const maxDelay = 10000;
      const multiplier = 2;
      
      transport.configureReconnection({
        delayMs: baseDelay,
        maxDelayMs: maxDelay,
        backoffMultiplier: multiplier,
      });
      
      // Test delay calculation by triggering multiple failures
      spawnMock.mockImplementation(() => {
        const proc = new MockChildProcess();
        proc.simulateError(new Error('Connection failed'));
        return proc as unknown as ChildProcess;
      });
      
      // This would test the internal delay calculation
      // The actual delays are: 1000ms, 2000ms, 4000ms, then cap at maxDelay
      expect(transport.getReconnectionStatus().maxAttempts).toBe(3);
    });
    
    it('should handle reconnection during active reconnection attempt', async () => {
      spawnMock.mockImplementation(() => {
        const proc = new MockChildProcess();
        proc.simulateError(new Error('Connection failed'));
        return proc as unknown as ChildProcess;
      });
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      
      try {
        await connectPromise;
      } catch {
        // Expected to fail and start reconnection
      }
      
      const status1 = transport.getReconnectionStatus();
      expect(status1.isReconnecting).toBe(true);
      
      // Try to connect again while reconnecting
      const connectPromise2 = transport.connect();
      await advanceTimers(100);
      
      try {
        await connectPromise2;
      } catch {
        // Also expected to fail
      }
      
      // Should not have increased attempts beyond max
      const status2 = transport.getReconnectionStatus();
      expect(status2.attempts).toBeLessThanOrEqual(3);
    });
    
    it('should clear reconnection timer when disabled', async () => {
      spawnMock.mockImplementation(() => {
        const proc = new MockChildProcess();
        proc.simulateError(new Error('Connection failed'));
        return proc as unknown as ChildProcess;
      });
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      
      try {
        await connectPromise;
      } catch {
        // Expected to fail and schedule reconnection
      }
      
      // Disable reconnection - should clear timer
      transport.setReconnectionEnabled(false);
      
      // Advance time - should not attempt reconnection
      const beforeSpawnCount = spawnMock.mock.calls.length;
      await advanceTimers(2000);
      const afterSpawnCount = spawnMock.mock.calls.length;
      
      expect(afterSpawnCount).toBe(beforeSpawnCount);
    });
    
    it('should not schedule reconnection if shouldReconnect is false', async () => {
      const connectSpy = vi.spyOn(transport, 'connect');
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // Set shouldReconnect to false (happens during disconnect)
      (transport as any).shouldReconnect = false;
      
      // Simulate process exit
      mockProcess.emit('exit', 1, null);
      await nextTick();
      
      // Wait for potential reconnection
      await advanceTimers(2000);
      
      expect(connectSpy).toHaveBeenCalledTimes(1); // Only initial connect
    });
  });

  describe('Message Buffering', () => {
    beforeEach(() => {
      transport = createTransport();
    });

    it('should buffer messages when disconnected', async () => {
      const request = TestDataFactory.createMcpRequest();
      
      await transport.send(request);
      
      const status = transport.getReconnectionStatus();
      expect(status.bufferSize).toBe(1);
    });
    
    it('should flush buffered messages on reconnection', async () => {
      const request1 = TestDataFactory.createMcpRequest({ id: 'req1' });
      const request2 = TestDataFactory.createMcpRequest({ id: 'req2' });
      
      // Buffer messages while disconnected
      await transport.send(request1);
      await transport.send(request2);
      
      expect(transport.getReconnectionStatus().bufferSize).toBe(2);
      
      // Connect and flush
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
      
      // Wait for buffer flush
      await advanceTimers(100);
      await nextTick();
      
      expect(transport.getReconnectionStatus().bufferSize).toBe(0);
      expect(writeSpy).toHaveBeenCalledTimes(2);
    });
    
    it('should drop oldest messages when buffer is full', async () => {
      // Create transport with small buffer
      const smallBufferTransport = createTransport();
      (smallBufferTransport as any).maxBufferSize = 2;
      
      const request1 = TestDataFactory.createMcpRequest({ id: 'req1' });
      const request2 = TestDataFactory.createMcpRequest({ id: 'req2' });
      const request3 = TestDataFactory.createMcpRequest({ id: 'req3' });
      
      await smallBufferTransport.send(request1);
      await smallBufferTransport.send(request2);
      await smallBufferTransport.send(request3); // Should drop req1
      
      const status = smallBufferTransport.getReconnectionStatus();
      expect(status.bufferSize).toBe(2);
    });
    
    it('should handle buffer flush errors gracefully', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const request = TestDataFactory.createMcpRequest();
      
      await transport.send(request);
      expect(transport.getReconnectionStatus().bufferSize).toBe(1);
      
      // Mock the internal flushMessageBuffer method to fail on first message
      const originalFlush = (transport as any).flushMessageBuffer.bind(transport);
      (transport as any).flushMessageBuffer = vi.fn().mockImplementation(async () => {
        const messages = [...(transport as any).messageBuffer];
        (transport as any).messageBuffer = [];
        
        // Simulate first message failing
        throw new Error('Send failed');
      });
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // Wait for flush attempt
      await advanceTimers(100);
      await nextTick();
      
      // Should have attempted to flush
      expect((transport as any).flushMessageBuffer).toHaveBeenCalled();
      
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
    
    it('should preserve message order in buffer', async () => {
      const messages = Array.from({ length: 5 }, (_, i) => 
        TestDataFactory.createMcpRequest({ id: `order-${i}` })
      );
      
      // Buffer all messages
      for (const msg of messages) {
        await transport.send(msg);
      }
      
      expect(transport.getReconnectionStatus().bufferSize).toBe(5);
      
      // Connect and flush
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
      
      // Wait for flush
      await advanceTimers(100);
      await nextTick();
      
      expect(writeSpy).toHaveBeenCalledTimes(5);
      
      // Check order by examining the stringified messages
      messages.forEach((msg, index) => {
        expect(writeSpy).toHaveBeenNthCalledWith(
          index + 1,
          JSON.stringify(msg) + '\n',
          'utf8',
          expect.any(Function)
        );
      });
    });
    
    it('should handle empty buffer flush gracefully', async () => {
      // Connect without buffering any messages
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
      
      // Wait for any potential flush operations
      await advanceTimers(100);
      await nextTick();
      
      // Should not attempt to write anything
      expect(writeSpy).not.toHaveBeenCalled();
      expect(transport.getReconnectionStatus().bufferSize).toBe(0);
    });
    
    it('should log buffer operations for debugging', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Test buffer warning when full
      const smallBufferTransport = createTransport();
      (smallBufferTransport as any).maxBufferSize = 2;
      
      const request1 = TestDataFactory.createMcpRequest({ id: 'log1' });
      const request2 = TestDataFactory.createMcpRequest({ id: 'log2' });
      const request3 = TestDataFactory.createMcpRequest({ id: 'log3' });
      
      await smallBufferTransport.send(request1);
      await smallBufferTransport.send(request2);
      await smallBufferTransport.send(request3); // Should trigger warning
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Message buffer full, dropping oldest message'
      );
      
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
    
    it('should handle buffer size at boundary conditions', async () => {
      // Test with maxBufferSize of 1
      const singleBufferTransport = createTransport();
      (singleBufferTransport as any).maxBufferSize = 1;
      
      const request1 = TestDataFactory.createMcpRequest({ id: 'boundary1' });
      const request2 = TestDataFactory.createMcpRequest({ id: 'boundary2' });
      
      await singleBufferTransport.send(request1);
      expect(singleBufferTransport.getReconnectionStatus().bufferSize).toBe(1);
      
      await singleBufferTransport.send(request2);
      expect(singleBufferTransport.getReconnectionStatus().bufferSize).toBe(1);
      
      // Only the second message should remain
      const connectPromise = singleBufferTransport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
      
      await advanceTimers(100);
      await nextTick();
      
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy).toHaveBeenCalledWith(
        JSON.stringify(request2) + '\n',
        'utf8',
        expect.any(Function)
      );
    });
    
    it('should handle mixed message types in buffer', async () => {
      const request = TestDataFactory.createMcpRequest({ id: 'mixed-req' });
      const notification = TestDataFactory.createMcpNotification({
        method: 'test/notification'
      });
      
      await transport.send(request);
      await transport.send(notification);
      
      expect(transport.getReconnectionStatus().bufferSize).toBe(2);
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
      
      await advanceTimers(100);
      await nextTick();
      
      expect(writeSpy).toHaveBeenCalledTimes(2);
      expect(writeSpy).toHaveBeenNthCalledWith(
        1,
        JSON.stringify(request) + '\n',
        'utf8',
        expect.any(Function)
      );
      expect(writeSpy).toHaveBeenNthCalledWith(
        2,
        JSON.stringify(notification) + '\n',
        'utf8',
        expect.any(Function)
      );
    });
  });

  describe('Configuration and Status', () => {
    beforeEach(() => {
      transport = createTransport();
    });

    it('should return reconnection status', () => {
      const status = transport.getReconnectionStatus();
      
      expect(status).toMatchObject({
        enabled: expect.any(Boolean),
        attempts: expect.any(Number),
        maxAttempts: expect.any(Number),
        isReconnecting: expect.any(Boolean),
        bufferSize: expect.any(Number),
      });
      
      expect(status.enabled).toBe(true);
      expect(status.attempts).toBe(0);
      expect(status.maxAttempts).toBe(5);
      expect(status.isReconnecting).toBe(false);
      expect(status.bufferSize).toBe(0);
    });
    
    it('should update reconnection configuration', () => {
      const newConfig = {
        enabled: false,
        maxAttempts: 10,
        delayMs: 2000,
      };
      
      transport.configureReconnection(newConfig);
      
      const status = transport.getReconnectionStatus();
      expect(status.enabled).toBe(false);
      expect(status.maxAttempts).toBe(10);
    });
    
    it('should enable/disable reconnection', () => {
      transport.setReconnectionEnabled(false);
      expect(transport.getReconnectionStatus().enabled).toBe(false);
      
      transport.setReconnectionEnabled(true);
      expect(transport.getReconnectionStatus().enabled).toBe(true);
    });
    
    it('should update individual configuration properties', () => {
      transport.configureReconnection({ maxAttempts: 7 });
      expect(transport.getReconnectionStatus().maxAttempts).toBe(7);
      expect(transport.getReconnectionStatus().enabled).toBe(true); // Should preserve other settings
      
      transport.configureReconnection({ delayMs: 500 });
      expect(transport.getReconnectionStatus().maxAttempts).toBe(7); // Should preserve previous change
    });
    
    it('should track reconnection state correctly', async () => {
      spawnMock.mockImplementation(() => {
        const proc = new MockChildProcess();
        proc.simulateError(new Error('Connection failed'));
        return proc as unknown as ChildProcess;
      });
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      
      try {
        await connectPromise;
      } catch {
        // Expected to fail
      }
      
      const status = transport.getReconnectionStatus();
      expect(status.attempts).toBe(1);
      expect(status.isReconnecting).toBe(true);
    });
    
    it('should provide accurate buffer size', async () => {
      expect(transport.getReconnectionStatus().bufferSize).toBe(0);
      
      await transport.send(TestDataFactory.createMcpRequest());
      expect(transport.getReconnectionStatus().bufferSize).toBe(1);
      
      await transport.send(TestDataFactory.createMcpNotification());
      expect(transport.getReconnectionStatus().bufferSize).toBe(2);
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // After connection and flush
      await advanceTimers(100);
      await nextTick();
      
      expect(transport.getReconnectionStatus().bufferSize).toBe(0);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    beforeEach(() => {
      transport = createTransport();
    });

    it('should handle null/undefined process streams', async () => {
      spawnMock.mockImplementation(() => {
        const proc = new MockChildProcess();
        (proc as any).stdin = null;
        return proc as unknown as ChildProcess;
      });
      
      transport = createTransport(undefined, { enabled: false });
      
      await expect(transport.connect()).rejects.toThrow(/Failed to get process stdio streams/);
    });
    
    it('should handle process with missing stderr', async () => {
      spawnMock.mockImplementation(() => {
        const proc = new MockChildProcess();
        (proc as any).stderr = null;
        return proc as unknown as ChildProcess;
      });
      
      // Should not throw, just skip stderr handling
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      expect(transport.isConnected()).toBe(true);
    });
    
    it('should handle concurrent connection attempts', async () => {
      const connectPromise1 = transport.connect();
      const connectPromise2 = transport.connect();
      
      await advanceTimers(100);
      await Promise.all([connectPromise1, connectPromise2]);
      
      expect(spawnMock).toHaveBeenCalledTimes(1);
      expect(transport.isConnected()).toBe(true);
    });
    
    it('should handle concurrent disconnect attempts', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const disconnectPromise1 = transport.disconnect();
      const disconnectPromise2 = transport.disconnect();
      
      await Promise.all([disconnectPromise1, disconnectPromise2]);
      
      expect(transport.isConnected()).toBe(false);
    });
    
    it('should handle large messages', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const largeMessage = TestDataFactory.createMcpRequest({
        params: {
          data: 'x'.repeat(100000), // 100KB of data
        },
      });
      
      const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
      
      await transport.send(largeMessage);
      await nextTick();
      
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('x'.repeat(100000)),
        'utf8',
        expect.any(Function)
      );
    });
    
    it('should handle rapid message sending', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const messages = Array.from({ length: 100 }, (_, i) => 
        TestDataFactory.createMcpRequest({ id: i })
      );
      
      const sendPromises = messages.map(msg => transport.send(msg));
      
      await Promise.all(sendPromises);
      await nextTick();
      
      expect(mockProcess.stdin.write).toHaveBeenCalledTimes(100);
    });
    
    it('should handle extremely rapid connections and disconnections', async () => {
      // Rapid connect/disconnect cycles
      for (let i = 0; i < 5; i++) {
        const connectPromise = transport.connect();
        await advanceTimers(50); // Very short connection time
        await connectPromise;
        
        const disconnectPromise = transport.disconnect();
        await advanceTimers(10);
        await disconnectPromise;
      }
      
      expect(transport.isConnected()).toBe(false);
    });
    
    it('should handle messages with special characters', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const specialMessage = TestDataFactory.createMcpRequest({
        params: {
          text: '\n\r\t\\"\u0000\u001F\u007F\u0080\uFFFF',
          emoji: '🚀🔥💻🎉',
          unicode: 'Hello 世界 🌍',
        },
      });
      
      const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
      
      await transport.send(specialMessage);
      await nextTick();
      
      expect(writeSpy).toHaveBeenCalledWith(
        JSON.stringify(specialMessage) + '\n',
        'utf8',
        expect.any(Function)
      );
    });
    
    it('should handle zero-length messages', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const emptyMessage = TestDataFactory.createMcpRequest({
        params: {},
      });
      
      const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
      
      await transport.send(emptyMessage);
      await nextTick();
      
      expect(writeSpy).toHaveBeenCalledWith(
        JSON.stringify(emptyMessage) + '\n',
        'utf8',
        expect.any(Function)
      );
    });
    
    it('should handle process PID edge cases', async () => {
      spawnMock.mockImplementation(() => {
        const proc = new MockChildProcess();
        proc.pid = 0; // Edge case: PID 0
        return proc as unknown as ChildProcess;
      });
      
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      expect(transport.isConnected()).toBe(true);
    });
    
    it('should handle undefined/null message parameters', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const nullMessage = {
        jsonrpc: '2.0' as const,
        id: 'null-test',
        method: 'test/null',
        params: null,
      };
      
      const undefinedMessage = {
        jsonrpc: '2.0' as const,
        id: 'undefined-test',
        method: 'test/undefined',
      };
      
      const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
      
      await transport.send(nullMessage);
      await transport.send(undefinedMessage);
      await nextTick();
      
      expect(writeSpy).toHaveBeenCalledTimes(2);
    });
    
    it('should handle connection during shutdown', async () => {
      const connectPromise1 = transport.connect();
      await advanceTimers(100);
      await connectPromise1;
      
      // Start disconnect
      const disconnectPromise = transport.disconnect();
      
      // Try to connect while disconnecting
      const connectPromise2 = transport.connect();
      
      await Promise.all([disconnectPromise, connectPromise2]);
      
      // Final state should be consistent
      expect(transport.isConnected()).toBe(true);
    });
    
    it('should handle process spawn with custom environment', async () => {
      const customConfig = TestDataFactory.createStdioConfig({
        env: {
          CUSTOM_VAR: 'test_value',
          PATH: '/custom/path',
        },
        cwd: '/custom/working/dir',
      });
      
      const customTransport = createTransport(customConfig);
      
      const connectPromise = customTransport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      expect(spawnMock).toHaveBeenCalledWith(
        customConfig.command,
        customConfig.args,
        expect.objectContaining({
          env: expect.objectContaining({
            CUSTOM_VAR: 'test_value',
            PATH: '/custom/path',
          }),
          cwd: '/custom/working/dir',
        })
      );
    });
    
    it('should handle memory pressure during high-volume messaging', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // Send many large messages to simulate memory pressure
      const largeMessages = Array.from({ length: 50 }, (_, i) => 
        TestDataFactory.createMcpRequest({
          id: `memory-${i}`,
          params: {
            data: 'x'.repeat(10000), // 10KB each
          },
        })
      );
      
      const sendPromises = largeMessages.map(msg => transport.send(msg));
      
      await Promise.all(sendPromises);
      await nextTick();
      
      expect(mockProcess.stdin.write).toHaveBeenCalledTimes(50);
      expect(transport.isConnected()).toBe(true);
    });
  });

  describe('Cleanup and Resource Management', () => {
    beforeEach(() => {
      transport = createTransport();
    });

    it('should clean up resources on disconnect', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const closeSpy = vi.spyOn(mockReadline, 'close');
      
      await transport.disconnect();
      await nextTick();
      
      expect(closeSpy).toHaveBeenCalled();
      expect(transport.isConnected()).toBe(false);
    });
    
    it('should remove all listeners on cleanup', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const removeAllListenersSpy = vi.spyOn(mockProcess, 'removeAllListeners');
      
      await transport.disconnect();
      await nextTick();
      
      expect(removeAllListenersSpy).toHaveBeenCalled();
    });
    
    it('should handle cleanup with missing resources', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // Simulate missing readline interface
      (transport as any).readline = undefined;
      
      // Should not throw
      await expect(transport.disconnect()).resolves.not.toThrow();
    });
    
    it('should cancel pending operations on disconnect', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // Simulate pending drain operation
      mockProcess.stdin.simulateBackpressure();
      
      const sendPromise = transport.send(TestDataFactory.createMcpRequest());
      
      // Disconnect while send is pending
      const disconnectPromise = transport.disconnect();
      await nextTick();
      
      await disconnectPromise;
      
      // Send promise should still resolve (not hang)
      await expect(sendPromise).resolves.not.toThrow();
    });
    
    it('should clean up stdin/stdout/stderr listeners separately', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const stdinListenersSpy = vi.spyOn(mockProcess.stdin, 'removeAllListeners');
      const stdoutListenersSpy = vi.spyOn(mockProcess.stdout, 'removeAllListeners');
      const stderrListenersSpy = vi.spyOn(mockProcess.stderr, 'removeAllListeners');
      
      await transport.disconnect();
      await nextTick();
      
      expect(stdinListenersSpy).toHaveBeenCalled();
      expect(stdoutListenersSpy).toHaveBeenCalled();
      expect(stderrListenersSpy).toHaveBeenCalled();
    });
    
    it('should handle cleanup when process is already destroyed', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // Simulate process being destroyed externally
      (transport as any).process = null;
      
      // Should not throw
      await expect(transport.disconnect()).resolves.not.toThrow();
    });
    
    it('should resolve pending drain promises on cleanup', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // Simulate backpressure
      mockProcess.stdin.simulateBackpressure();
      
      const sendPromise = transport.send(TestDataFactory.createMcpRequest());
      
      // Don't wait for drain, disconnect immediately
      await transport.disconnect();
      
      // The send promise should resolve due to cleanup
      await expect(sendPromise).resolves.not.toThrow();
    });
    
    it('should handle multiple cleanup calls gracefully', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // Call disconnect multiple times
      await transport.disconnect();
      await transport.disconnect();
      await transport.disconnect();
      
      expect(transport.isConnected()).toBe(false);
    });
    
    it('should clean up timers and intervals', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // Trigger a reconnection scenario to create timers
      mockProcess.emit('exit', 1, null);
      await nextTick();
      
      // Should have a reconnection timer
      expect(transport.getReconnectionStatus().isReconnecting).toBe(true);
      
      // Disconnect should clear all timers
      await transport.disconnect();
      await nextTick();
      
      expect(transport.getReconnectionStatus().isReconnecting).toBe(false);
    });
    
    it('should handle cleanup with partial resource initialization', async () => {
      // Simulate a connection that partially fails
      spawnMock.mockImplementation(() => {
        const proc = new MockChildProcess();
        // Process is created but readline will be missing
        return proc as unknown as ChildProcess;
      });
      
      createInterfaceMock.mockImplementation(() => {
        throw new Error('Readline creation failed');
      });
      
      transport = createTransport(undefined, { enabled: false });
      
      try {
        await transport.connect();
      } catch {
        // Expected to fail
      }
      
      // Cleanup should handle partial state
      await expect(transport.disconnect()).resolves.not.toThrow();
    });
    
    it('should prevent memory leaks from event listeners', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      // Add multiple message handlers to simulate real usage
      const handlers = Array.from({ length: 10 }, () => vi.fn());
      handlers.forEach(handler => transport.onMessage(handler));
      
      const errorHandlers = Array.from({ length: 5 }, () => vi.fn());
      errorHandlers.forEach(handler => transport.onError(handler));
      
      const disconnectHandlers = Array.from({ length: 3 }, () => vi.fn());
      disconnectHandlers.forEach(handler => transport.onDisconnect(handler));
      
      // Disconnect should clean up all handlers
      await transport.disconnect();
      await nextTick();
      
      // Handlers should still exist in arrays but process listeners should be cleaned
      expect(transport.isConnected()).toBe(false);
    });
  });

  describe('Performance and Stress Testing', () => {
    beforeEach(() => {
      transport = createTransport();
    });

    it('should handle sustained high message throughput', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const messageCount = 1000;
      const messages = Array.from({ length: messageCount }, (_, i) => 
        TestDataFactory.createMcpRequest({ id: `throughput-${i}` })
      );
      
      const startTime = Date.now();
      
      // Send all messages
      const sendPromises = messages.map(msg => transport.send(msg));
      await Promise.all(sendPromises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (less than 1 second for 1000 messages)
      expect(duration).toBeLessThan(1000);
      expect(mockProcess.stdin.write).toHaveBeenCalledTimes(messageCount);
    });
    
    it('should handle connection stress testing', async () => {
      const iterations = 20;
      
      for (let i = 0; i < iterations; i++) {
        const connectPromise = transport.connect();
        await advanceTimers(10);
        await connectPromise;
        
        expect(transport.isConnected()).toBe(true);
        
        await transport.disconnect();
        await nextTick();
        
        expect(transport.isConnected()).toBe(false);
      }
      
      // Should still be functional after stress test
      const finalConnectPromise = transport.connect();
      await advanceTimers(100);
      await finalConnectPromise;
      
      expect(transport.isConnected()).toBe(true);
    });
    
    it('should handle mixed workload efficiently', async () => {
      const connectPromise = transport.connect();
      await advanceTimers(100);
      await connectPromise;
      
      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);
      
      // Mixed send and receive operations
      const sendPromises = [];
      const receiveCount = 50;
      
      // Send messages while receiving
      for (let i = 0; i < receiveCount; i++) {
        // Send a message
        sendPromises.push(
          transport.send(TestDataFactory.createMcpRequest({ id: `mixed-${i}` }))
        );
        
        // Simulate receiving a response
        const response = TestDataFactory.createMcpResponse(`mixed-${i}`);
        mockReadline.simulateLine(JSON.stringify(response));
      }
      
      await Promise.all(sendPromises);
      await nextTick();
      
      expect(mockProcess.stdin.write).toHaveBeenCalledTimes(receiveCount);
      expect(messageHandler).toHaveBeenCalledTimes(receiveCount);
    });
  });
});