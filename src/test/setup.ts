/**
 * @fileoverview Test Setup
 * 
 * Global test setup file that runs before all tests.
 * This file sets up global mocks, test utilities, and environment configuration.
 */

import { vi } from 'vitest';

// Mock console methods to reduce noise in tests
const consoleMethods = ['log', 'warn', 'error', 'debug', 'info'] as const;

// Store original console methods
const originalConsole = {} as Record<typeof consoleMethods[number], any>;

// Set up global test environment
beforeAll(() => {
  // Store original console methods
  consoleMethods.forEach(method => {
    originalConsole[method] = console[method];
  });
  
  // Mock console methods in tests (can be overridden per test)
  consoleMethods.forEach(method => {
    console[method] = vi.fn();
  });
});

// Clean up after all tests
afterAll(() => {
  // Restore original console methods
  consoleMethods.forEach(method => {
    console[method] = originalConsole[method];
  });
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Global test utilities
export const testUtils = {
  /**
   * Create a mock function with type safety
   */
  createMockFn: <T extends (...args: any[]) => any>(implementation?: T) => {
    return implementation ? vi.fn(implementation) as T & ReturnType<typeof vi.fn> : vi.fn() as T & ReturnType<typeof vi.fn>;
  },
  
  /**
   * Wait for a specified number of milliseconds
   */
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  /**
   * Create a mock AbortSignal
   */
  createMockAbortSignal: (aborted = false) => ({
    aborted,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onabort: null,
    reason: undefined,
    throwIfAborted: vi.fn(),
  }),
  
  /**
   * Create a mock AbortController
   */
  createMockAbortController: () => {
    const signal = testUtils.createMockAbortSignal();
    return {
      signal,
      abort: vi.fn(() => {
        signal.aborted = true;
      }),
    };
  },
  
  /**
   * Generate a unique ID for tests
   */
  generateTestId: () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  
  /**
   * Create a mock timestamp
   */
  createMockTimestamp: () => Date.now(),
  
  /**
   * Restore console for specific tests
   */
  restoreConsole: () => {
    consoleMethods.forEach(method => {
      console[method] = originalConsole[method];
    });
  },
  
  /**
   * Mock console for specific tests
   */
  mockConsole: () => {
    consoleMethods.forEach(method => {
      console[method] = vi.fn();
    });
  },
};

// Make test utilities available globally
declare global {
  var testUtils: typeof import('./setup.js').testUtils;
}

// @ts-ignore
globalThis.testUtils = testUtils;