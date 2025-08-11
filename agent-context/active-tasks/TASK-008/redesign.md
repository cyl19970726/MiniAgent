# TASK-008 重新设计方案

## 参考 Google 实现的关键学习点

从 `other.md` 中的 Google 实现，我们学到：

1. **类型安全**: 使用 `Record<string, unknown>` 而不是 `Record<string, any>`
2. **简洁设计**: 不过度设计，只实现必要的功能
3. **清晰分离**: MCP 工具作为 BaseTool 的扩展，而不是复杂的适配层
4. **实用主义**: 专注于实际需求，而不是理论完美

## 简化后的实现方案

### 1. 精简 McpConfig（只保留实际需要的）

```typescript
// src/mcp-sdk/client.ts
export interface McpConfig {
  transport: 'stdio' | 'sse' | 'http';
  
  // stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  
  // HTTP-based transports (SSE, HTTP)
  url?: string;
  headers?: Record<string, string>;
  
  // Common options
  timeout?: number;
  clientInfo?: {
    name: string;
    version: string;
  };
}
```

### 2. 修复类型问题

```typescript
// src/mcp-sdk/tool-adapter.ts
export class McpToolAdapter extends BaseTool<Record<string, unknown>, any> {
  // ... 使用 unknown 而不是 any
}
```

### 3. McpManager 更新细节

保持 McpManager 的核心功能，同时使用新的 McpConfig：

```typescript
// src/mcp-sdk/manager.ts
export interface McpServerConfig {
  name: string;
  config: McpConfig;  // 使用更新后的 McpConfig
  autoConnect?: boolean;
}

export class McpManager {
  // 保留现有的管理功能
  async addServer(config: McpServerConfig): Promise<McpToolAdapter[]>
  async removeServer(name: string): Promise<void>
  
  // 保留列表和查询功能
  listServers(): string[]
  getServerTools(name: string): McpToolAdapter[]
  getAllTools(): McpToolAdapter[]
  isServerConnected(name: string): boolean
  
  // 保留服务器信息功能
  getServersInfo(): Array<{
    name: string;
    connected: boolean;
    toolCount: number;
  }>
  
  // 保留批量操作
  async disconnectAll(): Promise<void>
}
```

主要修改：
1. McpServerConfig 使用新的 McpConfig 接口
2. addServer 方法正确传递 env, cwd, headers 等配置到 SimpleMcpClient
3. 保留所有现有的管理和查询功能
4. 不做过度抽象，保持实用性

## 实施计划

### Phase 1: 核心修复（并行）
1. **mcp-dev-1**: 修复 client.ts 的 McpConfig
2. **mcp-dev-2**: 修复 tool-adapter.ts 的类型

### Phase 2: 集成测试
1. **test-dev-1**: 创建集成测试

### Phase 3: 清理
1. 删除不必要的设计文档
2. 保持代码简洁

## 需要删除的文件
- design.md (过度设计)
- mcp-interfaces.ts (不需要)
- 多余的报告文件

## 成功标准
- ✅ McpConfig 支持必要的配置（env, cwd, headers, timeout）
- ✅ 类型安全（使用 unknown 而不是 any）
- ✅ 代码简洁，没有过度设计
- ✅ 可以正常工作