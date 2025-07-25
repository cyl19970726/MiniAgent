/**
 * Example Tools for Agent Framework
 * 
 * This module demonstrates how to create custom tools using the BaseTool framework.
 * Includes WeatherTool for getting weather data and SubTool for basic math operations.
 */

import { BaseTool, ToolResult, Type, Schema } from '../src/index.js';

// ============================================================================
// WEATHER TOOL
// ============================================================================

/**
 * Weather Tool - Get current weather for specified coordinates
 * 
 * This tool fetches weather data from the Open-Meteo API for any given
 * latitude and longitude coordinates.
 */
export class WeatherTool extends BaseTool<{ latitude: number; longitude: number }> {
  constructor() {
    super(
      'get_weather',
      'Weather Tool',
      'Get current weather temperature (Celsius) for specified coordinates',
      {
        type: Type.OBJECT,
        properties: {
          latitude: {
            type: Type.NUMBER,
            description: 'Latitude coordinate (range: -90 to 90)'
          },
          longitude: {
            type: Type.NUMBER,
            description: 'Longitude coordinate (range: -180 to 180)'
          }
        },
        required: ['latitude', 'longitude']
      },
      false, // isOutputMarkdown
      true   // canUpdateOutput
    );
  }

  validateToolParams(params: { latitude: number; longitude: number }): string | null {
    const requiredError = this.validateRequiredParams(params, ['latitude', 'longitude']);
    if (requiredError) return requiredError;

    const typeError = this.validateParameterTypes(params, {
      latitude: 'number',
      longitude: 'number'
    });
    if (typeError) return typeError;

    // Validate coordinate ranges
    if (params.latitude < -90 || params.latitude > 90) {
      return 'Latitude must be between -90 and 90';
    }
    
    if (params.longitude < -180 || params.longitude > 180) {
      return 'Longitude must be between -180 and 180';
    }

    return null;
  }

  getDescription(params: { latitude: number; longitude: number }): string {
    return `Get weather for coordinates (${params.latitude}, ${params.longitude})`;
  }

  async execute(
    params: { latitude: number; longitude: number },
    abortSignal: AbortSignal,
    outputUpdateHandler?: (output: string) => void
  ): Promise<ToolResult> {
    const { latitude, longitude } = params;
    
    if (outputUpdateHandler) {
      outputUpdateHandler(this.formatProgress('Fetching weather', `${latitude}, ${longitude}`, '🌤️'));
    }

    try {
      // Check for cancellation
      this.checkAbortSignal(abortSignal, 'Weather fetch');

      if (outputUpdateHandler) {
        outputUpdateHandler(this.formatProgress('Contacting API', 'open-meteo.com', '🌐'));
      }

      const temperature = await this.fetchWeatherData(latitude, longitude);
      
      // Check for cancellation after API call
      this.checkAbortSignal(abortSignal, 'Weather fetch');

      const result = {
        latitude,
        longitude,
        temperature,
        unit: '°C',
        success: true
      };

      return this.createResult(
        `Weather at (${latitude}, ${longitude}): ${temperature}°C`,
        `🌤️ Weather: ${temperature}°C at coordinates (${latitude}, ${longitude})`,
        `Retrieved weather: ${temperature}°C`
      );
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error : new Error(String(error)),
        'Weather fetch'
      );
    }
  }

  /**
   * Fetch weather data from Open-Meteo API
   */
  private async fetchWeatherData(latitude: number, longitude: number): Promise<number> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    if (!data.current || typeof data.current.temperature_2m !== 'number') {
      throw new Error('Invalid weather data received from API');
    }
    
    return data.current.temperature_2m;
  }
}

// ============================================================================
// SUBTRACTION TOOL
// ============================================================================

/**
 * Subtraction Tool - Perform basic subtraction operations
 * 
 * This tool performs subtraction between two numbers and provides
 * detailed calculation information.
 */
export class SubTool extends BaseTool<{ minuend: number; subtrahend: number }> {
  constructor() {
    super(
      'subtract',
      'Subtraction Tool',
      'Perform subtraction operation between two numbers',
      {
        type: Type.OBJECT,
        properties: {
          minuend: {
            type: Type.NUMBER,
            description: 'The number to subtract from (first number)'
          },
          subtrahend: {
            type: Type.NUMBER,
            description: 'The number to subtract (second number)'
          }
        },
        required: ['minuend', 'subtrahend']
      },
      false, // isOutputMarkdown
      true   // canUpdateOutput
    );
  }

  validateToolParams(params: { minuend: number; subtrahend: number }): string | null {
    const requiredError = this.validateRequiredParams(params, ['minuend', 'subtrahend']);
    if (requiredError) return requiredError;

    const typeError = this.validateParameterTypes(params, {
      minuend: 'number',
      subtrahend: 'number'
    });
    if (typeError) return typeError;

    // Check for invalid numbers
    if (!isFinite(params.minuend) || !isFinite(params.subtrahend)) {
      return 'Numbers must be finite values';
    }

    return null;
  }

  getDescription(params: { minuend: number; subtrahend: number }): string {
    return `Subtract ${params.subtrahend} from ${params.minuend}`;
  }

  async execute(
    params: { minuend: number; subtrahend: number },
    abortSignal: AbortSignal,
    outputUpdateHandler?: (output: string) => void
  ): Promise<ToolResult> {
    const { minuend, subtrahend } = params;
    
    if (outputUpdateHandler) {
      outputUpdateHandler(this.formatProgress('Calculating', `${minuend} - ${subtrahend}`, '➖'));
    }

    try {
      // Check for cancellation
      this.checkAbortSignal(abortSignal, 'Subtraction calculation');

      // Simulate brief calculation delay
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check for cancellation after delay
      this.checkAbortSignal(abortSignal, 'Subtraction calculation');

      const result = minuend - subtrahend;
      const operation = `${minuend} - ${subtrahend} = ${result}`;
      
      // Additional calculation info
      const absResult = Math.abs(result);
      const isNegative = result < 0;
      const info = isNegative ? 'negative result' : 'positive result';

      return this.createResult(
        `${operation} (${info})`,
        `➖ ${operation}`,
        `Subtraction result: ${result}`
      );
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error : new Error(String(error)),
        'Subtraction calculation'
      );
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS AND CONSTANTS
// ============================================================================

/**
 * Convenience function to create a WeatherTool instance
 */
export function createWeatherTool(): WeatherTool {
  return new WeatherTool();
}

/**
 * Convenience function to create a SubTool instance
 */
export function createSubTool(): SubTool {
  return new SubTool();
}

/**
 * Common city coordinates for weather queries
 */
export const CITY_COORDINATES = {
  // 中国主要城市
  '北京': { latitude: 39.9042, longitude: 116.4074 },
  '上海': { latitude: 31.2304, longitude: 121.4737 },
  '广州': { latitude: 23.1291, longitude: 113.2644 },
  '深圳': { latitude: 22.5431, longitude: 114.0579 },
  '成都': { latitude: 30.5728, longitude: 104.0668 },
  '杭州': { latitude: 30.2741, longitude: 120.1551 },
  '西安': { latitude: 34.3416, longitude: 108.9398 },
  '武汉': { latitude: 30.5928, longitude: 114.3055 },
  '南京': { latitude: 32.0603, longitude: 118.7969 },
  '重庆': { latitude: 29.4316, longitude: 106.9123 },
  '天津': { latitude: 39.3434, longitude: 117.3616 },
  '苏州': { latitude: 31.2989, longitude: 120.5853 },
  '青岛': { latitude: 36.0986, longitude: 120.3719 },
  '大连': { latitude: 38.9140, longitude: 121.6147 },
  '厦门': { latitude: 24.4798, longitude: 118.0819 },
  
  // 国际主要城市
  '东京': { latitude: 35.6762, longitude: 139.6503 },
  '纽约': { latitude: 40.7128, longitude: -74.0060 },
  '伦敦': { latitude: 51.5074, longitude: -0.1278 },
  '巴黎': { latitude: 48.8566, longitude: 2.3522 },
  '洛杉矶': { latitude: 34.0522, longitude: -118.2437 },
  '悉尼': { latitude: -33.8688, longitude: 151.2093 },
  '新加坡': { latitude: 1.3521, longitude: 103.8198 },
  '首尔': { latitude: 37.5665, longitude: 126.9780 },
  '曼谷': { latitude: 13.7563, longitude: 100.5018 },
  '迪拜': { latitude: 25.2048, longitude: 55.2708 },
  '多伦多': { latitude: 43.6532, longitude: -79.3832 },
  '柏林': { latitude: 52.5200, longitude: 13.4050 },
  '罗马': { latitude: 41.9028, longitude: 12.4964 },
  '马德里': { latitude: 40.4168, longitude: -3.7038 },
  '莫斯科': { latitude: 55.7558, longitude: 37.6173 }
} as const;

/**
 * Get coordinates for a city name
 */
export function getCityCoordinates(cityName: string): { latitude: number; longitude: number } | null {
  const coordinates = CITY_COORDINATES[cityName as keyof typeof CITY_COORDINATES];
  return coordinates ? { ...coordinates } : null;
}

/**
 * Get weather for a city by name
 */
export async function getWeatherForCity(cityName: string): Promise<{ city: string; temperature: number; coordinates: { latitude: number; longitude: number } } | null> {
  const coordinates = getCityCoordinates(cityName);
  if (!coordinates) {
    return null;
  }

  const weatherTool = createWeatherTool();
  const abortController = new AbortController();
  
  try {
    const result = await weatherTool.execute(coordinates, abortController.signal);
    
    // Check if the result contains an error
    if (result.llmContent.includes('Error:') || result.returnDisplay.includes('❌')) {
      return null;
    }
    
    // Parse temperature from result
    const content = result.llmContent;
    const match = content.match(/(-?\d+(?:\.\d+)?)°C/);
    const temperature = match ? parseFloat(match[1]) : 0;
    
    return {
      city: cityName,
      temperature,
      coordinates
    };
  } catch (error) {
    console.error(`Failed to get weather for ${cityName}:`, error);
    return null;
  }
}

/**
 * List all available cities
 */
export function getAvailableCities(): string[] {
  return Object.keys(CITY_COORDINATES);
}

/**
 * Find cities by partial name match
 */
export function findCitiesByName(partialName: string): string[] {
  const searchTerm = partialName.toLowerCase();
  return Object.keys(CITY_COORDINATES).filter(city => 
    city.toLowerCase().includes(searchTerm)
  );
}