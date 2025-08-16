# TASK-006: Improved Agent Prompt Design for Library Integration

## Task Information
- **ID**: TASK-006
- **Name**: Better Agent Prompts for Library Integration
- **Category**: [PROCESS] [DOCUMENTATION] [QUALITY]
- **Created**: 2025-08-10
- **Status**: Planning

## Problem Statement
The current agent prompt design led to a complete reimplementation of the MCP protocol instead of using the official SDK. This indicates that our prompts for library integration tasks are insufficient and don't properly guide agents to:
1. Research and use existing libraries
2. Check for official SDKs before reimplementing
3. Verify implementation approaches against documentation
4. Follow the principle of not reinventing the wheel

## Root Cause Analysis
The agent (specifically mcp-dev):
- Did not search for or use the official `@modelcontextprotocol/sdk` package
- Created custom implementations of all MCP components
- Misunderstood the task as "implement MCP protocol" rather than "integrate MCP SDK"

## Objectives
- [ ] Design comprehensive prompt templates for library integration tasks
- [ ] Create verification checklist for agents before implementation
- [ ] Establish patterns for SDK discovery and usage
- [ ] Add explicit instructions about using existing libraries
- [ ] Create examples of good vs bad integration approaches
- [ ] Update agent-dev and tool-dev agent prompts

## Proposed Prompt Improvements

### 1. Pre-Implementation Checklist
Agents should be prompted to:
```
Before implementing any integration:
1. Search for official SDK/library: npm search, GitHub, documentation
2. Check package.json for existing dependencies
3. Read official documentation and examples
4. Verify if reimplementation is truly needed
5. Prefer thin adapter layers over full reimplementations
```

### 2. Library Integration Template
```
When integrating library [X]:
1. Install official package: npm install [package-name]
2. Import from official SDK: import { Client } from "[package]"
3. Create adapter layer to bridge to framework
4. Use SDK's native features and patterns
5. Don't reimplement what the SDK provides
```

### 3. Explicit Anti-Patterns
```
NEVER:
- Reimplement protocols that have official SDKs
- Create custom JSON-RPC clients when SDK exists
- Write transport layers if SDK provides them
- Duplicate SDK functionality
```

### 4. Integration Verification
```
After implementation, verify:
- Are you using the official SDK's classes?
- Is your code mostly adapters/bridges?
- Did you minimize custom protocol code?
- Are you following SDK's patterns?
```

## Implementation Strategy

### Phase 1: Prompt Template Creation
- Create standardized prompts for library integration
- Add SDK discovery instructions
- Include verification steps

### Phase 2: Agent Prompt Updates
- Update mcp-dev agent prompt
- Update tool-dev agent prompt  
- Update agent-dev for framework integrations
- Add library integration examples

### Phase 3: Testing and Validation
- Test with new integration tasks
- Verify agents use SDKs properly
- Measure reduction in reimplementation

## Success Criteria
- Agents consistently use official SDKs when available
- No unnecessary protocol reimplementations
- Clear adapter/bridge pattern usage
- Proper dependency management
- Documentation references in implementations

## Lessons Learned
This task emerged from TASK-004 where the MCP integration was completely reimplemented instead of using `@modelcontextprotocol/sdk`. This highlights the critical importance of clear, explicit prompts about using existing libraries.

## Example Prompt Enhancement

### Before (Current):
```
Implement MCP (Model Context Protocol) support
```

### After (Improved):
```
Integrate MCP using the official @modelcontextprotocol/sdk:
1. Install: npm install @modelcontextprotocol/sdk
2. Use SDK's Client class: import { Client } from "@modelcontextprotocol/sdk/client/index.js"
3. Use SDK's transports: StdioClientTransport, etc.
4. Create thin adapter to bridge SDK tools to BaseTool
5. DO NOT reimplement the protocol - use the SDK
```

## Timeline
- Start: 2025-08-10
- Target: Complete prompt improvements within 1-2 hours