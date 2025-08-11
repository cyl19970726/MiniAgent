# Coordinator Execution Plan for TASK-XXX

## 🎯 Parallel Execution Strategy

### Quick Decision: Can We Parallelize?
```
Look at the modules/files to work on:
- If they import each other → Must be sequential
- If they're in different folders → Usually can parallelize  
- If they're independent features → Definitely parallelize
```

## 📊 Work Breakdown for Maximum Parallelization

### Identified Work Units
| Work Unit | Files/Modules | Dependencies | Can Start Immediately? |
|-----------|--------------|--------------|------------------------|
| Unit A: Test BaseAgent | src/baseAgent.ts | None | ✅ YES |
| Unit B: Test Tools | src/baseTool.ts | None | ✅ YES |
| Unit C: Test Providers | src/chat/*.ts | None | ✅ YES |
| Unit D: New Feature | src/newFeature.ts | None | ✅ YES |
| Unit E: Integration | All above | A,B,C,D | ❌ NO - Wait for others |

### Parallelization Opportunity Score: 4/5 units (80%)

## 🚀 Execution Phases

### PHASE 1: Maximum Parallel Burst
**Goal**: Start everything that has no dependencies AT THE SAME TIME

```markdown
I will now call multiple subagents in parallel to maximize efficiency:

- test-dev(id:1) for Unit A: Test BaseAgent
- test-dev(id:2) for Unit B: Test Tools  
- test-dev(id:3) for Unit C: Test Providers
- agent-dev(id:1) for Unit D: Implement new feature
```

**Why parallel?** These units don't depend on each other - they can all run simultaneously!

### PHASE 2: Dependent Work
**Goal**: Work that needs Phase 1 results

```markdown
After Phase 1 completes, I'll call:

- test-dev(id:4) for Unit E: Integration tests (needs all Phase 1 work)
- agent-dev(id:2) for connecting the components
```

### PHASE 3: Final Review
```markdown
- reviewer(id:1) to review all changes
```

## 📈 Efficiency Calculation

### Sequential Approach (DON'T DO THIS)
```
Unit A (1hr) → Unit B (1hr) → Unit C (1hr) → Unit D (1hr) → Unit E (1hr) → Review (0.5hr)
Total: 5.5 hours
```

### Parallel Approach (DO THIS!)
```
Phase 1: [A + B + C + D simultaneously] = 1 hour
Phase 2: [E] = 1 hour  
Phase 3: [Review] = 0.5 hour
Total: 2.5 hours
```

**Time Saved: 3 hours (55% faster!)**

## 🔑 Key Principles for Coordinator

### 1. Always Think in Parallel First
Ask: "What can run at the same time?"
- Different files? → Parallel
- Different features? → Parallel
- Different test suites? → Parallel

### 2. Use Multiple Instances of Same Agent Type
Don't do:
```
test-dev tests everything sequentially
```

Do:
```
test-dev(id:1) tests module A
test-dev(id:2) tests module B  
test-dev(id:3) tests module C
(All running simultaneously!)
```

### 3. Clear Phase Boundaries
- Phase N must complete before Phase N+1 starts
- But within a phase, EVERYTHING runs in parallel

## 🎮 Execution Commands for Coordinator

### How to call parallel agents:
```markdown
Phase 1 - I'll execute these in parallel for maximum efficiency:

@test-dev "Test the BaseAgent module"
@test-dev "Test the Tool system"  
@test-dev "Test the Chat providers"
@agent-dev "Implement the new feature"

(All 4 agents will work simultaneously)
```

### How NOT to call agents:
```markdown
❌ First I'll call test-dev to test everything
❌ Then I'll call agent-dev to implement
❌ Then I'll call another test-dev
```

## 📋 Parallel Execution Checklist

Before starting:
- [ ] Identified all independent work units
- [ ] Grouped dependent work into later phases
- [ ] Assigned separate agent instances for parallel work
- [ ] Calculated time savings

During execution:
- [ ] Called all Phase 1 agents in ONE message (parallel)
- [ ] Waited for ALL Phase 1 to complete
- [ ] Started Phase 2 only after Phase 1 done
- [ ] Maximized parallelization in each phase

## 🚨 When to Break Parallelization Rules

Only go sequential when:
1. Module B directly imports/extends Module A
2. Test results determine what to implement next
3. Architecture decisions block everything else

Even then, look for partial parallelization opportunities!