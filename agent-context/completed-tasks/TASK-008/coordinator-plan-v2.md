# Coordinator Plan V2 for TASK-008: 简化的 MCP 修复方案

## 任务分析（基于 Google 参考实现）
- 核心问题：McpConfig 缺少必要配置，类型使用 any 而不是 unknown
- 解决方案：最小化修改，专注实际需求
- 文件清理：删除过度设计的文档

## 并行执行策略

### Phase 1: 核心修复（3个并行任务）
同时执行：
- **mcp-dev-1**: 修复 src/mcp-sdk/client.ts
  - 添加 env, cwd 支持到 stdio transport
  - 添加 headers, timeout 支持
  - 简化验证逻辑
  
- **mcp-dev-2**: 修复 src/mcp-sdk/tool-adapter.ts  
  - 改 `Record<string, any>` 为 `Record<string, unknown>`
  - 参考 Google 的 DiscoveredMCPTool 模式

- **mcp-dev-3**: 更新 src/mcp-sdk/manager.ts
  - 更新 McpServerConfig 使用新的 McpConfig
  - 修改 addServer 正确传递所有配置
  - 保留所有管理功能（listServers, getServersInfo 等）

### Phase 2: 测试（1个任务）
- **test-dev-1**: 创建/更新测试
  - 测试新的 McpConfig 选项
  - 测试类型安全

### Phase 3: 清理和审查（1个任务）
- **reviewer-1**: 审查所有更改
  - 确保代码简洁
  - 验证类型安全
  - 清理不必要的文件

## 资源分配
- 总 subagents: 4
- 最大并行: 2（Phase 1）
- 阶段数: 3

## 预计时间
- 顺序执行：~2 小时
- 并行执行：~1 小时
- 效率提升：50%

## 成功指标
- McpConfig 支持实际需要的配置
- 类型安全（no any）
- 代码保持简洁
- 测试通过