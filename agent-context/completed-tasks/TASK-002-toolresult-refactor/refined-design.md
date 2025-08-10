# TASK-002: Tool Interface 精炼设计方案

## 🎯 核心设计理念

基于您的反馈，重新设计工具系统的数据流和接口职责：

1. **ToolResult<T>** - 工具执行的原始结果（泛型）
2. **IToolCallResponseInfo** - ToolScheduler 增强后的执行结果
3. **ContentPart** - 与 LLM 通信的统一格式

## 📐 核心接口设计

### 1. ToolResult 接口（可扩展的泛型结果）

```typescript
// 工具结果的基础接口，提供转换为历史记录字符串的能力
export interface IToolResult {
  toHistoryStr(): string;
}

// 默认实现（用于大多数工具）
export class DefaultToolResult<T = unknown> implements IToolResult {
  constructor(public data: T) {}
  
  toHistoryStr(): string {
    return JSON.stringify(this.data);
  }
}

// ITool 接口更新
export interface ITool<TParams = unknown, TResult extends IToolResult = DefaultToolResult> {
  name: string;
  description: string;
  schema: ToolDeclaration;
  
  execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<TResult>;
}
```

### 2. IToolCallResponseInfo（ToolScheduler 的执行结果）

```typescript
// ToolScheduler 执行后的完整结果信息
export interface IToolCallResponseInfo {
  callId: string;                    // 调用标识符
  result?: IToolResult;               // 工具返回的原始结果
  success: boolean;                   // 执行是否成功
  error?: Error;                      // 系统错误（如崩溃、超时）
  duration?: number;                  // 执行时长（毫秒）
  metadata?: {                       // 执行元数据
    startTime: number;
    endTime: number;
    memoryUsage?: number;
  };
  
  // 转换为 ContentPart 的方法
  toContentPart(request: IToolCallRequestInfo): ContentPart;
}

// 实现 toContentPart 方法
class ToolCallResponseInfo implements IToolCallResponseInfo {
  // ... 其他属性
  
  toContentPart(request: IToolCallRequestInfo): ContentPart {
    return {
      type: 'function_response',
      functionResponse: {
        id: request.functionId,
        call_id: this.callId,
        name: request.name,
        result: this.result ? this.result.toHistoryStr() : JSON.stringify({
          success: false,
          error: this.error?.message || 'Unknown error'
        })
      }
    };
  }
}
```

### 3. IToolCallRequestInfo（保持不变，添加转换方法）

```typescript
export interface IToolCallRequestInfo {
  callId: string;
  functionId?: string;
  name: string;
  args: Record<string, unknown>;
  isClientInitiated: boolean;
  promptId: string;
  
  // 从 ContentPart 创建的静态方法
  static fromContentPart(content: ContentPart): IToolCallRequestInfo | null;
}

// 静态方法实现
export class ToolCallRequestInfo {
  static fromContentPart(content: ContentPart): IToolCallRequestInfo | null {
    if (content.type !== 'function_call' || !content.functionCall) {
      return null;
    }
    
    return {
      callId: content.functionCall.call_id,
      functionId: content.functionCall.id,
      name: content.functionCall.name,
      args: JSON.parse(content.functionCall.args),
      isClientInitiated: false,
      promptId: '' // 需要从上下文获取
    };
  }
}
```

### 4. BaseTool 基础实现

```typescript
export abstract class BaseTool<TParams = unknown, TResult = unknown> 
  implements ITool<TParams, DefaultToolResult<TResult>> {
  
  constructor(
    readonly name: string,
    readonly description: string,
    readonly parameterSchema: Schema,
  ) {}
  
  // 抽象方法：子类实现具体逻辑
  protected abstract executeCore(params: TParams): Promise<TResult>;
  
  // 最终的 execute 方法，返回 DefaultToolResult
  async execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<DefaultToolResult<TResult>> {
    const result = await this.executeCore(params);
    return new DefaultToolResult(result);
  }
}

// 使用示例
class CalculatorTool extends BaseTool<{expression: string}, {result: number}> {
  protected async executeCore(params: {expression: string}) {
    const result = eval(params.expression); // 简化示例
    return { result };
  }
}
```

## 🔄 数据流设计

### 完整的工具执行数据流

```
1. LLM 生成 function_call
   ↓
2. ContentPart (function_call) 
   ↓ [ToolCallRequestInfo.fromContentPart]
3. IToolCallRequestInfo
   ↓ [ToolScheduler.schedule]
4. Tool.execute() → TResult extends IToolResult
   ↓ [ToolScheduler 增强]
5. IToolCallResponseInfo (包含 result, success, error, duration)
   ↓ [toContentPart]
6. ContentPart (function_response)
   ↓ [result.toHistoryStr()]
7. 历史记录（JSON 字符串）
```

### 职责划分

| 组件 | 职责 | 处理内容 |
|------|------|----------|
| **Tool** | 业务逻辑执行 | 返回 TResult (extends IToolResult) |
| **ToolScheduler** | 执行管理 | 处理系统错误、超时、记录执行时间 |
| **BaseAgent** | 历史管理 | 调用 toHistoryStr() 保存结果 |
| **ContentPart** | 通信格式 | LLM 交互的统一格式 |

## 🔧 CoreToolScheduler 更新

```typescript
class CoreToolScheduler {
  async executeToolCall(scheduledCall: IScheduledToolCall): Promise<void> {
    const startTime = Date.now();
    
    try {
      // 执行工具，获取原始结果
      const toolResult = await scheduledCall.tool.execute(
        scheduledCall.request.args,
        this.abortController?.signal,
        updateOutput,
      );
      
      // 创建增强的响应信息
      const response: IToolCallResponseInfo = {
        callId: scheduledCall.request.callId,
        result: toolResult,           // 原始工具结果
        success: true,                 // 执行成功
        duration: Date.now() - startTime,
        metadata: {
          startTime,
          endTime: Date.now(),
        }
      };
      
      // 更新状态为成功
      this.updateToolCallState(scheduledCall.request.callId, {
        status: ToolCallStatus.Success,
        response
      });
      
    } catch (error) {
      // 处理系统错误（崩溃、超时等）
      const response: IToolCallResponseInfo = {
        callId: scheduledCall.request.callId,
        result: new DefaultToolResult({
          error: error.message,
          stack: error.stack
        }),
        success: false,                // 执行失败
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime,
      };
      
      this.updateToolCallState(scheduledCall.request.callId, {
        status: ToolCallStatus.Error,
        response
      });
    }
  }
}
```

## 🔧 BaseAgent 更新

```typescript
class BaseAgent {
  // 处理工具执行完成
  onToolExecutionDone(
    request: IToolCallRequestInfo, 
    response: IToolCallResponseInfo
  ) {
    // 转换为 ContentPart 并添加到历史
    const toolResultMessage: MessageItem = {
      role: 'user',
      content: response.toContentPart(request),
      turnIdx: this.currentTurn,
    };
    
    this.chat.addHistory(toolResultMessage);
    
    // 发出事件（保留完整的 response 对象）
    this.emit(AgentEventType.ToolExecutionDone, {
      toolName: request.name,
      callId: request.callId,
      result: response.result,    // 完整的 IToolResult
      success: response.success,
      error: response.error,
      duration: response.duration,
      sessionId: this.sessionId,
      turn: this.currentTurn,
    });
  }
}
```

## 📊 冗余消除

基于新设计，可以消除以下冗余：

1. **删除 ToolResult 旧接口** - 替换为泛型 IToolResult
2. **合并 ToolCallRequest 和 IToolCallRequestInfo** - 只保留一个
3. **删除 ToolCallResponse** - 功能被 IToolCallResponseInfo 覆盖
4. **简化 IToolCall 变体** - 使用判别联合类型

## ✅ 优势

1. **清晰的职责划分**
   - Tool: 业务逻辑
   - ToolScheduler: 执行管理
   - BaseAgent: 历史管理

2. **灵活的扩展性**
   - 自定义 IToolResult 实现
   - 可覆盖 toHistoryStr() 方法
   - 保留未来优化空间

3. **类型安全**
   - 泛型 TResult 提供类型安全
   - 编译时检查

4. **向后兼容**
   - DefaultToolResult 提供默认实现
   - 现有工具只需小改动

## 📝 迁移路径

### Phase 1: 添加新接口
```typescript
// 1. 添加 IToolResult 接口
// 2. 添加 DefaultToolResult 类
// 3. 更新 ITool 使用泛型
```

### Phase 2: 更新 ToolScheduler
```typescript
// 1. 更新 IToolCallResponseInfo
// 2. 实现 toContentPart 方法
// 3. 处理系统错误
```

### Phase 3: 更新 BaseAgent
```typescript
// 1. 使用 toContentPart 转换
// 2. 调用 toHistoryStr() 保存历史
```

### Phase 4: 迁移工具
```typescript
// 示例迁移
class MyTool extends BaseTool<Params, Result> {
  protected async executeCore(params: Params): Promise<Result> {
    // 原有逻辑
    return result;
  }
}
```

这个设计保持了系统的简洁性，同时提供了清晰的扩展点和职责划分。