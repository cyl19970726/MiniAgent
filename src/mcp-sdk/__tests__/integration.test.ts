/**
 * @fileoverview MCP SDK Integration Tests
 * 
 * Simple integration tests for the minimal MCP implementation.
 * Tests connection, tool discovery, tool execution, and error handling
 * using the real test server in stdio mode.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SimpleMcpClient } from '../client.js';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';

describe('MCP SDK Integration Tests', () => {
  let client: SimpleMcpClient;
  let serverProcess: ChildProcessWithoutNullStreams | null = null;
  const serverPath = path.resolve(__dirname, '../../../examples/utils/server.ts');

  beforeAll(async () => {
    // Start test server in stdio mode
    console.log('Starting MCP test server...');
    serverProcess = spawn('npx', ['tsx', serverPath, '--stdio'], { 
      stdio: ['pipe', 'pipe', 'pipe'] 
    });

    // Wait a bit for server to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create client
    client = new SimpleMcpClient();
  }, 15000);

  afterAll(async () => {
    // Clean up
    if (client && client.connected) {
      await client.disconnect();
    }
    
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
      // Wait for process to terminate
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  });

  it('should connect to MCP server', async () => {
    expect(client.connected).toBe(false);
    
    await client.connect({
      transport: 'stdio',
      command: 'npx',
      args: ['tsx', serverPath, '--stdio']
    });
    
    expect(client.connected).toBe(true);
  });

  it('should list available tools', async () => {
    const tools = await client.listTools();
    
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    
    // Check for expected tools from test server
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('add');
    expect(toolNames).toContain('echo');
    
    // Verify tool structure
    const addTool = tools.find(t => t.name === 'add');
    expect(addTool).toBeDefined();
    expect(addTool!.inputSchema).toBeDefined();
    expect(addTool!.inputSchema.properties).toHaveProperty('a');
    expect(addTool!.inputSchema.properties).toHaveProperty('b');
  });

  it('should execute add tool', async () => {
    const result = await client.callTool('add', { a: 5, b: 3 });
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    
    // Check the result content
    const textContent = result.content[0];
    expect(textContent.type).toBe('text');
    expect(textContent.text).toBe('8');
  });

  it('should handle errors gracefully', async () => {
    // Test with invalid tool name
    await expect(client.callTool('nonexistent_tool', {})).rejects.toThrow();
    
    // Test with invalid parameters for add tool
    await expect(client.callTool('add', { a: 'invalid' })).rejects.toThrow();
    
    // Client should still be connected after errors
    expect(client.connected).toBe(true);
  });

  it('should disconnect cleanly', async () => {
    expect(client.connected).toBe(true);
    
    await client.disconnect();
    
    expect(client.connected).toBe(false);
    
    // Should not be able to call tools after disconnect
    await expect(client.listTools()).rejects.toThrow('Client is not connected');
  });
});