# MCP SDK Integration Refactoring Design

## Overview
This document outlines the architectural design for refactoring MiniAgent's MCP integration to properly use the official `@modelcontextprotocol/sdk` instead of the custom implementation.

## Current State Analysis

### Existing Implementation Issues
1. **Complete Protocol Reimplementation**: The current `mcpClient.ts` reimplements the entire MCP JSON-RPC protocol from scratch
2. **Custom Transport Layer**: Custom transport implementations instead of using SDK transports
3. **Duplicated Effort**: Protocol handling, connection management, and error handling all reimplemented
4. **Maintenance Burden**: Custom code requires ongoing maintenance and may diverge from official protocol

### SDK Implementation Status
The SDK-based implementation has been created but needs architectural refinement:
- ✅ `McpSdkClient` - Basic wrapper around official SDK Client
- ✅ `McpSdkToolAdapter` - Bridges SDK tools to BaseTool interface  
- ✅ Official SDK dependency added (`@modelcontextprotocol/sdk@^1.17.2`)
- ⚠️ Backward compatibility maintained but needs cleanup strategy

## Proposed Architecture

### 1. McpSdkClient Wrapper Design

```typescript
interface McpSdkClientConfig {
  serverName: string;
  transport: {
    type: 'stdio' | 'sse' | 'websocket';
    // Transport-specific config
  };
  clientInfo?: Implementation;
}

class McpSdkClient {
  // Thin wrapper around SDK Client
  // Minimal interface, delegate to SDK
}
```

**Design Principles:**
- **Minimal Wrapper**: Only add what's necessary for MiniAgent integration
- **Delegate Everything**: Let SDK handle protocol, connection, error handling
- **Configuration Abstraction**: Simple config interface that maps to SDK transports

### 2. McpSdkToolAdapter Bridge Pattern

```typescript
class McpSdkToolAdapter extends BaseTool {
  // Convert MCP JSON Schema to TypeBox/Zod
  // Bridge MCP tool execution to BaseTool interface
  // Handle parameter validation and result transformation
}
```

**Key Responsibilities:**
- Schema conversion (JSON Schema → TypeBox/Zod)
- Parameter validation using Zod
- Result transformation (MCP format → ToolResult)
- Error handling and reporting

### 3. Export Strategy

```typescript
// src/mcp/index.ts - New primary exports
export { McpSdkClient } from './mcpSdkClient.js';
export { McpSdkToolAdapter, createMcpSdkToolAdapters } from './mcpSdkToolAdapter.js';

// Re-export SDK types for convenience
export type { Tool as McpTool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Deprecated exports for backward compatibility
/** @deprecated Use McpSdkClient instead */
export { McpClient } from './mcpClient.js';
/** @deprecated Use McpSdkToolAdapter instead */
export { McpToolAdapter } from './mcpToolAdapter.js';
```

## Implementation Plan

### Phase 1: Architecture Refinement ✅ COMPLETED
- [x] Create McpSdkClient wrapper
- [x] Implement McpSdkToolAdapter bridge
- [x] Add deprecation notices to old implementation
- [x] Update main exports

### Phase 2: Enhanced Integration
- [ ] Improve schema conversion robustness
- [ ] Add SDK-specific error handling
- [ ] Enhance connection lifecycle management
- [ ] Add SDK capabilities detection

### Phase 3: Migration Strategy
- [ ] Create migration guide documentation
- [ ] Add compatibility layer utilities
- [ ] Update all examples to use SDK approach
- [ ] Add deprecation warnings in old code

### Phase 4: Cleanup (Future Major Version)
- [ ] Remove deprecated custom implementation
- [ ] Clean up interface exports
- [ ] Remove old examples and tests
- [ ] Update documentation completely

## Technical Decisions

### 1. Schema Conversion Strategy
**Decision**: Convert MCP JSON Schema to both TypeBox and Zod
- TypeBox for BaseTool compatibility
- Zod for runtime validation
- Graceful fallback for complex schemas

### 2. Error Handling Approach
**Decision**: Wrap SDK errors in MiniAgent ToolResult format
- Preserve original error information
- Consistent error format across framework
- Proper error propagation to agents

### 3. Transport Configuration
**Decision**: Simplified config interface that maps to SDK transports
- Hide SDK complexity from users
- Support all SDK transport types
- Easy migration path for existing configs

### 4. Backward Compatibility
**Decision**: Maintain old exports with deprecation warnings
- No breaking changes in current version
- Clear migration path documented
- Remove in next major version

## Quality Assurance

### Testing Strategy
- Unit tests for schema conversion
- Integration tests with mock MCP servers
- Compatibility tests with existing code
- Performance benchmarks vs custom implementation

### Documentation Requirements
- API documentation for new classes
- Migration guide from old to new implementation
- Examples using real MCP servers
- Troubleshooting guide

## Benefits of New Architecture

### 1. Reliability
- Use battle-tested SDK implementation
- Automatic protocol updates
- Reduced maintenance burden

### 2. Feature Parity
- Access to all SDK features
- Support for new MCP protocol versions
- Better error handling and diagnostics

### 3. Developer Experience
- Simpler configuration
- Better TypeScript support
- Consistent with MCP ecosystem

### 4. Maintainability
- Less custom code to maintain
- Focus on MiniAgent-specific value
- Easier debugging with SDK tools

## Migration Path for Users

### Immediate (Current Version)
```typescript
// Old way (still works, deprecated)
import { McpClient } from '@continue-reasoning/mini-agent/mcp';

// New way (recommended)
import { McpSdkClient } from '@continue-reasoning/mini-agent/mcp';
```

### Next Version (Breaking Changes)
- Remove deprecated exports
- Update all documentation
- Provide automated migration tools

## Risk Mitigation

### 1. Backward Compatibility Risks
- **Risk**: Breaking existing user code
- **Mitigation**: Maintain deprecated exports with warnings

### 2. Schema Conversion Risks
- **Risk**: Complex JSON Schemas not converting properly
- **Mitigation**: Comprehensive test suite, graceful fallbacks

### 3. Performance Risks
- **Risk**: SDK wrapper adds overhead
- **Mitigation**: Minimal wrapper design, performance testing

### 4. Feature Gap Risks
- **Risk**: SDK missing features from custom implementation
- **Mitigation**: Feature audit, contribute back to SDK if needed

## Success Metrics

1. **Zero Breaking Changes**: All existing code continues to work
2. **Feature Parity**: All custom implementation features available via SDK
3. **Performance**: No significant performance degradation
4. **Developer Experience**: Simpler API, better TypeScript support
5. **Reliability**: Reduced bug reports related to MCP connectivity

## Conclusion

This refactoring moves MiniAgent from a custom MCP implementation to properly leveraging the official SDK. The design prioritizes:

1. **Minimal Disruption**: Backward compatibility maintained
2. **Architectural Cleanliness**: Thin wrapper pattern
3. **Long-term Maintainability**: Delegate to official SDK
4. **Developer Experience**: Simpler, more reliable API

The implementation is already largely complete and provides a solid foundation for MCP integration going forward.