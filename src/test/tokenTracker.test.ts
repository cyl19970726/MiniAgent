/**
 * @fileoverview TokenTracker Tests
 * 
 * Comprehensive test suite for the TokenTracker implementation.
 * Tests cover token usage tracking, limit warnings, calculations,
 * reset functionality, and usage analytics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenTracker } from '../tokenTracker.js';
import { ITokenUsage } from '../interfaces.js';

describe('TokenTracker', () => {
  let tokenTracker: TokenTracker;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tokenTracker = new TokenTracker('gemini-pro', 1000000);
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Constructor', () => {
    it('should initialize with correct parameters', () => {
      const usage = tokenTracker.getUsage();
      
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.cumulativeTokens).toBe(0);
      expect(usage.tokenLimit).toBe(1000000);
      expect(usage.usagePercentage).toBe(0);
    });

    it('should initialize with initial usage', () => {
      const initialUsage: Partial<ITokenUsage> = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cumulativeTokens: 150,
      };

      const tracker = new TokenTracker('gemini-flash', 500000, initialUsage);
      const usage = tracker.getUsage();

      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
      expect(usage.cumulativeTokens).toBe(150);
      expect(usage.tokenLimit).toBe(500000);
      expect(usage.usagePercentage).toBeCloseTo(0.03, 4); // 150/500000 * 100
    });

    it('should handle undefined initial usage values', () => {
      const initialUsage: Partial<ITokenUsage> = {
        inputTokens: 100,
        // outputTokens undefined
        totalTokens: 150,
        // cumulativeTokens undefined
      };

      const tracker = new TokenTracker('gemini-pro', 1000000, initialUsage);
      const usage = tracker.getUsage();

      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(150);
      expect(usage.cumulativeTokens).toBe(0);
    });
  });

  describe('Token Usage Updates', () => {
    it('should update usage correctly', () => {
      tokenTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      
      const usage = tokenTracker.getUsage();
      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
      expect(usage.cumulativeTokens).toBe(150);
      expect(usage.usagePercentage).toBeCloseTo(0.015, 4); // 150/1000000 * 100
    });

    it('should accumulate multiple updates', () => {
      tokenTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      tokenTracker.updateUsage({ inputTokens: 200, outputTokens: 100 });
      tokenTracker.updateUsage({ inputTokens: 150, outputTokens: 75 });
      
      const usage = tokenTracker.getUsage();
      expect(usage.inputTokens).toBe(450);
      expect(usage.outputTokens).toBe(225);
      expect(usage.totalTokens).toBe(675);
      expect(usage.cumulativeTokens).toBe(675);
      expect(usage.usagePercentage).toBeCloseTo(0.0675, 4); // 675/1000000 * 100
    });

    it('should handle zero token updates', () => {
      tokenTracker.updateUsage({ inputTokens: 0, outputTokens: 0 });
      
      const usage = tokenTracker.getUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.cumulativeTokens).toBe(0);
      expect(usage.usagePercentage).toBe(0);
    });

    it('should reject negative token values', () => {
      tokenTracker.updateUsage({ inputTokens: -50, outputTokens: 100 });
      
      const usage = tokenTracker.getUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.cumulativeTokens).toBe(0);
      
      expect(consoleSpy).toHaveBeenCalledWith('TokenTracker: Negative token usage detected, ignoring update');
    });

    it('should reject negative output tokens', () => {
      tokenTracker.updateUsage({ inputTokens: 100, outputTokens: -50 });
      
      const usage = tokenTracker.getUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.cumulativeTokens).toBe(0);
      
      expect(consoleSpy).toHaveBeenCalledWith('TokenTracker: Negative token usage detected, ignoring update');
    });
  });

  describe('Usage Retrieval', () => {
    it('should return deep copy of usage', () => {
      tokenTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      
      const usage1 = tokenTracker.getUsage();
      const usage2 = tokenTracker.getUsage();
      
      expect(usage1).toEqual(usage2);
      expect(usage1).not.toBe(usage2); // Different references
      
      // Modifying one should not affect the other
      usage1.inputTokens = 999;
      expect(tokenTracker.getUsage().inputTokens).toBe(100);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all usage counters', () => {
      tokenTracker.updateUsage({ inputTokens: 500, outputTokens: 300 });
      
      // Verify usage before reset
      let usage = tokenTracker.getUsage();
      expect(usage.totalTokens).toBe(800);
      expect(usage.cumulativeTokens).toBe(800);
      
      tokenTracker.reset();
      
      // Verify usage after reset
      usage = tokenTracker.getUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.cumulativeTokens).toBe(0);
      expect(usage.tokenLimit).toBe(1000000); // Should preserve limit
      expect(usage.usagePercentage).toBe(0);
    });

    it('should allow usage after reset', () => {
      tokenTracker.updateUsage({ inputTokens: 500, outputTokens: 300 });
      tokenTracker.reset();
      tokenTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      
      const usage = tokenTracker.getUsage();
      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
      expect(usage.cumulativeTokens).toBe(150);
    });
  });

  describe('Limit Warnings', () => {
    it('should detect approaching limit with default threshold', () => {
      // Set usage to 80% of limit (default threshold)
      const eightyPercent = Math.floor(1000000 * 0.8);
      tokenTracker.updateUsage({ inputTokens: eightyPercent, outputTokens: 0 });
      
      expect(tokenTracker.isApproachingLimit()).toBe(true);
    });

    it('should detect approaching limit with custom threshold', () => {
      // Set usage to 50% of limit
      const fiftyPercent = Math.floor(1000000 * 0.5);
      tokenTracker.updateUsage({ inputTokens: fiftyPercent, outputTokens: 0 });
      
      expect(tokenTracker.isApproachingLimit(0.5)).toBe(true);
      expect(tokenTracker.isApproachingLimit(0.6)).toBe(false);
    });

    it('should not trigger warning below threshold', () => {
      // Set usage to 70% of limit
      const seventyPercent = Math.floor(1000000 * 0.7);
      tokenTracker.updateUsage({ inputTokens: seventyPercent, outputTokens: 0 });
      
      expect(tokenTracker.isApproachingLimit()).toBe(false); // Default is 80%
      expect(tokenTracker.isApproachingLimit(0.8)).toBe(false);
      expect(tokenTracker.isApproachingLimit(0.7)).toBe(true);
    });

    it('should handle invalid threshold values', () => {
      tokenTracker.updateUsage({ inputTokens: 900000, outputTokens: 0 }); // 90%
      
      expect(tokenTracker.isApproachingLimit(-0.1)).toBe(false);
      expect(tokenTracker.isApproachingLimit(1.5)).toBe(false);
      
      expect(consoleSpy).toHaveBeenCalledWith('TokenTracker: Invalid threshold, should be between 0 and 1');
    });

    it('should log warning at 90% usage', () => {
      const ninetyPercent = Math.floor(1000000 * 0.9);
      tokenTracker.updateUsage({ inputTokens: ninetyPercent, outputTokens: 0 });
      
      expect(consoleSpy).toHaveBeenCalledWith('TokenTracker: 90% of token limit reached for gemini-pro');
    });

    it('should only log warning once per 90% threshold', () => {
      const ninetyPercent = Math.floor(1000000 * 0.9);
      
      // First update to 90%
      tokenTracker.updateUsage({ inputTokens: ninetyPercent, outputTokens: 0 });
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      
      // Additional updates shouldn't trigger more warnings
      tokenTracker.updateUsage({ inputTokens: 1000, outputTokens: 0 });
      tokenTracker.updateUsage({ inputTokens: 1000, outputTokens: 0 });
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Usage Summary', () => {
    it('should provide formatted usage summary', () => {
      tokenTracker.updateUsage({ inputTokens: 150000, outputTokens: 50000 });
      
      const summary = tokenTracker.getUsageSummary();
      
      expect(summary).toContain('Token Usage Summary for gemini-pro:');
      expect(summary).toContain('Input: 150,000 tokens');
      expect(summary).toContain('Output: 50,000 tokens');
      expect(summary).toContain('Total: 200,000 tokens');
      expect(summary).toContain('Cumulative: 200,000 tokens');
      expect(summary).toContain('Limit: 1,000,000 tokens');
      expect(summary).toContain('Usage: 20.0%');
      expect(summary).toContain('Output Efficiency: 25.0%'); // 50000/200000 * 100
    });

    it('should handle zero usage in summary', () => {
      const summary = tokenTracker.getUsageSummary();
      
      expect(summary).toContain('Token Usage Summary for gemini-pro:');
      expect(summary).toContain('Input: 0 tokens');
      expect(summary).toContain('Output: 0 tokens');
      expect(summary).toContain('Total: 0 tokens');
      expect(summary).toContain('Cumulative: 0 tokens');
      expect(summary).toContain('Usage: 0.0%');
      expect(summary).toContain('Output Efficiency: 0.0%');
    });
  });

  describe('Detailed Usage Analytics', () => {
    it('should provide detailed usage breakdown', () => {
      tokenTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      tokenTracker.updateUsage({ inputTokens: 200, outputTokens: 100 });
      
      const detailed = tokenTracker.getDetailedUsage();
      
      // Basic usage
      expect(detailed.basic.inputTokens).toBe(300);
      expect(detailed.basic.outputTokens).toBe(150);
      expect(detailed.basic.totalTokens).toBe(450);
      
      // Efficiency metrics
      expect(detailed.efficiency.outputRatio).toBeCloseTo(150 / 450, 3);
      expect(detailed.efficiency.averageInputPerRequest).toBeGreaterThan(0);
      expect(detailed.efficiency.averageOutputPerRequest).toBeGreaterThan(0);
      
      // Limit warnings
      expect(detailed.limits.isApproachingWarning).toBe(false);
      expect(detailed.limits.isApproachingDanger).toBe(false);
      expect(detailed.limits.remainingTokens).toBe(1000000 - 450);
      expect(detailed.limits.estimatedRequestsRemaining).toBeGreaterThan(0);
    });

    it('should detect warning and danger states', () => {
      // Set to 85% (warning)
      const warningAmount = Math.floor(1000000 * 0.85);
      tokenTracker.updateUsage({ inputTokens: warningAmount, outputTokens: 0 });
      
      let detailed = tokenTracker.getDetailedUsage();
      expect(detailed.limits.isApproachingWarning).toBe(true);
      expect(detailed.limits.isApproachingDanger).toBe(false);
      
      // Set to 96% (danger)
      tokenTracker.reset();
      const dangerAmount = Math.floor(1000000 * 0.96);
      tokenTracker.updateUsage({ inputTokens: dangerAmount, outputTokens: 0 });
      
      detailed = tokenTracker.getDetailedUsage();
      expect(detailed.limits.isApproachingWarning).toBe(true);
      expect(detailed.limits.isApproachingDanger).toBe(true);
    });

    it('should handle zero usage in detailed analytics', () => {
      const detailed = tokenTracker.getDetailedUsage();
      
      expect(detailed.efficiency.outputRatio).toBe(0);
      expect(detailed.limits.remainingTokens).toBe(1000000);
      expect(detailed.limits.estimatedRequestsRemaining).toBeGreaterThan(0);
    });
  });

  describe('Usage Data Export', () => {
    it('should export complete usage data', () => {
      tokenTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      
      const exportedData = tokenTracker.exportUsageData();
      
      expect(exportedData.modelName).toBe('gemini-pro');
      expect(exportedData.tokenLimit).toBe(1000000);
      expect(exportedData.usage.inputTokens).toBe(100);
      expect(exportedData.usage.outputTokens).toBe(50);
      expect(exportedData.usage.totalTokens).toBe(150);
      expect(exportedData.timestamp).toBeGreaterThan(0);
      expect(typeof exportedData.timestamp).toBe('number');
    });

    it('should provide independent copy of usage data', () => {
      tokenTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      
      const exportedData = tokenTracker.exportUsageData();
      
      // Modify tracker after export
      tokenTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      
      // Exported data should be unchanged
      expect(exportedData.usage.inputTokens).toBe(100);
      expect(exportedData.usage.outputTokens).toBe(50);
      expect(exportedData.usage.totalTokens).toBe(150);
    });
  });

  describe('Percentage Calculations', () => {
    it('should calculate percentages correctly', () => {
      // Test various percentage levels
      const testCases = [
        { tokens: 100000, expectedPercentage: 10.0 },
        { tokens: 500000, expectedPercentage: 50.0 },
        { tokens: 999999, expectedPercentage: 99.9999 },
        { tokens: 1000000, expectedPercentage: 100.0 },
        { tokens: 1100000, expectedPercentage: 100.0 }, // Capped at 100%
      ];

      testCases.forEach(({ tokens, expectedPercentage }) => {
        tokenTracker.reset();
        tokenTracker.updateUsage({ inputTokens: tokens, outputTokens: 0 });
        
        const usage = tokenTracker.getUsage();
        if (expectedPercentage === 100.0) {
          expect(usage.usagePercentage).toBe(100.0);
        } else {
          expect(usage.usagePercentage).toBeCloseTo(expectedPercentage, 4);
        }
      });
    });

    it('should handle zero token limit', () => {
      const zeroLimitTracker = new TokenTracker('test-model', 0);
      zeroLimitTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      
      const usage = zeroLimitTracker.getUsage();
      expect(usage.usagePercentage).toBe(0);
    });

    it('should handle negative token limit', () => {
      const negativeLimitTracker = new TokenTracker('test-model', -1000);
      negativeLimitTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      
      const usage = negativeLimitTracker.getUsage();
      expect(usage.usagePercentage).toBe(0);
    });
  });

  describe('Model Name Tracking', () => {
    it('should preserve model name in summaries and exports', () => {
      const customTracker = new TokenTracker('custom-model-name', 500000);
      customTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      
      const summary = customTracker.getUsageSummary();
      expect(summary).toContain('Token Usage Summary for custom-model-name:');
      
      const exportedData = customTracker.exportUsageData();
      expect(exportedData.modelName).toBe('custom-model-name');
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely large token values', () => {
      const largeTracker = new TokenTracker('large-model', Number.MAX_SAFE_INTEGER);
      const largeTokens = Math.floor(Number.MAX_SAFE_INTEGER / 2);
      
      largeTracker.updateUsage({ inputTokens: largeTokens, outputTokens: 0 });
      
      const usage = largeTracker.getUsage();
      expect(usage.inputTokens).toBe(largeTokens);
      expect(usage.totalTokens).toBe(largeTokens);
      expect(usage.usagePercentage).toBeCloseTo(50.0, 1);
    });

    it('should handle fractional percentages correctly', () => {
      const precisionTracker = new TokenTracker('precision-model', 1000000);
      precisionTracker.updateUsage({ inputTokens: 1, outputTokens: 0 });
      
      const usage = precisionTracker.getUsage();
      expect(usage.usagePercentage).toBeCloseTo(0.0001, 4); // 1/1000000 * 100
    });

    it('should maintain consistency after multiple operations', () => {
      // Perform multiple operations and verify consistency
      tokenTracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
      const usage1 = tokenTracker.getUsage();
      
      tokenTracker.updateUsage({ inputTokens: 200, outputTokens: 100 });
      const usage2 = tokenTracker.getUsage();
      
      // Verify accumulation
      expect(usage2.inputTokens).toBe(usage1.inputTokens + 200);
      expect(usage2.outputTokens).toBe(usage1.outputTokens + 100);
      expect(usage2.totalTokens).toBe(usage1.totalTokens + 300);
      expect(usage2.cumulativeTokens).toBe(usage1.cumulativeTokens + 300);
      
      // Reset and verify
      tokenTracker.reset();
      const usage3 = tokenTracker.getUsage();
      
      expect(usage3.inputTokens).toBe(0);
      expect(usage3.outputTokens).toBe(0);
      expect(usage3.totalTokens).toBe(0);
      expect(usage3.cumulativeTokens).toBe(0);
      expect(usage3.usagePercentage).toBe(0);
      expect(usage3.tokenLimit).toBe(1000000);
    });
  });
});