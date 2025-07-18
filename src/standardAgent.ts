import { BaseAgent } from "./baseAgent";
import { GeminiChat } from "./geminiChat";
import {  CoreToolScheduler } from "./coreToolScheduler";
import { IChatConfig, ITool, AllConfig } from "./interfaces";
export class StandardAgent extends BaseAgent {
  constructor(
    public tools: ITool[],
    config: AllConfig,
  ) {

    let actualChatConfig: IChatConfig = {
      ...config.chatConfig,
      toolDeclarations: tools.map(tool => tool.schema),
    };
    const chat = new GeminiChat(actualChatConfig);
    const toolScheduler = new CoreToolScheduler({
      ...config.toolSchedulerConfig,
      tools: tools,
    });
    super(config.agentConfig, chat, toolScheduler);
  }
}