import * as vscode from 'vscode';
import type { AiProvider } from './types';
import type { AssistResult } from './modes/types';
import { TokenBudget } from '../token/TokenBudget';

const ASSIST_SYSTEM = `你是 Prompt 精炼助手。任务：将冗长的「项目上下文 Prompt」压缩为精准、可执行的版本。

必须保留：
- 技术栈与关键规范
- 与用户需求直接相关的文件路径与代码片段
- 用户的原始需求描述
- 明确的输出格式要求（文件路径 + 完整代码）

必须删除或压缩：
- 无关依赖列表
- 冗余的完整目录树
- 重复或可推断的信息

输出要求：
- 只输出精炼后的 Prompt 正文
- 不要加解释、前言或 markdown 代码块包裹
- 使用中文，结构清晰（Context / Objective / Response 等小节）`;

export class AssistService {
  private tokenBudget = new TokenBudget();

  async refine(
    provider: AiProvider,
    rawPrompt: string,
    userInput: string,
    onProgress?: (message: string) => void,
  ): Promise<AssistResult> {
    const config = vscode.workspace.getConfiguration('projectPromptPro');
    const minTokens = config.get<number>('assist.minTokensToRefine', 2500);
    const maxOutput = config.get<number>('assist.maxOutputTokens', 4096);
    const estimated = this.tokenBudget.estimate(rawPrompt);

    if (estimated < minTokens) {
      return {
        refinedPrompt: rawPrompt,
        applied: false,
        skippedReason: `Prompt 约 ${estimated} tokens，低于精炼阈值 ${minTokens}`,
      };
    }

    onProgress?.('Assist：正在调用 LLM 精炼 Prompt…');

    const userMessage = `【用户需求】
${userInput}

【待精炼的原始 Prompt】（约 ${estimated} tokens）
${rawPrompt}`;

    const refined = await provider.chat(
      [
        { role: 'system', content: ASSIST_SYSTEM },
        { role: 'user', content: userMessage },
      ],
      { maxTokens: maxOutput, temperature: 0.15 },
    );

    const cleaned = stripCodeFences(refined.trim());
    if (!cleaned || cleaned.length < 80) {
      return {
        refinedPrompt: rawPrompt,
        applied: false,
        skippedReason: 'LLM 返回内容过短，保留原始 Prompt',
      };
    }

    return { refinedPrompt: cleaned, applied: true };
  }
}

function stripCodeFences(text: string): string {
  const fenceMatch = text.match(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```\s*$/);
  return fenceMatch ? fenceMatch[1].trim() : text;
}
