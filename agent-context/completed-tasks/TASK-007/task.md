# TASK-007: Clean MCP SDK-Only Integration

## Task Information
- **ID**: TASK-007
- **Name**: Clean MCP SDK-Only Integration (Remove Custom Implementation)
- **Category**: [CORE] [REFACTOR] [SIMPLIFICATION]
- **Created**: 2025-08-11
- **Status**: Complete
- **Completed**: 2025-08-11

## Description
Remove ALL custom MCP implementation and keep ONLY a minimal wrapper around the official `@modelcontextprotocol/sdk`. This task aims to dramatically simplify the MCP integration by removing backward compatibility, custom protocol implementation, and unnecessary complexity.

## Objectives
- [ ] Delete all custom MCP implementation files
- [ ] Create minimal SDK wrapper (<500 lines total)
- [ ] Use SDK directly without abstraction layers
- [ ] Remove all backward compatibility code
- [ ] Simplify to essential functionality only
- [ ] Create clean examples showing direct SDK usage

## Simplification Targets
- **Before**: ~5000+ lines of custom MCP code
- **After**: <500 lines of minimal wrapper
- **Reduction**: 90% code removal
- **Complexity**: From complex to trivial

## Files to Delete
- src/mcp/mcpClient.ts
- src/mcp/mcpToolAdapter.ts  
- src/mcp/mcpConnectionManager.ts
- src/mcp/schemaManager.ts
- src/mcp/interfaces.ts
- src/mcp/transports/*
- src/mcp/__tests__/* (old tests)
- All backward compatibility code

## Files to Create (Minimal)
- src/mcp-sdk/client.ts (thin SDK wrapper, <200 lines)
- src/mcp-sdk/tool-adapter.ts (simple adapter, <150 lines)
- src/mcp-sdk/index.ts (clean exports, <50 lines)
- examples/mcp-simple.ts (direct SDK usage)

## Success Metrics
- Code reduction: >90%
- Complexity: Trivial
- Dependencies: Only @modelcontextprotocol/sdk
- No custom protocol code
- No backward compatibility

## Timeline
- Start: 2025-08-11
- Target: Complete in 2.5 hours using parallel execution