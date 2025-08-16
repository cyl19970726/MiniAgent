# Subtask for [Agent-Name]-[ID]

## Task Context
- **Parent Task**: TASK-XXX - [Brief description]
- **Your Role**: [What part you play in the overall solution]
- **Execution Phase**: Phase [1/2/3]

## Your Specific Assignment

### Scope of Work
**You are responsible for these specific files/modules:**
```
src/specific/module1.ts   - [What to do with it]
src/specific/module2.ts   - [What to do with it]
tests/module1.test.ts     - [Create/update tests]
```

### Detailed Technical Approach

#### Step 1: [First thing to do]
```typescript
// Example code or pseudocode showing the approach
interface YourInterface {
  // Specific implementation details
}
```
- Why: [Rationale for this approach]
- How: [Specific implementation steps]

#### Step 2: [Second thing to do]
```typescript
// Specific code patterns to follow
class YourImplementation {
  // Details of what to implement
}
```
- Why: [Rationale]
- How: [Steps]

#### Step 3: [Testing approach]
```typescript
// Test structure to follow
describe('YourModule', () => {
  // Specific test cases needed
})
```

### Design Decisions Already Made
These decisions have been made at the architecture level - follow them:
1. Use pattern X for [reason]
2. Implement interface Y because [reason]
3. Follow existing convention Z

### Your Specific Objectives
- [ ] Implement [specific feature/function]
- [ ] Create unit tests with 90% coverage
- [ ] Ensure TypeScript types are complete
- [ ] Update any affected documentation
- [ ] Ensure no breaking changes

## Implementation Details

### Required Interfaces/Types
```typescript
// Exact interfaces you need to implement
export interface RequiredInterface {
  method1(): Promise<Result>;
  method2(param: Type): void;
}
```

### Required Functions
```typescript
// Functions you must implement
export async function yourFunction(param: ParamType): Promise<ReturnType> {
  // Implementation approach
  // 1. Validate input
  // 2. Process data
  // 3. Return result
}
```

### Error Handling
Handle these specific error cases:
- Case 1: [How to handle]
- Case 2: [How to handle]
- Case 3: [How to handle]

### Performance Requirements
- Max execution time: X ms
- Memory constraints: Y MB
- Optimization priorities: [List]

## Dependencies and Constraints

### External Dependencies
- You can use these libraries: [list]
- You cannot introduce new dependencies

### Interface Contracts
Your module must expose these exact interfaces:
```typescript
export {
  YourInterface,
  YourImplementation,
  yourFunction
}
```

### Compatibility Requirements
- Must work with Node.js 18+
- Must support TypeScript 5.0+
- Must follow existing code style

## Testing Requirements

### Unit Tests Required
```typescript
// Specific test cases you must cover
- Test normal operation
- Test edge case 1
- Test edge case 2
- Test error handling
- Test performance
```

### Coverage Targets
- Line coverage: 90%
- Branch coverage: 85%
- Function coverage: 100%

## Deliverables

### Code Deliverables
1. Implementation in specified files
2. Complete unit tests
3. TypeScript definitions
4. JSDoc comments for public APIs

### Report Deliverable
Create report at: `/agent-context/active-tasks/TASK-XXX/reports/report-[agent-name]-[id].md`

Include in your report:
- Summary of implementation
- List of files changed
- Test results and coverage
- Any issues or blockers
- Recommendations if any

## Success Criteria
Your subtask is complete when:
- [ ] All code implemented according to spec
- [ ] All tests passing
- [ ] Coverage targets met
- [ ] No TypeScript errors
- [ ] No lint warnings
- [ ] Report submitted

## Do NOT Do
- Do not modify files outside your scope
- Do not change existing interfaces (only extend)
- Do not add new dependencies
- Do not refactor unrelated code
- Do not worry about other agents' work

## Timeline
- Start: Immediately
- Expected Duration: X hours
- Must complete before: Phase [next] starts

---
*This subtask is self-contained. You have all information needed to complete it. Focus only on your specific assignment.*