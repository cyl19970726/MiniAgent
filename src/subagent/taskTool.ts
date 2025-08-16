/**
 * @fileoverview Task Tool Implementation for Subagent Delegation
 * 
 * This module provides the TaskTool class that enables agents to delegate
 * tasks to specialized subagents. The tool integrates with the SubAgentRegistry
 * to discover available subagents and creates isolated subagent instances
 * for task execution.
 */

import { Type } from '@google/genai';
import { BaseTool } from '../baseTool.js';
import { SubAgentRegistry } from './registry.js';
import { 
  IChat, 
  IToolScheduler, 
  IAgentConfig,
  AgentEventType,
  MessageItem,
  DefaultToolResult,
} from '../interfaces.js';

/**
 * Task delegation tool that enables agents to delegate work to specialized subagents
 * 
 * The TaskTool provides a mechanism for parent agents to delegate specific tasks
 * to specialized subagents registered in the SubAgentRegistry. Each subagent runs
 * in an isolated context with filtered tools (excluding the Task tool itself to
 * prevent nesting).
 */
export class TaskTool extends BaseTool<
  { task: string; subagent_name: string },
  { result: string; success: boolean; error?: string }
> {
  /**
   * Create a new TaskTool instance
   * 
   * @param registry - SubAgentRegistry containing available subagents
   * @param parentConfig - Configuration from the parent agent
   * @param chatFactory - Factory function to create IChat instances
   * @param schedulerFactory - Factory function to create IToolScheduler instances
   */
  constructor(
    private registry: SubAgentRegistry,
    private parentConfig: IAgentConfig,
    private chatFactory: (config: any) => IChat<any>,
    private schedulerFactory: (config: any) => Promise<IToolScheduler>
  ) {
    super(
      'Task',
      'Task Delegation Tool',
      'Delegate tasks to specialized subagents',
      {} as any, // Will be overridden by getter
      false, // isOutputMarkdown
      true   // canUpdateOutput
    );
  }

  /**
   * Dynamic schema based on registered subagents
   * 
   * This getter dynamically generates the schema including an enum of
   * available subagent names from the registry.
   */
  override get schema() {
    const subagents = this.registry.listSubAgents();
    const subagentNames = subagents.map(s => s.name);
    
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: Type.OBJECT,
        properties: {
          task: {
            type: Type.STRING,
            description: 'The task to delegate to the subagent'
          },
          subagent_name: {
            type: Type.STRING,
            enum: subagentNames,
            description: `Available subagents: ${subagentNames.join(', ')}`
          }
        },
        required: ['task', 'subagent_name']
      }
    };
  }

  /**
   * Validate tool parameters
   * 
   * Ensures the task is non-empty and the subagent exists in the registry.
   * 
   * @param params - Parameters to validate
   * @returns Error message if invalid, null if valid
   */
  override validateToolParams(params: { task: string; subagent_name: string }): string | null {
    // Basic parameter validation
    const basicError = this.validateRequiredParams(params as Record<string, unknown>, ['task', 'subagent_name']);
    if (basicError) return basicError;

    // Type validation
    const typeError = this.validateParameterTypes(params as Record<string, unknown>, {
      task: 'string',
      subagent_name: 'string'
    });
    if (typeError) return typeError;

    // Validate task content
    if (params.task.trim().length === 0) {
      return 'Task cannot be empty';
    }

    // Validate subagent exists
    const subagentConfig = this.registry.getConfig(params.subagent_name);
    if (!subagentConfig) {
      return `Subagent '${params.subagent_name}' not found in registry`;
    }

    return null;
  }

  /**
   * Get description of what the tool will do
   * 
   * @param params - Tool parameters
   * @returns Description of the delegation operation
   */
  override getDescription(params: { task: string; subagent_name: string }): string {
    const subagentConfig = this.registry.getConfig(params.subagent_name);
    if (!subagentConfig) {
      return `Delegate task to unknown subagent '${params.subagent_name}'`;
    }

    return `Delegate task to ${subagentConfig.name} (${subagentConfig.description}): ${params.task}`;
  }

  /**
   * Execute the task delegation
   * 
   * This method:
   * 1. Gets the subagent configuration from the registry
   * 2. Creates a chat instance with the subagent's system prompt
   * 3. Filters parent tools (excludes Task tool to prevent nesting)
   * 4. Creates an isolated BaseAgent instance
   * 5. Executes the task using processOneTurn
   * 6. Collects results and handles errors gracefully
   * 
   * @param params - Task and subagent parameters
   * @param abortSignal - Abort signal for cancellation
   * @param outputUpdateHandler - Handler for streaming output updates
   * @returns Promise resolving to task execution result
   */
  async execute(
    params: { task: string; subagent_name: string },
    abortSignal: AbortSignal,
    outputUpdateHandler?: (output: string) => void
  ): Promise<DefaultToolResult<{ result: string; success: boolean; error?: string }>> {
    try {
      // Validate parameters
      const validationError = this.validateToolParams(params);
      if (validationError) {
        const errorResult = {
          result: '',
          success: false,
          error: validationError
        };
        return new DefaultToolResult(errorResult);
      }

      // Get subagent configuration
      const registrySubagentConfig = this.registry.getConfig(params.subagent_name);
      if (!registrySubagentConfig) {
        const errorResult = {
          result: '',
          success: false,
          error: `Subagent '${params.subagent_name}' not found`
        };
        return new DefaultToolResult(errorResult);
      }

      if (outputUpdateHandler) {
        outputUpdateHandler(`🤖 Delegating task to ${registrySubagentConfig.name}...`);
      }

      // Create subagent system prompt
      const systemPrompt = `${registrySubagentConfig.systemPrompt}\n\nYour task: ${params.task}`;

      // Get parent tools and filter out Task tool to prevent nesting
      const tempScheduler = await this.schedulerFactory({ tools: [] });
      const parentTools = tempScheduler.getToolList();
      const filteredTools = parentTools.filter((tool: any) => tool.name !== 'Task');

      // Create chat instance with subagent configuration
      const chatConfig = {
        ...this.parentConfig,
        systemPrompt
      };
      const chat = this.chatFactory(chatConfig);

      // Create tool scheduler with filtered tools
      const scheduler = await this.schedulerFactory({ tools: filteredTools });

      // Create isolated subagent instance using dynamic import
      const agentConfig = {
        ...this.parentConfig,
        sessionId: `${this.parentConfig.sessionId || 'default'}-sub-${params.subagent_name}-${Date.now()}`
      };
      
      // Dynamically import BaseAgent to avoid circular dependency
      const { BaseAgent } = await import('../baseAgent.js');
      
      // Create a simple concrete BaseAgent implementation for subagent execution
      class SimpleTaskAgent extends BaseAgent {
        constructor(
          agentConfig: IAgentConfig,
          chat: IChat<any>,
          toolScheduler: IToolScheduler
        ) {
          super(agentConfig, chat, toolScheduler);
        }
      }
      
      const subagent = new SimpleTaskAgent(agentConfig, chat, scheduler);

      if (outputUpdateHandler) {
        outputUpdateHandler(`🎯 Starting task execution with ${registrySubagentConfig.name}...`);
      }

      // Prepare messages for the subagent
      const messages: MessageItem[] = [{
        role: 'user',
        content: {
          type: 'text',
          text: params.task,
          metadata: {
            sessionId: subagent.getStatus().config.sessionId || 'unknown',
            timestamp: Date.now()
          }
        },
        turnIdx: 1
      }];

      // Execute task using processOneTurn
      const events = subagent.processOneTurn(
        subagent.getStatus().config.sessionId || 'unknown',
        messages,
        abortSignal
      );

      // Collect results from the event stream
      let result = '';
      let error: string | undefined;
      let hasCompleted = false;

      for await (const event of events) {
        if (abortSignal.aborted) {
          break;
        }

        // Handle different event types
        switch (event.type) {
          case AgentEventType.ResponseChunkTextDelta:
            if (event.data && typeof event.data === 'object' && 'content' in event.data) {
              const content = (event.data as any).content;
              if (content && content.type === 'text' && content.text) {
                result += content.text;
                if (outputUpdateHandler) {
                  outputUpdateHandler(`💭 ${content.text}`);
                }
              }
            }
            break;

          case AgentEventType.ResponseChunkTextDone:
            if (event.data && typeof event.data === 'object' && 'content' in event.data) {
              const content = (event.data as any).content;
              if (content && content.type === 'text' && content.text) {
                result += content.text;
              }
            }
            break;

          case AgentEventType.ToolExecutionStart:
            if (outputUpdateHandler && event.data) {
              const data = event.data as any;
              outputUpdateHandler(`🔧 Using tool: ${data.toolName}`);
            }
            break;

          case AgentEventType.ToolExecutionDone:
            if (event.data) {
              const data = event.data as any;
              if (data.error) {
                if (outputUpdateHandler) {
                  outputUpdateHandler(`❌ Tool error: ${data.error}`);
                }
              } else if (outputUpdateHandler) {
                outputUpdateHandler(`✅ Tool completed: ${data.toolName}`);
              }
            }
            break;

          case AgentEventType.TurnComplete:
            hasCompleted = true;
            if (outputUpdateHandler) {
              outputUpdateHandler(`✨ Task completed by ${registrySubagentConfig.name}`);
            }
            break;

          case AgentEventType.Error:
            if (event.data) {
              const data = event.data as any;
              error = data.message || 'Unknown error occurred';
              if (outputUpdateHandler) {
                outputUpdateHandler(`❌ Error: ${error}`);
              }
            }
            break;

          case AgentEventType.ResponseFailed:
            error = 'Response generation failed';
            if (outputUpdateHandler) {
              outputUpdateHandler(`❌ Response failed`);
            }
            break;
        }
      }

      // Check if operation was aborted
      if (abortSignal.aborted) {
        const abortedResult = {
          result: result || '',
          success: false,
          error: 'Task execution was cancelled'
        };
        return new DefaultToolResult(abortedResult);
      }

      // Return final result
      const success = !error && hasCompleted;
      const finalResult: { result: string; success: boolean; error?: string } = {
        result: result || '',
        success,
      };
      
      if (error) {
        finalResult.error = error;
      } else if (!success) {
        finalResult.error = 'Task did not complete successfully';
      }

      return new DefaultToolResult(finalResult);

    } catch (error) {
      // Handle unexpected errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      if (outputUpdateHandler) {
        outputUpdateHandler(`💥 Unexpected error: ${errorMessage}`);
      }

      const errorResult = {
        result: '',
        success: false,
        error: errorMessage
      };
      return new DefaultToolResult(errorResult);
    }
  }
}