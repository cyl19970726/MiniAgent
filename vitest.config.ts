/**
 * @fileoverview Vitest Configuration
 * 
 * Configuration for testing the Agent framework using Vitest.
 * This setup ensures proper TypeScript support, test isolation,
 * and coverage reporting.
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Test file patterns
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
    ],
    
    // Files to exclude
    exclude: [
      'node_modules/**',
      'dist/**',
      'examples/**',
    ],
    
    // Test timeout
    testTimeout: 10000,
    
    // Setup files
    setupFiles: ['./src/test/setup.ts'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'examples/**',
        'src/test/**',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    
    // Global test settings
    globals: true,
    
    // Reporters
    reporter: ['verbose', 'json'],
    
    // Parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
  
  // TypeScript configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  
  // ESM support
  esbuild: {
    target: 'node18',
  },
});