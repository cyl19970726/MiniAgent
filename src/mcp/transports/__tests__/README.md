# MCP Transport Tests

This directory contains comprehensive test suites for MCP transports, including unit tests, integration tests, and supporting infrastructure.

## Quick Start

### Run Basic Tests (Currently Working)
```bash
# Run all basic transport tests  
npm test -- src/mcp/transports/__tests__/TransportBasics.test.ts

# Run with coverage
npm run test:coverage -- src/mcp/transports/__tests__/TransportBasics.test.ts
```

### Test Status

| Test Suite | Status | Tests | Description |
|------------|---------|-------|-------------|
| `TransportBasics.test.ts` | ✅ Passing | 30 | Interface compliance, configuration validation |
| `StdioTransport.test.ts` | 🔄 Implemented | 57 | Comprehensive STDIO transport testing |
| `HttpTransport.test.ts` | 🔄 Implemented | 90+ | Comprehensive HTTP transport testing |

## Test Architecture

### Test Files

- **`TransportBasics.test.ts`** - Basic functionality and interface compliance tests
- **`StdioTransport.test.ts`** - Comprehensive STDIO transport test suite  
- **`HttpTransport.test.ts`** - Comprehensive HTTP transport test suite

### Supporting Infrastructure  

- **`mocks/MockMcpServer.ts`** - Mock MCP server implementations
- **`utils/TestUtils.ts`** - Test utilities and helpers
- **`utils/index.ts`** - Consolidated exports

## Test Categories

### 1. Basic Transport Tests ✅
**File:** `TransportBasics.test.ts`
**Status:** All 30 tests passing

**Coverage:**
- Transport instantiation and configuration
- Interface method existence and types
- Configuration validation and updates
- Session management (HTTP)
- Reconnection settings (STDIO)
- Authentication configuration support
- Message format validation

### 2. Comprehensive STDIO Tests 🔄  
**File:** `StdioTransport.test.ts`
**Status:** Implemented, needs mock fixes

**Test Areas:**
- Connection lifecycle (connect/disconnect/reconnect)
- Process management and child process handling
- Message sending and receiving via stdin/stdout
- Error handling (process crashes, communication failures)
- Reconnection logic with exponential backoff
- Message buffering during disconnection
- Resource cleanup and memory management
- Edge cases and boundary conditions

### 3. Comprehensive HTTP Tests 🔄
**File:** `HttpTransport.test.ts`  
**Status:** Implemented, needs mock fixes

**Test Areas:**
- SSE connection establishment and management
- HTTP POST message sending
- Authentication (Bearer, Basic, OAuth2)
- Session persistence and resumption
- Connection state transitions
- Message buffering and retry logic
- Custom SSE event handling
- Error scenarios and recovery
- Performance and stress testing

## Mock Infrastructure

### MockMcpServer
Provides realistic MCP server behavior for testing without external dependencies:

```typescript
import { MockStdioMcpServer, MockHttpMcpServer } from './mocks/MockMcpServer.js';

// Create STDIO mock server
const stdioServer = new MockStdioMcpServer({
  name: 'test-server',
  tools: [/* ... */],
  simulateErrors: false
});

// Create HTTP mock server  
const httpServer = new MockHttpMcpServer({
  name: 'test-server',
  responseDelay: 100
});
```

### Test Utilities
Comprehensive testing helpers for async operations and assertions:

```typescript
import { 
  TransportTestUtils, 
  McpTestDataFactory, 
  TransportAssertions 
} from './utils/index.js';

// Wait for condition
await TransportTestUtils.waitFor(() => transport.isConnected());

// Create test data
const request = McpTestDataFactory.createRequest();
const config = McpTestDataFactory.createStdioConfig();

// Validate messages
TransportAssertions.assertValidRequest(message);
```

## Running Tests

### Individual Test Suites
```bash
# Basic tests (working)
npm test -- src/mcp/transports/__tests__/TransportBasics.test.ts

# STDIO tests (needs mock fixes)
npm test -- src/mcp/transports/__tests__/StdioTransport.test.ts

# HTTP tests (needs mock fixes)  
npm test -- src/mcp/transports/__tests__/HttpTransport.test.ts
```

### All Transport Tests
```bash
# Run all tests
npm test -- src/mcp/transports/__tests__/

# With coverage
npm run test:coverage -- src/mcp/transports/__tests__/

# Watch mode
npm test -- src/mcp/transports/__tests__/ --watch
```

### Test Filtering
```bash
# Run specific test categories
npm test -- src/mcp/transports/__tests__/ --grep "Connection Lifecycle"
npm test -- src/mcp/transports/__tests__/ --grep "Authentication"
npm test -- src/mcp/transports/__tests__/ --grep "Error Handling"

# Run tests by transport type
npm test -- src/mcp/transports/__tests__/ --grep "StdioTransport"
npm test -- src/mcp/transports/__tests__/ --grep "HttpTransport"
```

## Current Coverage

```
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
HttpTransport.ts   |   45.69 |     70.0 |   46.66 |   45.69 |
StdioTransport.ts  |   41.88 |    61.11 |   45.45 |   41.88 |
```

**Note:** Current coverage is from basic tests only. Full comprehensive test execution will significantly improve coverage once mocking issues are resolved.

## Known Issues

### Mock Setup Issues
The comprehensive test suites for STDIO and HTTP transports are fully implemented but currently have mocking setup issues with Vitest. The basic tests work perfectly and validate core functionality.

**Issue:** Vitest module mocking for `child_process` and global `EventSource`
**Status:** Implementation complete, mocking configuration needs refinement

### Next Steps
1. Fix Vitest mocking configuration for Node.js modules
2. Enable full execution of comprehensive test suites
3. Achieve 80%+ code coverage target
4. Add performance and stress testing

## Test Development

### Adding New Tests
1. Follow existing patterns in `TransportBasics.test.ts`
2. Use provided utilities from `utils/TestUtils.ts`  
3. Leverage mock servers from `mocks/MockMcpServer.ts`
4. Ensure proper cleanup in `afterEach` hooks

### Mock Development
1. Extend `BaseMockMcpServer` for new server types
2. Add new utilities to `TestUtils.ts` as needed
3. Follow existing patterns for event simulation
4. Ensure proper resource cleanup

### Best Practices
- Use `describe` blocks to organize related tests
- Always clean up resources in `afterEach`
- Use realistic test data from `McpTestDataFactory`
- Test both success and failure scenarios
- Include edge cases and boundary conditions

## Contributing

When adding new transport tests:

1. **Follow the Pattern:** Use existing test structure and naming
2. **Use Utilities:** Leverage provided test utilities and mocks
3. **Document Thoroughly:** Add clear descriptions and comments
4. **Test Comprehensively:** Include success, failure, and edge cases
5. **Clean Up:** Always clean up resources and connections

## Questions?

For questions about transport testing:
1. Review existing test patterns in `TransportBasics.test.ts`
2. Check utility functions in `utils/TestUtils.ts`
3. Examine mock implementations in `mocks/MockMcpServer.ts`
4. Refer to MiniAgent's main test patterns in `src/test/`