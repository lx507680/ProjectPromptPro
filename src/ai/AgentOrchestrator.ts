import * as vscode from 'vscode';
import { McpToolRegistry } from '../mcp/McpToolRegistry';
import type { McpClientManager } from '../mcp/McpClientManager';
import { extractSuggestedPrompt, parseFinalAnswer, parseToolCall } from '../mcp/parseToolCalls';
import type { ProjectContext } from '../types/ProjectContext';
import type { AiProvider } from './types';
import type { AgentRunResult, AgentToolCallRecord } from './modes/types';

function buildAgentSystemPrompt(toolsDoc: string): string {
  return `你是 Project Prompt Pro 的项目分析 Agent。用户有一个代码仓库和改造需求，你需要通过 MCP 工具分析项目，输出可落地的改造方案。

## 工具调用协议
每次最多调用一个工具。格式：
<tool_call>
{"name": "工具名", "arguments": { ... }}
</tool_call>

等待工具返回后继续分析。信息足够时输出最终答案（不要再调用工具）：
<final_answer>
## 需求理解
（1-3 句）

## 相关文件
- path/to/file — 原因

## 改造步骤
1. 修改 xxx：...
2. ...

## 推荐 Prompt（复制给 Cursor）
（一段可直接粘贴给 AI 编程工具的完整 Prompt，含必要上下文与输出要求）
</final_answer>

## 可用工具
${toolsDoc}

## 分析原则
- 先 get_project_summary / find_related_files 了解全貌，再 read_file 看关键代码
- 改造步骤要具体到文件和操作
- 「推荐 Prompt」必须自包含，即使不看报告也能让 AI 开始编码`;
}

export class AgentOrchestrator {
  constructor(private mcpManager?: McpClientManager) {}

  async run(params: {
    provider: AiProvider;
    workspaceRoot: string;
    userInput: string;
    context: ProjectContext;
    onProgress?: (message: string) => void;
  }): Promise<AgentRunResult> {
    const config = vscode.workspace.getConfiguration('projectPromptPro');
    const maxSteps = config.get<number>('agent.maxSteps', 8);
    const sanitize = config.get<boolean>('sanitizeSecrets', true);

    const registry = new McpToolRegistry(this.mcpManager);
    params.onProgress?.('Agent：连接 MCP 工具…');
    const mcpStatus = await registry.refreshExternalTools();
    if (mcpStatus.connected > 0) {
      params.onProgress?.(`Agent：已连接 ${mcpStatus.connected} 个外部 MCP Server`);
    }
    if (mcpStatus.failed.length > 0) {
      params.onProgress?.(`Agent：${mcpStatus.failed.length} 个 MCP 连接失败（已跳过）`);
    }

    const toolCtx = registry.createContext(params.workspaceRoot, params.context, sanitize);
    const mcpMeta = { connected: mcpStatus.connected, failed: mcpStatus.failed };

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: buildAgentSystemPrompt(registry.formatToolsForPrompt()) },
      {
        role: 'user',
        content: `【用户需求】\n${params.userInput}\n\n请分析该项目并给出改造方案。项目根目录：${params.workspaceRoot}`,
      },
    ];

    const toolCalls: AgentToolCallRecord[] = [];
    let lastAssistantText = '';

    for (let step = 1; step <= maxSteps; step++) {
      params.onProgress?.(`Agent：第 ${step}/${maxSteps} 轮分析…`);

      const assistantText = await params.provider.chat(messages, {
        maxTokens: config.get<number>('agent.maxOutputTokens', 4096),
        temperature: 0.2,
      });
      lastAssistantText = assistantText;
      messages.push({ role: 'assistant', content: assistantText });

      const toolCall = parseToolCall(assistantText);
      if (!toolCall) {
        const final = parseFinalAnswer(assistantText);
        if (final) {
          return this.buildResult(final, step, toolCalls, mcpMeta);
        }
        if (step >= maxSteps) {
          return this.buildResult(
            assistantText.trim() || 'Agent 未产出有效结果',
            step,
            toolCalls,
            mcpMeta,
          );
        }
        messages.push({
          role: 'user',
          content:
            '请使用 <tool_call> 调用工具收集信息，或使用 <final_answer> 输出完整改造方案。',
        });
        continue;
      }

      params.onProgress?.(`Agent：调用工具 ${toolCall.name}…`);
      const toolResult = await registry.execute(toolCall.name, toolCall.arguments, toolCtx);
      toolCalls.push({
        step,
        tool: toolCall.name,
        arguments: toolCall.arguments,
        resultPreview: toolResult.slice(0, 200),
      });

      messages.push({
        role: 'user',
        content: `<tool_result name="${toolCall.name}">\n${toolResult}\n</tool_result>`,
      });
    }

    const fallback = parseFinalAnswer(lastAssistantText) ?? lastAssistantText.trim();
    return this.buildResult(
      fallback || 'Agent 已达到最大步数，请缩小需求范围或增加 agent.maxSteps。',
      maxSteps,
      toolCalls,
      mcpMeta,
    );
  }

  private buildResult(
    report: string,
    stepsUsed: number,
    toolCalls: AgentToolCallRecord[],
    mcp?: { connected: number; failed: string[] },
  ): AgentRunResult {
    const suggestedPrompt = extractSuggestedPrompt(report);
    return {
      report,
      suggestedPrompt: suggestedPrompt || report,
      stepsUsed,
      toolCalls,
      mcpConnected: mcp?.connected,
      mcpFailed: mcp?.failed,
    };
  }
}
