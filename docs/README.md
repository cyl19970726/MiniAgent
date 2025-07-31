# MiniAgent 文档

欢迎使用 MiniAgent 文档！这里包含了使用 MiniAgent 框架所需的所有文档资料。

## 📚 文档结构

### 📖 基础文档
- **[快速开始](./quickstart.md)** - 5分钟快速上手，了解基本使用方法

### 🔧 核心概念
- **[Agent运行原理](./agent-loop-principle.md)** - 深入理解 Agent Loop 的工作机制
  - Agent Loop 主要过程
  - 接收用户请求 → 访问LLM → 生成toolCall → ToolScheduler执行toolCall → 结果重新添加到历史记录 → 继续访问LLM → 没有toolCall则跳出loop
  - 架构图和流程图
  - 核心组件详解

### 🛠️ 使用指南
- **[BaseAgent使用指南](./baseagent-usage.md)** - 完整的 BaseAgent 使用手册
  - 所有 Agent Event 类型说明
  - 推荐的事件处理方法
  - 高级用法和性能监控
  - 错误处理策略

- **[Tool定义和使用](./tool-definition.md)** - 工具系统完整指南
  - 如何定义自定义工具
  - 事件接收和处理
  - 通过 callback 启用 tool 的 approve 功能
  - 工具确认机制

- **[SessionManager使用指南](./session-manager-usage.md)** - 会话管理功能指南
  - 如何通过 StandardAgent 使用 processWithSession 功能
  - 多会话管理
  - 会话持久化
  - 高级会话管理特性

## 🚀 快速导航

### 新手入门
1. 首先阅读 [快速开始](./quickstart.md) 了解基本概念
2. 然后查看 [Agent运行原理](./agent-loop-principle.md) 理解内部机制
3. 根据需要选择相应的使用指南

### 开发者指南
- **基础开发**: [BaseAgent使用指南](./baseagent-usage.md)
- **工具开发**: [Tool定义和使用](./tool-definition.md)  
- **会话管理**: [SessionManager使用指南](./session-manager-usage.md)

### 架构理解
- **核心流程**: [Agent运行原理](./agent-loop-principle.md)
- **事件系统**: [BaseAgent使用指南](./baseagent-usage.md)
- **工具系统**: [Tool定义和使用](./tool-definition.md)

## 📋 文档更新记录

- ✅ 重新组织文档结构，按功能模块分类
- ✅ 添加详细的 Agent Loop 运行原理说明
- ✅ 完善所有 Agent Event 类型的处理方法
- ✅ 增加工具确认机制和 callback 使用指南
- ✅ 添加 SessionManager 完整使用文档

## 🔍 快速查找

### 常见问题
- **如何处理 LLM 响应?** → [BaseAgent使用指南](./baseagent-usage.md#llm-响应事件)
- **如何创建自定义工具?** → [Tool定义和使用](./tool-definition.md#创建自定义工具)
- **如何管理多个会话?** → [SessionManager使用指南](./session-manager-usage.md#多会话管理)
- **如何理解 Agent 执行流程?** → [Agent运行原理](./agent-loop-principle.md#详细执行步骤)

### 事件类型速查
- **UserMessage** - 用户消息事件
- **ResponseStart** - LLM响应开始
- **ResponseChunkTextDelta** - 文本流式更新
- **ToolExecutionStart** - 工具执行开始
- **TurnComplete** - 对话轮次完成

详细说明请查看 [BaseAgent使用指南](./baseagent-usage.md#agent-事件类型详解)

### 配置选项速查
- **ChatProvider**: `gemini` | `openai`
- **ApprovalMode**: `yolo` | `default` | `always`
- **LogLevel**: `DEBUG` | `INFO` | `WARN` | `ERROR`

详细配置请查看 [快速开始](./quickstart.md#进阶配置)

## 💡 使用提示

1. **阅读顺序建议**: 快速开始 → Agent运行原理 → 具体使用指南
2. **实践建议**: 结合 `examples/` 目录下的示例代码学习
3. **调试技巧**: 启用 DEBUG 日志可以看到详细的执行过程
4. **性能优化**: 注意监控 Token 使用量和工具执行时间

## 🤝 贡献文档

如果您发现文档有误或需要改进，欢迎：
1. 提交 Issue 报告问题
2. 提交 Pull Request 改进文档
3. 分享使用经验和最佳实践

---

**开始探索 MiniAgent 的强大功能吧！** 🚀