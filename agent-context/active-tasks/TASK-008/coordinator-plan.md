# Coordinator Plan for TASK-008: Fix MCP Configuration and Types

## Task Analysis
- Total modules to work on: 4 (client.ts, tool-adapter.ts, manager.ts, tests)
- Independent modules identified: 3 (can work in parallel)
- Dependencies: manager.ts depends on client.ts changes

## Issues to Fix
1. **McpConfig interface is inadequate**:
   - Missing cwd, env support for stdio
   - Missing headers, timeout support
   - No WebSocket transport support
   - No metadata fields (description, includeTools, excludeTools)

2. **Type issues in McpToolAdapter**:
   - params should be `Record<string, unknown>` not `Record<string, any>`
   - Type safety improvements needed

## Parallel Execution Strategy

### Phase 1: Core Fixes (All Parallel)
Execute simultaneously:
- **mcp-dev-1**: Redesign McpConfig interface and update SimpleMcpClient
  - Add comprehensive transport configurations
  - Support cwd, env, headers, timeout
  - Add WebSocket transport
  - Files: src/mcp-sdk/client.ts

- **mcp-dev-2**: Fix McpToolAdapter type issues
  - Change params to Record<string, unknown>
  - Improve type safety
  - Files: src/mcp-sdk/tool-adapter.ts

- **test-dev-1**: Create comprehensive tests for MCP SDK
  - Test McpToolAdapter
  - Test SimpleMcpClient with new config
  - Files: src/mcp-sdk/__tests__/

### Phase 2: Integration Updates (After Phase 1)
- **mcp-dev-3**: Update McpManager to use new McpConfig
  - Update McpServerConfig interface
  - Use new configuration options
  - Files: src/mcp-sdk/manager.ts

### Phase 3: Review and Finalization
- **reviewer-1**: Review all changes
  - Verify type safety
  - Check configuration completeness
  - Ensure no backward compatibility issues

## Resource Allocation
- Total subagents needed: 5
- Maximum parallel subagents: 3 (Phase 1)
- Phases: 3

## Time Estimation
- Sequential execution: ~5 hours
- Parallel execution: ~2 hours
- Efficiency gain: 60%

## Risk Mitigation
- If mcp-dev-1 fails: Block Phase 2 until resolved
- If test-dev-1 needs client changes: Can still create test structure
- No backward compatibility concerns (per user request)