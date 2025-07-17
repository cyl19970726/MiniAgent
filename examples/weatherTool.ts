/**
 * Weather Tool - Get current weather information using Open-Meteo API
 */

import { BaseTool, ToolResult, ToolCallConfirmationDetails } from '@google/gemini-cli-core';
import { FunctionDeclaration, Type, Schema } from '@google/genai';

interface WeatherParams {
  city: string;
  unit?: 'celsius' | 'fahrenheit';
}

// 常用城市的坐标
const CITY_COORDINATES = {
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
  
  // 国际城市
  '东京': { latitude: 35.6762, longitude: 139.6503 },
  '纽约': { latitude: 40.7128, longitude: -74.0060 },
  '伦敦': { latitude: 51.5074, longitude: -0.1278 },
  '巴黎': { latitude: 48.8566, longitude: 2.3522 },
  '洛杉矶': { latitude: 34.0522, longitude: -118.2437 },
  '悉尼': { latitude: -33.8688, longitude: 151.2093 },
  
  // 英文城市名
  'Beijing': { latitude: 39.9042, longitude: 116.4074 },
  'Shanghai': { latitude: 31.2304, longitude: 121.4737 },
  'Tokyo': { latitude: 35.6762, longitude: 139.6503 },
  'New York': { latitude: 40.7128, longitude: -74.0060 },
  'London': { latitude: 51.5074, longitude: -0.1278 },
  'Paris': { latitude: 48.8566, longitude: 2.3522 },
  'Los Angeles': { latitude: 34.0522, longitude: -118.2437 },
  'Sydney': { latitude: -33.8688, longitude: 151.2093 }
};

/**
 * 获取天气的核心函数
 */
async function getWeather(latitude: number, longitude: number): Promise<number> {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`
    );
    
    if (!response.ok) {
      throw new Error(`Weather API request failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    return data.current.temperature_2m;
  } catch (error) {
    throw new Error(`获取天气数据失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export class WeatherTool extends BaseTool<WeatherParams, ToolResult> {
  constructor() {
    super(
      'get_weather',
      'Weather Tool',
      '获取指定城市的当前天气温度（摄氏度）',
      {
        type: Type.OBJECT,
        properties: {
          city: {
            type: Type.STRING,
            description: '城市名称（支持中英文），如：北京、上海、Beijing、Shanghai等',
          },
          unit: {
            type: Type.STRING,
            enum: ['celsius', 'fahrenheit'],
            description: '温度单位（默认：摄氏度）',
          },
        },
        required: ['city'],
      },
      false
    );
  }

  validateToolParams(params: WeatherParams): string | null {
    if (!params.city || typeof params.city !== 'string') {
      return 'City name is required and must be a string';
    }

    if (params.unit && !['celsius', 'fahrenheit'].includes(params.unit)) {
      return 'Unit must be either "celsius" or "fahrenheit"';
    }

    // Check if city is supported
    const cityKey = Object.keys(CITY_COORDINATES).find(
      key => key.toLowerCase() === params.city.toLowerCase()
    );
    
    if (!cityKey) {
      return `City "${params.city}" is not supported. Supported cities: ${Object.keys(CITY_COORDINATES).join(', ')}`;
    }

    return null;
  }

  async shouldConfirmExecute(
    params: WeatherParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // No confirmation needed for weather lookups
    return false;
  }

  async execute(
    params: WeatherParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const { city, unit = 'celsius' } = params;
    
    // Check if signal is aborted
    if (signal.aborted) {
      throw new Error('Weather lookup was aborted');
    }

    // Update output if callback provided
    if (updateOutput) {
      updateOutput(`🌤️ 正在查询 ${city} 的天气信息...`);
    }

    try {
      // Find city coordinates (case-insensitive)
      const cityKey = Object.keys(CITY_COORDINATES).find(
        key => key.toLowerCase() === city.toLowerCase()
      );
      
      if (!cityKey) {
        return {
          llmContent: `不支持城市"${city}"的天气查询。支持的城市：${Object.keys(CITY_COORDINATES).join(', ')}`,
          returnDisplay: `❌ 不支持的城市: ${city}`,
        };
      }

      const coordinates = CITY_COORDINATES[cityKey as keyof typeof CITY_COORDINATES];
      
      // Get weather data
      const temperature = await getWeather(coordinates.latitude, coordinates.longitude);
      
      // Convert temperature if needed
      let finalTemp = temperature;
      let tempUnit = '°C';
      
      if (unit === 'fahrenheit') {
        finalTemp = (temperature * 9/5) + 32;
        tempUnit = '°F';
      }

      const weatherInfo = {
        city: cityKey,
        temperature: Math.round(finalTemp),
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        unit: unit === 'fahrenheit' ? 'fahrenheit' : 'celsius',
        success: true
      };

      const responseText = `${weatherInfo.city}当前温度：${weatherInfo.temperature}${tempUnit}（坐标：${weatherInfo.latitude}, ${weatherInfo.longitude}）`;

      return {
        llmContent: JSON.stringify(weatherInfo),
        returnDisplay: `🌤️ ${responseText}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown weather lookup error';
      
      return {
        llmContent: `获取"${city}"天气信息时出错：${errorMessage}`,
        returnDisplay: `❌ 天气查询错误: ${errorMessage}`,
      };
    }
  }
}