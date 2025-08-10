# Tool 定义和使用指南

## 概述

MiniAgent 的工具系统是框架的核心功能之一，允许 AI Agent 执行各种操作，如文件读写、API 调用、数据处理等。本文档详细介绍如何定义、实现和使用工具。

## ITool 接口详解

### 基本接口定义

```typescript
export interface ITool {
  name: string;                    // 工具名称，必须唯一
  description: string;             // 工具描述
  schema: ToolSchema;              // 工具参数 schema
  isOutputMarkdown: boolean;       // 输出是否为 Markdown 格式
  canUpdateOutput: boolean;        // 是否可以更新输出

  // 核心方法
  validateToolParams(params: any): string | null;
  getDescription(params: any): string;
  shouldConfirmExecute(params: any): Promise<boolean | ToolCallConfirmationDetails>;
  execute(params: any, abortSignal?: AbortSignal): Promise<ToolResult>;
}
```

### Schema 定义

```typescript
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: any;
    }>;
    required: string[];
  };
}
```

### 工具执行结果

```typescript
export interface ToolResult {
  summary: string;           // 执行摘要
  llmContent: string;        // 返回给 LLM 的内容
  returnDisplay?: string;    // 显示给用户的内容
  error?: string;           // 错误信息
  metadata?: Record<string, unknown>;
}
```

## 创建自定义工具

### 1. 简单工具示例 - 计算器

```typescript
import { ITool, ToolResult, ToolSchema } from '@continue-reasoning/mini-agent';

export const calculatorTool: ITool = {
  name: 'calculator',
  description: 'Perform mathematical calculations',
  schema: {
    name: 'calculator',
    description: 'Calculate mathematical expressions',
    input_schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to calculate (e.g., "2 + 3 * 4")'
        }
      },
      required: ['expression']
    }
  },
  isOutputMarkdown: false,
  canUpdateOutput: false,

  validateToolParams(params: any): string | null {
    if (!params.expression) {
      return 'Expression is required';
    }
    
    // 基本安全检查，只允许数字和基本运算符
    const allowedPattern = /^[0-9+\-*/().\s]+$/;
    if (!allowedPattern.test(params.expression)) {
      return 'Invalid characters in expression. Only numbers and +, -, *, /, (), . are allowed';
    }
    
    return null;
  },

  getDescription(params: any): string {
    return `Calculate: ${params.expression}`;
  },

  async shouldConfirmExecute(): Promise<false> {
    // 数学计算不需要确认
    return false;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      // 注意：在生产环境中应该使用更安全的表达式求值库
      const result = eval(params.expression);
      
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Invalid calculation result');
      }

      return {
        summary: `Calculated ${params.expression}`,
        llmContent: `The result of ${params.expression} is ${result}`,
        returnDisplay: `${params.expression} = ${result}`
      };
    } catch (error: any) {
      return {
        summary: 'Calculation failed',
        llmContent: `Error calculating ${params.expression}: ${error.message}`,
        error: error.message
      };
    }
  }
};
```

### 2. 异步工具示例 - 天气查询

```typescript
export const weatherTool: ITool = {
  name: 'get_weather',
  description: 'Get current weather information for a city',
  schema: {
    name: 'get_weather',
    description: 'Fetch weather data for a specified city',
    input_schema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'Name of the city to get weather for'
        },
        units: {
          type: 'string',
          description: 'Temperature units',
          enum: ['celsius', 'fahrenheit']
        }
      },
      required: ['city']
    }
  },
  isOutputMarkdown: true,
  canUpdateOutput: false,

  validateToolParams(params: any): string | null {
    if (!params.city || typeof params.city !== 'string') {
      return 'City name is required and must be a string';
    }
    
    if (params.units && !['celsius', 'fahrenheit'].includes(params.units)) {
      return 'Units must be either "celsius" or "fahrenheit"';
    }
    
    return null;
  },

  getDescription(params: any): string {
    const units = params.units || 'celsius';
    return `Get weather for ${params.city} in ${units}`;
  },

  async shouldConfirmExecute(): Promise<false> {
    // 天气查询是只读操作，不需要确认
    return false;
  },

  async execute(params: any, abortSignal?: AbortSignal): Promise<ToolResult> {
    const { city, units = 'celsius' } = params;
    
    try {
      // 模拟 API 调用
      const response = await fetch(`https://api.weather.com/v1/current?city=${encodeURIComponent(city)}`, {
        signal: abortSignal,
        headers: {
          'Authorization': `Bearer ${process.env.WEATHER_API_KEY}`
        }
      });

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // 转换温度单位
      let temperature = data.temperature;
      if (units === 'fahrenheit') {
        temperature = (temperature * 9/5) + 32;
      }

      const weatherInfo = `
## 🌤️ Weather in ${city}

- **Temperature**: ${temperature.toFixed(1)}°${units === 'celsius' ? 'C' : 'F'}
- **Condition**: ${data.condition}
- **Humidity**: ${data.humidity}%
- **Wind**: ${data.windSpeed} km/h
- **Updated**: ${new Date(data.timestamp).toLocaleString()}
      `.trim();

      return {
        summary: `Weather data for ${city}`,
        llmContent: weatherInfo,
        returnDisplay: weatherInfo,
        metadata: {
          city,
          temperature,
          units,
          timestamp: data.timestamp
        }
      };

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          summary: 'Weather request cancelled',
          llmContent: 'Weather request was cancelled',
          error: 'Request was aborted'
        };
      }

      return {
        summary: `Failed to get weather for ${city}`,
        llmContent: `Unable to fetch weather data for ${city}: ${error.message}`,
        error: error.message
      };
    }
  }
};
```

### 3. 需要确认的工具示例 - 文件写入

```typescript
export const fileWriteTool: ITool = {
  name: 'write_file',
  description: 'Write content to a file',
  schema: {
    name: 'write_file',
    description: 'Write or create a file with specified content',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to write to'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        },
        mode: {
          type: 'string',
          description: 'Write mode',
          enum: ['write', 'append']
        }
      },
      required: ['path', 'content']
    }
  },
  isOutputMarkdown: false,
  canUpdateOutput: true,

  validateToolParams(params: any): string | null {
    if (!params.path || typeof params.path !== 'string') {
      return 'File path is required';
    }
    
    if (!params.content || typeof params.content !== 'string') {
      return 'Content is required';
    }
    
    if (params.mode && !['write', 'append'].includes(params.mode)) {
      return 'Mode must be either "write" or "append"';
    }
    
    return null;
  },

  getDescription(params: any): string {
    const mode = params.mode || 'write';
    return `${mode === 'append' ? 'Append to' : 'Write'} file: ${params.path}`;
  },

  async shouldConfirmExecute(params: any): Promise<ToolCallConfirmationDetails> {
    const fs = await import('fs');
    const path = await import('path');
    
    const exists = fs.existsSync(params.path);
    const mode = params.mode || 'write';
    
    return {
      type: 'edit',
      title: exists ? 
        `${mode === 'append' ? 'Append to' : 'Overwrite'} existing file` : 
        'Create new file',
      fileName: path.basename(params.path),
      filePath: params.path,
      fileDiff: exists && mode === 'write' ? 
        `File will be overwritten with:\n${params.content}` :
        `Content to ${mode}:\n${params.content}`,
      onConfirm: async (outcome) => {
        // 确认回调将在工具执行时处理
        return outcome;
      }
    };
  },

  async execute(params: any): Promise<ToolResult> {
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');
    
    const { path: filePath, content, mode = 'write' } = params;
    
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      if (mode === 'append') {
        await fs.appendFile(filePath, content, 'utf8');
      } else {
        await fs.writeFile(filePath, content, 'utf8');
      }

      return {
        summary: `${mode === 'append' ? 'Appended to' : 'Wrote'} file ${filePath}`,
        llmContent: `Successfully ${mode === 'append' ? 'appended content to' : 'wrote'} file: ${filePath}`,
        returnDisplay: `✅ File ${mode === 'append' ? 'updated' : 'created'}: ${filePath}`
      };

    } catch (error: any) {
      return {
        summary: `Failed to write file ${filePath}`,
        llmContent: `Error writing to file ${filePath}: ${error.message}`,
        error: error.message
      };
    }
  }
};
```

## 工具确认机制

### ToolCallConfirmationDetails 接口

```typescript
export interface ToolCallConfirmationDetails {
  type: 'edit' | 'exec' | 'custom';
  title: string;
  fileName?: string;
  filePath?: string;
  fileDiff?: string;
  command?: string;
  customData?: Record<string, unknown>;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<ToolConfirmationOutcome>;
}

export enum ToolConfirmationOutcome {
  Cancel = 'cancel',
  ProceedOnce = 'proceed_once',
  ProceedAll = 'proceed_all'
}
```

### 实现确认机制

```typescript
export const dangerousTool: ITool = {
  name: 'system_command',
  description: 'Execute system commands',
  // ... schema definition

  async shouldConfirmExecute(params: any): Promise<ToolCallConfirmationDetails> {
    return {
      type: 'exec',
      title: 'Execute System Command',
      command: params.command,
      onConfirm: async (outcome) => {
        if (outcome === ToolConfirmationOutcome.Cancel) {
          throw new Error('Command execution cancelled by user');
        }
        return outcome;
      }
    };
  },

  async execute(params: any): Promise<ToolResult> {
    // 只有通过确认后才会执行到这里
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout, stderr } = await execAsync(params.command);
      
      return {
        summary: `Executed: ${params.command}`,
        llmContent: `Command output:\n${stdout}${stderr ? `\nErrors:\n${stderr}` : ''}`,
        returnDisplay: stdout || stderr || 'Command completed with no output'
      };
    } catch (error: any) {
      return {
        summary: `Command failed: ${params.command}`,
        llmContent: `Command failed: ${error.message}`,
        error: error.message
      };
    }
  }
};
```

## 处理工具事件

### 监听工具执行事件

```typescript
async function handleToolEvents(agent: BaseAgent) {
  const events = agent.process(userMessages, sessionId, abortSignal);
  
  for await (const event of events) {
    switch (event.type) {
      case AgentEventType.ToolExecutionStart:
        const startData = event.data as any;
        console.log(`🔧 Starting tool: ${startData.toolName}`);
        console.log(`   Args: ${JSON.stringify(startData.args, null, 2)}`);
        
        // 显示工具执行进度
        showToolProgress(startData.toolName, startData.callId);
        break;

      case AgentEventType.ToolExecutionDone:
        const doneData = event.data as any;
        
        if (doneData.error) {
          console.error(`❌ Tool ${doneData.toolName} failed: ${doneData.error}`);
          showToolError(doneData.toolName, doneData.error);
        } else {
          console.log(`✅ Tool ${doneData.toolName} completed in ${doneData.duration}ms`);
          console.log(`   Result: ${doneData.result?.summary}`);
          
          // 显示工具结果
          if (doneData.result?.returnDisplay) {
            showToolResult(doneData.toolName, doneData.result.returnDisplay);
          }
        }
        
        hideToolProgress(doneData.callId);
        break;

      case AgentEventType.ToolConfirmation:
        const confirmationData = event.data as ToolCallConfirmationDetails;
        
        // 显示确认对话框
        const userChoice = await showConfirmationDialog(confirmationData);
        
        // 调用确认回调
        await confirmationData.onConfirm(userChoice);
        break;
    }
  }
}
```

### 自定义确认对话框

```typescript
async function showConfirmationDialog(
  confirmation: ToolCallConfirmationDetails
): Promise<ToolConfirmationOutcome> {
  switch (confirmation.type) {
    case 'edit':
      console.log(`\n⚠️  ${confirmation.title}`);
      console.log(`File: ${confirmation.fileName}`);
      console.log(`Changes:\n${confirmation.fileDiff}`);
      break;
      
    case 'exec':
      console.log(`\n⚠️  ${confirmation.title}`);
      console.log(`Command: ${confirmation.command}`);
      break;
      
    case 'custom':
      console.log(`\n⚠️  ${confirmation.title}`);
      if (confirmation.customData) {
        console.log(JSON.stringify(confirmation.customData, null, 2));
      }
      break;
  }

  // 获取用户输入（实际实现中可能使用 readline 或 GUI）
  const answer = await getUserInput('Allow this action? (y/n/a for all): ');
  
  switch (answer.toLowerCase()) {
    case 'y':
    case 'yes':
      return ToolConfirmationOutcome.ProceedOnce;
    case 'a':
    case 'all':
      return ToolConfirmationOutcome.ProceedAll;
    default:
      return ToolConfirmationOutcome.Cancel;
  }
}
```

## 工具注册和使用

### 注册工具到 Agent

```typescript
import { StandardAgent } from '@continue-reasoning/mini-agent';

// 创建工具数组
const tools = [
  calculatorTool,
  weatherTool,
  fileWriteTool,
  dangerousTool
];

// 创建 Agent 并注册工具
const agent = new StandardAgent(tools, {
  chatProvider: 'gemini',
  agentConfig: {
    model: 'gemini-2.0-flash',
    workingDirectory: process.cwd(),
    apiKey: process.env.GEMINI_API_KEY
  },
  chatConfig: {
    apiKey: process.env.GEMINI_API_KEY,
    modelName: 'gemini-2.0-flash',
    systemPrompt: 'You are a helpful assistant with access to various tools.'
  },
  toolSchedulerConfig: {
    approvalMode: 'default', // 根据工具的 shouldConfirmExecute 决定
    onToolCallsUpdate: (calls) => {
      console.log(`Pending tool calls: ${calls.length}`);
    }
  }
});
```

### 动态工具管理

```typescript
class DynamicToolManager {
  private tools: Map<string, ITool> = new Map();
  
  registerTool(tool: ITool): void {
    // 验证工具
    this.validateTool(tool);
    
    // 注册工具
    this.tools.set(tool.name, tool);
    console.log(`✅ Registered tool: ${tool.name}`);
  }
  
  unregisterTool(toolName: string): boolean {
    const removed = this.tools.delete(toolName);
    if (removed) {
      console.log(`🗑️  Unregistered tool: ${toolName}`);
    }
    return removed;
  }
  
  getTools(): ITool[] {
    return Array.from(this.tools.values());
  }
  
  getTool(name: string): ITool | undefined {
    return this.tools.get(name);
  }
  
  private validateTool(tool: ITool): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool name is required and must be a string');
    }
    
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name "${tool.name}" already exists`);
    }
    
    if (!tool.schema || !tool.schema.input_schema) {
      throw new Error('Tool schema is required');
    }
    
    // 验证必需的方法
    const requiredMethods = ['validateToolParams', 'getDescription', 'shouldConfirmExecute', 'execute'];
    for (const method of requiredMethods) {
      if (typeof (tool as any)[method] !== 'function') {
        throw new Error(`Tool must implement ${method} method`);
      }
    }
  }
}

// 使用动态工具管理器
const toolManager = new DynamicToolManager();
toolManager.registerTool(calculatorTool);
toolManager.registerTool(weatherTool);

// 创建 Agent 时使用动态工具
const agent = new StandardAgent(toolManager.getTools(), config);
```

## 高级工具模式

### 1. 工具链（Tool Chaining）

```typescript
export const dataProcessingChain: ITool = {
  name: 'process_data_chain',
  description: 'Process data through multiple steps',
  
  async execute(params: any): Promise<ToolResult> {
    const steps = params.steps || [];
    let data = params.initialData;
    const results: string[] = [];
    
    for (const step of steps) {
      switch (step.type) {
        case 'filter':
          data = data.filter(step.condition);
          results.push(`Filtered data: ${data.length} items`);
          break;
          
        case 'transform':
          data = data.map(step.transformer);
          results.push(`Transformed data`);
          break;
          
        case 'aggregate':
          data = this.aggregate(data, step.groupBy, step.aggregator);
          results.push(`Aggregated data`);
          break;
      }
    }
    
    return {
      summary: 'Data processing chain completed',
      llmContent: `Processing steps:\n${results.join('\n')}\nFinal result: ${JSON.stringify(data, null, 2)}`,
      metadata: { finalData: data, steps: results }
    };
  }
};
```

### 2. 条件工具（Conditional Tools）

```typescript
export const conditionalTool: ITool = {
  name: 'conditional_action',
  description: 'Execute different actions based on conditions',
  
  async execute(params: any): Promise<ToolResult> {
    const { condition, trueAction, falseAction } = params;
    
    // 评估条件
    const conditionResult = await this.evaluateCondition(condition);
    
    // 执行相应的动作
    const action = conditionResult ? trueAction : falseAction;
    const result = await this.executeAction(action);
    
    return {
      summary: `Executed ${conditionResult ? 'true' : 'false'} branch`,
      llmContent: `Condition "${condition}" evaluated to ${conditionResult}. Result: ${result}`,
      metadata: { condition, conditionResult, executedAction: action }
    };
  }
};
```

### 3. 批量工具（Batch Tools）

```typescript
export const batchTool: ITool = {
  name: 'batch_processor',
  description: 'Process multiple items in batch',
  
  async execute(params: any, abortSignal?: AbortSignal): Promise<ToolResult> {
    const { items, batchSize = 10, parallel = true } = params;
    const results: any[] = [];
    const errors: any[] = [];
    
    // 分批处理
    for (let i = 0; i < items.length; i += batchSize) {
      if (abortSignal?.aborted) {
        throw new Error('Batch processing aborted');
      }
      
      const batch = items.slice(i, i + batchSize);
      
      if (parallel) {
        // 并行处理
        const batchPromises = batch.map(item => this.processItem(item));
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            errors.push({ item: batch[index], error: result.reason });
          }
        });
      } else {
        // 顺序处理
        for (const item of batch) {
          try {
            const result = await this.processItem(item);
            results.push(result);
          } catch (error) {
            errors.push({ item, error });
          }
        }
      }
    }
    
    return {
      summary: `Processed ${results.length} items, ${errors.length} errors`,
      llmContent: `Batch processing completed:\n- Success: ${results.length}\n- Errors: ${errors.length}`,
      metadata: { 
        results, 
        errors, 
        totalItems: items.length,
        successRate: (results.length / items.length * 100).toFixed(2) + '%'
      }
    };
  }
};
```

## 最佳实践

### 1. 错误处理

```typescript
async execute(params: any, abortSignal?: AbortSignal): Promise<ToolResult> {
  try {
    // 检查中断信号
    if (abortSignal?.aborted) {
      throw new Error('Tool execution was aborted');
    }
    
    // 执行工具逻辑
    const result = await this.performOperation(params);
    
    return {
      summary: 'Operation completed successfully',
      llmContent: result,
      returnDisplay: result
    };
    
  } catch (error: any) {
    // 区分不同类型的错误
    if (error.name === 'AbortError') {
      return {
        summary: 'Operation aborted',
        llmContent: 'The operation was cancelled',
        error: 'Aborted by user'
      };
    }
    
    if (error.code === 'ENOENT') {
      return {
        summary: 'File not found',
        llmContent: `The specified file was not found: ${error.path}`,
        error: 'File not found'
      };
    }
    
    // 通用错误处理
    return {
      summary: 'Operation failed',
      llmContent: `Error: ${error.message}`,
      error: error.message
    };
  }
}
```

### 2. 参数验证

```typescript
validateToolParams(params: any): string | null {
  // 类型检查
  if (typeof params.name !== 'string') {
    return 'Name must be a string';
  }
  
  // 范围检查
  if (params.count && (params.count < 1 || params.count > 100)) {
    return 'Count must be between 1 and 100';
  }
  
  // 格式检查
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (params.email && !emailRegex.test(params.email)) {
    return 'Invalid email format';
  }
  
  // 依赖检查
  if (params.useAdvanced && !params.apiKey) {
    return 'API key is required when using advanced features';
  }
  
  return null;
}
```

### 3. 性能优化

```typescript
// 使用缓存
const cache = new Map<string, any>();

async execute(params: any): Promise<ToolResult> {
  const cacheKey = JSON.stringify(params);
  
  // 检查缓存
  if (cache.has(cacheKey)) {
    const cachedResult = cache.get(cacheKey);
    return {
      ...cachedResult,
      summary: cachedResult.summary + ' (cached)'
    };
  }
  
  // 执行操作
  const result = await this.performExpensiveOperation(params);
  
  // 缓存结果（设置 TTL）
  cache.set(cacheKey, result);
  setTimeout(() => cache.delete(cacheKey), 300000); // 5分钟后过期
  
  return result;
}
```

### 4. 日志记录

```typescript
import { createLogger } from '@continue-reasoning/mini-agent';

const logger = createLogger('MyTool');

async execute(params: any): Promise<ToolResult> {
  const startTime = Date.now();
  logger.info(`Starting tool execution with params:`, params);
  
  try {
    const result = await this.performOperation(params);
    const duration = Date.now() - startTime;
    
    logger.info(`Tool execution completed in ${duration}ms`);
    return result;
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(`Tool execution failed after ${duration}ms:`, error);
    throw error;
  }
}
```

通过遵循这些模式和最佳实践，您可以创建强大、可靠且用户友好的工具，充分发挥 MiniAgent 框架的潜力。