/** 生成模式 */
export type GenerationMode = 'prompt-only' | 'assist' | 'agent';

export interface AssistResult {
  refinedPrompt: string;
  applied: boolean;
  skippedReason?: string;
}

export interface AgentToolCallRecord {
  step: number;
  tool: string;
  arguments: Record<string, unknown>;
  resultPreview: string;
}

export interface AgentRunResult {
  report: string;
  suggestedPrompt: string;
  stepsUsed: number;
  toolCalls: AgentToolCallRecord[];
  mcpConnected?: number;
  mcpFailed?: string[];
}

/** Agent 报告面板数据 */
export interface AgentReportViewModel extends AgentRunResult {
  userInput: string;
  generatedAt: number;
  mcpConnected?: number;
  mcpFailed?: string[];
}

export const GENERATION_MODE_LABELS: Record<GenerationMode, string> = {
  'prompt-only': '仅本地 Prompt',
  assist: 'Assist（LLM 精炼）',
  agent: 'Agent（MCP 多轮分析）',
};
