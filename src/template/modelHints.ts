import type { ModelStyle } from './types';

const HINTS: Record<ModelStyle, string> = {
  default: '',
  gpt: '请使用清晰的 Markdown 小节组织回答；代码块标注语言与完整文件路径。',
  claude: '请用结构化 XML 标签（如 <analysis>、<code>）分段输出；代码需完整可运行。',
  deepseek: '请先简要分析再给出代码；推理步骤保持简洁，最终代码须可直接运行。',
};

export function getModelHint(style: ModelStyle): string {
  return HINTS[style] ?? '';
}

export const MODEL_OPTIONS: Array<{ id: ModelStyle; label: string }> = [
  { id: 'default', label: '通用（自动适配）' },
  { id: 'gpt', label: 'GPT（长上下文）' },
  { id: 'claude', label: 'Claude Opus（代码强）' },
  { id: 'deepseek', label: 'DeepSeek R1（结构化）' },
];
