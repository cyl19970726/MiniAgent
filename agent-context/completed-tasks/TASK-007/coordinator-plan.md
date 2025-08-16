# Coordinator Plan for TASK-007: Clean MCP SDK-Only Integration

## Task Analysis
- **Objective**: Remove ALL custom MCP code, keep ONLY official SDK integration
- **Approach**: Delete custom implementation, simplify to minimal SDK wrapper
- **Philosophy**: Reduce complexity, use SDK directly, no backward compatibility

## Current State Analysis
- Custom implementation files to DELETE:
  - src/mcp/mcpClient.ts (custom implementation)
  - src/mcp/mcpToolAdapter.ts (old adapter)
  - src/mcp/mcpConnectionManager.ts (old manager)
  - src/mcp/schemaManager.ts (custom schema)
  - src/mcp/transports/* (custom transports)
  - src/mcp/interfaces.ts (custom interfaces)
  
- SDK integration to KEEP and SIMPLIFY:
  - Minimal wrapper around SDK Client
  - Simple tool adapter for BaseTool
  - Direct SDK usage everywhere

## Parallel Execution Strategy

### Phase 1: Architecture Design (1 agent)
**Duration**: 30 minutes
- **system-architect**: Design minimal SDK-only architecture
  - Define clean integration points
  - Remove all complexity
  - Use SDK directly

### Phase 2: Cleanup and Simplification (3 agents in parallel)
**Duration**: 45 minutes
Execute simultaneously:
- **mcp-dev-1**: Delete all custom MCP implementation
  - Remove old files
  - Clean up imports
  - Remove deprecated exports

- **mcp-dev-2**: Simplify SDK wrapper to minimal
  - Create simple McpClient using SDK
  - Direct SDK method exposure
  - No custom protocol code

- **mcp-dev-3**: Create simple tool adapter
  - Minimal McpToolAdapter
  - Direct SDK tool to BaseTool bridge
  - No complex conversions

### Phase 3: Examples and Documentation (2 agents in parallel)
**Duration**: 30 minutes
Execute simultaneously:
- **mcp-dev-4**: Create clean examples
  - Simple SDK usage
  - No migration examples
  - Direct, clear patterns

- **tool-dev-1**: Update exports and integration
  - Clean index.ts
  - Simple public API
  - No backward compatibility

### Phase 4: Testing and Review (2 agents in parallel)
**Duration**: 30 minutes
Execute simultaneously:
- **test-dev-1**: Create simple integration tests
  - Test SDK integration only
  - No compatibility tests
  - Clean test structure

- **reviewer-1**: Review simplified architecture
  - Verify minimal approach
  - Check SDK-only usage
  - Confirm complexity reduction

## Resource Allocation
- **Total subagents needed**: 8
- **Maximum parallel subagents**: 3
- **Total phases**: 4
- **Estimated total time**: 2.5 hours

## Simplification Goals
1. **Delete**: Remove 80% of current MCP code
2. **Simplify**: Reduce to <500 lines total
3. **Direct**: Use SDK methods directly
4. **Clean**: No backward compatibility
5. **Minimal**: Only essential wrapper code

## Success Criteria
- ✅ ALL custom MCP implementation deleted
- ✅ ONLY official SDK used
- ✅ NO backward compatibility code
- ✅ Minimal wrapper (< 500 lines total)
- ✅ Clean, simple architecture
- ✅ Direct SDK usage patterns
- ✅ Reduced system complexity

## Risk Mitigation
- **Breaking changes**: Acceptable - this is a clean redesign
- **User migration**: Not a concern - removing old code
- **Simplification**: Priority over features