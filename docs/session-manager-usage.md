# SessionManager 使用指南

## 概述

SessionManager 是 StandardAgent 的核心功能，提供了多会话管理能力，允许在单个 Agent 实例中维护多个独立的对话上下文。每个会话拥有独立的消息历史、Token 使用统计和元数据管理。

## StandardAgent 与 SessionManager

### 创建 StandardAgent

```typescript
import { StandardAgent, ITool } from '@continue-reasoning/mini-agent';

// 创建工具
const tools: ITool[] = [
  createWeatherTool(),
  createCalculatorTool(),
  createFileReadTool()
];

// 创建带会话管理的 Agent
const agent = new StandardAgent(tools, {
  chatProvider: 'gemini', // 或 'openai'
  agentConfig: {
    model: 'gemini-2.0-flash',
    workingDirectory: process.cwd(),
    apiKey: process.env.GEMINI_API_KEY,
    maxHistoryTokens: 50000,
    debugMode: false
  },
  chatConfig: {
    apiKey: process.env.GEMINI_API_KEY,
    modelName: 'gemini-2.0-flash',
    tokenLimit: 100000,
    systemPrompt: `You are a helpful assistant with access to various tools.
    
IMPORTANT: 
- Always use available tools when needed
- Provide clear and concise responses
- Maintain context across the conversation`
  },
  toolSchedulerConfig: {
    approvalMode: 'yolo', // 自动批准工具调用
    onAllToolCallsComplete: (calls) => {
      console.log(`✅ ${calls.length} tool(s) completed`);
    }
  }
});

console.log('🤖 StandardAgent created with session management');
```

### SessionManager 自动初始化

StandardAgent 在创建时会自动初始化 SessionManager：

```typescript
// 在 StandardAgent 构造函数中自动执行：
// 1. 创建 InternalSessionManager 实例
// 2. 创建默认会话 "Default Session"
// 3. 设置当前会话为默认会话

// 获取默认会话信息
const defaultSessionId = agent.getCurrentSessionId();
console.log(`Default session: ${defaultSessionId}`);

// 查看初始会话状态
const sessions = agent.getSessions();
console.log(`Total sessions: ${sessions.length}`);
```

## processWithSession 核心方法

### 基本用法

```typescript
// 方式 1: 使用字符串输入（最常用）
async function simpleChat() {
  console.log('🗣️ Simple chat example');
  
  for await (const event of agent.processWithSession(
    "Hello! What's the weather like in Tokyo?",
    "user-123-chat"
  )) {
    await handleEvent(event);
  }
}

// 方式 2: 使用 MessageItem 数组（高级用法）
async function advancedChat() {
  const messages: MessageItem[] = [
    {
      role: 'user',
      content: { 
        type: 'text', 
        text: 'Analyze this data and calculate the average'
      },
      metadata: {
        timestamp: Date.now(),
        source: 'api',
        priority: 'high'
      }
    }
  ];
  
  for await (const event of agent.processWithSession(
    messages,
    "data-analysis-session"
  )) {
    await handleEvent(event);
  }
}

// 方式 3: 自动会话创建
async function autoSessionCreation() {
  // 如果会话不存在，会自动创建
  for await (const event of agent.processWithSession(
    "Start a new conversation",
    "auto-created-session-001"
  )) {
    await handleEvent(event);
  }
  
  // 验证会话已创建
  const session = agent.getSessionManager().getSession("auto-created-session-001");
  console.log(`Auto-created session: ${session?.title}`);
}
```

### 事件处理

```typescript
async function handleEvent(event: AgentEvent) {
  switch (event.type) {
    case 'response.chunk.text.delta':
      // 流式文本输出
      const delta = event.data as any;
      process.stdout.write(delta.content.text_delta);
      break;
      
    case 'response.chunk.text.done':
      // 完整响应
      const textDone = event.data as any;
      console.log(`\n🤖 Assistant: ${textDone.content.text}`);
      break;
      
    case 'tool.call.execution.start':
      // 工具执行开始
      const toolStart = event.data as any;
      console.log(`🔧 Using tool: ${toolStart.toolName}`);
      break;
      
    case 'tool.call.execution.done':
      // 工具执行完成
      const toolDone = event.data as any;
      if (toolDone.error) {
        console.error(`❌ Tool failed: ${toolDone.error}`);
      } else {
        console.log(`✅ Tool completed: ${toolDone.toolName}`);
      }
      break;
      
    case 'turn.complete':
      // 回合完成
      console.log('🎯 Conversation turn completed');
      break;
  }
}
```

## 会话管理 API

### 1. 会话创建和切换

```typescript
// 创建新会话
const sessionId1 = agent.createNewSession("Customer Support");
const sessionId2 = agent.createNewSession("Technical Discussion");
const sessionId3 = agent.createNewSession("General Chat");

console.log(`Created sessions: ${sessionId1}, ${sessionId2}, ${sessionId3}`);

// 切换会话
const switched = agent.switchToSession(sessionId1);
if (switched) {
  console.log(`✅ Switched to session: ${sessionId1}`);
  
  // 获取当前会话 ID
  const currentId = agent.getCurrentSessionId();
  console.log(`Current session: ${currentId}`);
} else {
  console.error(`❌ Failed to switch to session: ${sessionId1}`);
}

// 使用会话管理器直接操作
const sessionManager = agent.getSessionManager();
const session = sessionManager.getCurrentSession();
if (session) {
  console.log(`Current session details:`);
  console.log(`  Title: ${session.title}`);
  console.log(`  Created: ${session.createdAt}`);
  console.log(`  Messages: ${session.messageHistory.length}`);
  console.log(`  Tokens: ${session.tokenUsage.totalTokens}`);
}
```

### 2. 会话查询和管理

```typescript
// 获取所有会话
function listAllSessions() {
  const sessions = agent.getSessions();
  
  console.log(`\n📋 All Sessions (${sessions.length} total):`);
  sessions.forEach((session, index) => {
    const isCurrent = session.id === agent.getCurrentSessionId();
    const indicator = isCurrent ? '👉' : '  ';
    
    console.log(`${indicator} ${index + 1}. ${session.title}`);
    console.log(`     ID: ${session.id}`);
    console.log(`     Created: ${new Date(session.createdAt).toLocaleString()}`);
    console.log(`     Last Active: ${new Date(session.lastActiveAt).toLocaleString()}`);
    console.log(`     Messages: ${session.messageHistory.length}`);
    console.log(`     Tokens: ${session.tokenUsage.totalTokens}`);
    
    if (session.metadata && Object.keys(session.metadata).length > 0) {
      console.log(`     Metadata: ${JSON.stringify(session.metadata)}`);
    }
    console.log('');
  });
}

// 查找特定会话
function findSession(sessionId: string) {
  const sessionManager = agent.getSessionManager();
  const session = sessionManager.getSession(sessionId);
  
  if (session) {
    console.log(`✅ Found session: ${session.title}`);
    return session;
  } else {
    console.log(`❌ Session not found: ${sessionId}`);
    return null;
  }
}

// 获取会话统计
function getSessionStatistics() {
  const sessions = agent.getSessions();
  const stats = {
    total: sessions.length,
    totalMessages: sessions.reduce((sum, s) => sum + s.messageHistory.length, 0),
    totalTokens: sessions.reduce((sum, s) => sum + s.tokenUsage.totalTokens, 0),
    oldestSession: null as AgentSession | null,
    newestSession: null as AgentSession | null,
    mostActiveSession: null as AgentSession | null
  };

  if (sessions.length > 0) {
    stats.oldestSession = sessions.reduce((oldest, session) => 
      new Date(session.createdAt) < new Date(oldest.createdAt) ? session : oldest
    );
    
    stats.newestSession = sessions.reduce((newest, session) => 
      new Date(session.createdAt) > new Date(newest.createdAt) ? session : newest
    );
    
    stats.mostActiveSession = sessions.reduce((mostActive, session) => 
      session.messageHistory.length > mostActive.messageHistory.length ? session : mostActive
    );
  }

  return stats;
}
```

### 3. 会话更新和删除

```typescript
// 更新会话标题
function updateSessionTitle(sessionId: string, newTitle: string) {
  const updated = agent.updateSessionTitle(sessionId, newTitle);
  
  if (updated) {
    console.log(`✅ Updated session title: ${newTitle}`);
  } else {
    console.error(`❌ Failed to update session title: ${sessionId}`);
  }
}

// 删除会话
function deleteSession(sessionId: string) {
  // 确保不删除当前活跃的会话
  const currentId = agent.getCurrentSessionId();
  if (sessionId === currentId) {
    console.warn(`⚠️ Cannot delete active session. Switch to another session first.`);
    return;
  }
  
  const deleted = agent.deleteSession(sessionId);
  
  if (deleted) {
    console.log(`✅ Deleted session: ${sessionId}`);
  } else {
    console.error(`❌ Failed to delete session: ${sessionId}`);
  }
}

// 清理旧会话
function cleanupOldSessions(maxAge: number = 7 * 24 * 60 * 60 * 1000) { // 默认7天
  const sessions = agent.getSessions();
  const now = Date.now();
  const currentSessionId = agent.getCurrentSessionId();
  
  const sessionsToDelete = sessions.filter(session => {
    const age = now - new Date(session.lastActiveAt).getTime();
    return age > maxAge && session.id !== currentSessionId;
  });
  
  console.log(`🧹 Cleaning up ${sessionsToDelete.length} old sessions`);
  
  sessionsToDelete.forEach(session => {
    agent.deleteSession(session.id);
    console.log(`   Deleted: ${session.title} (${Math.round((now - new Date(session.lastActiveAt).getTime()) / (24 * 60 * 60 * 1000))} days old)`);
  });
}
```

## 实际应用场景

### 1. 多用户聊天系统

```typescript
class MultiUserChatSystem {
  private agent: StandardAgent;
  private userSessions: Map<string, string> = new Map(); // userId -> sessionId

  constructor(agent: StandardAgent) {
    this.agent = agent;
  }

  async handleUserMessage(userId: string, message: string) {
    // 获取或创建用户会话
    let sessionId = this.userSessions.get(userId);
    
    if (!sessionId) {
      sessionId = this.agent.createNewSession(`User ${userId} Chat`);
      this.userSessions.set(userId, sessionId);
      console.log(`📝 Created new session for user ${userId}: ${sessionId}`);
    }

    console.log(`👤 User ${userId}: ${message}`);

    try {
      // 在用户的专用会话中处理消息
      for await (const event of this.agent.processWithSession(message, sessionId)) {
        await this.handleUserEvent(userId, event);
      }
    } catch (error) {
      console.error(`❌ Error processing message for user ${userId}:`, error);
    }
  }

  private async handleUserEvent(userId: string, event: AgentEvent) {
    switch (event.type) {
      case 'response.chunk.text.done':
        const response = event.data as any;
        console.log(`🤖 To User ${userId}: ${response.content.text}`);
        
        // 发送响应给用户
        await this.sendToUser(userId, response.content.text);
        break;
        
      case 'tool.call.execution.start':
        const toolStart = event.data as any;
        console.log(`🔧 [User ${userId}] Using tool: ${toolStart.toolName}`);
        break;
    }
  }

  async sendToUser(userId: string, message: string) {
    // 实现发送消息给用户的逻辑
    // 例如: WebSocket, HTTP 响应, 消息队列等
    console.log(`📤 Sending to ${userId}: ${message}`);
  }

  getUserSessionInfo(userId: string) {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return null;

    const sessionManager = this.agent.getSessionManager();
    return sessionManager.getSession(sessionId);
  }

  getAllUserSessions() {
    const result = new Map();
    this.userSessions.forEach((sessionId, userId) => {
      const sessionInfo = this.getUserSessionInfo(userId);
      if (sessionInfo) {
        result.set(userId, sessionInfo);
      }
    });
    return result;
  }
}

// 使用示例
const chatSystem = new MultiUserChatSystem(agent);

// 模拟多用户对话
await chatSystem.handleUserMessage('alice', 'What\'s the weather in Paris?');
await chatSystem.handleUserMessage('bob', 'Calculate 15 * 23');
await chatSystem.handleUserMessage('alice', 'Thanks! Now check London weather.');
```

### 2. 主题分类会话管理

```typescript
class TopicBasedSessionManager {
  private agent: StandardAgent;
  private topicSessions: Map<string, string> = new Map(); // topic -> sessionId
  private sessionTopics: Map<string, string> = new Map(); // sessionId -> topic

  constructor(agent: StandardAgent) {
    this.agent = agent;
  }

  async handleTopicMessage(topic: string, message: string) {
    // 获取或创建主题会话
    let sessionId = this.topicSessions.get(topic);
    
    if (!sessionId) {
      sessionId = this.agent.createNewSession(`${topic} Discussion`);
      this.topicSessions.set(topic, sessionId);
      this.sessionTopics.set(sessionId, topic);
      
      console.log(`📚 Created new session for topic "${topic}": ${sessionId}`);
    }

    console.log(`📝 [${topic}] ${message}`);

    // 在主题会话中处理消息
    for await (const event of this.agent.processWithSession(message, sessionId)) {
      await this.handleTopicEvent(topic, event);
    }
  }

  private async handleTopicEvent(topic: string, event: AgentEvent) {
    switch (event.type) {
      case 'response.chunk.text.done':
        const response = event.data as any;
        console.log(`🤖 [${topic}]: ${response.content.text}`);
        break;
        
      case 'turn.complete':
        // 更新主题会话的最后活跃时间
        const sessionId = this.topicSessions.get(topic);
        if (sessionId) {
          const session = this.agent.getSessionManager().getSession(sessionId);
          if (session) {
            console.log(`📊 [${topic}] Session updated: ${session.messageHistory.length} messages, ${session.tokenUsage.totalTokens} tokens`);
          }
        }
        break;
    }
  }

  getTopicSummary() {
    const summary = new Map();
    
    this.topicSessions.forEach((sessionId, topic) => {
      const session = this.agent.getSessionManager().getSession(sessionId);
      if (session) {
        summary.set(topic, {
          sessionId,
          title: session.title,
          messageCount: session.messageHistory.length,
          tokenUsage: session.tokenUsage.totalTokens,
          lastActive: session.lastActiveAt,
          created: session.createdAt
        });
      }
    });
    
    return summary;
  }

  async mergeTopics(sourceTopic: string, targetTopic: string) {
    const sourceSessionId = this.topicSessions.get(sourceTopic);
    const targetSessionId = this.topicSessions.get(targetTopic);
    
    if (!sourceSessionId || !targetSessionId) {
      throw new Error('Both topics must have existing sessions');
    }

    const sourceSession = this.agent.getSessionManager().getSession(sourceSessionId);
    const targetSession = this.agent.getSessionManager().getSession(targetSessionId);
    
    if (!sourceSession || !targetSession) {
      throw new Error('Session data not found');
    }

    console.log(`🔄 Merging topic "${sourceTopic}" into "${targetTopic}"`);

    // 切换到目标会话
    this.agent.switchToSession(targetSessionId);
    
    // 添加合并消息
    await this.handleTopicMessage(targetTopic, 
      `[Merged conversation from topic: ${sourceTopic}] Previous discussion context has been incorporated.`
    );

    // 删除源会话
    this.agent.deleteSession(sourceSessionId);
    this.topicSessions.delete(sourceTopic);
    this.sessionTopics.delete(sourceSessionId);

    console.log(`✅ Successfully merged "${sourceTopic}" into "${targetTopic}"`);
  }
}

// 使用示例
const topicManager = new TopicBasedSessionManager(agent);

// 不同主题的对话
await topicManager.handleTopicMessage('weather', 'What\'s the weather forecast for tomorrow?');
await topicManager.handleTopicMessage('programming', 'How to implement a binary search?');
await topicManager.handleTopicMessage('weather', 'Any chance of rain this week?');
await topicManager.handleTopicMessage('cooking', 'Recipe for chocolate cake');

// 查看主题摘要
const summary = topicManager.getTopicSummary();
console.log('\n📊 Topic Summary:');
summary.forEach((info, topic) => {
  console.log(`  ${topic}: ${info.messageCount} messages, ${info.tokenUsage} tokens`);
});
```

### 3. 会话持久化和恢复

```typescript
class SessionPersistenceManager {
  private agent: StandardAgent;
  private storageDir: string;

  constructor(agent: StandardAgent, storageDir: string = './sessions') {
    this.agent = agent;
    this.storageDir = storageDir;
    this.ensureStorageDir();
  }

  private async ensureStorageDir() {
    const fs = await import('fs/promises');
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directory:', error);
    }
  }

  // 保存单个会话到文件
  async saveSession(sessionId: string): Promise<boolean> {
    try {
      const session = this.agent.getSessionManager().getSession(sessionId);
      if (!session) {
        console.error(`Session not found: ${sessionId}`);
        return false;
      }

      const fs = await import('fs/promises');
      const path = await import('path');
      
      const filename = `${sessionId}.json`;
      const filepath = path.join(this.storageDir, filename);
      
      const sessionData = {
        ...session,
        savedAt: new Date().toISOString(),
        version: '1.0'
      };

      await fs.writeFile(filepath, JSON.stringify(sessionData, null, 2), 'utf-8');
      console.log(`💾 Saved session to: ${filepath}`);
      return true;
    } catch (error) {
      console.error(`Failed to save session ${sessionId}:`, error);
      return false;
    }
  }

  // 从文件恢复会话
  async loadSession(sessionId: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const filename = `${sessionId}.json`;
      const filepath = path.join(this.storageDir, filename);
      
      const data = await fs.readFile(filepath, 'utf-8');
      const sessionData: AgentSession = JSON.parse(data);
      
      // 验证会话数据
      if (!sessionData.id || !sessionData.messageHistory) {
        throw new Error('Invalid session data format');
      }

      // 创建新会话并恢复数据
      const newSessionId = this.agent.createNewSession(sessionData.title);
      const sessionManager = this.agent.getSessionManager();
      
      // 切换到新会话
      this.agent.switchToSession(newSessionId);
      
      // 恢复消息历史
      const chat = this.agent.getChat();
      chat.clearHistory();
      
      if (sessionData.messageHistory.length > 0) {
        sessionData.messageHistory.forEach(message => {
          chat.addHistory(message);
        });
      }

      console.log(`📂 Loaded session from: ${filepath}`);
      console.log(`   Messages restored: ${sessionData.messageHistory.length}`);
      console.log(`   Original tokens: ${sessionData.tokenUsage.totalTokens}`);
      
      return true;
    } catch (error) {
      console.error(`Failed to load session ${sessionId}:`, error);
      return false;
    }
  }

  // 保存所有会话
  async saveAllSessions(): Promise<number> {
    const sessions = this.agent.getSessions();
    let savedCount = 0;

    console.log(`💾 Saving ${sessions.length} sessions...`);

    for (const session of sessions) {
      const success = await this.saveSession(session.id);
      if (success) {
        savedCount++;
      }
    }

    console.log(`✅ Saved ${savedCount}/${sessions.length} sessions`);
    return savedCount;
  }

  // 列出可用的保存文件
  async listSavedSessions(): Promise<string[]> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const files = await fs.readdir(this.storageDir);
      const sessionFiles = files.filter(file => file.endsWith('.json'));
      
      return sessionFiles.map(file => path.basename(file, '.json'));
    } catch (error) {
      console.error('Failed to list saved sessions:', error);
      return [];
    }
  }

  // 自动保存功能
  startAutoSave(intervalMinutes: number = 10) {
    const intervalMs = intervalMinutes * 60 * 1000;
    
    console.log(`⏰ Auto-save enabled: every ${intervalMinutes} minutes`);
    
    return setInterval(async () => {
      console.log('🔄 Auto-saving sessions...');
      const saved = await this.saveAllSessions();
      console.log(`📦 Auto-save completed: ${saved} sessions saved`);
    }, intervalMs);
  }
}

// 使用示例
const persistenceManager = new SessionPersistenceManager(agent, './my-sessions');

// 进行一些对话
await agent.processWithSession('Hello, how are you?', 'test-session-1');
await agent.processWithSession('What is 2+2?', 'test-session-2');

// 保存所有会话
await persistenceManager.saveAllSessions();

// 列出保存的会话
const savedSessions = await persistenceManager.listSavedSessions();
console.log('Saved sessions:', savedSessions);

// 启用自动保存（每5分钟）
const autoSaveTimer = persistenceManager.startAutoSave(5);

// 稍后停止自动保存
// clearInterval(autoSaveTimer);
```

## 高级特性

### 1. 会话事件监听

```typescript
class SessionEventMonitor {
  private agent: StandardAgent;
  private eventLog: Array<{ timestamp: number; sessionId: string; event: string; data?: any }> = [];

  constructor(agent: StandardAgent) {
    this.agent = agent;
    this.setupSessionMonitoring();
  }

  private setupSessionMonitoring() {
    // 监听会话相关事件
    const originalProcess = this.agent.processWithSession.bind(this.agent);
    
    this.agent.processWithSession = async function* (...args) {
      const [userInput, sessionId] = args;
      const monitor = this;
      
      monitor.logEvent(sessionId || 'unknown', 'session_started', { 
        inputType: typeof userInput,
        inputLength: typeof userInput === 'string' ? userInput.length : userInput?.length 
      });

      try {
        for await (const event of originalProcess(...args)) {
          // 记录重要事件
          switch (event.type) {
            case 'tool.call.execution.start':
            case 'tool.call.execution.done':
            case 'turn.complete':
              monitor.logEvent(sessionId || 'unknown', event.type, event.data);
              break;
          }
          
          yield event;
        }
        
        monitor.logEvent(sessionId || 'unknown', 'session_completed');
      } catch (error) {
        monitor.logEvent(sessionId || 'unknown', 'session_error', { error: error.message });
        throw error;
      }
    }.bind(this);
  }

  private logEvent(sessionId: string, event: string, data?: any) {
    this.eventLog.push({
      timestamp: Date.now(),
      sessionId,
      event,
      data
    });

    // 保持日志大小
    if (this.eventLog.length > 1000) {
      this.eventLog = this.eventLog.slice(-800); // 保留最新的800条
    }
  }

  getSessionEvents(sessionId: string) {
    return this.eventLog.filter(log => log.sessionId === sessionId);
  }

  getEventStatistics() {
    const stats = {
      totalEvents: this.eventLog.length,
      sessionCount: new Set(this.eventLog.map(log => log.sessionId)).size,
      eventTypes: new Map<string, number>(),
      sessionsWithErrors: new Set<string>()
    };

    this.eventLog.forEach(log => {
      // 统计事件类型
      const count = stats.eventTypes.get(log.event) || 0;
      stats.eventTypes.set(log.event, count + 1);

      // 记录有错误的会话
      if (log.event === 'session_error') {
        stats.sessionsWithErrors.add(log.sessionId);
      }
    });

    return stats;
  }

  exportEventLog(format: 'json' | 'csv' = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.eventLog, null, 2);
    } else {
      // 简单的 CSV 格式
      const headers = 'Timestamp,SessionId,Event,Data\n';
      const rows = this.eventLog.map(log => 
        `${new Date(log.timestamp).toISOString()},${log.sessionId},${log.event},"${JSON.stringify(log.data || '')}"`
      ).join('\n');
      
      return headers + rows;
    }
  }
}

// 使用示例
const monitor = new SessionEventMonitor(agent);

// 进行一些会话
await agent.processWithSession('Calculate 5 * 7', 'math-session');
await agent.processWithSession('What\'s the weather?', 'weather-session');

// 查看统计
const stats = monitor.getEventStatistics();
console.log('Event statistics:', stats);

// 导出日志
const jsonLog = monitor.exportEventLog('json');
console.log('Event log:', jsonLog);
```

### 2. 会话分析和优化

```typescript
class SessionAnalyzer {
  private agent: StandardAgent;

  constructor(agent: StandardAgent) {
    this.agent = agent;
  }

  analyzeAllSessions() {
    const sessions = this.agent.getSessions();
    
    const analysis = {
      overview: this.getOverviewAnalysis(sessions),
      tokenUsage: this.getTokenUsageAnalysis(sessions),
      conversationPatterns: this.getConversationPatterns(sessions),
      recommendations: this.getOptimizationRecommendations(sessions)
    };

    return analysis;
  }

  private getOverviewAnalysis(sessions: AgentSession[]) {
    const now = Date.now();
    
    return {
      totalSessions: sessions.length,
      totalMessages: sessions.reduce((sum, s) => sum + s.messageHistory.length, 0),
      totalTokens: sessions.reduce((sum, s) => sum + s.tokenUsage.totalTokens, 0),
      averageMessagesPerSession: sessions.length > 0 ? 
        sessions.reduce((sum, s) => sum + s.messageHistory.length, 0) / sessions.length : 0,
      activeSessions: sessions.filter(s => 
        now - new Date(s.lastActiveAt).getTime() < 24 * 60 * 60 * 1000
      ).length,
      oldestSession: sessions.reduce((oldest, s) => 
        !oldest || new Date(s.createdAt) < new Date(oldest.createdAt) ? s : oldest
      , null as AgentSession | null),
      newestSession: sessions.reduce((newest, s) => 
        !newest || new Date(s.createdAt) > new Date(newest.createdAt) ? s : newest
      , null as AgentSession | null)
    };
  }

  private getTokenUsageAnalysis(sessions: AgentSession[]) {
    const tokenUsages = sessions.map(s => s.tokenUsage.totalTokens);
    
    return {
      total: tokenUsages.reduce((sum, tokens) => sum + tokens, 0),
      average: tokenUsages.length > 0 ? 
        tokenUsages.reduce((sum, tokens) => sum + tokens, 0) / tokenUsages.length : 0,
      median: this.calculateMedian(tokenUsages),
      min: Math.min(...tokenUsages),
      max: Math.max(...tokenUsages),
      distribution: this.getTokenDistribution(tokenUsages),
      highUsageSessions: sessions
        .filter(s => s.tokenUsage.totalTokens > 10000)
        .sort((a, b) => b.tokenUsage.totalTokens - a.tokenUsage.totalTokens)
        .slice(0, 5)
    };
  }

  private getConversationPatterns(sessions: AgentSession[]) {
    const patterns = {
      averageConversationLength: 0,
      commonMessageTypes: new Map<string, number>(),
      timeDistribution: new Map<string, number>(),
      sessionDurations: [] as number[]
    };

    sessions.forEach(session => {
      // 会话时长
      const duration = new Date(session.lastActiveAt).getTime() - new Date(session.createdAt).getTime();
      patterns.sessionDurations.push(duration);

      // 消息类型分析
      session.messageHistory.forEach(message => {
        const type = message.content.type;
        patterns.commonMessageTypes.set(type, (patterns.commonMessageTypes.get(type) || 0) + 1);
      });

      // 时间分布分析（按小时）
      const hour = new Date(session.createdAt).getHours();
      const timeSlot = `${hour}:00-${hour + 1}:00`;
      patterns.timeDistribution.set(timeSlot, (patterns.timeDistribution.get(timeSlot) || 0) + 1);
    });

    patterns.averageConversationLength = sessions.length > 0 ?
      sessions.reduce((sum, s) => sum + s.messageHistory.length, 0) / sessions.length : 0;

    return patterns;
  }

  private getOptimizationRecommendations(sessions: AgentSession[]) {
    const recommendations: string[] = [];
    
    // 检查高 Token 使用的会话
    const highTokenSessions = sessions.filter(s => s.tokenUsage.totalTokens > 20000);
    if (highTokenSessions.length > 0) {
      recommendations.push(`Consider implementing history truncation for ${highTokenSessions.length} high-token sessions`);
    }

    // 检查长时间未活跃的会话
    const now = Date.now();
    const staleSessionsCount = sessions.filter(s => 
      now - new Date(s.lastActiveAt).getTime() > 7 * 24 * 60 * 60 * 1000
    ).length;
    
    if (staleSessionsCount > 0) {
      recommendations.push(`Consider archiving or cleaning up ${staleSessionsCount} stale sessions (inactive > 7 days)`);
    }

    // 检查会话数量
    if (sessions.length > 50) {
      recommendations.push('Large number of sessions detected. Consider implementing session lifecycle management');
    }

    // 检查消息密度
    const averageMessages = sessions.length > 0 ?
      sessions.reduce((sum, s) => sum + s.messageHistory.length, 0) / sessions.length : 0;
    
    if (averageMessages > 100) {
      recommendations.push('High message density detected. Consider implementing conversation summarization');
    }

    return recommendations;
  }

  private calculateMedian(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0 ?
      (sorted[mid - 1] + sorted[mid]) / 2 :
      sorted[mid];
  }

  private getTokenDistribution(tokenUsages: number[]) {
    const ranges = [
      { min: 0, max: 1000, label: '0-1K' },
      { min: 1000, max: 5000, label: '1K-5K' },
      { min: 5000, max: 10000, label: '5K-10K' },
      { min: 10000, max: 20000, label: '10K-20K' },
      { min: 20000, max: Infinity, label: '20K+' }
    ];

    const distribution = new Map<string, number>();
    
    ranges.forEach(range => {
      const count = tokenUsages.filter(tokens => 
        tokens >= range.min && tokens < range.max
      ).length;
      distribution.set(range.label, count);
    });

    return distribution;
  }

  generateReport(): string {
    const analysis = this.analyzeAllSessions();
    
    let report = '📊 Session Analysis Report\n';
    report += '========================\n\n';
    
    // 概览
    report += '📋 Overview:\n';
    report += `  Total Sessions: ${analysis.overview.totalSessions}\n`;
    report += `  Total Messages: ${analysis.overview.totalMessages}\n`;
    report += `  Total Tokens: ${analysis.overview.totalTokens.toLocaleString()}\n`;
    report += `  Average Messages/Session: ${analysis.overview.averageMessagesPerSession.toFixed(2)}\n`;
    report += `  Active Sessions (24h): ${analysis.overview.activeSessions}\n\n`;
    
    // Token 使用
    report += '💰 Token Usage:\n';
    report += `  Average per Session: ${analysis.tokenUsage.average.toFixed(0)}\n`;
    report += `  Median: ${analysis.tokenUsage.median.toFixed(0)}\n`;
    report += `  Range: ${analysis.tokenUsage.min} - ${analysis.tokenUsage.max.toLocaleString()}\n`;
    report += `  High Usage Sessions: ${analysis.tokenUsage.highUsageSessions.length}\n\n`;
    
    // 分布
    report += '📊 Token Distribution:\n';
    analysis.tokenUsage.distribution.forEach((count, range) => {
      report += `  ${range}: ${count} sessions\n`;
    });
    report += '\n';
    
    // 建议
    if (analysis.recommendations.length > 0) {
      report += '💡 Recommendations:\n';
      analysis.recommendations.forEach(rec => {
        report += `  • ${rec}\n`;
      });
    }
    
    return report;
  }
}

// 使用示例
const analyzer = new SessionAnalyzer(agent);

// 生成分析报告
console.log(analyzer.generateReport());

// 获取详细分析
const analysis = analyzer.analyzeAllSessions();
console.log('Detailed analysis:', JSON.stringify(analysis, null, 2));
```

## 最佳实践

### 1. 会话生命周期管理

```typescript
class SessionLifecycleManager {
  private agent: StandardAgent;
  private maxSessionAge = 30 * 24 * 60 * 60 * 1000; // 30天
  private maxSessionSize = 100; // 最大消息数
  private maxTokensPerSession = 50000;

  constructor(agent: StandardAgent) {
    this.agent = agent;
  }

  // 会话健康检查
  performHealthCheck() {
    const sessions = this.agent.getSessions();
    const issues: Array<{ sessionId: string; issue: string; severity: 'low' | 'medium' | 'high' }> = [];

    sessions.forEach(session => {
      // 检查会话年龄
      const age = Date.now() - new Date(session.createdAt).getTime();
      if (age > this.maxSessionAge) {
        issues.push({
          sessionId: session.id,
          issue: `Session is ${Math.round(age / (24 * 60 * 60 * 1000))} days old`,
          severity: 'medium'
        });
      }

      // 检查消息数量
      if (session.messageHistory.length > this.maxSessionSize) {
        issues.push({
          sessionId: session.id,
          issue: `Session has ${session.messageHistory.length} messages (exceeds ${this.maxSessionSize})`,
          severity: 'high'
        });
      }

      // 检查 Token 使用
      if (session.tokenUsage.totalTokens > this.maxTokensPerSession) {
        issues.push({
          sessionId: session.id,
          issue: `Session uses ${session.tokenUsage.totalTokens} tokens (exceeds ${this.maxTokensPerSession})`,
          severity: 'high'
        });
      }
    });

    return issues;
  }

  // 自动优化会话
  async optimizeSessions() {
    const issues = this.performHealthCheck();
    const optimizations: string[] = [];

    for (const issue of issues) {
      if (issue.severity === 'high') {
        if (issue.issue.includes('messages')) {
          // 截断长对话
          await this.truncateSession(issue.sessionId);
          optimizations.push(`Truncated session ${issue.sessionId}`);
        } else if (issue.issue.includes('tokens')) {
          // 清理高 Token 会话
          await this.cleanupHighTokenSession(issue.sessionId);
          optimizations.push(`Cleaned up high-token session ${issue.sessionId}`);
        }
      }
    }

    return optimizations;
  }

  private async truncateSession(sessionId: string) {
    const session = this.agent.getSessionManager().getSession(sessionId);
    if (!session) return;

    // 保留最近的50%消息
    const keepCount = Math.floor(session.messageHistory.length * 0.5);
    const recentMessages = session.messageHistory.slice(-keepCount);

    // 切换到会话并重新设置历史
    this.agent.switchToSession(sessionId);
    const chat = this.agent.getChat();
    chat.clearHistory();
    
    recentMessages.forEach(message => {
      chat.addHistory(message);
    });

    console.log(`🔧 Truncated session ${sessionId}: kept ${keepCount}/${session.messageHistory.length} messages`);
  }

  private async cleanupHighTokenSession(sessionId: string) {
    // 对于高 Token 使用的会话，可以：
    // 1. 清理历史记录
    // 2. 压缩对话内容
    // 3. 创建摘要

    const session = this.agent.getSessionManager().getSession(sessionId);
    if (!session) return;

    // 简单策略：清理并添加摘要
    this.agent.switchToSession(sessionId);
    const chat = this.agent.getChat();
    
    const messageCount = session.messageHistory.length;
    const tokenCount = session.tokenUsage.totalTokens;
    
    chat.clearHistory();
    
    // 添加摘要消息
    const summaryMessage = {
      role: 'assistant' as const,
      content: {
        type: 'text' as const,
        text: `[Session cleaned up] Previous conversation contained ${messageCount} messages using ${tokenCount} tokens. History has been cleared to optimize performance.`
      },
      metadata: {
        timestamp: Date.now(),
        type: 'system_cleanup'
      }
    };
    
    chat.addHistory(summaryMessage);

    console.log(`🧹 Cleaned up session ${sessionId}: removed ${messageCount} messages, ${tokenCount} tokens`);
  }
}

// 使用示例
const lifecycleManager = new SessionLifecycleManager(agent);

// 执行健康检查
const issues = lifecycleManager.performHealthCheck();
console.log('Session health issues:', issues);

// 自动优化
const optimizations = await lifecycleManager.optimizeSessions();
console.log('Applied optimizations:', optimizations);
```

### 2. 错误处理和重试

```typescript
async function robustSessionProcessing(
  agent: StandardAgent,
  message: string,
  sessionId: string,
  maxRetries: number = 3
) {
  let attempt = 1;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    try {
      console.log(`🔄 Attempt ${attempt}/${maxRetries} for session ${sessionId}`);

      const abortController = new AbortController();
      
      // 设置超时
      const timeout = setTimeout(() => {
        abortController.abort();
      }, 30000 * attempt); // 递增超时

      // 处理消息
      for await (const event of agent.processWithSession(message, sessionId, abortController.signal)) {
        await handleEvent(event);
      }

      clearTimeout(timeout);
      console.log(`✅ Successfully processed message in session ${sessionId}`);
      return;

    } catch (error) {
      lastError = error as Error;
      console.error(`❌ Attempt ${attempt} failed:`, error.message);

      // 某些错误不应该重试
      if (error.message.includes('User cancelled') || 
          error.message.includes('Invalid session')) {
        throw error;
      }

      // 会话相关的特殊处理
      if (error.message.includes('session') || error.message.includes('history')) {
        console.log('🔧 Session error detected, attempting recovery...');
        
        try {
          // 尝试修复会话状态
          const sessionManager = agent.getSessionManager();
          const session = sessionManager.getSession(sessionId);
          
          if (!session) {
            // 会话不存在，创建新的
            console.log('📝 Creating new session...');
            const newSessionId = agent.createNewSession(`Recovered Session ${sessionId}`);
            sessionId = newSessionId;
          } else {
            // 重置会话状态
            console.log('🔄 Resetting session state...');
            agent.switchToSession(sessionId);
          }
        } catch (recoveryError) {
          console.error('Session recovery failed:', recoveryError);
        }
      }

      if (attempt < maxRetries) {
        // 实现退避策略
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      attempt++;
    }
  }

  throw new Error(`Failed to process message after ${maxRetries} attempts: ${lastError?.message}`);
}

async function handleEvent(event: AgentEvent) {
  // 事件处理逻辑
  switch (event.type) {
    case 'response.chunk.text.done':
      const response = event.data as any;
      console.log('Assistant:', response.content.text);
      break;
    // ... 其他事件处理
  }
}
```

通过遵循这些指南和最佳实践，您可以充分利用 MiniAgent 的 SessionManager 功能，构建强大、可靠且可扩展的多会话 AI 应用程序。