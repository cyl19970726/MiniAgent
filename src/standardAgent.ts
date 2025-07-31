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
  MessageItem
} from "./interfaces";

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

  constructor(
    public tools: ITool[],
    config: AllConfig & { chatProvider?: 'gemini' | 'openai' },
  ) {

    let actualChatConfig: IChatConfig = {
      ...config.chatConfig,
      toolDeclarations: tools.map(tool => tool.schema),
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
    super(config.agentConfig, chat, toolScheduler);

    // Initialize session manager
    this.sessionManager = new InternalSessionManager(this);
    this.currentSessionId = this.sessionManager.createSession('Default Session');
    
    // Set initial session without state switching since we're starting fresh
    this.sessionManager.setCurrentSession(this.currentSessionId);
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
      // Filter only user messages and convert to the format expected by BaseAgent
      const userMessages = userInput
        .filter(item => item.role === 'user')
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
}