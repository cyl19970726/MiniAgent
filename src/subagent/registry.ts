/**
 * @fileoverview SubAgent Registry Implementation
 * 
 * This module provides the SubAgentRegistry class for managing registered
 * subagent configurations and generating system prompt snippets.
 */

import { SubAgentConfig } from '../interfaces.js';

/**
 * Registry for managing SubAgent configurations
 * 
 * The SubAgentRegistry provides centralized management of subagent configurations,
 * including validation, storage, and system prompt generation capabilities.
 */
export class SubAgentRegistry {
  private subagents: Map<string, SubAgentConfig> = new Map();

  /**
   * Create a new SubAgentRegistry instance
   */
  constructor() {
    // Initialize empty registry
  }

  /**
   * Register a new subagent configuration
   * 
   * @param config - SubAgentConfig to register
   * @throws {Error} If config is invalid or name already exists
   */
  register(config: SubAgentConfig): void {
    // Validate required fields
    this.validateConfig(config);

    // Check for duplicate registration
    if (this.subagents.has(config.name)) {
      throw new Error(`SubAgent with name '${config.name}' is already registered`);
    }

    // Store configuration
    this.subagents.set(config.name, config);
  }

  /**
   * Get subagent configuration by name
   * 
   * @param name - Name of the subagent to retrieve
   * @returns SubAgentConfig if found, undefined otherwise
   */
  getConfig(name: string): SubAgentConfig | undefined {
    return this.subagents.get(name);
  }

  /**
   * Get all registered subagent configurations
   * 
   * @returns Array of all registered SubAgentConfig objects
   */
  listSubAgents(): SubAgentConfig[] {
    return Array.from(this.subagents.values());
  }

  /**
   * Generate system prompt snippet listing available subagents
   * 
   * This creates a formatted description of all registered subagents
   * suitable for inclusion in a main agent's system prompt.
   * 
   * @returns Formatted string describing available subagents
   */
  generateSystemPromptSnippet(): string {
    const subagentList = this.listSubAgents();
    
    if (subagentList.length === 0) {
      return 'No specialized subagents are currently available.';
    }

    const snippetLines = [
      'Available specialized subagents:',
      ''
    ];

    for (const subagent of subagentList) {
      snippetLines.push(`**${subagent.name}**`);
      snippetLines.push(`- Description: ${subagent.description}`);
      snippetLines.push(`- When to use: ${subagent.whenToUse}`);
      
      if (subagent.tools && subagent.tools !== '*') {
        const toolList = Array.isArray(subagent.tools) ? subagent.tools.join(', ') : subagent.tools;
        snippetLines.push(`- Available tools: ${toolList}`);
      } else {
        snippetLines.push('- Available tools: All parent agent tools (except Task tool)');
      }
      
      snippetLines.push('');
    }

    snippetLines.push('Use the Task tool to delegate work to these subagents when appropriate.');

    return snippetLines.join('\n');
  }

  /**
   * Validate a SubAgentConfig for required fields and format
   * 
   * @param config - Configuration to validate
   * @throws {Error} If validation fails
   * @private
   */
  private validateConfig(config: SubAgentConfig): void {
    // Check required string fields
    if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
      throw new Error('SubAgent config must have a non-empty name');
    }

    if (!config.description || typeof config.description !== 'string' || config.description.trim() === '') {
      throw new Error('SubAgent config must have a non-empty description');
    }

    if (!config.systemPrompt || typeof config.systemPrompt !== 'string' || config.systemPrompt.trim() === '') {
      throw new Error('SubAgent config must have a non-empty systemPrompt');
    }

    if (!config.whenToUse || typeof config.whenToUse !== 'string' || config.whenToUse.trim() === '') {
      throw new Error('SubAgent config must have a non-empty whenToUse field');
    }

    // Validate tools field if provided
    if (config.tools !== undefined) {
      if (config.tools !== '*' && (!Array.isArray(config.tools) || config.tools.length === 0)) {
        throw new Error('SubAgent config tools must be "*" or a non-empty array of tool names');
      }
      
      if (Array.isArray(config.tools)) {
        for (const tool of config.tools) {
          if (typeof tool !== 'string' || tool.trim() === '') {
            throw new Error('All tool names in SubAgent config must be non-empty strings');
          }
        }
      }
    }

    // Validate name format - should be alphanumeric with underscores/hyphens
    if (!/^[a-zA-Z0-9_-]+$/.test(config.name)) {
      throw new Error('SubAgent name must contain only letters, numbers, underscores, and hyphens');
    }
  }
}