# BaseAgent 使用指南

## 概述

BaseAgent 是 MiniAgent 框架的核心组件，提供了完整的 AI Agent 功能，包括与 LLM 通信、工具执行、事件管理和状态追踪。本文档详细介绍如何使用 BaseAgent。

有关 Agent 事件系统的详细信息，请参阅 [事件系统文档](./architecture/event-system.md)。

## 基本使用

### 创建 BaseAgent

```typescript
import { 
  BaseAgent, 
  GeminiChat, 
  OpenAIChatResponse,
  CoreToolScheduler 
} from '@continue-reasoning/mini-agent';

// 1. 创建 Chat 实例
const chat = new GeminiChat({
  apiKey: process.env.GEMINI_API_KEY,
  modelName: 'gemini-2.0-flash',
  tokenLimit: 100000,
  systemPrompt: 'You are a helpful assistant with access to various tools.'
});

// 2. 创建 ToolScheduler
const toolScheduler = new CoreToolScheduler({
  tools: [weatherTool, calculatorTool, fileReadTool],
  approvalMode: 'yolo', // 自动批准所有工具调用
  onAllToolCallsComplete: (completedCalls) => {
    console.log(`✅ ${completedCalls.length} tools completed`);
  }
});

// 3. 创建 BaseAgent
const agent = new BaseAgent(
  {
    model: 'gemini-2.0-flash',
    workingDirectory: process.cwd(),
    apiKey: process.env.GEMINI_API_KEY,
    sessionId: 'default-session',
    maxHistoryTokens: 50000,
    debugMode: true
  },
  chat,
  toolScheduler
);
```

### 处理用户请求

```typescript
async function processUserRequest(userInput: string, sessionId: string) {
  // 构建用户消息
  const userMessages = [{
    role: 'user' as const,
    content: { type: 'text' as const, text: userInput },
    metadata: { sessionId, timestamp: Date.now() }
  }];

  // 创建 AbortController 用于取消操作
  const abortController = new AbortController();
  
  // 设置超时
  setTimeout(() => {
    console.log('⏰ Request timeout, aborting...');
    abortController.abort();
  }, 60000);

  try {
    // 处理请求并获取事件流
    const events = agent.process(userMessages, sessionId, abortController.signal);
    
    for await (const event of events) {
      await handleAgentEvent(event);
    }
  } catch (error) {
    console.error('❌ Error processing request:', error);
  }
}
```

## 事件处理

BaseAgent 通过事件驱动的方式提供实时状态反馈。详细的事件类型和处理方法请参阅 [事件系统文档](./architecture/event-system.md)。

### 基本事件处理示例

```typescript
async function handleAgentEvent(event: AgentEvent): Promise<void> {
  switch (event.type) {
    case 'response.chunk.text.delta':
      // 实时显示文本
      process.stdout.write(event.data.content.text_delta);
      break;
      
    case 'response.chunk.text.done':
      // 完整响应
      console.log('\nAssistant:', event.data.content.text);
      break;
      
    case 'tool.call.execution.start':
      console.log(`🔧 Using tool: ${event.data.toolName}`);
      break;
      
    case 'tool.call.execution.done':
      if (event.data.error) {
        console.error(`❌ Tool failed: ${event.data.error}`);
      } else {
        console.log(`✅ Tool completed: ${event.data.toolName}`);
      }
      break;
      
    case 'turn.complete':
      console.log('🎯 Conversation turn completed');
      break;
  }
}
```

## 高级用法

### 事件过滤和分组

```typescript
async function processWithEventFiltering(userInput: string, sessionId: string) {
  const events = agent.process([{
    role: 'user',
    content: { type: 'text', text: userInput },
    metadata: { sessionId }
  }], sessionId, new AbortController().signal);

  // 分组处理不同类型的事件
  const llmEvents: AgentEvent[] = [];
  const toolEvents: AgentEvent[] = [];
  const userEvents: AgentEvent[] = [];

  for await (const event of events) {
    switch (event.type) {
      case AgentEventType.ResponseChunkTextDelta:
      case AgentEventType.ResponseChunkTextDone:
      case AgentEventType.ResponseStart:
      case AgentEventType.ResponseComplete:
        llmEvents.push(event);
        await handleLLMEvent(event);
        break;

      case AgentEventType.ToolExecutionStart:
      case AgentEventType.ToolExecutionDone:
        toolEvents.push(event);
        await handleToolEvent(event);
        break;

      case AgentEventType.UserMessage:
      case AgentEventType.UserCancelled:
        userEvents.push(event);
        await handleUserEvent(event);
        break;

      case AgentEventType.TurnComplete:
        // 处理汇总信息
        await handleTurnSummary(llmEvents, toolEvents, userEvents);
        break;
    }
  }
}
```

### 性能监控

```typescript
class AgentPerformanceMonitor {
  private metrics = {
    totalTurns: 0,
    totalTokens: 0,
    toolExecutions: new Map<string, number>(),
    averageResponseTime: 0,
    errorCount: 0
  };

  async monitorAgentEvents(events: AsyncGenerator<AgentEvent>) {
    const turnStartTime = Date.now();

    for await (const event of events) {
      switch (event.type) {
        case AgentEventType.ToolExecutionDone:
          const toolData = event.data as any;
          const currentCount = this.metrics.toolExecutions.get(toolData.toolName) || 0;
          this.metrics.toolExecutions.set(toolData.toolName, currentCount + 1);
          break;

        case AgentEventType.TurnComplete:
          this.metrics.totalTurns++;
          const duration = Date.now() - turnStartTime;
          this.updateAverageResponseTime(duration);
          break;

        case AgentEventType.Error:
        case AgentEventType.ResponseFailed:
          this.metrics.errorCount++;
          break;

        case AgentEventType.ResponseComplete:
          const usage = agent.getTokenUsage();
          this.metrics.totalTokens = usage.totalTokens;
          break;
      }
    }
  }

  private updateAverageResponseTime(duration: number) {
    if (this.metrics.totalTurns === 1) {
      this.metrics.averageResponseTime = duration;
    } else {
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * (this.metrics.totalTurns - 1) + duration) / this.metrics.totalTurns;
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }
}
```

### 状态管理

```typescript
class AgentStateManager {
  private currentTurn = 0;
  private sessionData: Map<string, any> = new Map();
  private activeTools: Set<string> = new Set();

  async handleStateUpdates(event: AgentEvent) {
    switch (event.type) {
      case AgentEventType.UserMessage:
        this.currentTurn++;
        break;

      case AgentEventType.ToolExecutionStart:
        const startData = event.data as any;
        this.activeTools.add(startData.callId);
        break;

      case AgentEventType.ToolExecutionDone:
        const doneData = event.data as any;
        this.activeTools.delete(doneData.callId);
        break;

      case AgentEventType.TurnComplete:
        // 保存回合状态
        const turnState = {
          turn: this.currentTurn,
          timestamp: Date.now(),
          tokenUsage: agent.getTokenUsage()
        };
        this.sessionData.set(`turn_${this.currentTurn}`, turnState);
        break;
    }
  }

  getCurrentState() {
    return {
      currentTurn: this.currentTurn,
      activeToolCount: this.activeTools.size,
      sessionDataSize: this.sessionData.size
    };
  }
}
```

## 最佳实践

### 1. 错误处理策略
```typescript
async function robustEventHandling(event: AgentEvent) {
  try {
    await handleAgentEvent(event);
  } catch (error) {
    console.error(`Error handling event ${event.type}:`, error);
    
    // 记录错误但不中断事件流
    errorLogger.log({
      eventType: event.type,
      error: error.message,
      timestamp: Date.now()
    });
  }
}
```

### 2. 资源管理
```typescript
// 清理长时间运行的会话
if (agent.getStatus().historySize > 100) {
  console.log('📝 History size limit reached, clearing...');
  agent.clearHistory();
}

// 监控内存使用
const memUsage = process.memoryUsage();
if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
  console.warn('⚠️  High memory usage detected');
}
```

### 3. 用户体验优化
```typescript
// 实现智能的加载状态
let loadingTimer: NodeJS.Timeout;

case AgentEventType.ResponseStart:
  loadingTimer = setTimeout(() => {
    ui.showMessage("This is taking longer than usual...");
  }, 10000);
  break;

case AgentEventType.ResponseComplete:
  clearTimeout(loadingTimer);
  break;
```

通过理解和正确处理这些事件，您可以构建响应迅速、用户友好的 AI 应用程序。