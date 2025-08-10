# TASK-002: Tool Interface 最终设计方案

## ✅ 设计原则

1. **类型安全优先**: 使用 `unknown` 而非 `any`
2. **职责清晰分离**: Tool 负责业务逻辑，ToolScheduler 负责执行管理
3. **可扩展性**: 通过 `IToolResult.toHistoryStr()` 提供自定义点
4. **极简主义**: 符合 MiniAgent 的 minimal 理念

## 📐 核心接口定义

### 1. IToolResult 接口族

```typescript
// 工具结果的基础接口
export interface IToolResult {
  toHistoryStr(): string;
}

// 默认实现 - 使用 unknown 保证类型安全
export class DefaultToolResult<T = unknown> implements IToolResult {
  constructor(public data: T) {}
  
  toHistoryStr(): string {
    return JSON.stringify(this.data);
  }
}
```

**设计决策**: 使用 `T = unknown` 而非 `T = any`
- ✅ 强制类型声明，避免运行时错误
- ✅ 支持延迟类型实例化
- ✅ 与 `TParams = unknown` 保持一致
- ✅ 符合 TypeScript 最佳实践

### 2. ITool 接口

```typescript
export interface ITool<TParams = unknown, TResult extends IToolResult = DefaultToolResult> {
  name: string;
  description: string;
  schema: ToolDeclaration;
  isOutputMarkdown: boolean;
  canUpdateOutput: boolean;
  
  validateToolParams(params: TParams): string | null;
  getDescription(params: TParams): string;
  shouldConfirmExecute(params: TParams, signal: AbortSignal): Promise<ToolCallConfirmationDetails | false>;
  
  execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<TResult>;
}
```

### 3. IToolCallRequestInfo & IToolCallResponseInfo

```typescript
// 请求信息 - 合并原有的两个接口
export interface IToolCallRequestInfo {
  callId: string;
  functionId?: string;  // OpenAI 兼容
  name: string;
  args: Record<string, unknown>;
  isClientInitiated: boolean;
  promptId: string;
  
  // 静态工厂方法
  static fromContentPart(content: ContentPart): IToolCallRequestInfo | null;
}

// 响应信息 - ToolScheduler 增强后的结果
export interface IToolCallResponseInfo {
  callId: string;
  result?: IToolResult;      // 工具返回的原始结果
  success: boolean;          // 执行是否成功
  error?: Error;             // 系统错误（崩溃、超时等）
  duration?: number;         // 执行时长
  metadata?: {
    startTime: number;
    endTime: number;
    memoryUsage?: number;
  };
  
  // 转换为 ContentPart 的方法
  toContentPart(request: IToolCallRequestInfo): ContentPart;
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
    readonly isOutputMarkdown: boolean = true,
    readonly canUpdateOutput: boolean = false,
  ) {}
  
  get schema(): ToolDeclaration {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameterSchema,
    };
  }
  
  validateToolParams(params: TParams): string | null {
    // 基础验证逻辑
    return null;
  }
  
  getDescription(params: TParams): string {
    return this.description;
  }
  
  async shouldConfirmExecute(params: TParams, signal: AbortSignal): Promise<ToolCallConfirmationDetails | false> {
    return false; // 默认不需要确认
  }
  
  // 子类实现具体业务逻辑
  protected abstract executeCore(params: TParams): Promise<TResult>;
  
  // 最终的 execute 方法
  async execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<DefaultToolResult<TResult>> {
    const result = await this.executeCore(params);
    return new DefaultToolResult(result);
  }
}
```

## 🔄 数据流架构

```
┌─────────────────┐
│   LLM Response  │
│  function_call  │
└────────┬────────┘
         │
         ▼ ContentPart
┌─────────────────┐
│ToolCallRequest │ ◄── IToolCallRequestInfo.fromContentPart()
│      Info       │
└────────┬────────┘
         │
         ▼ 
┌─────────────────┐
│ ToolScheduler   │
│   .schedule()   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Tool.execute() │ ──► TResult extends IToolResult
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ToolScheduler   │ ──► 添加 success, error, duration
│  (增强结果)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ToolCallResponse│ ──► IToolCallResponseInfo
│      Info       │
└────────┬────────┘
         │
         ▼ toContentPart()
┌─────────────────┐
│   ContentPart   │
│function_response│
└────────┬────────┘
         │
         ▼ toHistoryStr()
┌─────────────────┐
│  Chat History   │
│  (JSON String)  │
└─────────────────┘
```

## 📊 接口简化成果

| 原接口 | 新接口 | 说明 |
|--------|--------|------|
| ToolResult (固定格式) | IToolResult (接口) + DefaultToolResult<T> | 可扩展的泛型设计 |
| ToolCallRequest + IToolCallRequestInfo | IToolCallRequestInfo | 合并冗余 |
| ToolCallResponse | 删除 | 功能并入 IToolCallResponseInfo |
| 7个 IBaseToolCall 变体 | ToolCall + ToolCallState (联合类型) | 大幅简化 |

**接口数量减少**: ~40% (从 25+ 减少到 15)

## 🚀 实施计划

### Phase 1: 核心接口实现（立即开始）
- [ ] 更新 `src/interfaces.ts`
- [ ] 实现 IToolResult 和 DefaultToolResult
- [ ] 更新 ITool 接口

### Phase 2: 基础组件更新
- [ ] 更新 `src/baseTool.ts`
- [ ] 更新 `src/coreToolScheduler.ts`
- [ ] 更新 `src/baseAgent.ts`

### Phase 3: 工具迁移
- [ ] 迁移内置工具
- [ ] 更新示例工具

### Phase 4: 测试验证
- [ ] 单元测试
- [ ] 集成测试
- [ ] 示例验证

## ✅ 成功标准

1. **类型安全**: 无 `any` 类型泄漏
2. **向后兼容**: 提供迁移路径
3. **测试覆盖**: 100% 关键路径
4. **性能稳定**: 无性能退化
5. **文档完整**: API 文档更新

## 📝 关键设计决策记录

### 为什么选择 `unknown` 而非 `any`？

```typescript
// ❌ 使用 any - 失去类型安全
const result = new DefaultToolResult();  // T = any
result.data.someProperty;  // 不报错，但可能崩溃

// ✅ 使用 unknown - 保持类型安全
const result = new DefaultToolResult();  // T = unknown
result.data.someProperty;  // 编译错误！必须先类型检查
```

**决策理由**:
1. **类型安全**: 强制显式类型处理
2. **一致性**: 与框架其他部分保持一致
3. **延迟实例化**: 支持更好的类型推断
4. **最佳实践**: TypeScript 团队推荐

这个最终设计完美平衡了简洁性、类型安全和可扩展性！