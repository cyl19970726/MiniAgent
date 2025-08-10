# TASK-002: Tool Interface Refactor & Redundancy Elimination

## 📋 Executive Summary

综合优化 MiniAgent 的 Tool 相关接口，包括：
1. 重构 ToolResult 为 `{success: boolean, message: string}`
2. 消除 ~40% 的冗余接口
3. 统一工具执行流程的数据结构

## 🎯 核心目标

1. **消除冗余**：合并功能重叠的接口
2. **统一结构**：建立一致的工具执行数据模型
3. **保持简洁**：符合 MiniAgent 的极简理念
4. **类型安全**：利用 TypeScript 强类型系统

## 🔍 冗余分析结果

### 发现的主要冗余

| 冗余类型 | 接口对 | 重叠度 | 优化方案 |
|---------|--------|--------|----------|
| **主要冗余** | ToolResult vs IToolCallResponseInfo | 85% | 合并为 ToolExecutionResult |
| **次要冗余** | ToolCallRequest vs IToolCallRequestInfo | 95% | 统一为 ToolCallRequest |
| **复杂冗余** | 7个 IBaseToolCall 变体 | - | 使用判别联合类型 |
| **事件冗余** | ToolExecutionStart/DoneEvent | 70% | 统一事件结构 |
| **确认冗余** | 4个 ConfirmationDetails | 60% | 使用基础接口+扩展 |

## 📐 新接口设计

### 1. 统一的工具执行结果

```typescript
// 替代 ToolResult 和 IToolCallResponseInfo
export interface ToolExecutionResult {
  success: boolean;           // 执行成功标志
  message: string;            // 结果消息或错误描述
  callId?: string;            // 可选的调用ID（用于跟踪）
  error?: Error;              // 可选的错误对象
  duration?: number;          // 可选的执行时长
}

// 兼容性别名（过渡期）
export type ToolResult = Pick<ToolExecutionResult, 'success' | 'message'>;
```

### 2. 统一的工具调用请求

```typescript
// 合并 ToolCallRequest 和 IToolCallRequestInfo
export interface ToolCallRequest {
  callId: string;                    // 唯一调用标识符
  functionId?: string;               // 可选的函数ID（OpenAI兼容）
  name: string;                      // 工具名称
  args: Record<string, unknown>;     // 工具参数
  isClientInitiated: boolean;        // 是否客户端发起
  promptId: string;                  // 关联的提示ID
}

// 移除 IToolCallRequestInfo（直接使用 ToolCallRequest）
```

### 3. 简化的工具调用状态

```typescript
// 使用判别联合类型替代 7 个接口
export type ToolCallState = 
  | { status: 'validating'; tool: ITool }
  | { status: 'scheduled'; tool: ITool }
  | { status: 'executing'; tool: ITool; liveOutput?: string }
  | { status: 'awaiting_approval'; tool: ITool; confirmationDetails: ToolConfirmationDetails }
  | { status: 'success'; tool: ITool; result: ToolExecutionResult; duration: number }
  | { status: 'error'; result: ToolExecutionResult; duration: number }
  | { status: 'cancelled'; tool: ITool; result: ToolExecutionResult; duration: number };

export interface ToolCall {
  request: ToolCallRequest;
  state: ToolCallState;
  startTime: number;
  outcome?: ToolConfirmationOutcome;
}
```

### 4. 统一的工具事件

```typescript
// 基础工具事件接口
export interface ToolExecutionEvent extends AgentEvent {
  toolName: string;
  callId: string;
  sessionId: string;
  turn: number;
}

// 具体事件类型
export interface ToolExecutionStartEvent extends ToolExecutionEvent {
  type: AgentEventType.ToolExecutionStart;
  args: Record<string, unknown>;
}

export interface ToolExecutionDoneEvent extends ToolExecutionEvent {
  type: AgentEventType.ToolExecutionDone;
  result: ToolExecutionResult;  // 使用统一的结果类型
}
```

### 5. 简化的确认详情

```typescript
// 基础确认接口
export interface BaseConfirmationDetails {
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome, payload?: any) => Promise<void>;
}

// 具体类型扩展
export interface EditConfirmationDetails extends BaseConfirmationDetails {
  type: 'edit';
  fileName: string;
  fileDiff: string;
  isModifying?: boolean;
}

export interface ExecConfirmationDetails extends BaseConfirmationDetails {
  type: 'exec';
  command: string;
  rootCommand: string;
}

// 联合类型
export type ToolConfirmationDetails = 
  | EditConfirmationDetails 
  | ExecConfirmationDetails
  | McpConfirmationDetails
  | InfoConfirmationDetails;
```

## 🔧 实施计划

### Phase 1: 核心接口重构（第1周）
1. 创建新的统一接口
2. 添加兼容性类型别名
3. 更新 TypeScript 定义

### Phase 2: 迁移实现（第2周）
1. 更新 CoreToolScheduler 使用新接口
2. 更新 BaseAgent 的工具处理
3. 迁移所有工具实现

### Phase 3: 移除冗余（第3周）
1. 删除废弃的接口
2. 清理兼容性代码
3. 更新文档

### Phase 4: 测试验证（第4周）
1. 全面测试新接口
2. 性能基准测试
3. 示例应用验证

## 📊 影响评估

### 积极影响
- **减少 ~40% 接口数量**（从 25+ 减少到 15）
- **降低维护成本**（单一真相源）
- **提高开发体验**（更清晰的类型）
- **更好的扩展性**（统一的数据模型）

### 需要注意的变更
- **Breaking Change**: 所有工具需要更新返回类型
- **历史格式变更**: JSON 序列化的结果格式
- **事件数据变更**: 统一的事件结构

## 📝 迁移示例

### 工具实现迁移

```typescript
// 旧实现
class MyTool extends BaseTool {
  async execute(params: any): Promise<ToolResult> {
    return { result: "Success message" };
  }
}

// 新实现
class MyTool extends BaseTool {
  async execute(params: any): Promise<ToolExecutionResult> {
    return { 
      success: true, 
      message: "Success message" 
    };
  }
}
```

### BaseAgent 历史记录

```typescript
// 更新后的历史记录处理
const toolResultMessage: MessageItem = {
  role: 'user',
  content: {
    type: 'function_response',
    functionResponse: {
      call_id: request.callId,
      name: request.name,
      result: JSON.stringify(response), // 完整的 ToolExecutionResult
    },
  },
  turnIdx: this.currentTurn,
};
```

### CoreToolScheduler 结果处理

```typescript
// 统一的结果创建
const result: ToolExecutionResult = {
  success: true,
  message: "Tool executed successfully",
  callId: scheduledCall.request.callId,
  duration: Date.now() - scheduledCall.startTime
};
```

## ✅ 成功标准

1. **所有工具返回新格式**
2. **接口数量减少 40%**
3. **所有测试通过**
4. **无性能退化**
5. **文档完整更新**

## 🚀 长期收益

1. **更易维护**：减少重复代码和接口
2. **更好的类型安全**：统一的数据模型
3. **更清晰的架构**：简化的工具执行流程
4. **更好的扩展性**：易于添加新功能

这个综合设计将 MiniAgent 的工具系统简化到最小必要复杂度，同时保持完整功能。