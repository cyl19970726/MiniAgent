import { BaseAgent } from "./baseAgent";
import { GeminiChat } from "./chat/geminiChat";
import { OpenAIChatResponse } from "./chat/openaiChat";
import { CoreToolScheduler } from "./coreToolScheduler";
import { 
  IChatConfig, 
  ITool, 
  AllConfig, 
  IChat, 
  IStandardAgent, 
  ISessionManager, 
  AgentSession,
  AgentEvent,
  IAgentStatus,
  MessageItem,
  McpServerConfig,
} from "./interfaces";
import { McpManager, McpToolAdapter } from './mcp-sdk/index.js';
import { SubAgentRegistry } from './subagent/registry.js';

/**
 * Internal session manager implementation
 */
class InternalSessionManager implements ISessionManager {
  private sessions: Map<string, AgentSession> = new Map();
  private currentSessionId: string | null = null;
  private agent: StandardAgent;

  constructor(agent: StandardAgent) {
    this.agent = agent;
  }

  createSession(title?: string): string {
    const sessionId = this.generateSessionId();
    const session: AgentSession = {
      id: sessionId,
      title: title || `Session ${new Date().toLocaleString()}`,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      messageHistory: [],
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0
      },
      metadata: {}
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  getSession(sessionId: string): AgentSession | null {
    return this.sessions.get(sessionId) || null;
  }

  getAllSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  deleteSession(sessionId: string): boolean {
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
    return this.sessions.delete(sessionId);
  }

  setCurrentSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Save current session state before switching (only if different session)
    if (this.currentSessionId && this.currentSessionId !== sessionId) {
      this.saveCurrentSessionState();
    }

    // Switch to new session
    this.currentSessionId = sessionId;
    this.restoreSessionState(session);
    
    // Update last active time
    session.lastActiveAt = new Date().toISOString();
    
    return true;
  }

  getCurrentSession(): AgentSession | null {
    if (!this.currentSessionId) return null;
    return this.sessions.get(this.currentSessionId) || null;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  updateSessionTitle(sessionId: string, title: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    session.title = title;
    session.lastActiveAt = new Date().toISOString();
    return true;
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  clearAllSessions(): void {
    this.sessions.clear();
    this.currentSessionId = null;
    this.agent.clearHistory();
  }

  async saveSession(sessionId: string): Promise<boolean> {
    // Basic implementation - could be extended for persistence
    const session = this.sessions.get(sessionId);
    return session !== undefined;
  }

  async loadSession(sessionId: string): Promise<AgentSession | null> {
    // Basic implementation - could be extended for persistence
    return this.getSession(sessionId);
  }

  private saveCurrentSessionState(): void {
    if (!this.currentSessionId) return;
    
    const session = this.sessions.get(this.currentSessionId);
    if (!session) return;

    try {
      // Save chat history
      const chat = this.agent.getChat();
      if (chat && chat.getHistory) {
        session.messageHistory = chat.getHistory();
      }

      // Save token usage - ensure we have valid data and handle undefined safely
      const tokenUsage = this.agent.getTokenUsage();
      if (tokenUsage) {
        session.tokenUsage = {
          totalInputTokens: tokenUsage.inputTokens || 0,
          totalOutputTokens: tokenUsage.outputTokens || 0,
          totalTokens: tokenUsage.totalTokens || 0
        };
      }
    } catch (error) {
      // Log error but don't fail session switching
      console.warn(`Warning: Failed to save session state for ${this.currentSessionId}:`, error);
    }
  }

  private restoreSessionState(session: AgentSession): void {
    try {
      // Restore chat history
      const chat = this.agent.getChat();
      if (chat && chat.clearHistory && chat.setHistory) {
        chat.clearHistory();
        if (session.messageHistory.length > 0) {
          chat.setHistory(session.messageHistory);
        }
      }

      // Reset token tracker to avoid stale state issues with cachedTokens
      if (chat && chat.getTokenTracker) {
        const tokenTracker = chat.getTokenTracker();
        if (tokenTracker && tokenTracker.reset) {
          tokenTracker.reset();
        }
      }
    } catch (error) {
      // Log error but don't fail session switching
      console.warn(`Warning: Failed to restore session state for ${session.id}:`, error);
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

export class StandardAgent extends BaseAgent implements IStandardAgent {
  sessionManager: InternalSessionManager;
  private currentSessionId: string;
  private mcpManager?: McpManager;
  private mcpToolRegistry: Map<string, { serverName: string; originalName: string }> = new Map();
  private fullConfig: AllConfig;

  constructor(
    public tools: ITool[],
    config: AllConfig & { chatProvider?: 'gemini' | 'openai' },
    registry?: SubAgentRegistry
  ) {

    let actualChatConfig: IChatConfig = {
      ...config.chatConfig,
    };
    
    // Select chat implementation based on provider
    let chat: IChat<any>;
    const provider = config.chatProvider || 'gemini'; // Default to gemini for backward compatibility
    
    switch (provider) {
      case 'openai':
        chat = new OpenAIChatResponse(actualChatConfig);
        break;
      case 'gemini':
      default:
        chat = new GeminiChat(actualChatConfig);
        break;
    }
    
    const toolScheduler = new CoreToolScheduler({
      ...config.toolSchedulerConfig,
      tools: tools,
    });
    super(config.agentConfig, chat, toolScheduler, registry);

    // Store config for later use
    this.fullConfig = config;

    // Initialize session manager
    this.sessionManager = new InternalSessionManager(this);
    this.currentSessionId = this.sessionManager.createSession('Default Session');
    
    // Set initial session without state switching since we're starting fresh
    this.sessionManager.setCurrentSession(this.currentSessionId);

    // Initialize MCP if configured
    if (config.agentConfig.mcp?.enabled) {
      this.mcpManager = new McpManager();
      
      // Auto-connect servers if configured
      if (config.agentConfig.mcp.autoDiscoverTools && config.agentConfig.mcp.servers) {
        this.initializeMcpServers(config.agentConfig.mcp.servers).catch(error => {
          console.warn('Failed to initialize MCP servers:', error);
        });
      }
    }
  }

  // Enhanced process method with session support
  async *processWithSession(
    userInput: string | MessageItem[],
    sessionId?: string,
    abortSignal?: AbortSignal
  ): AsyncGenerator<AgentEvent> {
    // Handle session management
    if (sessionId) {
      if (!this.sessionManager.getSession(sessionId)) {
        // Create session if it doesn't exist
        this.sessionManager.createSession(`Session ${sessionId}`);
      }
      // Switch to specified session
      this.switchToSession(sessionId);
    }

    // Convert input to the format expected by BaseAgent.process
    if (typeof userInput === 'string') {
      // Convert string to user message format expected by BaseAgent
      const userMessages = [{
        role: 'user' as const,
        content: { type: 'text' as const, text: userInput },
        metadata: { sessionId: this.currentSessionId }
      }];
      
      yield* this.process(
        userMessages,
        this.currentSessionId,
        abortSignal || new AbortController().signal
      );
    } else {
      // convert to the format expected by BaseAgent
      const userMessages = userInput
        .map(item => ({
          role: 'user' as const,
          content: item.content,
          metadata: { 
            sessionId: this.currentSessionId,
            ...(item.metadata?.responseId && { previousResponseId: item.metadata.responseId })
          }
        }));
      
      yield* this.process(
        userMessages,
        this.currentSessionId,
        abortSignal || new AbortController().signal
      );
    }
  }

  // Session management methods
  createNewSession(title?: string): string {
    return this.sessionManager.createSession(title);
  }

  switchToSession(sessionId: string): boolean {
    if (this.sessionManager.setCurrentSession(sessionId)) {
      this.currentSessionId = sessionId;
      return true;
    }
    return false;
  }

  getSessionManager(): ISessionManager {
    return this.sessionManager;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  // Convenience session methods
  getSessions(): AgentSession[] {
    return this.sessionManager.getAllSessions();
  }

  deleteSession(sessionId: string): boolean {
    return this.sessionManager.deleteSession(sessionId);
  }

  updateSessionTitle(sessionId: string, title: string): boolean {
    return this.sessionManager.updateSessionTitle(sessionId, title);
  }

  // Enhanced tool management with session context
  getToolsForSession(_sessionId?: string): ITool[] {
    // For now, return all tools regardless of session
    // Could be enhanced to support session-specific tools
    return this.getToolList();
  }

  // Session-aware status
  getSessionStatus(sessionId?: string): IAgentStatus & { sessionInfo?: AgentSession | undefined } {
    const baseStatus = this.getStatus();
    const targetSessionId = sessionId || this.currentSessionId;
    const sessionInfo = targetSessionId ? this.sessionManager.getSession(targetSessionId) : null;

    return {
      ...baseStatus,
      ...(sessionInfo ? { sessionInfo } : {})
    };
  }

  // Enhanced tool registration to track MCP tools
  override registerTool(tool: ITool): void {
    // Track MCP tools in separate registry
    if ((tool as any).metadata?.isMcpTool) {
      this.mcpToolRegistry.set(tool.name, {
        serverName: (tool as any).metadata.serverName,
        originalName: (tool as any).metadata.originalName
      });
    }
    
    // Register with base agent
    super.registerTool(tool);
  }

  // Enhanced tool removal to clean up MCP registry
  override removeTool(toolName: string): boolean {
    // Remove from MCP registry if present
    this.mcpToolRegistry.delete(toolName);
    
    // Remove from base agent
    return super.removeTool(toolName);
  }

  // ============================================================================
  // MCP MANAGEMENT METHODS
  // ============================================================================

  /**
   * Add an MCP server and register its tools
   */
  async addMcpServer(config: McpServerConfig): Promise<ITool[]> {
    if (!this.mcpManager) {
      throw new Error('MCP is not enabled. Set agentConfig.mcp.enabled = true');
    }
    
    const mcpTools = await this.mcpManager.addServer(config);
    const tools = this.convertMcpToolsToITools(mcpTools, config.name);
    
    // Register tools with the agent
    tools.forEach(tool => this.registerTool(tool));
    
    return tools;
  }

  /**
   * Remove an MCP server and unregister its tools
   */
  async removeMcpServer(name: string): Promise<boolean> {
    if (!this.mcpManager) return false;
    
    try {
      // Remove tools from agent first
      const mcpTools = this.mcpManager.getServerTools(name);
      mcpTools.forEach(mcpTool => {
        const toolName = this.generateToolName(mcpTool.name, name);
        this.removeTool(toolName);
      });
      
      // Remove server
      await this.mcpManager.removeServer(name);
      return true;
    } catch (error) {
      console.warn(`Failed to remove MCP server '${name}':`, error);
      return false;
    }
  }

  /**
   * List all registered MCP servers
   */
  listMcpServers(): string[] {
    return this.mcpManager?.listServers() || [];
  }

  /**
   * Get connection status for an MCP server
   */
  getMcpServerStatus(name: string): { connected: boolean; toolCount: number } | null {
    if (!this.mcpManager) return null;
    
    const serverInfo = this.mcpManager.getServersInfo().find(info => info.name === name);
    return serverInfo ? { connected: serverInfo.connected, toolCount: serverInfo.toolCount } : null;
  }

  /**
   * Get tools from MCP servers
   */
  getMcpTools(serverName?: string): ITool[] {
    if (!this.mcpManager) return [];
    
    if (serverName) {
      // Get tools from specific server
      const mcpTools = this.mcpManager.getServerTools(serverName);
      return mcpTools
        .map(mcpTool => this.getTool(this.generateToolName(mcpTool.name, serverName)))
        .filter((tool): tool is ITool => tool !== undefined);
    } else {
      // Get all MCP tools from registry
      const allMcpTools: ITool[] = [];
      this.mcpToolRegistry.forEach((_, toolName) => {
        const tool = this.getTool(toolName);
        if (tool) {
          allMcpTools.push(tool);
        }
      });
      return allMcpTools;
    }
  }

  /**
   * Refresh tools from MCP servers
   */
  async refreshMcpTools(serverName?: string): Promise<ITool[]> {
    if (!this.mcpManager) return [];
    
    if (serverName) {
      // Refresh single server
      const mcpTools = await this.mcpManager.connectServer(serverName);
      const tools = this.convertMcpToolsToITools(mcpTools, serverName);
      
      // Re-register tools
      tools.forEach(tool => this.registerTool(tool));
      
      return tools;
    } else {
      // Refresh all servers
      const allTools: ITool[] = [];
      for (const name of this.mcpManager.listServers()) {
        try {
          const mcpTools = await this.mcpManager.connectServer(name);
          const tools = this.convertMcpToolsToITools(mcpTools, name);
          
          // Re-register tools
          tools.forEach(tool => this.registerTool(tool));
          
          allTools.push(...tools);
        } catch (error) {
          console.warn(`Failed to refresh MCP server '${name}':`, error);
        }
      }
      return allTools;
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Initialize MCP servers during construction
   */
  private async initializeMcpServers(servers: McpServerConfig[]): Promise<void> {
    const results = await Promise.allSettled(
      servers.map(async (serverConfig) => {
        try {
          await this.addMcpServer(serverConfig);
          console.log(`✅ Connected to MCP server: ${serverConfig.name}`);
        } catch (error) {
          console.warn(`⚠️  Failed to connect to MCP server '${serverConfig.name}':`, error);
          // Continue with other servers
        }
      })
    );
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    if (failed > 0) {
      console.warn(`MCP initialization: ${successful} successful, ${failed} failed`);
    }
  }

  /**
   * Generate tool name with conflict resolution strategy
   */
  private generateToolName(toolName: string, serverName: string): string {
    const config = this.fullConfig.agentConfig.mcp;
    const strategy = config?.toolNamingStrategy || 'prefix';
    
    switch (strategy) {
      case 'prefix':
        const prefix = config?.toolNamePrefix || serverName;
        return `${prefix}_${toolName}`;
      
      case 'suffix':
        const suffix = config?.toolNameSuffix || serverName;
        return `${toolName}_${suffix}`;
      
      case 'error':
        // Check for conflicts and throw error
        if (this.getTool(toolName)) {
          throw new Error(`Tool name conflict: '${toolName}' already exists`);
        }
        return toolName;
      
      default:
        return `${serverName}_${toolName}`;
    }
  }

  /**
   * Register SubAgent registry dynamically after construction
   * Convenience method for adding subagent support to existing agents
   */
  override async registerSubAgents(registry: SubAgentRegistry): Promise<void> {
    // Delegate to BaseAgent implementation
    await super.registerSubAgents(registry);
  }

  /**
   * Convert MCP tools to ITool implementations with wrapped names
   */
  private convertMcpToolsToITools(mcpTools: McpToolAdapter[], serverName: string): ITool[] {
    return mcpTools.map(mcpTool => {
      // McpToolAdapter already implements ITool, simply return it with modified properties
      const originalName = mcpTool.name;
      const wrappedName = this.generateToolName(originalName, serverName);
      
      // Modify the tool properties directly
      Object.defineProperty(mcpTool, 'name', { value: wrappedName, configurable: true });
      Object.defineProperty(mcpTool, 'description', { 
        value: `[${serverName}] ${mcpTool.description}`, 
        configurable: true 
      });
      
      // Add metadata for tracking
      (mcpTool as any).metadata = {
        originalName,
        serverName,
        isMcpTool: true
      };
      
      return mcpTool;
    });
  }
}