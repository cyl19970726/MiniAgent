# Agent Framework Implementation Plan

## 实现原则

### 核心原则
1. **参考而非依赖**：不再引入 core 包的内容，而是参考 core 包的实现，创建我们自己版本的代码
2. **独立实现**：每个核心组件都有自己的实现版本（AgentEvent、CoreToolScheduler、GeminiChat 等）
3. **测试驱动**：每个实现文件都要有对应的测试文件，采用 vitest 框架
4. **一文件一测试**：每个实现文件对应一个测试文件，测试代码参考 core 包的测试例子
5. **接口优先**：所有实现都要严格遵循 interfaces.ts 中定义的接口

### 依赖策略
- **✅ 允许**：参考 core 包的实现逻辑和测试模式
- **❌ 禁止**：直接 import core 包的类型或实现
- **🔄 转换**：需要与 core 包交互时，通过适配器模式处理类型转换

## 当前状态

### ✅ 已完成
- [x] Core interfaces 定义 (`interfaces.ts`)
- [x] 项目结构建立
- [x] 框架文档创建

### 🔄 进行中
- [ ] `GeminiChat` 实现需要完善（参考 core 版本）
- [ ] 接口注释需要补充和澄清

### ❌ 待开始
- [ ] `TokenTracker` 实现
- [ ] `AgentEvent` 系统实现
- [ ] `CoreToolScheduler` 实现
- [ ] `BaseAgent` 实现
- [ ] 测试框架搭建

## 实现任务

### Phase 1: 基础组件实现 (Week 1-2)

#### Task 1.1: 完善 GeminiChat 实现
- **文件**: `src/geminiChat.ts`
- **参考**: `@packages/core/src/core/geminiChat.ts`
- **测试**: `src/geminiChat.test.ts`
- **测试参考**: `@packages/core/src/core/geminiChat.test.ts`
- **要求**:
  - 实现完整的流式消息处理
  - 支持 `ConversationContent` 类型（我们自己的类型）
  - 集成 TokenTracker
  - 实现 curated history 提取
  - 支持系统提示词管理
  - 错误处理和重试机制

#### Task 1.2: 实现 TokenTracker
- **文件**: `src/tokenTracker.ts`
- **参考**: core 包中的 token 管理逻辑
- **测试**: `src/tokenTracker.test.ts`
- **接口**: `ITokenTracker`, `ITokenUsage`
- **要求**:
  - 实时 token 使用跟踪
  - 使用百分比计算
  - 限制执行
  - 重置功能
  - 使用摘要生成

#### Task 1.3: 实现 AgentEvent 系统
- **文件**: `src/agentEvent.ts`
- **参考**: core 包的事件系统设计
- **测试**: `src/agentEvent.test.ts`
- **接口**: `AgentEvent`, `EventHandler`
- **要求**:
  - 事件发射基础设施
  - 事件类型管理
  - 处理器注册系统
  - 错误处理
  - 事件过滤和转换

### Phase 2: 工具系统实现 (Week 2-3)

#### Task 2.1: 实现 CoreToolScheduler
- **文件**: `src/coreToolScheduler.ts`
- **参考**: `@packages/core/src/core/coreToolScheduler.ts`
- **测试**: `src/coreToolScheduler.test.ts`
- **接口**: `IToolScheduler`
- **要求**:
  - 工具调度和执行管理
  - 工具状态跟踪 (`IToolCall` 及其状态)
  - 确认和批准流程
  - 错误处理和重试
  - 实时输出更新

#### Task 2.2: 工具调用提取器
- **文件**: `src/toolExtractor.ts`
- **测试**: `src/toolExtractor.test.ts`
- **要求**:
  - 从 LLM 响应中提取工具调用
  - 转换为调度器格式
  - 处理函数调用/响应
  - 错误处理和验证

#### Task 2.3: 工具结果集成
- **文件**: 更新 `src/geminiChat.ts`
- **测试**: 更新 `src/geminiChat.test.ts`
- **要求**:
  - 将工具结果添加到历史记录
  - 处理工具执行事件
  - 支持流式工具更新
  - 维护对话流程

### Phase 3: Agent 实现 (Week 3-4)

#### Task 3.1: 实现 BaseAgent
- **文件**: `src/baseAgent.ts`
- **测试**: `src/baseAgent.test.ts`
- **接口**: `IAgent`
- **要求**:
  - 协调 Chat 和 ToolScheduler
  - 实现完整的对话流程
  - 事件发射系统
  - 会话管理
  - 状态跟踪

#### Task 3.2: 对话管理器
- **文件**: `src/conversationManager.ts`
- **测试**: `src/conversationManager.test.ts`
- **要求**:
  - Turn 管理
  - 历史持久化
  - 会话处理
  - 状态管理

### Phase 4: 测试和优化 (Week 4-5)

#### Task 4.1: 测试框架完善
- **文件**: `vitest.config.ts`
- **要求**:
  - 配置 vitest 测试框架
  - 设置测试环境
  - Mock 外部依赖
  - 代码覆盖率配置

#### Task 4.2: 集成测试
- **文件**: `src/integration.test.ts`
- **要求**:
  - 端到端测试
  - 组件集成测试
  - 性能基准测试
  - 错误场景测试

## 接口补充说明

### 需要澄清的接口注释

#### 1. `ConversationContent` vs Core `Content`
```typescript
/**
 * Generic conversation content - 我们自己的对话内容类型
 * 
 * 这个类型替代了 core 包的 Content 类型，提供了更灵活的
 * 内容结构，支持多种媒体类型和函数调用。
 * 
 * 与 core 包的 Content 的主要区别：
 * - 使用 ContentPart[] 而不是 Part[]
 * - 支持更多的 role 类型
 * - 包含可选的 metadata
 */
export interface ConversationContent {
  // ... 现有定义
}
```

#### 2. `IToolScheduler` 接口
```typescript
/**
 * Core tool scheduler interface - 工具调度器接口
 * 
 * 这个接口定义了工具调度的核心功能，包括：
 * - 工具调用的调度和执行
 * - 状态跟踪和管理
 * - 确认和批准流程
 * - 错误处理和重试
 * 
 * 实现参考 core 包的 CoreToolScheduler，但使用我们自己的类型系统
 */
export interface IToolScheduler {
  // ... 现有定义
}
```

#### 3. `AgentEvent` 系统
```typescript
/**
 * Agent event types - 代理事件类型
 * 
 * 定义了代理在处理过程中发出的各种事件：
 * - Content: 内容生成事件
 * - ToolCallRequest: 工具调用请求
 * - ToolCallResponse: 工具调用响应
 * - TokenUsage: Token 使用情况
 * - Error: 错误事件
 * - ModelFallback: 模型回退事件
 */
export enum AgentEventType {
  // ... 现有定义
}
```

## 实现优先级

### 🔥 立即开始
1. **完善 GeminiChat 实现** - 核心对话功能
2. **实现 TokenTracker** - Token 管理
3. **设置测试框架** - 确保质量

### 🟡 第二周
4. **实现 CoreToolScheduler** - 工具执行
5. **创建 AgentEvent 系统** - 事件管理
6. **工具调用提取器** - 工具集成

### 🟢 第三周
7. **实现 BaseAgent** - 主要代理逻辑
8. **对话管理器** - 会话处理
9. **集成测试** - 端到端测试

## 测试策略

### 测试文件组织
```
src/
├── geminiChat.ts → geminiChat.test.ts
├── tokenTracker.ts → tokenTracker.test.ts
├── agentEvent.ts → agentEvent.test.ts
├── coreToolScheduler.ts → coreToolScheduler.test.ts
├── baseAgent.ts → baseAgent.test.ts
└── integration.test.ts
```

### 测试参考
- **GeminiChat**: 参考 `@packages/core/src/core/geminiChat.test.ts`
- **CoreToolScheduler**: 参考 core 包的工具调度测试
- **事件系统**: 参考 core 包的事件测试模式
- **集成测试**: 参考现有的端到端测试

## 成功标准

### Phase 1 完成标准
- [ ] GeminiChat 通过所有流式测试
- [ ] TokenTracker 准确跟踪使用情况
- [ ] 所有接口兼容性问题解决
- [ ] 测试覆盖率 > 80%

### Phase 2 完成标准
- [ ] 工具通过调度器成功执行
- [ ] 支持所有现有工具类型
- [ ] 工具结果正确集成到聊天中
- [ ] 事件流维护完整

### Phase 3 完成标准
- [ ] BaseAgent 处理完整对话流程
- [ ] 所有关键操作发出事件
- [ ] 会话管理正常工作
- [ ] 与现有 CLI 集成工作

### 最终完成标准
- [ ] 测试覆盖率 > 90%
- [ ] 完整文档
- [ ] 工作示例
- [ ] 性能基准测试
- [ ] 零 TypeScript 编译错误

## 下一步行动

1. **立即**: 完善 GeminiChat 实现，参考 core 包但使用我们的类型
2. **本周**: 实现 TokenTracker 和设置测试框架
3. **下周**: 创建 CoreToolScheduler 和 AgentEvent 系统
4. **第三周**: 实现 BaseAgent 连接所有组件
5. **第四周**: 完成测试和文档

这个计划确保我们创建一个独立、完整、经过良好测试的 Agent 框架，同时保持与现有生态系统的兼容性。