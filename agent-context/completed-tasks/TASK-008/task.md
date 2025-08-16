# TASK-008: Fix MCP Configuration and Types

## Task Information
- **ID**: TASK-008
- **Name**: Fix MCP Configuration and Types
- **Category**: [MCP]
- **Status**: Completed
- **Created**: 2024-01-11
- **Branch**: task/TASK-008-fix-mcp-config

## Description
Fix the inadequate McpConfig interface that doesn't support essential features (cwd, env, headers, timeout, WebSocket), and fix type issues in McpToolAdapter.

## Requirements
1. Redesign McpConfig to support all transport types and configurations
2. Add support for cwd, env for stdio transport
3. Add headers, timeout support for HTTP-based transports
4. Add WebSocket transport support
5. Fix McpToolAdapter params type to Record<string, unknown>
6. No backward compatibility required

## Agent Assignments

### Phase 1 (Parallel)
- **mcp-dev-1**: Redesign McpConfig and update SimpleMcpClient
- **mcp-dev-2**: Fix McpToolAdapter types
- **test-dev-1**: Create comprehensive tests

### Phase 2
- **mcp-dev-3**: Update McpManager

### Phase 3
- **reviewer-1**: Final review

## Progress Tracking
- [x] McpConfig redesigned
- [x] SimpleMcpClient updated
- [x] McpToolAdapter types fixed
- [x] McpManager updated
- [x] Tests created (139 tests passing)
- [x] Review completed

## Files Modified
- src/mcp-sdk/client.ts
- src/mcp-sdk/tool-adapter.ts
- src/mcp-sdk/manager.ts
- src/mcp-sdk/__tests__/*

## Notes
- User frustrated with current implementation quality
- Complete redesign needed, no backward compatibility
- Based on Google's MCPServerConfig reference implementation