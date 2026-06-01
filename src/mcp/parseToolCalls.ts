import type { ParsedToolCall } from './types';

const TOOL_CALL_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i;
const FINAL_ANSWER_RE = /<final_answer>\s*([\s\S]*?)\s*<\/final_answer>/i;

/** 从 Agent 回复中解析工具调用 */
export function parseToolCall(text: string): ParsedToolCall | null {
  const match = text.match(TOOL_CALL_RE);
  if (!match) {
    return null;
  }
  try {
    const parsed = JSON.parse(match[1].trim()) as { name?: string; arguments?: Record<string, unknown> };
    if (!parsed.name || typeof parsed.name !== 'string') {
      return null;
    }
    return {
      name: parsed.name,
      arguments: parsed.arguments ?? {},
    };
  } catch {
    return null;
  }
}

/** 从 Agent 回复中解析最终答案（需包含 <final_answer> 标签） */
export function parseFinalAnswer(text: string): string | null {
  const match = text.match(FINAL_ANSWER_RE);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/** 从最终报告中提取「推荐 Prompt」区块 */
export function extractSuggestedPrompt(report: string): string {
  const markers = [
    /##\s*推荐\s*Prompt[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i,
    /##\s*Recommended\s*Prompt[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i,
    /```prompt\s*\n([\s\S]*?)```/i,
  ];
  for (const re of markers) {
    const m = report.match(re);
    if (m?.[1]?.trim()) {
      return m[1].trim();
    }
  }
  return report;
}
