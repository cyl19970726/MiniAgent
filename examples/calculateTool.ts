/**
 * Calculate Tool - A simple mathematical calculator tool for demonstration
 */

import { BaseTool, ToolResult, ToolCallConfirmationDetails } from '@google/gemini-cli-core';
import { FunctionDeclaration, Type, Schema } from '@google/genai';

interface CalculateParams {
  expression: string;
}

/**
 * Safe mathematical expression evaluator
 */
class SafeCalculator {
  private allowedOperators = ['+', '-', '*', '/', '(', ')', '.', ' '];
  private allowedFunctions = ['abs', 'min', 'max', 'round', 'floor', 'ceil', 'sqrt'];

  /**
   * Validate that the expression only contains safe characters
   */
  private validateExpression(expression: string): boolean {
    // Remove numbers and allowed operators
    const cleaned = expression.replace(/[0-9]/g, '');
    
    // Check for allowed operators
    for (const char of cleaned) {
      if (!this.allowedOperators.includes(char)) {
        // Check if it's part of an allowed function
        let isPartOfFunction = false;
        for (const func of this.allowedFunctions) {
          if (expression.includes(func)) {
            isPartOfFunction = true;
            break;
          }
        }
        if (!isPartOfFunction) {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Safely evaluate a mathematical expression
   */
  evaluate(expression: string): number {
    // Clean the expression
    const cleaned = expression.replace(/\s+/g, '');
    
    // Validate the expression
    if (!this.validateExpression(cleaned)) {
      throw new Error('Invalid or unsafe expression');
    }

    // Replace function names with Math equivalents
    let processed = cleaned;
    for (const func of this.allowedFunctions) {
      processed = processed.replace(new RegExp(func, 'g'), `Math.${func}`);
    }

    try {
      // Use Function constructor for safer evaluation than eval
      const result = new Function('Math', `return ${processed}`)(Math);
      
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Invalid calculation result');
      }
      
      return result;
    } catch (error) {
      throw new Error(`Calculation error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export class CalculateTool extends BaseTool<CalculateParams, ToolResult> {
  private calculator = new SafeCalculator();

  constructor() {
    super(
      'calculate',
      'Calculator Tool',
      'Perform mathematical calculations safely. Supports basic arithmetic operations (+, -, *, /) and functions (abs, min, max, round, floor, ceil, sqrt)',
      {
        type: Type.OBJECT,
        properties: {
          expression: {
            type: Type.STRING,
            description: 'Mathematical expression to evaluate. Examples: "2 + 3", "sqrt(16)", "abs(-5)", "max(10, 20)"',
          },
        },
        required: ['expression'],
      },
      false
    );
  }

  validateToolParams(params: CalculateParams): string | null {
    if (!params.expression || typeof params.expression !== 'string') {
      return 'Expression is required and must be a string';
    }

    if (params.expression.trim().length === 0) {
      return 'Expression cannot be empty';
    }

    // Check for obviously dangerous patterns
    const dangerous = ['eval', 'function', 'constructor', 'prototype', 'import', 'require'];
    const lowerExpression = params.expression.toLowerCase();
    
    for (const pattern of dangerous) {
      if (lowerExpression.includes(pattern)) {
        return `Expression contains disallowed pattern: ${pattern}`;
      }
    }

    return null;
  }

  async shouldConfirmExecute(
    params: CalculateParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // No confirmation needed for basic calculations
    return false;
  }

  async execute(
    params: CalculateParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const { expression } = params;
    
    // Check if signal is aborted
    if (signal.aborted) {
      throw new Error('Calculation was aborted');
    }

    // Update output if callback provided
    if (updateOutput) {
      updateOutput(`🔢 Calculating: ${expression}`);
    }

    try {
      const result = this.calculator.evaluate(expression);
      
      // Format the result nicely
      const formattedResult = this.formatResult(result);
      
      const responseText = `${expression} = ${formattedResult}`;

      return {
        llmContent: responseText,
        returnDisplay: `🔢 ${responseText}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown calculation error';
      
      return {
        llmContent: `Error calculating "${expression}": ${errorMessage}`,
        returnDisplay: `❌ Calculation error: ${errorMessage}`,
      };
    }
  }

  /**
   * Format the result for display
   */
  private formatResult(result: number): string {
    // Round to reasonable precision
    if (Number.isInteger(result)) {
      return result.toString();
    }
    
    // For decimals, show up to 6 decimal places but remove trailing zeros
    const formatted = result.toFixed(6);
    return parseFloat(formatted).toString();
  }
}