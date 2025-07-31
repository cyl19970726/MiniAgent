# MiniAgent 快速开始指南

## 安装

```bash
npm install @continue-reasoning/mini-agent
```

## 5 分钟快速上手

### 1. 最简单的例子 - 使用 StandardAgent

```typescript
import { StandardAgent } from '@continue-reasoning/mini-agent';

// 创建 Agent
const agent = new StandardAgent([], {
  chatProvider: 'gemini',
  agentConfig: {
    model: 'gemini-2.0-flash',
    workingDirectory: process.cwd(),
    apiKey: process.env.GEMINI_API_KEY
  },
  chatConfig: {
    apiKey: process.env.GEMINI_API_KEY,
    modelName: 'gemini-2.0-flash',
    systemPrompt: 'You are a helpful assistant.'
  },
  toolSchedulerConfig: {
    approvalMode: 'yolo'
  }
});

// 处理对话
async function chat() {
  for await (const event of agent.processWithSession("Hello! How are you?")) {
    if (event.type === 'response.chunk.text.done') {
      console.log('Assistant:', event.data.content.text);
    }
  }
}

chat();
```

### 2. 添加工具 - 天气查询

```typescript
import { ITool, ToolResult } from '@continue-reasoning/mini-agent';

// 定义天气工具
const weatherTool: ITool = {
  name: 'get_weather',
  description: 'Get weather for a city',
  schema: {
    name: 'get_weather',
    description: 'Get weather information',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' }
      },
      required: ['city']
    }
  },
  isOutputMarkdown: true,
  canUpdateOutput: false,
  
  validateToolParams(params: any): string | null {
    return params.city ? null : 'City is required';
  },
  
  getDescription(params: any): string {
    return `Get weather for ${params.city}`;
  },
  
  async shouldConfirmExecute(): Promise<false> {
    return false;
  },
  
  async execute(params: any): Promise<ToolResult> {
    // 模拟天气 API
    const temp = Math.floor(20 + Math.random() * 15);
    const weather = `🌤️ ${params.city}: ${temp}°C, Partly Cloudy`;
    
    return {
      summary: `Weather for ${params.city}`,
      llmContent: weather,
      returnDisplay: weather
    };
  }
};

// 创建带工具的 Agent
const agent = new StandardAgent([weatherTool], config);

// 使用工具
async function askWeather() {
  for await (const event of agent.processWithSession("What's the weather in Beijing?")) {
    if (event.type === 'tool.call.execution.start') {
      console.log('🔧 Calling tool:', event.data.toolName);
    }
    if (event.type === 'response.chunk.text.done') {
      console.log('Assistant:', event.data.content.text);
    }
  }
}
```

### 3. 会话管理 - 多用户对话

```typescript
// 创建不同的会话
const user1Session = agent.createNewSession("User 1 Chat");
const user2Session = agent.createNewSession("User 2 Chat");

// 用户 1 的对话
for await (const event of agent.processWithSession(
  "I'm planning a trip to Tokyo", 
  user1Session
)) {
  // 处理用户 1 的响应
}

// 用户 2 的对话（独立的上下文）
for await (const event of agent.processWithSession(
  "Help me write Python code", 
  user2Session
)) {
  // 处理用户 2 的响应
}

// 切回用户 1 继续对话
for await (const event of agent.processWithSession(
  "What's the best time to visit?", 
  user1Session
)) {
  // 上下文自动恢复，知道在讨论东京旅行
}
```

## 常见用例

### 1. 流式输出处理

```typescript
let fullResponse = '';

for await (const event of agent.processWithSession(message)) {
  switch (event.type) {
    case 'response.chunk.text.delta':
      // 实时显示文本
      process.stdout.write(event.data.content.text_delta);
      fullResponse += event.data.content.text_delta;
      break;
      
    case 'response.chunk.text.done':
      // 完整响应
      console.log('\nComplete:', event.data.content.text);
      break;
      
    case 'tool.call.execution.start':
      console.log(`\n🔧 Using tool: ${event.data.toolName}`);
      break;
  }
}
```

### 2. 错误处理

```typescript
try {
  for await (const event of agent.processWithSession(message)) {
    if (event.type === 'agent.error' || event.type === 'response.failed') {
      console.error('Error:', event.data);
      // 实现错误恢复逻辑
    }
  }
} catch (error) {
  console.error('Fatal error:', error);
}
```

### 3. 中断处理

```typescript
const abortController = new AbortController();

// 设置超时
setTimeout(() => {
  console.log('Timeout! Aborting...');
  abortController.abort();
}, 30000);

// 传递 abort signal
for await (const event of agent.processWithSession(
  message, 
  sessionId, 
  abortController.signal
)) {
  // 处理事件
}
```

### 4. Token 使用监控

```typescript
// 获取当前会话状态
const status = agent.getSessionStatus();
console.log(`Tokens used: ${status.tokenUsage.totalTokens}`);
console.log(`Usage: ${status.tokenUsage.usagePercentage.toFixed(2)}%`);

// 获取所有会话的 token 使用
const sessions = agent.getSessions();
sessions.forEach(session => {
  console.log(`${session.title}: ${session.tokenUsage.totalTokens} tokens`);
});
```

## 进阶配置

### 使用 OpenAI

```typescript
const agent = new StandardAgent(tools, {
  chatProvider: 'openai',
  agentConfig: {
    model: 'gpt-4o',
    workingDirectory: process.cwd(),
    apiKey: process.env.OPENAI_API_KEY
  },
  chatConfig: {
    apiKey: process.env.OPENAI_API_KEY,
    modelName: 'gpt-4o',
    systemPrompt: 'You are a helpful assistant.'
  },
  toolSchedulerConfig: {
    approvalMode: 'default'
  }
});
```

### 工具确认模式

```typescript
// 'yolo' - 自动批准所有工具调用
// 'default' - 根据工具的 shouldConfirmExecute 决定
// 'always' - 始终需要确认

const agent = new StandardAgent(tools, {
  // ... 其他配置
  toolSchedulerConfig: {
    approvalMode: 'always',
    // 自定义确认处理
    onToolCallsUpdate: (calls) => {
      // 显示待确认的工具调用
    }
  }
});
```

### 日志配置

```typescript
import { configureLogger, LogLevel } from '@continue-reasoning/mini-agent';

configureLogger({
  level: LogLevel.DEBUG,
  autoDetectContext: true,
  includeTimestamp: true,
  enableColors: true
});
```

## 下一步

- 查看[完整文档](./session-manager-design.md)了解详细功能
- 参考[架构设计](./architecture.md)理解内部原理
- 探索[示例代码](../examples/)学习最佳实践

## 常见问题

### Q: 如何选择合适的模型？
- **gemini-2.0-flash**: 快速、便宜，适合大多数场景
- **gpt-4o**: 功能强大，适合复杂任务
- **o1**: 支持深度思考，适合需要推理的任务

### Q: 如何处理长对话？
- 使用会话管理分割不同主题
- 监控 token 使用量
- 必要时创建新会话

### Q: 工具执行失败怎么办？
- 监听 `ToolExecutionDone` 事件的 error 字段
- 实现重试逻辑
- 提供用户友好的错误信息

### Q: 如何优化性能？
- 使用流式输出减少延迟感
- 合理使用工具并行执行
- 利用缓存机制（OpenAI）