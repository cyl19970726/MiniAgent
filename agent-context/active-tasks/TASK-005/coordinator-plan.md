# Coordinator Plan for TASK-005: MCP SDK Integration Refactoring

## Task Analysis
- **Objective**: Refactor MCP implementation to use official `@modelcontextprotocol/sdk`
- **Current State**: Custom MCP protocol implementation (incorrect approach)
- **Target State**: Thin adapter layer using official SDK
- **Impact**: Major architectural change affecting MCP module

## Module Breakdown and Dependencies

### Independent Modules (Can be worked on in parallel)
1. **SDK Client Wrapper** (mcpSdkClient.ts)
   - Wraps official SDK Client
   - Handles transport creation
   - Connection management

2. **Tool Adapter** (mcpSdkToolAdapter.ts)
   - Bridges SDK tools to BaseTool
   - Schema conversion (JSON Schema → TypeBox/Zod)
   - Parameter validation

3. **Examples** (mcp-sdk-example.ts)
   - Demonstrate correct SDK usage
   - Multiple transport examples
   - Integration patterns

4. **Documentation** (README.md, migration guide)
   - Migration instructions
   - API documentation
   - Best practices

5. **Tests** (SDK integration tests)
   - Client wrapper tests
   - Tool adapter tests
   - Integration tests

### Dependent Modules
1. **Index Exports** (src/mcp/index.ts)
   - Depends on: SDK Client Wrapper, Tool Adapter
   - Export new implementation
   - Deprecation notices

2. **Connection Manager Refactor** (mcpConnectionManager.ts)
   - Depends on: SDK Client Wrapper
   - Update to use McpSdkClient

## Parallel Execution Strategy

### Phase 1: Architecture and Design (1 agent)
**Duration**: 30 minutes
- **system-architect**: Design the refactoring approach
  - SDK integration patterns
  - Backward compatibility strategy
  - Migration path

### Phase 2: Core Implementation (3 agents in parallel)
**Duration**: 1 hour
Execute simultaneously:
- **mcp-dev-1**: Implement McpSdkClient wrapper
  - Create thin wrapper around SDK Client
  - Support stdio, SSE, WebSocket transports
  - Connection lifecycle management

- **mcp-dev-2**: Implement McpSdkToolAdapter
  - Bridge SDK tools to BaseTool interface
  - Schema conversion logic
  - Runtime validation with Zod

- **tool-dev-1**: Create helper utilities
  - createMcpSdkToolAdapters function
  - Type-safe tool creation helpers
  - Schema conversion utilities

### Phase 3: Supporting Components (3 agents in parallel)
**Duration**: 45 minutes
Execute simultaneously:
- **mcp-dev-3**: Update exports and deprecations
  - Update src/mcp/index.ts
  - Add deprecation notices
  - Maintain backward compatibility

- **mcp-dev-4**: Create comprehensive examples
  - Basic SDK usage example
  - Advanced patterns example
  - Migration examples

- **test-dev-1**: Create SDK integration tests
  - McpSdkClient tests
  - McpSdkToolAdapter tests
  - End-to-end integration tests

### Phase 4: Documentation and Migration (2 agents in parallel)
**Duration**: 30 minutes
Execute simultaneously:
- **mcp-dev-5**: Create documentation
  - README.md for MCP module
  - Migration guide
  - API documentation

- **mcp-dev-6**: Refactor Connection Manager
  - Update to use McpSdkClient
  - Maintain existing API
  - Add SDK-specific features

### Phase 5: Review and Finalization (1 agent)
**Duration**: 30 minutes
- **reviewer-1**: Comprehensive review
  - Code quality check
  - API consistency
  - Documentation completeness
  - Test coverage

## Resource Allocation
- **Total subagents needed**: 12
- **Maximum parallel subagents**: 3 (Phases 2 & 3)
- **Total phases**: 5
- **Estimated total time**: 3.5 hours

## Time Comparison
- **Sequential execution**: ~8-10 hours
- **Parallel execution**: ~3.5 hours
- **Efficiency gain**: 65%

## Risk Mitigation

### Technical Risks
1. **SDK API differences**: mcp-dev agents will adapt SDK patterns to MiniAgent conventions
2. **Breaking changes**: Maintain old implementation as deprecated
3. **Test failures**: Fix in Phase 5 if needed

### Coordination Risks
1. **Phase 2 delays**: Phase 3 can start partially if some components ready
2. **Integration issues**: Phase 5 reviewer will catch and coordinate fixes

## Success Criteria
- ✅ Official SDK properly integrated
- ✅ All custom protocol code deprecated
- ✅ Backward compatibility maintained
- ✅ Comprehensive tests passing
- ✅ Examples demonstrating correct usage
- ✅ Clear migration documentation
- ✅ No regression in existing functionality

## Deliverables by Phase

### Phase 1 Deliverables
- Detailed refactoring design document
- SDK integration patterns
- Backward compatibility approach

### Phase 2 Deliverables
- src/mcp/mcpSdkClient.ts
- src/mcp/mcpSdkToolAdapter.ts
- Helper utilities for tool creation

### Phase 3 Deliverables
- Updated src/mcp/index.ts
- examples/mcp-sdk-example.ts
- Comprehensive test suite

### Phase 4 Deliverables
- src/mcp/README.md
- Migration guide
- Updated mcpConnectionManager.ts

### Phase 5 Deliverables
- Code review report
- Final adjustments
- Merged implementation