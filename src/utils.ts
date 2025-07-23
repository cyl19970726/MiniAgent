/**
 * @fileoverview Utility functions for the AI Agent framework
 * 
 * This module provides utility functions shared across different implementations,
 * including type conversions and common transformations needed for different
 * AI provider APIs.
 */

/**
 * Convert Type enum values (OBJECT, NUMBER, STRING) to lowercase for API compatibility
 * 
 * Different AI providers expect different casing for type values:
 * - Gemini API expects lowercase (object, number, string)
 * - OpenAI API expects lowercase (object, number, string)
 * - Our Type enum uses uppercase (OBJECT, NUMBER, STRING)
 * 
 * This function recursively converts all type fields to lowercase while preserving
 * the rest of the object structure.
 * 
 * @param obj - Object to convert type fields in
 * @returns Object with type fields converted to lowercase
 */
export function convertTypesToLowercase(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => convertTypesToLowercase(item));
  }
  
  const result = { ...obj };
  
  // Convert type field if it exists
  if (result.type && typeof result.type === 'string') {
    result.type = result.type.toLowerCase();
  }
  
  // Recursively convert nested objects
  Object.keys(result).forEach(key => {
    if (typeof result[key] === 'object' && result[key] !== null) {
      result[key] = convertTypesToLowercase(result[key]);
    }
  });
  
  return result;
}

/**
 * Deep clone an object using JSON serialization
 * 
 * This is a utility function for creating deep copies of configuration objects
 * to avoid mutations affecting the original objects.
 * 
 * @param obj - Object to clone
 * @returns Deep cloned object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Generate a unique ID with optional prefix
 * 
 * @param prefix - Optional prefix for the ID
 * @returns Unique ID string
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Safe JSON parsing with fallback
 * 
 * @param jsonString - JSON string to parse
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed object or fallback value
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return fallback;
  }
}

/**
 * Validate if a string is a valid JSON
 * 
 * @param str - String to validate
 * @returns True if valid JSON, false otherwise
 */
export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Truncate text to a maximum length with ellipsis
 * 
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @param ellipsis - Ellipsis string (default: '...')
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number, ellipsis: string = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
}