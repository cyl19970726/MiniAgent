# TASK-010: SubAgent System Implementation - Coordinator Plan

## Execution Strategy

This plan orchestrates the implementation of the SubAgent system for MiniAgent framework through parallel execution of specialized subagents. The implementation follows the simplified architecture design in `architecture.md` and must meet all acceptance criteria defined in `test-detail.md`.

## Phase Overview

### Phase 1: Core Implementation (Parallel - 4 subagents)
**Goal**: Build the foundational components of the SubAgent system
- **Duration**: All tasks execute simultaneously
- **Dependencies**: None - can start immediately
- **Subagents**: agent-dev (2 tasks), tool-dev (1 task), system-architect (1 task)

### Phase 2: Integration & Testing (Parallel - 3 subagents)  
**Goal**: Integrate SubAgent system with existing framework and create tests
- **Duration**: Starts after Phase 1 completion
- **Dependencies**: Requires Phase 1 components
- **Subagents**: agent-dev (1 task), test-dev (2 tasks)

### Phase 3: Examples & Documentation (Parallel - 2 subagents)
**Goal**: Create comprehensive examples and validate the system
- **Duration**: Starts after Phase 2 completion
- **Dependencies**: Requires integrated system from Phase 2
- **Subagents**: tool-dev (1 task), reviewer (1 task)

## Phase 1: Core Implementation (Parallel Execution)

### 1.1 SubAgent Interfaces & Registry [agent-dev-1]
**Subagent**: agent-dev
**Scope**: Define core interfaces and implement SubAgentRegistry
**Files to create/modify**:
- Update `src/interfaces.ts` with SubAgentTask, SubAgentResult, SubAgentConfig
- Create `src/subagent/registry.ts` with SubAgentRegistry class
- Create `src/subagent/index.ts` for exports

**Key Requirements**:
- SubAgentTask with name and description fields
- SubAgentResult with result, success, and error fields
- SubAgentConfig with name, description, systemPrompt, tools, whenToUse
- Registry methods: register, getConfig, listSubAgents, generateSystemPromptSnippet

### 1.2 Task Tool Implementation [tool-dev-1]
**Subagent**: tool-dev
**Scope**: Implement the Task tool following BaseTool pattern
**Files to create**:
- Create `src/subagent/taskTool.ts` with TaskTool class

**Key Requirements**:
- Extend BaseTool with proper type parameters
- Dynamic schema generation based on registered subagents
- Execute method creates temporary agent instances
- Proper cleanup after task completion
- Tool inheritance logic (all parent tools except Task)
- Support for abort signals and output updates

### 1.3 BaseAgent ProcessOneTurn Method [agent-dev-2]
**Subagent**: agent-dev
**Scope**: Add processOneTurn method to BaseAgent for subagent isolation
**Files to modify**:
- Update `src/baseAgent.ts` with processOneTurn method

**Key Requirements**:
- Method processes a single turn without history management
- Takes sessionId, messages, and signal parameters
- Returns async generator of AgentEvents
- Enables stateless subagent execution
- Maintains compatibility with existing process method

### 1.4 Architecture Validation [system-architect-1]
**Subagent**: system-architect  
**Scope**: Validate core implementation against architecture
**Files to review**:
- All Phase 1 created files
- Validate against `architecture.md` requirements

**Key Requirements**:
- Ensure stateless design principles
- Verify tool unification approach
- Confirm event stream flexibility
- Validate subagent isolation rules

## Phase 2: Integration & Testing (Sequential within phase)

### 2.1 Agent Integration [agent-dev-3]
**Subagent**: agent-dev
**Scope**: Integrate SubAgent system with BaseAgent and StandardAgent
**Files to modify**:
- Update `src/baseAgent.ts` constructor to accept optional registry
- Update `src/standardAgent.ts` to auto-register Task tool
- Update system prompt generation

**Key Requirements**:
- Optional registry parameter in constructors
- Auto-registration of Task tool when registry provided
- System prompt includes available subagents
- Backward compatibility maintained

### 2.2 Unit Tests [test-dev-1]
**Subagent**: test-dev
**Scope**: Create comprehensive unit tests
**Files to create**:
- Create `src/subagent/__tests__/registry.test.ts`
- Create `src/subagent/__tests__/taskTool.test.ts`

**Key Requirements**:
- All 7 SubAgentRegistry test cases from test-detail.md
- All 10 TaskTool test cases from test-detail.md
- Mock implementations for testing
- 80% coverage minimum

### 2.3 Integration Tests [test-dev-2]
**Subagent**: test-dev
**Scope**: Create integration tests
**Files to create**:
- Create `src/subagent/__tests__/integration.test.ts`

**Key Requirements**:
- BaseAgent integration tests (4 cases)
- StandardAgent integration tests (4 cases)
- Tool Scheduler integration tests (4 cases)
- Parallel execution validation
- Memory leak detection

## Phase 3: Examples & Validation (Parallel Execution)

### 3.1 SubAgent Example [tool-dev-2]
**Subagent**: tool-dev
**Scope**: Create comprehensive real-world example
**Files to create**:
- Create `examples/subagentExample.ts`

**Key Requirements**:
- Complete implementation from test-detail.md Section 3.2
- Multiple subagent configurations (code-analyzer, test-writer, doc-writer, debugger)
- Shell tool implementation for subagents
- Temporary directory management
- Real LLM calls (no mocks)
- Progress tracking and result verification

### 3.2 Final Review & Validation [reviewer-1]
**Subagent**: reviewer
**Scope**: Comprehensive review and acceptance validation
**Files to review**:
- All created/modified files
- Test execution results
- Example execution results

**Key Requirements**:
- Verify all acceptance criteria from test-detail.md Section 9
- Validate performance metrics (< 100ms overhead, < 10MB memory)
- Ensure 80% test coverage
- Confirm backward compatibility
- Check documentation completeness

## Dependency Graph

```
Phase 1 (Parallel)
├── 1.1 SubAgent Interfaces [agent-dev-1]
├── 1.2 Task Tool [tool-dev-1]
├── 1.3 ProcessOneTurn [agent-dev-2]
└── 1.4 Architecture Review [system-architect-1]
    ↓
Phase 2 (Sequential within phase)
├── 2.1 Agent Integration [agent-dev-3] 
│   ↓
├── 2.2 Unit Tests [test-dev-1]
│   ↓
└── 2.3 Integration Tests [test-dev-2]
    ↓
Phase 3 (Parallel)
├── 3.1 SubAgent Example [tool-dev-2]
└── 3.2 Final Review [reviewer-1]
```

## Success Metrics

Each phase must meet these criteria before proceeding:

### Phase 1 Success Criteria
- ✅ All interfaces defined in `src/interfaces.ts`
- ✅ SubAgentRegistry fully implemented
- ✅ TaskTool fully implemented
- ✅ ProcessOneTurn method added to BaseAgent
- ✅ Architecture validation passed

### Phase 2 Success Criteria
- ✅ BaseAgent and StandardAgent support registry
- ✅ Task tool auto-registered when registry provided
- ✅ All unit tests passing (17 test cases)
- ✅ All integration tests passing (12 test cases)
- ✅ No breaking changes to existing tests

### Phase 3 Success Criteria
- ✅ SubAgent example runs successfully
- ✅ Performance metrics met (< 100ms, < 10MB)
- ✅ Test coverage ≥ 80%
- ✅ All acceptance criteria verified
- ✅ Documentation complete

## Risk Mitigation

### Parallel Execution Risks
- **Risk**: Conflicting file modifications
- **Mitigation**: Each subagent works on separate files in Phase 1

### Integration Risks
- **Risk**: Breaking existing functionality
- **Mitigation**: Sequential execution in Phase 2, comprehensive backward compatibility tests

### Performance Risks
- **Risk**: Subagent overhead too high
- **Mitigation**: Early performance validation in Phase 2 tests

## Execution Timeline

**Estimated Total Duration**: 4-6 hours

- **Phase 1**: 1-2 hours (parallel execution)
- **Phase 2**: 2-3 hours (sequential but focused)
- **Phase 3**: 1 hour (parallel validation)

## Notes for Subagents

1. **Use the architecture.md as your primary reference** - it contains the complete technical design
2. **Follow existing patterns** - look at similar implementations in the codebase
3. **Maintain backward compatibility** - no breaking changes to existing APIs
4. **Write clean, documented code** - include JSDoc comments for public APIs
5. **Test your implementation** - ensure it works before marking complete
6. **Report issues immediately** - if blocked, document the issue clearly

## Completion Checklist

- [ ] Phase 1: All 4 core components implemented
- [ ] Phase 2: Integration complete, all tests passing
- [ ] Phase 3: Example working, review approved
- [ ] All test suites from test-detail.md passing
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] No breaking changes
- [ ] Summary.md created with outcomes