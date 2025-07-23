import { BaseAgent } from "./baseAgent";
import { GeminiChat } from "./chat/geminiChat";
import { OpenAIChatResponse } from "./chat/openaiChat";
import {  CoreToolScheduler } from "./coreToolScheduler";
import { IChatConfig, ITool, AllConfig, IChat } from "./interfaces";
export class StandardAgent extends BaseAgent {
  constructor(
    public tools: ITool[],
    config: AllConfig & { chatProvider?: 'gemini' | 'openai' },
  ) {

    let actualChatConfig: IChatConfig = {
      ...config.chatConfig,
      toolDeclarations: tools.map(tool => tool.schema),
    };
    
    // Select chat implementation based on provider
    let chat: IChat<any>;
    const provider = config.chatProvider || 'gemini'; // Default to gemini for backward compatibility
    
    switch (provider) {
      case 'openai':
        chat = new OpenAIChatResponse(actualChatConfig);
        break;
      case 'gemini':
      default:
        chat = new GeminiChat(actualChatConfig);
        break;
    }
    
    const toolScheduler = new CoreToolScheduler({
      ...config.toolSchedulerConfig,
      tools: tools,
    });
    super(config.agentConfig, chat, toolScheduler);
  }
}