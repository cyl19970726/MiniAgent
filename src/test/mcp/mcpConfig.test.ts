/**
 * @fileoverview MCP Configuration Tests
 * 
 * Tests for MCP configuration loading, validation, and helper functions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  MCPConfigLoader,
  MCPConfigHelpers,
  DEFAULT_MCP_CONFIG,
  MCPConfig,
  MCPServerConfig,
  MCPError,
  MCPErrorType,
} from '../../mcp/index.js';
import { LogLevel } from '../../logger.js';

describe('MCPConfigLoader', () => {
  const testConfigPath = resolve('./test-mcp-config.json');

  afterEach(() => {
    // Clean up test files
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
    
    // Clean up environment variables
    delete process.env.MCP_TIMEOUT;
    delete process.env.MCP_RETRY_ATTEMPTS;
    delete process.env.MCP_LOG_LEVEL;
    delete process.env.MCP_AUTO_RESTART;
    delete process.env.MCP_SERVER_TEST_COMMAND;
    delete process.env.MCP_SERVER_TEST_ARGS;
  });

  describe('loadFromFile', () => {
    it('should load valid configuration from file', () => {
      const config: MCPConfig = {
        servers: [
          {
            name: 'test-server',
            command: 'echo',
            args: ['hello'],
          },
        ],
        timeout: 5000,
        retryAttempts: 2,
      };

      writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const loaded = MCPConfigLoader.loadFromFile(testConfigPath);
      expect(loaded.servers).toHaveLength(1);
      expect(loaded.servers[0].name).toBe('test-server');
      expect(loaded.timeout).toBe(5000);
      expect(loaded.retryAttempts).toBe(2);
    });

    it('should throw error for non-existent file', () => {
      expect(() => {
        MCPConfigLoader.loadFromFile('./non-existent-config.json');
      }).toThrow(MCPError);
    });

    it('should throw error for invalid JSON', () => {
      writeFileSync(testConfigPath, 'invalid json');
      
      expect(() => {
        MCPConfigLoader.loadFromFile(testConfigPath);
      }).toThrow(MCPError);
    });
  });

  describe('loadFromEnv', () => {
    it('should load configuration from environment variables', () => {
      process.env.MCP_TIMEOUT = '15000';
      process.env.MCP_RETRY_ATTEMPTS = '5';
      process.env.MCP_LOG_LEVEL = 'DEBUG';
      process.env.MCP_AUTO_RESTART = 'true';
      process.env.MCP_SERVER_TEST_COMMAND = 'npm';
      process.env.MCP_SERVER_TEST_ARGS = 'start,--verbose';

      const config = MCPConfigLoader.loadFromEnv();
      
      expect(config.timeout).toBe(15000);
      expect(config.retryAttempts).toBe(5);
      expect(config.logLevel).toBe(LogLevel.DEBUG);
      expect(config.autoRestart).toBe(true);
      expect(config.servers).toHaveLength(1);
      expect(config.servers![0].name).toBe('test');
      expect(config.servers![0].command).toBe('npm');
      expect(config.servers![0].args).toEqual(['start', '--verbose']);
    });

    it('should return empty config when no env vars set', () => {
      const config = MCPConfigLoader.loadFromEnv();
      expect(config).toEqual({});
    });
  });

  describe('createWithDefaults', () => {
    it('should create config with defaults', () => {
      const config = MCPConfigLoader.createWithDefaults();
      expect(config.timeout).toBe(DEFAULT_MCP_CONFIG.timeout);
      expect(config.retryAttempts).toBe(DEFAULT_MCP_CONFIG.retryAttempts);
      expect(config.servers).toEqual([]);
    });

    it('should merge partial config with defaults', () => {
      const partial = {
        servers: [{ name: 'test', command: 'echo' }],
        timeout: 5000,
      };

      const config = MCPConfigLoader.createWithDefaults(partial);
      expect(config.timeout).toBe(5000);
      expect(config.retryAttempts).toBe(DEFAULT_MCP_CONFIG.retryAttempts);
      expect(config.servers).toHaveLength(1);
    });
  });

  describe('validate', () => {
    it('should validate valid configuration', () => {
      const config: MCPConfig = {
        servers: [
          {
            name: 'valid-server',
            command: 'echo',
            args: ['test'],
          },
        ],
        timeout: 30000,
        retryAttempts: 3,
      };

      const result = MCPConfigLoader.validate(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect invalid servers array', () => {
      const config = {
        servers: 'not-an-array',
      } as any;

      const result = MCPConfigLoader.validate(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('servers must be an array');
    });

    it('should detect duplicate server names', () => {
      const config: MCPConfig = {
        servers: [
          { name: 'duplicate', command: 'echo' },
          { name: 'duplicate', command: 'echo' },
        ],
      };

      const result = MCPConfigLoader.validate(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate server name: duplicate');
    });

    it('should detect invalid timeout', () => {
      const config: MCPConfig = {
        servers: [],
        timeout: -1000,
      };

      const result = MCPConfigLoader.validate(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('timeout must be a positive number');
    });

    it('should generate warnings for empty servers', () => {
      const config: MCPConfig = {
        servers: [],
      };

      const result = MCPConfigLoader.validate(config);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('No servers configured');
    });
  });
});

describe('MCPConfigHelpers', () => {
  describe('createFilesystemServer', () => {
    it('should create filesystem server configuration', () => {
      const config = MCPConfigHelpers.createFilesystemServer('fs', '/path/to/dir');
      
      expect(config.name).toBe('fs');
      expect(config.command).toBe('npx');
      expect(config.args).toEqual(['@modelcontextprotocol/server-filesystem', '/path/to/dir']);
      expect(config.disabled).toBe(false);
    });

    it('should create disabled filesystem server', () => {
      const config = MCPConfigHelpers.createFilesystemServer('fs', '/path', true);
      expect(config.disabled).toBe(true);
    });
  });

  describe('createGitServer', () => {
    it('should create git server configuration', () => {
      const config = MCPConfigHelpers.createGitServer('git', '/repo/path');
      
      expect(config.name).toBe('git');
      expect(config.command).toBe('mcp-server-git');
      expect(config.args).toEqual(['/repo/path']);
      expect(config.cwd).toBe('/repo/path');
    });

    it('should create git server without repo path', () => {
      const config = MCPConfigHelpers.createGitServer();
      
      expect(config.name).toBe('git');
      expect(config.args).toEqual([]);
      expect(config.cwd).toBeUndefined();
    });
  });

  describe('createWebSearchServer', () => {
    it('should create web search server configuration', () => {
      const config = MCPConfigHelpers.createWebSearchServer('search', 'api-key-123');
      
      expect(config.name).toBe('search');
      expect(config.command).toBe('mcp-server-web-search');
      expect(config.env).toEqual({ SEARCH_API_KEY: 'api-key-123' });
    });

    it('should create web search server without API key', () => {
      const config = MCPConfigHelpers.createWebSearchServer();
      
      expect(config.env).toBeUndefined();
    });
  });

  describe('createDatabaseServer', () => {
    it('should create database server configuration', () => {
      const connectionString = 'postgresql://user:pass@localhost/db';
      const config = MCPConfigHelpers.createDatabaseServer('db', connectionString);
      
      expect(config.name).toBe('db');
      expect(config.command).toBe('mcp-server-database');
      expect(config.args).toEqual([connectionString]);
    });
  });

  describe('mergeConfigs', () => {
    it('should merge multiple configurations', () => {
      const config1: Partial<MCPConfig> = {
        timeout: 5000,
        servers: [{ name: 'server1', command: 'echo' }],
      };

      const config2: Partial<MCPConfig> = {
        retryAttempts: 5,
        servers: [{ name: 'server2', command: 'cat' }],
      };

      const merged = MCPConfigHelpers.mergeConfigs(config1, config2);
      
      expect(merged.timeout).toBe(5000);
      expect(merged.retryAttempts).toBe(5);
      expect(merged.servers).toHaveLength(2);
      expect(merged.servers[0].name).toBe('server1');
      expect(merged.servers[1].name).toBe('server2');
    });

    it('should handle duplicate server names', () => {
      const config1: Partial<MCPConfig> = {
        servers: [{ name: 'server1', command: 'echo' }],
      };

      const config2: Partial<MCPConfig> = {
        servers: [{ name: 'server1', command: 'cat' }], // Same name, different command
      };

      const merged = MCPConfigHelpers.mergeConfigs(config1, config2);
      
      expect(merged.servers).toHaveLength(1);
      expect(merged.servers[0].command).toBe('cat'); // Later config wins
    });
  });
});