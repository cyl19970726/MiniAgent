# MiniAgent Framework Integration Guide

> 你是一个 MiniAgent 框架的集成工程师，负责把 MiniAgent 集成到项目里。此文档专注于集成过程，而不是 MiniAgent 的内部运行原理。

## 目录

1. [快速开始](#快速开始)
2. [完整示例参考](#完整示例参考)
3. [工具系统：创建和管理 Tools](#工具系统创建和管理-tools)
4. [StandardAgent：使用和 Session 管理](#standardagent使用和-session-管理)
5. [流式接口：如何处理 Streaming](#流式接口如何处理-streaming)
6. [事件系统：监听和处理事件](#事件系统监听和处理事件)
7. [配置详解：所有 Config 说明](#配置详解所有-config-说明)
8. [工具执行器：回调和批准流程](#工具执行器回调和批准流程)
9. [常见问题和解决方案](#常见问题和解决方案)

## 快速开始

### 安装依赖

```bash
pnpm install @continue-reasoning/mini-agent
```

### 环境设置

```bash
# 创建 .env 文件
echo "OPENAI_API_KEY=your_openai_api_key" > .env
echo "GEMINI_API_KEY=your_gemini_api_key" >> .env

# 安装开发依赖
pnpm install -D typescript tsx @types/node dotenv
```

### TypeScript 配置

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

### 基础使用

```typescript
import { StandardAgent, AllConfig, ITool } from '@continue-reasoning/mini-agent';

// 1. 创建配置
const config: AllConfig = {
  agentConfig: {
    model: 'gpt-4',
    workingDirectory: process.cwd(),
    apiKey: process.env.OPENAI_API_KEY
  },
  chatConfig: {
    modelName: 'gpt-4',
    apiKey: process.env.OPENAI_API_KEY,
    systemPrompt: '你是一个有用的助手',
    tokenLimit: 128000
  },
  toolSchedulerConfig: {
    approvalMode: 'default'
  }
};

// 2. 创建 StandardAgent
const agent = new StandardAgent([], config);

// 3. 处理用户输入
for await (const event of agent.processWithSession('Hello!')) {
  console.log(event);
}
```

## 完整示例参考

在开始详细集成之前，建议先查看这些完整的工作示例：

### examples/tools.ts - 工具创建示例

这个文件展示了如何创建生产级别的工具：

```typescript
// 📁 examples/tools.ts
import { createWeatherTool, createSubTool, CITY_COORDINATES } from '@continue-reasoning/mini-agent/examples/tools';

// 1. 使用预建工具
const weatherTool = createWeatherTool();
const mathTool = createSubTool();

// 2. 获取天气数据
const beijingCoords = CITY_COORDINATES['北京']; // { latitude: 39.9042, longitude: 116.4074 }
const result = await weatherTool.execute(beijingCoords, new AbortController().signal);

// 3. 数学计算
const mathResult = await mathTool.execute({ minuend: 10, subtrahend: 5 }, new AbortController().signal);
console.log(mathResult.data); // { result: 5, operation: "10 - 5 = 5" }
```

**关键特性：**
- 完整的 TypeScript 类型定义
- 实时输出更新支持
- 错误处理和取消信号
- 预定义的城市坐标数据
- 生产就绪的工具验证

### examples/sessionManagerExample.ts - 会话管理示例

这个文件演示了复杂的多会话管理场景：

```typescript
// 📁 examples/sessionManagerExample.ts
import { StandardAgent, AgentEventType } from '@continue-reasoning/mini-agent';
import { createWeatherTool, createSubTool } from '@continue-reasoning/mini-agent/examples/tools';

// 运行示例
async function runExample() {
  const tools = [createWeatherTool(), createSubTool()];
  const agent = new StandardAgent(tools, config);
  
  // 创建多个会话进行温度比较
  const session1 = agent.createNewSession('Beijing vs Shanghai');
  const session2 = agent.createNewSession('Shanghai vs Guangzhou');
  
  // 在不同会话中进行独立对话
  await processConversation(agent, '比较北京和上海的温度', session1);
  await processConversation(agent, '比较上海和广州的温度', session2);
  
  // 切换回第一个会话继续对话
  agent.switchToSession(session1);
  await processConversation(agent, '现在比较广州和深圳的温度', session1);
}
```

**演示功能：**
- 多会话并行处理
- 会话状态隔离
- 会话历史保持
- 实时事件处理
- Token 使用统计

### 如何运行示例

```bash
# 设置环境变量
export OPENAI_API_KEY="your_openai_key"

# 运行会话管理示例
npx tsx examples/sessionManagerExample.ts

# 在你的项目中导入和使用
import { createWeatherTool } from '@continue-reasoning/mini-agent/examples/tools';
```

## 工具系统：创建和管理 Tools

### ITool 和 BaseTool 结构详解

#### ITool 接口

```typescript
import { ITool, IToolResult, DefaultToolResult, ToolDeclaration } from '@continue-reasoning/mini-agent';

// ITool 接口定义了所有工具必须实现的方法
interface ITool<TParams = unknown, TResult extends IToolResult = DefaultToolResult> {
  // 基本属性
  name: string;                     // 工具名称
  description: string;              // 工具描述
  schema: ToolDeclaration;          // 工具声明
  isOutputMarkdown: boolean;        // 输出是否为 Markdown
  canUpdateOutput: boolean;         // 是否支持流式输出
  
  // 核心方法
  validateToolParams(params: TParams): string | null;
  getDescription(params: TParams): string;
  shouldConfirmExecute(params: TParams, signal: AbortSignal): Promise<ToolCallConfirmationDetails | false>;
  execute(params: TParams, signal: AbortSignal, updateOutput?: (output: string) => void): Promise<TResult>;
}
```

#### BaseTool 类结构详解

BaseTool 是一个抽象基类，提供了完整的工具实现框架。理解其结构对于创建高质量工具至关重要：

```typescript
import { BaseTool, Schema, Type, DefaultToolResult } from '@continue-reasoning/mini-agent';

// BaseTool 类的完整结构
export abstract class BaseTool<TParams = unknown, TResult = unknown> 
  implements ITool<TParams, DefaultToolResult<TResult>> {
  
  // === 核心属性 ===
  readonly name: string;           // 工具内部名称 (API调用用)
  readonly displayName: string;    // 用户友好的显示名称
  readonly description: string;    // 工具功能描述
  readonly parameterSchema: Schema; // 参数验证Schema
  readonly isOutputMarkdown: boolean; // 输出是否为Markdown格式
  readonly canUpdateOutput: boolean;  // 是否支持流式输出更新
  
  // === 自动生成的属性 ===
  get schema(): ToolDeclaration {  // 工具声明，自动由name、description、parameterSchema组合
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameterSchema,
    };
  }
  
  // === 可重写的方法 ===
  validateToolParams(params: TParams): string | null;      // 参数验证
  getDescription(params: TParams): string;                 // 获取执行描述
  shouldConfirmExecute(params: TParams, signal: AbortSignal): Promise<ToolCallConfirmationDetails | false>; // 确认执行
  
  // === 必须实现的抽象方法 ===
  abstract execute(params: TParams, signal: AbortSignal, updateOutput?: (output: string) => void): Promise<DefaultToolResult<TResult>>;
  
  // === 内置的辅助方法 ===
  protected createResult(llmContent: string, returnDisplay?: string, summary?: string): {...};
  protected createErrorResult(error: Error | string, context?: string): {...};
  protected createFileDiffResult(fileName: string, fileDiff: string, llmContent: string, summary?: string): {...};
  protected validateRequiredParams(params: Record<string, unknown>, requiredFields: string[]): string | null;
  protected validateParameterTypes(params: Record<string, unknown>, typeMap: Record<string, string>): string | null;
  protected formatProgress(operation: string, progress: string, emoji?: string): string;
  protected checkAbortSignal(signal: AbortSignal, operation?: string): void;
}
```

#### BaseTool 的设计原则

1. **类型安全**: 使用泛型 `<TParams, TResult>` 确保参数和结果类型安全
2. **生命周期管理**: 从验证到执行的完整生命周期控制
3. **流式输出**: 支持实时输出更新，提升用户体验
4. **确认机制**: 内置危险操作确认流程
5. **错误处理**: 标准化的错误处理和结果格式
6. **取消支持**: 通过 AbortSignal 支持操作取消

#### 创建 BaseTool 的完整示例

```typescript
// 定义工具结果类型
export interface MyToolResult {
  success: boolean;
  output: string;
  timestamp: string;
}

export class MyTool extends BaseTool<{ input: string }, MyToolResult> {
  constructor() {
    super(
      'my_tool',                    // name - 工具名称
      'My Tool',                    // displayName - 显示名称
      '执行某项任务的示例工具',        // description - 工具描述
      {                             // parameterSchema - 参数 Schema
        type: Type.OBJECT,
        properties: {
          input: {
            type: Type.STRING,
            description: '输入参数'
          }
        },
        required: ['input']
      },
      false,                        // isOutputMarkdown - 输出是否为 Markdown
      true                          // canUpdateOutput - 是否支持流式输出
    );
  }

  // 重写参数验证方法
  override validateToolParams(params: { input: string }): string | null {
    // 使用内置的验证辅助方法
    const requiredError = this.validateRequiredParams(params, ['input']);
    if (requiredError) return requiredError;

    const typeError = this.validateParameterTypes(params, {
      input: 'string'
    });
    if (typeError) return typeError;

    // 自定义验证逻辑
    if (!params.input.trim()) {
      return '输入不能为空';
    }

    return null;
  }

  // 重写描述方法
  override getDescription(params: { input: string }): string {
    return `将执行任务，输入: ${params.input}`;
  }

  // 可选：重写确认执行方法（用于需要用户确认的工具）
  override async shouldConfirmExecute(
    params: { input: string }, 
    signal: AbortSignal
  ): Promise<ToolCallConfirmationDetails | false> {
    // 对于危险操作，返回确认详情
    if (params.input.includes('delete') || params.input.includes('remove')) {
      return {
        type: 'info',
        title: '确认执行',
        prompt: `确定要执行: ${params.input}？`,
        onConfirm: async (outcome) => {
          console.log('用户选择:', outcome);
        }
      };
    }
    
    return false; // 无需确认
  }

  // 实现执行方法
  async execute(
    params: { input: string },
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<DefaultToolResult<MyToolResult>> {
    // 输出实时进度
    if (updateOutput) {
      updateOutput(this.formatProgress('开始处理', params.input, '⚙️'));
    }

    try {
      // 检查取消信号
      this.checkAbortSignal(signal, '任务处理');
      
      // 模拟处理过程
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (updateOutput) {
        updateOutput(this.formatProgress('处理中', '50%', '⚙️'));
      }
      
      this.checkAbortSignal(signal, '任务处理');
      
      // 完成处理
      const result: MyToolResult = {
        success: true,
        output: `处理结果: ${params.input}`,
        timestamp: new Date().toISOString()
      };
      
      if (updateOutput) {
        updateOutput(this.formatProgress('处理完成', result.output, '✅'));
      }
      
      return new DefaultToolResult(result);
    } catch (error) {
      // 使用内置的错误结果创建方法
      const errorResult = this.createErrorResult(error instanceof Error ? error : new Error(String(error)));
      return new DefaultToolResult(errorResult as MyToolResult);
    }
  }
}

// 注册工具到 Agent
const tool = new MyTool();
agent.registerTool(tool);
```

#### BaseTool 内置辅助方法详解

BaseTool 提供了丰富的辅助方法来简化工具开发：

```typescript
export class AdvancedTool extends BaseTool<{ data: string; operation: string }, any> {
  // 使用所有内置辅助方法的示例
  
  override validateToolParams(params: { data: string; operation: string }): string | null {
    // 1. 验证必需参数
    const requiredError = this.validateRequiredParams(params, ['data', 'operation']);
    if (requiredError) return requiredError;

    // 2. 验证参数类型
    const typeError = this.validateParameterTypes(params, {
      data: 'string',
      operation: 'string'
    });
    if (typeError) return typeError;

    // 3. 自定义业务逻辑验证
    const validOperations = ['process', 'analyze', 'transform'];
    if (!validOperations.includes(params.operation)) {
      return `operation 必须是: ${validOperations.join(', ')}`;
    }

    return null;
  }

  async execute(
    params: { data: string; operation: string },
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ) {
    try {
      // 4. 检查取消信号
      this.checkAbortSignal(signal, '数据处理');
      
      // 5. 格式化进度输出
      if (updateOutput) {
        updateOutput(this.formatProgress('开始处理', params.operation, '🚀'));
      }
      
      // 模拟处理过程
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.checkAbortSignal(signal, '数据处理');
      
      if (updateOutput) {
        updateOutput(this.formatProgress('处理中', '50%', '⚙️'));
      }
      
      // 完成处理
      const result = {
        processed_data: `${params.operation}_${params.data}`,
        timestamp: new Date().toISOString()
      };
      
      // 6. 创建标准结果
      const toolResult = this.createResult(
        `处理完成: ${result.processed_data}`,  // llmContent
        `✅ 操作 ${params.operation} 完成`,     // returnDisplay
        `${params.operation} 操作成功`         // summary
      );
      
      return new DefaultToolResult(toolResult);
      
    } catch (error) {
      // 7. 创建错误结果
      const errorResult = this.createErrorResult(
        error instanceof Error ? error : new Error(String(error)),
        '数据处理过程中'
      );
      return new DefaultToolResult(errorResult);
    }
  }
}
```

#### BaseTool 生命周期方法重写指南

```typescript
export class ComprehensiveTool extends BaseTool<ToolParams, ToolResult> {
  
  // === 1. 参数验证方法（可选重写）===
  override validateToolParams(params: ToolParams): string | null {
    // 基础验证使用内置方法
    const requiredError = this.validateRequiredParams(params, ['requiredField']);
    if (requiredError) return requiredError;
    
    // 自定义业务逻辑验证
    if (params.value < 0) {
      return 'value 必须为正数';
    }
    
    return null; // 验证通过
  }
  
  // === 2. 获取执行描述（可选重写）===
  override getDescription(params: ToolParams): string {
    return `将执行 ${this.displayName}，参数: ${params.action}`;
  }
  
  // === 3. 确认执行检查（可选重写）===
  override async shouldConfirmExecute(
    params: ToolParams, 
    signal: AbortSignal
  ): Promise<ToolCallConfirmationDetails | false> {
    // 危险操作需要确认
    if (params.dangerous === true) {
      return {
        type: 'info',
        title: '确认危险操作',
        prompt: `确定要执行危险操作 ${params.action}？`,
        onConfirm: async (outcome) => {
          console.log('用户确认结果:', outcome);
        }
      };
    }
    
    return false; // 无需确认
  }
  
  // === 4. 执行方法（必须实现）===
  async execute(
    params: ToolParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<DefaultToolResult<ToolResult>> {
    try {
      // 使用所有内置辅助方法
      this.checkAbortSignal(signal);
      
      if (updateOutput) {
        updateOutput(this.formatProgress('开始', params.action, '🚀'));
      }
      
      // 实际业务逻辑
      const result = await this.performAction(params, signal, updateOutput);
      
      // 返回标准结果
      return new DefaultToolResult(this.createResult(
        `操作完成: ${result.message}`,
        `✅ ${result.status}`,
        result.summary
      ));
      
    } catch (error) {
      return new DefaultToolResult(this.createErrorResult(error, '工具执行'));
    }
  }
  
  private async performAction(
    params: ToolParams, 
    signal: AbortSignal, 
    updateOutput?: (output: string) => void
  ): Promise<ToolResult> {
    // 业务逻辑实现
    // 定期检查取消信号
    // 发送进度更新
    return { message: 'success', status: 'completed', summary: 'Action performed' };
  }
}
```

### 参考现有工具实现

查看 `examples/tools.ts` 中的完整 BaseTool 示例：

```typescript
// 天气工具示例
import { createWeatherTool, createSubTool } from './examples/tools.js';

const weatherTool = createWeatherTool();
const mathTool = createSubTool();

// 使用预定义的城市坐标
import { CITY_COORDINATES, getCityCoordinates } from './examples/tools.js';
const beijingCoords = getCityCoordinates('北京');
console.log(beijingCoords); // { latitude: 39.9042, longitude: 116.4074 }
```

### 需要确认的工具

```typescript
import { ToolCallConfirmationDetails, ToolConfirmationOutcome } from 'miniagent';

class DestructiveTool implements ITool {
  // ... 其他属性

  async shouldConfirmExecute(params: any, signal: AbortSignal): Promise<ToolCallConfirmationDetails | false> {
    // 需要用户确认的危险操作
    return {
      type: 'exec',
      title: '确认执行危险操作',
      command: `rm -rf ${params.path}`,
      rootCommand: 'rm',
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        console.log('用户选择:', outcome);
      }
    };
  }
}
```

### 工具管理

```typescript
// 获取所有工具
const tools = agent.getToolList();

// 获取特定工具
const tool = agent.getTool('my_tool');

// 移除工具
const removed = agent.removeTool('my_tool');

// 获取会话特定工具
const sessionTools = agent.getToolsForSession('session-123');
```

## StandardAgent：使用和 Session 管理

### 创建和使用 StandardAgent

```typescript
import { StandardAgent } from '@continue-reasoning/mini-agent';

// 创建带 session 管理的 agent
const agent = new StandardAgent(tools, {
  chatProvider: 'openai', // 或 'gemini'
  agentConfig: {
    model: 'gpt-4',
    workingDirectory: process.cwd(),
    sessionId: 'default-session'
  },
  chatConfig: {
    modelName: 'gpt-4',
    apiKey: process.env.OPENAI_API_KEY,
    tokenLimit: 128000
  },
  toolSchedulerConfig: {
    approvalMode: 'default'
  }
});
```

### Session 管理

```typescript
// 创建新会话
const sessionId = agent.createNewSession('我的新对话');

// 切换到指定会话
const switched = agent.switchToSession(sessionId);

// 获取所有会话
const sessions = agent.getSessions();

// 获取当前会话
const currentSession = agent.getSessionManager().getCurrentSession();

// 更新会话标题
agent.updateSessionTitle(sessionId, '新的标题');

// 删除会话
agent.deleteSession(sessionId);

// 获取会话状态
const status = agent.getSessionStatus(sessionId);
console.log(status.sessionInfo); // 包含会话详细信息
```

### Session 数据结构

```typescript
import { AgentSession } from 'miniagent';

interface AgentSession {
  id: string;                    // 会话唯一标识
  title?: string;               // 会话标题
  createdAt: string;            // 创建时间
  lastActiveAt: string;         // 最后活动时间
  messageHistory: MessageItem[]; // 消息历史
  tokenUsage: {                 // Token 使用统计
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, unknown>; // 自定义元数据
}
```

### 多会话处理示例

参考 `examples/sessionManagerExample.ts` 的完整实现：

```typescript
// 参考 examples/sessionManagerExample.ts
import { AgentEventType, AgentEvent } from '@continue-reasoning/mini-agent';

async function handleMultipleSessions() {
  // 为不同用户创建不同会话
  const userSessions = new Map<string, string>();
  
  function getUserSession(userId: string): string {
    if (!userSessions.has(userId)) {
      const sessionId = agent.createNewSession(`用户 ${userId} 的对话`);
      userSessions.set(userId, sessionId);
    }
    return userSessions.get(userId)!;
  }
  
  // 处理用户消息 - 基于 sessionManagerExample.ts 的 processConversation 函数
  async function handleUserMessage(userId: string, message: string) {
    const sessionId = getUserSession(userId);
    
    console.log(`💬 Session: ${sessionId}`);
    console.log(`👤 User ${userId}: ${message}`);
    
    let assistantResponse = '';
    
    for await (const event of agent.processWithSession(message, sessionId)) {
      switch (event.type) {
        case AgentEventType.ToolExecutionStart:
          const toolStartData = event.data as any;
          console.log(`🔧 Tool started: ${toolStartData.toolName}`);
          break;
        case AgentEventType.ToolExecutionDone:
          const toolDoneData = event.data as any;
          console.log(`🔧 Tool completed: ${toolDoneData.toolName}`);
          break;
        case AgentEventType.ResponseChunkTextDelta:
          const deltaData = event.data as any;
          assistantResponse += deltaData.content.text_delta || '';
          break;
        case AgentEventType.ResponseChunkTextDone:
          const textDoneData = event.data as any;
          console.log(`🤖 Assistant: ${textDoneData.content.text}`);
          break;
        case AgentEventType.ResponseComplete:
          console.log(`✅ Turn complete`);
          break;
      }
    }
    
    return assistantResponse;
  }
}

// 显示会话状态 - 基于 sessionManagerExample.ts
function showSessionStatus(agent: StandardAgent) {
  const sessions = agent.getSessions();
  const currentSessionId = agent.getCurrentSessionId();
  
  sessions.forEach((session, index) => {
    const isCurrent = session.id === currentSessionId;
    const indicator = isCurrent ? '👉' : '  ';
    console.log(`${indicator} ${index + 1}. ${session.title} (${session.id})`);
    console.log(`     Created: ${new Date(session.createdAt).toLocaleString()}`);
    console.log(`     Messages: ${session.messageHistory.length}`);
    console.log(`     Tokens: ${session.tokenUsage.totalTokens}`);
  });
}
```

## 流式接口：如何处理 Streaming

### 基础流式处理

MiniAgent 只支持流式接口，所有响应都通过 AsyncGenerator 返回。以下是所有事件类型的完整数据结构：

```typescript
import { AgentEventType, AgentEvent } from '@continue-reasoning/mini-agent';

// 基础流式处理
async function handleStreaming(userInput: string) {
  const abortController = new AbortController();
  
  try {
    for await (const event of agent.processWithSession(
      userInput, 
      undefined, // 使用当前会话
      abortController.signal
    )) {
      switch (event.type) {
        // LLM 响应流事件
        case AgentEventType.ResponseStart:
          // 响应开始
          const startData = event.data as { id: string; model: string; tools?: any[] };
          console.log('🚀 响应开始:', startData.model);
          break;
          
        case AgentEventType.ResponseChunkTextDelta:
          // 实时文本片段
          const textDelta = event.data as { content: { text_delta: string } };
          process.stdout.write(textDelta.content.text_delta);
          break;
          
        case AgentEventType.ResponseChunkTextDone:
          // 文本完成
          const textDone = event.data as { content: { text: string } };
          console.log('\n✅ 文本完成:', textDone.content.text);
          break;
          
        case AgentEventType.ResponseChunkThinkingDelta:
          // 思考过程片段
          const thinkingDelta = event.data as { content: { thinking_delta: string } };
          console.log('🧠 思考中:', thinkingDelta.content.thinking_delta);
          break;
          
        case AgentEventType.ResponseChunkThinkingDone:
          // 思考过程完成
          const thinkingDone = event.data as { content: { thinking: string } };
          console.log('🧠 思考完成:', thinkingDone.content.thinking);
          break;
          
        case AgentEventType.ResponseChunkFunctionCallDelta:
          // 函数调用参数增量
          const funcCallDelta = event.data as { 
            content: { functionCall: { id: string; call_id: string; name: string; args: string } } 
          };
          console.log('🔧 函数调用参数:', funcCallDelta.content.functionCall.name);
          break;
          
        case AgentEventType.ResponseChunkFunctionCallDone:
          // 函数调用参数完成
          const funcCallDone = event.data as { 
            content: { functionCall: { id: string; call_id: string; name: string; args: string } } 
          };
          console.log('🔧 函数调用准备:', funcCallDone.content.functionCall.name, 
                     JSON.parse(funcCallDone.content.functionCall.args));
          break;
          
        case AgentEventType.ResponseComplete:
          // 响应完成
          const completeData = event.data as { 
            response_id: string; 
            usage?: { 
              inputTokens: number; 
              outputTokens: number; 
              totalTokens: number;
              inputTokenDetails?: { cachedTokens: number };
              outputTokenDetails?: { reasoningTokens: number };
            } 
          };
          console.log('✅ 响应完成, Token 使用:', completeData.usage);
          break;
          
        // 工具执行事件
        case AgentEventType.ToolExecutionStart:
          // 工具开始执行
          const toolStart = event.data as { 
            toolName: string; 
            callId: string; 
            args: Record<string, unknown>; 
            sessionId: string; 
            turn: number 
          };
          console.log('🔧 工具开始执行:', toolStart.toolName, toolStart.args);
          break;
          
        case AgentEventType.ToolExecutionDone:
          // 工具执行完成
          const toolDone = event.data as { 
            toolName: string; 
            callId: string; 
            result?: any; 
            error?: string; 
            duration?: number; 
            sessionId: string; 
            turn: number 
          };
          if (toolDone.error) {
            console.log('❌ 工具执行失败:', toolDone.toolName, toolDone.error);
          } else {
            console.log('✅ 工具执行完成:', toolDone.toolName, 
                       `耗时: ${toolDone.duration}ms`);
          }
          break;
          
        // 用户交互事件
        case AgentEventType.UserMessage:
          // 用户消息
          const userMsg = event.data as { 
            type: string; 
            content: string; 
            sessionId: string; 
            turn: number; 
            metadata?: any 
          };
          console.log('👤 用户消息:', userMsg.content);
          break;
          
        case AgentEventType.TurnComplete:
          // 轮次完成
          const turnComplete = event.data as { 
            type: string; 
            sessionId: string; 
            turn: number; 
            hasToolCalls: boolean 
          };
          console.log('🔄 轮次完成:', `Turn ${turnComplete.turn}`, 
                     turnComplete.hasToolCalls ? '包含工具调用' : '无工具调用');
          break;
          
        // 错误和状态事件
        case AgentEventType.Error:
          // 错误事件
          const errorData = event.data as { 
            message: string; 
            timestamp: number; 
            turn: number 
          };
          console.error('❌ Agent 错误:', errorData.message);
          break;
          
        case AgentEventType.ResponseFailed:
          // 响应失败
          const failedData = event.data as { 
            response_id: string; 
            error: { code?: string; message?: string } 
          };
          console.error('❌ 响应失败:', failedData.error.message);
          break;
          
        case AgentEventType.ResponseIncomplete:
          // 响应不完整
          const incompleteData = event.data as { 
            response_id: string; 
            incomplete_details: { reason: string } 
          };
          console.warn('⚠️ 响应不完整:', incompleteData.incomplete_details.reason);
          break;
          
        default:
          console.log('🔍 其他事件:', event.type, event.data);
      }
    }
  } catch (error) {
    console.error('处理错误:', error);
  }
}
```

### 响应类型分类

```typescript
import { AgentEventType } from 'miniagent';

function categorizeEvents(event: AgentEvent) {
  // LLM 响应事件
  const llmEvents = [
    AgentEventType.ResponseStart,
    AgentEventType.ResponseChunkTextDelta,
    AgentEventType.ResponseChunkTextDone,
    AgentEventType.ResponseChunkThinkingDelta,
    AgentEventType.ResponseChunkThinkingDone,
    AgentEventType.ResponseChunkFunctionCallDelta,
    AgentEventType.ResponseChunkFunctionCallDone,
    AgentEventType.ResponseComplete,
    AgentEventType.ResponseIncomplete,
    AgentEventType.ResponseFailed
  ];

  // 工具执行事件
  const toolEvents = [
    AgentEventType.ToolExecutionStart,
    AgentEventType.ToolExecutionDone,
    AgentEventType.ToolConfirmation
  ];

  // 用户交互事件
  const userEvents = [
    AgentEventType.UserMessage,
    AgentEventType.UserCancelled
  ];

  // Agent 级别事件
  const agentEvents = [
    AgentEventType.TurnComplete,
    AgentEventType.Error,
    AgentEventType.ModelFallback
  ];
}
```

### 取消和超时处理

```typescript
async function handleWithTimeout(userInput: string, timeoutMs: number = 30000) {
  const abortController = new AbortController();
  
  // 设置超时
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);
  
  try {
    for await (const event of agent.processWithSession(userInput, undefined, abortController.signal)) {
      // 处理事件...
      
      // 用户取消
      if (shouldCancel()) {
        abortController.abort();
        break;
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      console.log('操作被取消或超时');
    } else {
      console.error('处理错误:', error);
    }
  } finally {
    clearTimeout(timeout);
  }
}
```

## 事件系统：监听和处理事件

### 推荐的事件处理模式

```typescript
import { AgentEvent, AgentEventType } from 'miniagent';

class EventProcessor {
  private currentResponse = '';
  private toolExecutions = new Map<string, any>();

  async processEvents(agent: StandardAgent, input: string) {
    for await (const event of agent.processWithSession(input)) {
      await this.handleEvent(event);
    }
  }

  private async handleEvent(event: AgentEvent) {
    switch (event.type) {
      // 1. 用户消息处理
      case AgentEventType.UserMessage:
        this.onUserMessage(event);
        break;

      // 2. LLM 响应流处理
      case AgentEventType.ResponseStart:
        this.onResponseStart(event);
        break;

      case AgentEventType.ResponseChunkTextDelta:
        this.onTextDelta(event);
        break;

      case AgentEventType.ResponseChunkTextDone:
        this.onTextDone(event);
        break;

      case AgentEventType.ResponseChunkThinkingDelta:
        this.onThinkingDelta(event);
        break;

      case AgentEventType.ResponseChunkThinkingDone:
        this.onThinkingDone(event);
        break;

      // 3. 函数调用处理
      case AgentEventType.ResponseChunkFunctionCallDelta:
        this.onFunctionCallDelta(event);
        break;

      case AgentEventType.ResponseChunkFunctionCallDone:
        this.onFunctionCallDone(event);
        break;

      // 4. 工具执行处理
      case AgentEventType.ToolExecutionStart:
        this.onToolStart(event);
        break;

      case AgentEventType.ToolExecutionDone:
        this.onToolDone(event);
        break;

      // 5. 完成和错误处理
      case AgentEventType.TurnComplete:
        this.onTurnComplete(event);
        break;

      case AgentEventType.ResponseComplete:
        this.onResponseComplete(event);
        break;

      case AgentEventType.Error:
        this.onError(event);
        break;
    }
  }

  private onUserMessage(event: AgentEvent) {
    console.log('用户输入:', event.data);
  }

  private onResponseStart(event: AgentEvent) {
    console.log('开始响应...');
    this.currentResponse = '';
  }

  private onTextDelta(event: AgentEvent) {
    const delta = event.data?.content?.text_delta || '';
    this.currentResponse += delta;
    process.stdout.write(delta); // 实时显示
  }

  private onTextDone(event: AgentEvent) {
    console.log('\n助手回复完成');
  }

  private onThinkingDelta(event: AgentEvent) {
    // 可选：显示思考过程
    const thinking = event.data?.content?.thinking_delta || '';
    console.log(`[思考] ${thinking}`);
  }

  private onFunctionCallDone(event: AgentEvent) {
    const call = event.data?.content?.functionCall;
    console.log(`准备调用工具: ${call?.name}`);
  }

  private onToolStart(event: AgentEvent) {
    const { toolName, callId, args } = event.data as any;
    console.log(`🔧 开始执行工具: ${toolName}`);
    this.toolExecutions.set(callId, { name: toolName, startTime: Date.now() });
  }

  private onToolDone(event: AgentEvent) {
    const { toolName, callId, result, error, duration } = event.data as any;
    console.log(`✅ 工具执行完成: ${toolName} (${duration}ms)`);
    this.toolExecutions.delete(callId);
  }

  private onTurnComplete(event: AgentEvent) {
    console.log('对话轮次完成');
  }

  private onError(event: AgentEvent) {
    console.error('错误:', event.data);
  }
}
```

### 自定义事件监听器

```typescript
// 注册全局事件监听器
agent.onEvent('my-logger', (event: AgentEvent) => {
  console.log(`[${new Date().toISOString()}] ${event.type}:`, event.data);
});

// 移除事件监听器
agent.offEvent('my-logger');
```

### 高级事件处理模式

```typescript
class AdvancedEventHandler {
  private progressBar?: any;
  private metrics = {
    totalTokens: 0,
    toolCalls: 0,
    responseTime: 0
  };

  async handleWithProgress(agent: StandardAgent, input: string) {
    const startTime = Date.now();
    
    for await (const event of agent.processWithSession(input)) {
      this.updateMetrics(event);
      this.updateUI(event);
    }
    
    this.metrics.responseTime = Date.now() - startTime;
    this.showSummary();
  }

  private updateMetrics(event: AgentEvent) {
    switch (event.type) {
      case AgentEventType.ResponseComplete:
        const usage = (event.data as any)?.usage;
        if (usage) {
          this.metrics.totalTokens = usage.totalTokens;
        }
        break;
        
      case AgentEventType.ToolExecutionStart:
        this.metrics.toolCalls++;
        break;
    }
  }

  private updateUI(event: AgentEvent) {
    // 更新进度条、状态指示器等
  }

  private showSummary() {
    console.log('执行摘要:', this.metrics);
  }
}
```

## 配置详解：所有 Config 说明

### AllConfig 结构

```typescript
interface AllConfig {
  agentConfig: IAgentConfig;          // Agent 基础配置
  toolSchedulerConfig: IToolSchedulerConfig; // 工具调度器配置
  chatConfig: IChatConfig;            // 聊天提供商配置
}
```

### IAgentConfig - Agent 基础配置

```typescript
interface IAgentConfig {
  // 必需配置
  model: string;                    // AI 模型名称 'gpt-4', 'gemini-pro' 等
  workingDirectory: string;         // 工作目录

  // 可选配置
  apiKey?: string;                  // API 密钥
  sessionId?: string;               // 默认会话 ID
  systemPrompt?: string;            // 系统提示词
  maxHistorySize?: number;          // 最大历史记录数
  maxHistoryTokens?: number;        // 最大历史 Token 数
  debugMode?: boolean;              // 调试模式
  logger?: ILogger;                 // 自定义日志器
  logLevel?: LogLevel;              // 日志级别
  
  // MCP 配置
  mcp?: {
    enabled: boolean;               // 启用 MCP
    servers: McpServerConfig[];     // MCP 服务器列表
    autoDiscoverTools?: boolean;    // 自动发现工具
    connectionTimeout?: number;     // 连接超时
    toolNamingStrategy?: 'prefix' | 'suffix' | 'error'; // 工具命名策略
    toolNamePrefix?: string;        // 工具名前缀
    toolNameSuffix?: string;        // 工具名后缀
  };
}
```

### IChatConfig - 聊天提供商配置

```typescript
interface IChatConfig {
  // 基础配置
  modelName: string;                // 模型名称
  apiKey: string;                   // API 密钥
  systemPrompt?: string;            // 系统提示词
  tokenLimit: number;               // Token 限制
  
  // 高级配置
  temperature?: number;             // 温度参数
  maxTokens?: number;               // 最大输出 Token
  topP?: number;                    // Top-P 参数
  frequencyPenalty?: number;        // 频率惩罚
  presencePenalty?: number;         // 存在惩罚
  
  // 历史管理
  initialHistory?: MessageItem[];   // 初始历史
  maxHistorySize?: number;          // 最大历史条数
  maxHistoryTokens?: number;        // 最大历史 Token
}
```

### IToolSchedulerConfig - 工具调度器配置

```typescript
interface IToolSchedulerConfig {
  tools?: ITool[];                  // 工具列表
  approvalMode?: 'default' | 'yolo' | 'always'; // 批准模式
  
  // 回调函数
  outputUpdateHandler?: (callId: string, output: string) => void;
  onAllToolCallsComplete?: (completed: ICompletedToolCall[]) => void;
  onToolCallsUpdate?: (toolCalls: IToolCall[]) => void;
  
  // 其他配置
  getPreferredEditor?: () => string | undefined;
  config?: unknown;                 // 自定义配置
}
```

### 配置示例

```typescript
// 完整配置示例
const config: AllConfig = {
  // Agent 配置
  agentConfig: {
    model: 'gpt-4',
    workingDirectory: '/project/path',
    apiKey: process.env.OPENAI_API_KEY,
    sessionId: 'main-session',
    systemPrompt: '你是一个专业的编程助手',
    maxHistorySize: 100,
    maxHistoryTokens: 50000,
    debugMode: false,
    logLevel: LogLevel.INFO,
    
    // MCP 配置
    mcp: {
      enabled: true,
      autoDiscoverTools: true,
      connectionTimeout: 5000,
      toolNamingStrategy: 'prefix',
      toolNamePrefix: 'mcp',
      servers: [
        {
          name: 'filesystem',
          transport: 'stdio',
          command: 'mcp-server-filesystem',
          args: ['/project/path']
        }
      ]
    }
  },
  
  // 聊天配置
  chatConfig: {
    modelName: 'gpt-4',
    apiKey: process.env.OPENAI_API_KEY,
    systemPrompt: '你是一个有用的助手',
    tokenLimit: 128000,
    temperature: 0.7,
    maxTokens: 4000,
    topP: 0.9
  },
  
  // 工具调度器配置
  toolSchedulerConfig: {
    approvalMode: 'default',
    outputUpdateHandler: (callId, output) => {
      console.log(`工具 ${callId}: ${output}`);
    },
    onAllToolCallsComplete: (completed) => {
      console.log(`完成 ${completed.length} 个工具调用`);
    },
    onToolCallsUpdate: (toolCalls) => {
      console.log(`工具状态更新: ${toolCalls.length} 个调用`);
    }
  }
};
```

## 工具执行器：回调和批准流程

### CoreToolScheduler 回调机制详解

CoreToolScheduler 提供了完整的工具执行生命周期回调系统：

```typescript
import { 
  IToolScheduler, 
  IToolSchedulerConfig,
  ToolExecutionStartCallback, 
  ToolExecutionDoneCallback,
  IToolCallRequestInfo,
  IToolCallResponseInfo,
  ICompletedToolCall,
  IToolCall,
  ToolCallStatus,
  ToolConfirmationOutcome
} from '@continue-reasoning/mini-agent';

// 1. 配置 ToolScheduler 回调
const toolSchedulerConfig: IToolSchedulerConfig = {
  // 批准模式：'yolo'(自动批准) | 'always'(总是要求批准) | 'default'(根据工具决定)
  approvalMode: 'default',
  
  // 实时输出更新回调 - 工具执行过程中的流式输出
  outputUpdateHandler: (callId: string, output: string) => {
    console.log(`📤 工具输出 [${callId}]: ${output}`);
    // 可以将输出发送到 UI 或日志系统
  },
  
  // 工具状态更新回调 - 工具状态变化时触发
  onToolCallsUpdate: (toolCalls: IToolCall[]) => {
    console.log('📊 工具状态更新:');
    toolCalls.forEach(call => {
      const { name } = call.request;
      const status = call.status;
      
      switch (status) {
        case ToolCallStatus.Validating:
          console.log(`  🔍 ${name}: 验证参数中...`);
          break;
        case ToolCallStatus.AwaitingApproval:
          console.log(`  ⏳ ${name}: 等待用户批准`);
          break;
        case ToolCallStatus.Scheduled:
          console.log(`  📅 ${name}: 已调度，准备执行`);
          break;
        case ToolCallStatus.Executing:
          console.log(`  ⚙️ ${name}: 执行中...`);
          break;
        case ToolCallStatus.Success:
          console.log(`  ✅ ${name}: 执行成功`);
          break;
        case ToolCallStatus.Error:
          console.log(`  ❌ ${name}: 执行失败`);
          break;
        case ToolCallStatus.Cancelled:
          console.log(`  🚫 ${name}: 已取消`);
          break;
      }
    });
  },
  
  // 所有工具完成回调 - 批次处理完成时触发
  onAllToolCallsComplete: (completed: ICompletedToolCall[]) => {
    console.log(`✅ 批次完成: ${completed.length} 个工具执行完毕`);
    
    // 统计执行结果
    const successful = completed.filter(call => call.status === ToolCallStatus.Success);
    const failed = completed.filter(call => call.status === ToolCallStatus.Error);
    const cancelled = completed.filter(call => call.status === ToolCallStatus.Cancelled);
    
    console.log(`  成功: ${successful.length}, 失败: ${failed.length}, 取消: ${cancelled.length}`);
    
    // 处理失败的工具
    failed.forEach(call => {
      console.error(`  失败工具 ${call.request.name}: ${call.response.error?.message}`);
    });
  },
};

// 2. 在 Agent 处理过程中传递执行回调
const executionCallbacks = {
  onExecutionStart: (toolCall: IToolCallRequestInfo) => {
    console.log(`🚀 开始执行工具: ${toolCall.name}`);
    console.log(`   调用ID: ${toolCall.callId}`);
    console.log(`   参数:`, toolCall.args);
    console.log(`   Prompt ID: ${toolCall.promptId}`);
  },
  
  onExecutionDone: (
    request: IToolCallRequestInfo,
    response: IToolCallResponseInfo,
    duration?: number
  ) => {
    if (response.success) {
      console.log(`✅ 工具执行成功: ${request.name}`);
      console.log(`   耗时: ${duration}ms`);
      console.log(`   结果:`, response.result?.toHistoryStr());
    } else {
      console.log(`❌ 工具执行失败: ${request.name}`);
      console.log(`   错误:`, response.error?.message);
      console.log(`   耗时: ${duration}ms`);
    }
  }
};

// 3. 手动处理工具批准
class ToolApprovalManager {
  constructor(private scheduler: IToolScheduler) {}
  
  // 批准工具执行
  async approveToolExecution(callId: string) {
    await this.scheduler.handleConfirmationResponse(
      callId,
      ToolConfirmationOutcome.ProceedOnce
    );
  }
  
  // 总是批准此类工具
  async approveAlways(callId: string) {
    await this.scheduler.handleConfirmationResponse(
      callId,
      ToolConfirmationOutcome.ProceedAlways
    );
  }
  
  // 修改参数后执行
  async modifyAndExecute(callId: string, newContent: string) {
    await this.scheduler.handleConfirmationResponse(
      callId,
      ToolConfirmationOutcome.ModifyWithEditor,
      { newContent }
    );
  }
  
  // 取消工具执行
  async cancelToolExecution(callId: string) {
    await this.scheduler.handleConfirmationResponse(
      callId,
      ToolConfirmationOutcome.Cancel
    );
  }
  
  // 监控待批准的工具
  monitorPendingApprovals() {
    const pendingCalls = this.scheduler.getCurrentToolCalls()
      .filter(call => call.status === ToolCallStatus.AwaitingApproval);
    
    pendingCalls.forEach(call => {
      const details = (call as any).confirmationDetails;
      console.log(`⏳ 等待批准: ${call.request.name}`);
      console.log(`   类型: ${details.type}`);
      console.log(`   标题: ${details.title}`);
    });
    
    return pendingCalls;
  }
}

// 4. 完整的 Agent 配置示例
const agent = new StandardAgent(tools, {
  chatProvider: 'openai',
  agentConfig: {
    model: 'gpt-4',
    workingDirectory: process.cwd(),
  },
  chatConfig: {
    modelName: 'gpt-4',
    apiKey: process.env.OPENAI_API_KEY,
    tokenLimit: 128000,
  },
  toolSchedulerConfig: toolSchedulerConfig, // 使用上面定义的配置
});

// 5. 处理流式响应并传递执行回调
async function processWithToolCallbacks(userInput: string) {
  for await (const event of agent.processWithSession(userInput)) {
    // 处理各种事件...
    
    // 注意：executionCallbacks 在 agent.process 内部传递给 scheduler.schedule
    // 这些回调会在 CoreToolScheduler.executeToolCall 方法中被调用
  }
}
```

### 工具批准模式

```typescript
// 1. 'yolo' 模式 - 自动批准所有工具
const yoloConfig = {
  toolSchedulerConfig: {
    approvalMode: 'yolo' as const,
    // 所有工具都会自动执行，无需用户确认
  }
};

// 2. 'always' 模式 - 总是需要用户确认
const alwaysConfig = {
  toolSchedulerConfig: {
    approvalMode: 'always' as const,
    // 所有工具都需要用户手动确认
  }
};

// 3. 'default' 模式 - 根据工具的 shouldConfirmExecute 决定
const defaultConfig = {
  toolSchedulerConfig: {
    approvalMode: 'default' as const,
    // 由每个工具的 shouldConfirmExecute 方法决定是否需要确认
  }
};
```

### 手动处理工具确认

```typescript
import { 
  ToolConfirmationOutcome, 
  ToolCallConfirmationDetails 
} from '@continue-reasoning/mini-agent';

class ToolApprovalHandler {
  private scheduler: IToolScheduler;

  constructor(scheduler: IToolScheduler) {
    this.scheduler = scheduler;
  }

  // 批准工具执行
  async approveToolExecution(callId: string) {
    await this.scheduler.handleConfirmationResponse(
      callId,
      ToolConfirmationOutcome.ProceedOnce
    );
  }

  // 总是批准此类工具
  async approveAlways(callId: string) {
    await this.scheduler.handleConfirmationResponse(
      callId,
      ToolConfirmationOutcome.ProceedAlways
    );
  }

  // 取消工具执行
  async cancelToolExecution(callId: string) {
    await this.scheduler.handleConfirmationResponse(
      callId,
      ToolConfirmationOutcome.Cancel
    );
  }

  // 修改后执行
  async modifyAndExecute(callId: string, newContent: string) {
    await this.scheduler.handleConfirmationResponse(
      callId,
      ToolConfirmationOutcome.ModifyWithEditor,
      { newContent }
    );
  }
}
```

### 监控工具执行状态

```typescript
class ToolExecutionMonitor {
  private toolStates = new Map<string, IToolCall>();

  monitorExecution(scheduler: IToolScheduler) {
    // 获取当前所有工具调用
    const currentCalls = scheduler.getCurrentToolCalls();
    
    currentCalls.forEach(call => {
      this.toolStates.set(call.request.callId, call);
      this.logToolState(call);
    });
  }

  private logToolState(call: IToolCall) {
    switch (call.status) {
      case 'validating':
        console.log(`🔍 验证工具: ${call.request.name}`);
        break;
      case 'scheduled':
        console.log(`📅 已调度工具: ${call.request.name}`);
        break;
      case 'executing':
        console.log(`⚙️ 执行中: ${call.request.name}`);
        break;
      case 'success':
        console.log(`✅ 成功: ${call.request.name}`);
        break;
      case 'error':
        console.log(`❌ 失败: ${call.request.name}`);
        break;
      case 'cancelled':
        console.log(`🚫 已取消: ${call.request.name}`);
        break;
      case 'awaiting_approval':
        console.log(`⏳ 等待批准: ${call.request.name}`);
        this.handleAwaitingApproval(call as IWaitingToolCall);
        break;
    }
  }

  private handleAwaitingApproval(call: IWaitingToolCall) {
    const details = call.confirmationDetails;
    
    switch (details.type) {
      case 'exec':
        console.log(`需要确认执行命令: ${details.command}`);
        break;
      case 'edit':
        console.log(`需要确认文件编辑: ${details.fileName}`);
        break;
      case 'mcp':
        console.log(`需要确认 MCP 工具: ${details.toolDisplayName}`);
        break;
      case 'info':
        console.log(`需要确认信息获取: ${details.prompt}`);
        break;
    }
  }
}
```

### 批量工具执行管理

```typescript
class BatchToolManager {
  private agent: StandardAgent;
  private pendingApprovals = new Map<string, IWaitingToolCall>();

  constructor(agent: StandardAgent) {
    this.agent = agent;
    this.setupToolCallbacks();
  }

  private setupToolCallbacks() {
    const scheduler = this.agent.getToolScheduler();
    
    // 监听工具状态更新
    const config = {
      onToolCallsUpdate: (toolCalls: IToolCall[]) => {
        toolCalls.forEach(call => {
          if (call.status === 'awaiting_approval') {
            this.pendingApprovals.set(call.request.callId, call as IWaitingToolCall);
          } else {
            this.pendingApprovals.delete(call.request.callId);
          }
        });
      },
      
      onAllToolCallsComplete: (completed: ICompletedToolCall[]) => {
        console.log(`批次完成: ${completed.length} 个工具执行完毕`);
        this.pendingApprovals.clear();
      }
    };
  }

  // 批准所有待批准的工具
  async approveAllPending() {
    const scheduler = this.agent.getToolScheduler();
    
    for (const [callId, call] of this.pendingApprovals) {
      await scheduler.handleConfirmationResponse(
        callId,
        ToolConfirmationOutcome.ProceedOnce
      );
    }
  }

  // 取消所有待批准的工具
  async cancelAllPending() {
    const scheduler = this.agent.getToolScheduler();
    
    for (const [callId, call] of this.pendingApprovals) {
      await scheduler.handleConfirmationResponse(
        callId,
        ToolConfirmationOutcome.Cancel
      );
    }
  }

  // 获取待批准工具列表
  getPendingApprovals(): IWaitingToolCall[] {
    return Array.from(this.pendingApprovals.values());
  }
}
```

## 常见问题和解决方案

### Q1: 如何处理工具执行超时？

```typescript
class TimeoutHandler {
  async executeWithTimeout(agent: StandardAgent, input: string, timeoutMs: number = 30000) {
    const abortController = new AbortController();
    
    const timeout = setTimeout(() => {
      console.log('操作超时，正在取消...');
      abortController.abort();
    }, timeoutMs);

    try {
      for await (const event of agent.processWithSession(input, undefined, abortController.signal)) {
        // 处理事件...
        
        if (event.type === 'turn.complete') {
          clearTimeout(timeout);
          break;
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        console.log('操作被取消');
      } else {
        throw error;
      }
    }
  }
}
```

### Q2: 如何实现工具执行重试？

```typescript
class RetryHandler {
  async executeWithRetry(
    scheduler: IToolScheduler,
    toolCall: IToolCallRequestInfo,
    maxRetries: number = 3
  ) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await scheduler.schedule([toolCall], new AbortController().signal);
        break; // 成功，跳出循环
      } catch (error) {
        console.log(`尝试 ${attempt}/${maxRetries} 失败:`, error);
        
        if (attempt === maxRetries) {
          throw error; // 最后一次尝试仍失败
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
}
```

### Q3: 如何实现自定义工具输出格式？

```typescript
class CustomToolResult implements IToolResult {
  constructor(
    private data: any,
    private format: 'json' | 'text' | 'markdown' = 'json'
  ) {}

  toHistoryStr(): string {
    switch (this.format) {
      case 'json':
        return JSON.stringify(this.data, null, 2);
      case 'markdown':
        return this.formatAsMarkdown(this.data);
      case 'text':
        return String(this.data);
      default:
        return JSON.stringify(this.data);
    }
  }

  private formatAsMarkdown(data: any): string {
    if (typeof data === 'string') return data;
    
    return `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  }
}

// 在工具中使用
class MyTool implements ITool {
  async execute(params: any, signal: AbortSignal): Promise<IToolResult> {
    const result = { success: true, data: params };
    return new CustomToolResult(result, 'markdown');
  }
}
```

### Q4: 如何实现会话持久化？

```typescript
class SessionPersistence {
  private storage: Map<string, AgentSession> = new Map();

  async saveSession(session: AgentSession): Promise<void> {
    // 保存到文件系统
    const filePath = `./sessions/${session.id}.json`;
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    
    // 或保存到数据库
    // await db.sessions.upsert({ where: { id: session.id }, data: session });
  }

  async loadSession(sessionId: string): Promise<AgentSession | null> {
    try {
      // 从文件系统加载
      const filePath = `./sessions/${sessionId}.json`;
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
      
      // 或从数据库加载
      // return await db.sessions.findUnique({ where: { id: sessionId } });
    } catch (error) {
      return null;
    }
  }

  async initializeWithPersistence(agent: StandardAgent) {
    const sessionManager = agent.getSessionManager();
    
    // 重写保存方法
    const originalSaveSession = sessionManager.saveSession.bind(sessionManager);
    sessionManager.saveSession = async (sessionId: string) => {
      const session = sessionManager.getSession(sessionId);
      if (session) {
        await this.saveSession(session);
        return true;
      }
      return false;
    };

    // 重写加载方法
    const originalLoadSession = sessionManager.loadSession.bind(sessionManager);
    sessionManager.loadSession = async (sessionId: string) => {
      return await this.loadSession(sessionId);
    };
  }
}
```

### Q5: 如何实现高级错误处理？

```typescript
class AdvancedErrorHandler {
  async handleWithRecovery(agent: StandardAgent, input: string) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        await this.processWithErrorHandling(agent, input);
        break; // 成功完成
      } catch (error) {
        attempt++;
        console.log(`尝试 ${attempt}/${maxRetries} 失败:`, error);

        if (attempt < maxRetries) {
          // 尝试恢复
          await this.attemptRecovery(agent, error);
        } else {
          // 最终失败处理
          await this.handleFinalFailure(agent, error);
          throw error;
        }
      }
    }
  }

  private async processWithErrorHandling(agent: StandardAgent, input: string) {
    for await (const event of agent.processWithSession(input)) {
      if (event.type === 'agent.error') {
        throw new Error(`Agent 错误: ${event.data}`);
      }
      
      if (event.type === 'response.failed') {
        throw new Error(`响应失败: ${event.data}`);
      }
      
      if (event.type === 'tool.call.execution.done') {
        const { error } = event.data as any;
        if (error) {
          console.warn(`工具执行警告: ${error}`);
        }
      }
    }
  }

  private async attemptRecovery(agent: StandardAgent, error: Error) {
    // 清理状态
    agent.clearHistory();
    
    // 重置会话
    const newSessionId = agent.createNewSession('恢复会话');
    agent.switchToSession(newSessionId);
    
    // 等待一段时间再重试
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private async handleFinalFailure(agent: StandardAgent, error: Error) {
    console.error('最终失败，进行清理...');
    
    // 取消所有待处理操作
    const scheduler = agent.getToolScheduler();
    scheduler.cancelAll('系统错误');
    
    // 记录错误日志
    await this.logError(error);
  }

  private async logError(error: Error) {
    const errorLog = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
    };
    
    console.error('错误日志:', errorLog);
    // 保存到文件或发送到监控系统
  }
}
```

---

## 总结

MiniAgent 框架提供了完整的 AI Agent 集成解决方案，支持：

1. **灵活的工具系统** - 轻松创建和管理自定义工具
2. **强大的会话管理** - 多会话并发处理和状态管理
3. **纯流式接口** - 实时响应和事件处理
4. **完善的事件系统** - 细粒度的执行监控和控制
5. **丰富的配置选项** - 适应各种使用场景
6. **智能的工具执行** - 确认流程和批准机制

通过本指南，你应该能够成功集成 MiniAgent 到你的项目中，并根据具体需求进行定制和扩展。