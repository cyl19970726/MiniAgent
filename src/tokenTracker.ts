/**
 * @fileoverview Token Usage Tracking Implementation
 * 
 * This module provides real-time token consumption tracking for AI agents.
 * It monitors input/output tokens, calculates cumulative usage, and provides
 * warnings when approaching model limits.
 */

import { ITokenTracker, ITokenUsage } from './interfaces.js';

/**
 * Real-time token usage tracker implementation
 * 
 * This class tracks token consumption across conversations, providing:
 * - Real-time usage updates
 * - Cumulative tracking across sessions
 * - Percentage-based limit warnings
 * - Usage summaries for monitoring
 * 
 * Key features:
 * - Thread-safe operation
 * - Model-specific token limits
 * - Automatic percentage calculations
 * - Reset capabilities for new sessions
 * 
 * @example
 * ```typescript
 * const tracker = new TokenTracker('gemini-pro', 1000000);
 * tracker.updateUsage({ inputTokens: 100, outputTokens: 50 });
 * 
 * if (tracker.isApproachingLimit(0.8)) {
 *   console.log('Warning: 80% of token limit reached');
 * }
 * ```
 */
export class TokenTracker implements ITokenTracker {
  /** Current token usage statistics */
  private currentUsage: ITokenUsage;
  
  /** Flag to track if 90% warning has been logged */
  private hasLoggedNinetyPercentWarning = false;
  
  /**
   * Constructor for TokenTracker
   * 
   * @param modelName - Name of the AI model being tracked
   * @param tokenLimit - Maximum tokens allowed for this model
   * @param initialUsage - Initial usage state (for session restoration)
   */
  constructor(
    private readonly modelName: string,
    private readonly tokenLimit: number,
    initialUsage?: Partial<ITokenUsage>,
  ) {
    this.currentUsage = {
      inputTokens: initialUsage?.inputTokens ?? 0,
      outputTokens: initialUsage?.outputTokens ?? 0,
      totalTokens: initialUsage?.totalTokens ?? 0,
      cumulativeTokens: initialUsage?.cumulativeTokens ?? 0,
      tokenLimit: this.tokenLimit,
      usagePercentage: 0,
    };
    
    this.recalculatePercentage();
  }

  /**
   * Update token usage with new consumption
   * 
   * This method is called after each API request to update the running
   * totals. It automatically recalculates percentages and cumulative usage.
   * 
   * @param usage - New token usage to add to totals
   */
  updateUsage(usage: { inputTokens: number; outputTokens: number }): void {
    // Validate input tokens are non-negative
    if (usage.inputTokens < 0 || usage.outputTokens < 0) {
      console.warn('TokenTracker: Negative token usage detected, ignoring update');
      return;
    }
    
    // Update individual token counts
    this.currentUsage.inputTokens += usage.inputTokens;
    this.currentUsage.outputTokens += usage.outputTokens;
    
    // Calculate totals
    const currentTotal = usage.inputTokens + usage.outputTokens;
    this.currentUsage.totalTokens += currentTotal;
    this.currentUsage.cumulativeTokens += currentTotal;
    
    // Recalculate percentage
    this.recalculatePercentage();
    
    // Log significant usage events (only once per threshold)
    if (this.isApproachingLimit(0.9) && !this.hasLoggedNinetyPercentWarning) {
      this.hasLoggedNinetyPercentWarning = true;
      console.warn(`TokenTracker: 90% of token limit reached for ${this.modelName}`);
    }
  }

  /**
   * Get current token usage statistics
   * 
   * Returns a deep copy of the current usage state to prevent
   * external modifications.
   * 
   * @returns Current token usage information
   */
  getUsage(): ITokenUsage {
    return {
      ...this.currentUsage,
    };
  }

  /**
   * Reset token tracking for new session
   * 
   * Clears all usage counters while preserving the token limit.
   * Useful when starting a new conversation or session.
   */
  reset(): void {
    this.currentUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cumulativeTokens: 0,
      tokenLimit: this.tokenLimit,
      usagePercentage: 0,
    };
    this.hasLoggedNinetyPercentWarning = false;
  }

  /**
   * Check if approaching token limit
   * 
   * Compares current cumulative usage against the specified threshold
   * to provide early warnings before hitting model limits.
   * 
   * @param threshold - Warning threshold as percentage (0.0 to 1.0)
   * @returns True if approaching limit
   */
  isApproachingLimit(threshold: number = 0.8): boolean {
    if (threshold < 0 || threshold > 1) {
      console.warn('TokenTracker: Invalid threshold, should be between 0 and 1');
      return false;
    }
    
    return this.currentUsage.usagePercentage >= (threshold * 100);
  }

  /**
   * Get usage summary for debugging and monitoring
   * 
   * Provides a human-readable summary of current token usage,
   * useful for logging and debugging purposes.
   * 
   * @returns Formatted usage summary string
   */
  getUsageSummary(): string {
    const usage = this.currentUsage;
    const efficiency = usage.totalTokens > 0 
      ? (usage.outputTokens / usage.totalTokens * 100).toFixed(1)
      : '0.0';
    
    return [
      `Token Usage Summary for ${this.modelName}:`,
      `  Input: ${usage.inputTokens.toLocaleString()} tokens`,
      `  Output: ${usage.outputTokens.toLocaleString()} tokens`, 
      `  Total: ${usage.totalTokens.toLocaleString()} tokens`,
      `  Cumulative: ${usage.cumulativeTokens.toLocaleString()} tokens`,
      `  Limit: ${usage.tokenLimit.toLocaleString()} tokens`,
      `  Usage: ${usage.usagePercentage.toFixed(1)}%`,
      `  Output Efficiency: ${efficiency}%`,
    ].join('\n');
  }

  /**
   * Get detailed usage breakdown
   * 
   * Provides detailed usage metrics for advanced monitoring
   * and analytics purposes.
   * 
   * @returns Detailed usage metrics object
   */
  getDetailedUsage(): {
    basic: ITokenUsage;
    efficiency: {
      outputRatio: number;
      averageInputPerRequest: number;
      averageOutputPerRequest: number;
    };
    limits: {
      isApproachingWarning: boolean;
      isApproachingDanger: boolean;
      remainingTokens: number;
      estimatedRequestsRemaining: number;
    };
  } {
    const usage = this.currentUsage;
    const requestCount = Math.max(1, usage.totalTokens / 100); // Estimate request count
    
    return {
      basic: this.getUsage(),
      efficiency: {
        outputRatio: usage.totalTokens > 0 ? usage.outputTokens / usage.totalTokens : 0,
        averageInputPerRequest: usage.inputTokens / requestCount,
        averageOutputPerRequest: usage.outputTokens / requestCount,
      },
      limits: {
        isApproachingWarning: this.isApproachingLimit(0.8),
        isApproachingDanger: this.isApproachingLimit(0.95),
        remainingTokens: Math.max(0, usage.tokenLimit - usage.cumulativeTokens),
        estimatedRequestsRemaining: Math.floor((usage.tokenLimit - usage.cumulativeTokens) / Math.max(100, usage.totalTokens / requestCount)),
      },
    };
  }

  /**
   * Export usage data for persistence
   * 
   * Returns serializable usage data that can be saved and restored
   * later to maintain usage tracking across sessions.
   * 
   * @returns Serializable usage data
   */
  exportUsageData(): {
    modelName: string;
    tokenLimit: number;
    usage: ITokenUsage;
    timestamp: number;
  } {
    return {
      modelName: this.modelName,
      tokenLimit: this.tokenLimit,
      usage: this.getUsage(),
      timestamp: Date.now(),
    };
  }

  /**
   * Recalculate usage percentage
   * 
   * Updates the usage percentage based on current cumulative tokens
   * and the configured token limit.
   * 
   * @private
   */
  private recalculatePercentage(): void {
    if (this.tokenLimit <= 0) {
      this.currentUsage.usagePercentage = 0;
      return;
    }
    
    this.currentUsage.usagePercentage = 
      (this.currentUsage.cumulativeTokens / this.tokenLimit) * 100;
    
    // Ensure percentage doesn't exceed 100%
    this.currentUsage.usagePercentage = Math.min(100, this.currentUsage.usagePercentage);
  }
}