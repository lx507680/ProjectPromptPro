export type AiProviderId = 'none' | 'deepseek' | 'openai' | 'anthropic' | 'custom';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface AiConnectionResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

/** AI Provider 统一接口（为 Agent 模式预留） */
export interface AiProvider {
  readonly id: AiProviderId;
  readonly name: string;
  testConnection(): Promise<AiConnectionResult>;
  chat(messages: AiMessage[], options?: AiChatOptions): Promise<string>;
}

export interface AiRuntimeConfig {
  provider: AiProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const DEFAULT_MODELS: Record<AiProviderId, string> = {
  none: '',
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-20241022',
  custom: 'gpt-4o-mini',
};

export const DEFAULT_BASE_URLS: Record<AiProviderId, string> = {
  none: '',
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  custom: 'https://api.openai.com/v1',
};
