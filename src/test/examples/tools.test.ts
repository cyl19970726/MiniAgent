/**
 * Tests for Example Tools
 * 
 * This file contains tests for the WeatherTool and SubTool implementations
 * to ensure they work correctly with the BaseTool framework.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeatherTool, SubTool, getCityCoordinates, getWeatherForCity, CITY_COORDINATES, WeatherResult, SubtractionResult } from '../../../examples/tools.js';

// Mock fetch for weather API tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WeatherTool', () => {
  let weatherTool: WeatherTool;
  let mockAbortController: AbortController;

  beforeEach(() => {
    weatherTool = new WeatherTool();
    mockAbortController = new AbortController();
    vi.clearAllMocks();
  });

  describe('Constructor and Properties', () => {
    it('should initialize with correct properties', () => {
      expect(weatherTool.name).toBe('get_weather');
      expect(weatherTool.displayName).toBe('Weather Tool');
      expect(weatherTool.description).toBe('Get current weather temperature (Celsius) for specified coordinates');
      expect(weatherTool.isOutputMarkdown).toBe(false);
      expect(weatherTool.canUpdateOutput).toBe(true);
    });

    it('should generate correct schema', () => {
      const schema = weatherTool.schema;
      expect(schema.name).toBe('get_weather');
      expect(schema.description).toBe('Get current weather temperature (Celsius) for specified coordinates');
      expect(schema.parameters).toBeDefined();
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters', () => {
      const result = weatherTool.validateToolParams({} as any);
      expect(result).toContain('latitude');
    });

    it('should validate parameter types', () => {
      const result = weatherTool.validateToolParams({
        latitude: 'invalid',
        longitude: 'invalid'
      } as any);
      expect(result).toContain('type');
    });

    it('should validate latitude range', () => {
      const result = weatherTool.validateToolParams({
        latitude: 100,
        longitude: 0
      });
      expect(result).toContain('Latitude must be between -90 and 90');
    });

    it('should validate longitude range', () => {
      const result = weatherTool.validateToolParams({
        latitude: 0,
        longitude: 200
      });
      expect(result).toContain('Longitude must be between -180 and 180');
    });

    it('should pass validation with valid parameters', () => {
      const result = weatherTool.validateToolParams({
        latitude: 39.9042,
        longitude: 116.4074
      });
      expect(result).toBe(null);
    });
  });

  describe('Tool Execution', () => {
    it('should execute successfully with valid parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          current: {
            temperature_2m: 25.5
          }
        })
      });

      const result = await weatherTool.execute(
        { latitude: 39.9042, longitude: 116.4074 },
        mockAbortController.signal
      );

      expect(result.data.success).toBe(true);
      expect(result.data.temperature).toBe(25.5);
      expect(result.data.latitude).toBe(39.9042);
      expect(result.data.longitude).toBe(116.4074);
      expect(result.data.message).toContain('25.5°C');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await weatherTool.execute(
        { latitude: 39.9042, longitude: 116.4074 },
        mockAbortController.signal
      );

      expect(result.data.success).toBe(false);
      expect(result.data.message).toContain('Weather API error');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await weatherTool.execute(
        { latitude: 39.9042, longitude: 116.4074 },
        mockAbortController.signal
      );

      expect(result.data.success).toBe(false);
      expect(result.data.message).toContain('Network error');
    });

    it('should handle abort signal', async () => {
      mockAbortController.abort();

      const result = await weatherTool.execute(
        { latitude: 39.9042, longitude: 116.4074 },
        mockAbortController.signal
      );

      expect(result.data.success).toBe(false);
      expect(result.data.message).toContain('cancelled');
    });

    it('should handle output updates', async () => {
      const outputHandler = vi.fn();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          current: {
            temperature_2m: 20.0
          }
        })
      });

      await weatherTool.execute(
        { latitude: 39.9042, longitude: 116.4074 },
        mockAbortController.signal,
        outputHandler
      );

      expect(outputHandler).toHaveBeenCalledWith(
        expect.stringContaining('🌤️')
      );
    });
  });

  describe('Description Generation', () => {
    it('should generate correct description', () => {
      const description = weatherTool.getDescription({
        latitude: 39.9042,
        longitude: 116.4074
      });
      
      expect(description).toBe('Get weather for coordinates (39.9042, 116.4074)');
    });
  });
});

describe('SubTool', () => {
  let subTool: SubTool;
  let mockAbortController: AbortController;

  beforeEach(() => {
    subTool = new SubTool();
    mockAbortController = new AbortController();
    vi.clearAllMocks();
  });

  describe('Constructor and Properties', () => {
    it('should initialize with correct properties', () => {
      expect(subTool.name).toBe('subtract');
      expect(subTool.displayName).toBe('Subtraction Tool');
      expect(subTool.description).toBe('Perform subtraction operation between two numbers');
      expect(subTool.isOutputMarkdown).toBe(false);
      expect(subTool.canUpdateOutput).toBe(true);
    });

    it('should generate correct schema', () => {
      const schema = subTool.schema;
      expect(schema.name).toBe('subtract');
      expect(schema.description).toBe('Perform subtraction operation between two numbers');
      expect(schema.parameters).toBeDefined();
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters', () => {
      const result = subTool.validateToolParams({} as any);
      expect(result).toContain('minuend');
    });

    it('should validate parameter types', () => {
      const result = subTool.validateToolParams({
        minuend: 'invalid',
        subtrahend: 'invalid'
      } as any);
      expect(result).toContain('type');
    });

    it('should validate finite numbers', () => {
      const result = subTool.validateToolParams({
        minuend: Infinity,
        subtrahend: 5
      });
      expect(result).toContain('finite');
    });

    it('should pass validation with valid parameters', () => {
      const result = subTool.validateToolParams({
        minuend: 10,
        subtrahend: 3
      });
      expect(result).toBe(null);
    });
  });

  describe('Tool Execution', () => {
    it('should execute successfully with positive result', async () => {
      const result = await subTool.execute(
        { minuend: 10, subtrahend: 3 },
        mockAbortController.signal
      );

      expect(result.data.success).toBe(true);
      expect(result.data.result).toBe(7);
      expect(result.data.operation).toBe('10 - 3 = 7');
      expect(result.data.isNegative).toBe(false);
      expect(result.data.message).toContain('positive result');
    });

    it('should execute successfully with negative result', async () => {
      const result = await subTool.execute(
        { minuend: 3, subtrahend: 10 },
        mockAbortController.signal
      );

      expect(result.data.success).toBe(true);
      expect(result.data.result).toBe(-7);
      expect(result.data.operation).toBe('3 - 10 = -7');
      expect(result.data.isNegative).toBe(true);
      expect(result.data.message).toContain('negative result');
    });

    it('should handle decimal numbers', async () => {
      const result = await subTool.execute(
        { minuend: 10.5, subtrahend: 3.2 },
        mockAbortController.signal
      );

      expect(result.data.success).toBe(true);
      expect(result.data.result).toBe(7.3);
      expect(result.data.operation).toBe('10.5 - 3.2 = 7.3');
      expect(result.data.isNegative).toBe(false);
    });

    it('should handle zero result', async () => {
      const result = await subTool.execute(
        { minuend: 5, subtrahend: 5 },
        mockAbortController.signal
      );

      expect(result.data.success).toBe(true);
      expect(result.data.result).toBe(0);
      expect(result.data.operation).toBe('5 - 5 = 0');
      expect(result.data.isNegative).toBe(false);
    });

    it('should handle abort signal', async () => {
      mockAbortController.abort();

      const result = await subTool.execute(
        { minuend: 10, subtrahend: 3 },
        mockAbortController.signal
      );

      expect(result.data.success).toBe(false);
      expect(result.data.message).toContain('cancelled');
    });

    it('should handle output updates', async () => {
      const outputHandler = vi.fn();

      await subTool.execute(
        { minuend: 10, subtrahend: 3 },
        mockAbortController.signal,
        outputHandler
      );

      expect(outputHandler).toHaveBeenCalledWith(
        expect.stringContaining('➖')
      );
    });
  });

  describe('Description Generation', () => {
    it('should generate correct description', () => {
      const description = subTool.getDescription({
        minuend: 10,
        subtrahend: 3
      });
      
      expect(description).toBe('Subtract 3 from 10');
    });
  });
});

describe('City Coordinates Utilities', () => {
  describe('getCityCoordinates', () => {
    it('should return coordinates for valid city', () => {
      const coordinates = getCityCoordinates('北京');
      expect(coordinates).toEqual({ latitude: 39.9042, longitude: 116.4074 });
    });

    it('should return null for invalid city', () => {
      const coordinates = getCityCoordinates('InvalidCity');
      expect(coordinates).toBe(null);
    });

    it('should return independent copy of coordinates', () => {
      const coordinates1 = getCityCoordinates('北京');
      const coordinates2 = getCityCoordinates('北京');
      
      expect(coordinates1).not.toBe(coordinates2);
      expect(coordinates1).toEqual(coordinates2);
    });
  });

  describe('getWeatherForCity', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return weather for valid city', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          current: {
            temperature_2m: 15.5
          }
        })
      });

      const result = await getWeatherForCity('北京');
      
      expect(result).toBeDefined();
      expect(result?.city).toBe('北京');
      expect(result?.temperature).toBe(15.5);
      expect(result?.coordinates).toEqual({ latitude: 39.9042, longitude: 116.4074 });
    });

    it('should return null for invalid city', async () => {
      const result = await getWeatherForCity('InvalidCity');
      expect(result).toBe(null);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      const result = await getWeatherForCity('北京');
      expect(result).toBe(null);
    });
  });

  describe('CITY_COORDINATES constant', () => {
    it('should contain expected cities', () => {
      expect(CITY_COORDINATES).toHaveProperty('北京');
      expect(CITY_COORDINATES).toHaveProperty('上海');
      expect(CITY_COORDINATES).toHaveProperty('纽约');
      expect(CITY_COORDINATES).toHaveProperty('伦敦');
    });

    it('should have valid coordinate values', () => {
      for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
        expect(coords.latitude).toBeGreaterThanOrEqual(-90);
        expect(coords.latitude).toBeLessThanOrEqual(90);
        expect(coords.longitude).toBeGreaterThanOrEqual(-180);
        expect(coords.longitude).toBeLessThanOrEqual(180);
      }
    });

    it('should contain at least 15 cities', () => {
      expect(Object.keys(CITY_COORDINATES).length).toBeGreaterThanOrEqual(15);
    });
  });
});