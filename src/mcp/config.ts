/**
 * @fileoverview MCP Configuration Utilities
 * 
 * This file provides utilities for loading, validating, and managing
 * MCP configuration from various sources (files, environment variables, etc.).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  MCPConfig,
  MCPServerConfig,
  ConfigValidationResult,
  isMCPServerConfig,
  MCPError,
  MCPErrorType,
} from './interfaces.js';
import { LogLevel } from '../logger.js';

/**
 * Default MCP configuration values
 */
export const DEFAULT_MCP_CONFIG: Partial<MCPConfig> = {
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  logLevel: LogLevel.INFO,
  autoRestart: true,
  maxConcurrentTools: 10,
};

/**
 * Environment variable prefixes for MCP configuration
 */
export const MCP_ENV_PREFIXES = {
  CONFIG: 'MCP_',
  SERVER: 'MCP_SERVER_',
} as const;

/**
 * Configuration loader class
 */
export class MCPConfigLoader {
  /**
   * Load configuration from file
   */
  static loadFromFile(filePath: string): MCPConfig {
    const resolvedPath = resolve(filePath);
    
    if (!existsSync(resolvedPath)) {
      throw new MCPError(
        MCPErrorType.ConfigurationError,
        `Configuration file not found: ${resolvedPath}`
      );
    }

    try {
      const fileContent = readFileSync(resolvedPath, 'utf-8');
      const config = JSON.parse(fileContent);
      
      return this.mergeWithDefaults(config);
    } catch (error) {
      throw new MCPError(
        MCPErrorType.ConfigurationError,
        `Failed to load configuration from ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Load configuration from environment variables
   */
  static loadFromEnv(): Partial<MCPConfig> {
    const config: Partial<MCPConfig> = {};
    const servers: MCPServerConfig[] = [];

    // Load global MCP settings
    const timeout = process.env.MCP_TIMEOUT;
    if (timeout) {
      config.timeout = parseInt(timeout, 10);
    }

    const retryAttempts = process.env.MCP_RETRY_ATTEMPTS;
    if (retryAttempts) {
      config.retryAttempts = parseInt(retryAttempts, 10);
    }

    const logLevel = process.env.MCP_LOG_LEVEL;
    if (logLevel) {
      config.logLevel = this.parseLogLevel(logLevel);
    }

    const autoRestart = process.env.MCP_AUTO_RESTART;
    if (autoRestart) {
      config.autoRestart = autoRestart.toLowerCase() === 'true';
    }

    const maxConcurrentTools = process.env.MCP_MAX_CONCURRENT_TOOLS;
    if (maxConcurrentTools) {
      config.maxConcurrentTools = parseInt(maxConcurrentTools, 10);
    }

    // Load server configurations
    const serverConfigs = this.loadServerConfigsFromEnv();
    if (serverConfigs.length > 0) {
      servers.push(...serverConfigs);
    }

    if (servers.length > 0) {
      config.servers = servers;
    }

    return config;
  }

  /**
   * Create configuration with defaults
   */
  static createWithDefaults(partialConfig: Partial<MCPConfig> = {}): MCPConfig {
    return this.mergeWithDefaults(partialConfig);
  }

  /**
   * Validate configuration
   */
  static validate(config: MCPConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate basic structure
    if (!config.servers || !Array.isArray(config.servers)) {
      errors.push('servers must be an array');
      return { isValid: false, errors, warnings };
    }

    // Validate global settings
    if (config.timeout !== undefined && (config.timeout <= 0 || !Number.isFinite(config.timeout))) {
      errors.push('timeout must be a positive number');
    }

    if (config.retryAttempts !== undefined && (config.retryAttempts < 0 || !Number.isInteger(config.retryAttempts))) {
      errors.push('retryAttempts must be a non-negative integer');
    }

    if (config.maxConcurrentTools !== undefined && (config.maxConcurrentTools <= 0 || !Number.isInteger(config.maxConcurrentTools))) {
      errors.push('maxConcurrentTools must be a positive integer');
    }

    // Validate servers
    const serverNames = new Set<string>();
    config.servers.forEach((server, index) => {
      const serverErrors = this.validateServerConfig(server, index);
      errors.push(...serverErrors);

      // Check for duplicate names
      if (server.name && serverNames.has(server.name)) {
        errors.push(`Duplicate server name: ${server.name}`);
      }
      if (server.name) {
        serverNames.add(server.name);
      }
    });

    // Warnings
    if (config.servers.length === 0) {
      warnings.push('No servers configured');
    }

    const enabledServers = config.servers.filter(s => !s.disabled);
    if (enabledServers.length === 0 && config.servers.length > 0) {
      warnings.push('All servers are disabled');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Merge configuration with defaults
   */
  private static mergeWithDefaults(partialConfig: Partial<MCPConfig>): MCPConfig {
    return {
      servers: [],
      ...DEFAULT_MCP_CONFIG,
      ...partialConfig,
    } as MCPConfig;
  }

  /**
   * Parse log level from string
   */
  private static parseLogLevel(logLevelStr: string): LogLevel {
    const level = logLevelStr.toUpperCase();
    switch (level) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Load server configurations from environment variables
   */
  private static loadServerConfigsFromEnv(): MCPServerConfig[] {
    const servers: MCPServerConfig[] = [];
    const serverMap = new Map<string, Partial<MCPServerConfig>>();

    // Parse all MCP_SERVER_* environment variables
    Object.keys(process.env).forEach(key => {
      if (!key.startsWith(MCP_ENV_PREFIXES.SERVER)) {
        return;
      }

      const value = process.env[key];
      if (!value) {
        return;
      }

      // Extract server name and property
      // Format: MCP_SERVER_<NAME>_<PROPERTY>
      const parts = key.substring(MCP_ENV_PREFIXES.SERVER.length).split('_');
      if (parts.length < 2) {
        return;
      }

      const serverName = parts[0].toLowerCase();
      const property = parts.slice(1).join('_').toLowerCase();

      if (!serverMap.has(serverName)) {
        serverMap.set(serverName, { name: serverName });
      }

      const serverConfig = serverMap.get(serverName)!;

      // Map properties
      switch (property) {
        case 'command':
          serverConfig.command = value;
          break;
        case 'args':
          serverConfig.args = value.split(',').map(arg => arg.trim());
          break;
        case 'cwd':
          serverConfig.cwd = value;
          break;
        case 'disabled':
          serverConfig.disabled = value.toLowerCase() === 'true';
          break;
        case 'timeout':
          serverConfig.timeout = parseInt(value, 10);
          break;
        case 'retryattempts':
          serverConfig.retryAttempts = parseInt(value, 10);
          break;
        default:
          // Environment variables for the server process
          if (!serverConfig.env) {
            serverConfig.env = {};
          }
          serverConfig.env[property.toUpperCase()] = value;
          break;
      }
    });

    // Convert to server configs
    serverMap.forEach(serverConfig => {
      if (serverConfig.name && serverConfig.command) {
        servers.push(serverConfig as MCPServerConfig);
      }
    });

    return servers;
  }

  /**
   * Validate a single server configuration
   */
  private static validateServerConfig(server: any, index: number): string[] {
    const errors: string[] = [];

    if (!isMCPServerConfig(server)) {
      errors.push(`Server at index ${index} is not a valid server configuration`);
      return errors;
    }

    // Validate name
    if (!server.name || typeof server.name !== 'string' || !server.name.trim()) {
      errors.push(`Server at index ${index} must have a non-empty name`);
    }

    // Validate command
    if (!server.command || typeof server.command !== 'string' || !server.command.trim()) {
      errors.push(`Server at index ${index} must have a non-empty command`);
    }

    // Validate args
    if (server.args !== undefined && !Array.isArray(server.args)) {
      errors.push(`Server ${server.name} args must be an array`);
    }

    // Validate env
    if (server.env !== undefined && (typeof server.env !== 'object' || Array.isArray(server.env))) {
      errors.push(`Server ${server.name} env must be an object`);
    }

    // Validate cwd
    if (server.cwd !== undefined && typeof server.cwd !== 'string') {
      errors.push(`Server ${server.name} cwd must be a string`);
    }

    // Validate timeout
    if (server.timeout !== undefined && (typeof server.timeout !== 'number' || server.timeout <= 0)) {
      errors.push(`Server ${server.name} timeout must be a positive number`);
    }

    // Validate retryAttempts
    if (server.retryAttempts !== undefined && (typeof server.retryAttempts !== 'number' || server.retryAttempts < 0 || !Number.isInteger(server.retryAttempts))) {
      errors.push(`Server ${server.name} retryAttempts must be a non-negative integer`);
    }

    return errors;
  }
}

/**
 * Helper functions for common configuration patterns
 */
export class MCPConfigHelpers {
  /**
   * Create a filesystem server configuration
   */
  static createFilesystemServer(
    name: string = 'filesystem',
    allowedPath: string,
    disabled: boolean = false
  ): MCPServerConfig {
    return {
      name,
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', allowedPath],
      disabled,
    };
  }

  /**
   * Create a git server configuration
   */
  static createGitServer(
    name: string = 'git',
    repoPath?: string,
    disabled: boolean = false
  ): MCPServerConfig {
    const args = repoPath ? [repoPath] : [];
    const config: MCPServerConfig = {
      name,
      command: 'mcp-server-git',
      args,
      disabled,
    };
    if (repoPath !== undefined) {
      config.cwd = repoPath;
    }
    return config;
  }

  /**
   * Create a web search server configuration
   */
  static createWebSearchServer(
    name: string = 'web-search',
    apiKey?: string,
    disabled: boolean = false
  ): MCPServerConfig {
    const config: MCPServerConfig = {
      name,
      command: 'mcp-server-web-search',
      args: [],
      disabled,
    };
    if (apiKey !== undefined) {
      config.env = { SEARCH_API_KEY: apiKey };
    }
    return config;
  }

  /**
   * Create a database server configuration
   */
  static createDatabaseServer(
    name: string = 'database',
    connectionString: string,
    disabled: boolean = false
  ): MCPServerConfig {
    return {
      name,
      command: 'mcp-server-database',
      args: [connectionString],
      disabled,
    };
  }

  /**
   * Merge multiple configurations
   */
  static mergeConfigs(...configs: Partial<MCPConfig>[]): MCPConfig {
    const merged: MCPConfig = {
      servers: [],
      ...DEFAULT_MCP_CONFIG,
    };

    configs.forEach(config => {
      // Merge other properties (later configs override earlier ones)
      const { servers: configServers, ...otherProps } = config;
      Object.assign(merged, otherProps);
    });
    
    // Handle servers array separately to properly merge
    const serverMap = new Map<string, MCPServerConfig>();
    configs.forEach(config => {
      if (config.servers) {
        config.servers.forEach(server => {
          serverMap.set(server.name, server);
        });
      }
    });
    merged.servers = Array.from(serverMap.values());

    return merged;
  }
}