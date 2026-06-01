import * as vscode from 'vscode';
import { McpClientManager } from '../mcp/McpClientManager';
import type { GenerationMode } from './modes/types';
import { AssistService } from './AssistService';
import { AgentOrchestrator } from './AgentOrchestrator';
import type { AiService } from './AiService';

export class AiModeRunner {
  private assist = new AssistService();
  private mcpManager: McpClientManager;
  private agent: AgentOrchestrator;

  constructor(
    private aiService: AiService,
    context?: vscode.ExtensionContext,
  ) {
    this.mcpManager = new McpClientManager(context);
    this.agent = new AgentOrchestrator(this.mcpManager);
  }

  async requireProvider(mode: GenerationMode): Promise<void> {
    if (mode === 'prompt-only') {
      return;
    }
    const runtime = await this.aiService.loadRuntimeConfig();
    if (runtime.provider === 'none') {
      throw new Error('请先在「AI Provider 设置」中配置 Provider（Assist / Agent 模式需要）');
    }
    if (!runtime.hasApiKey) {
      throw new Error('请先配置 API Key（命令：AI Provider 设置）');
    }
  }

  resolveMode(explicit?: GenerationMode): GenerationMode {
    if (explicit) {
      return explicit;
    }
    return vscode.workspace
      .getConfiguration('projectPromptPro')
      .get<GenerationMode>('generationMode', 'prompt-only');
  }

  getAssistService(): AssistService {
    return this.assist;
  }

  getAgentOrchestrator(): AgentOrchestrator {
    return this.agent;
  }

  getMcpManager(): McpClientManager {
    return this.mcpManager;
  }

  async getProvider() {
    return this.aiService.getProvider();
  }
}
