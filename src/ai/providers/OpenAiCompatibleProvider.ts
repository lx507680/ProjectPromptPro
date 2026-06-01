import type { AiChatOptions, AiConnectionResult, AiMessage, AiProvider, AiProviderId } from '../types';

/** OpenAI 兼容 API（DeepSeek / OpenAI / 自定义网关） */
export class OpenAiCompatibleProvider implements AiProvider {
  constructor(
    readonly id: AiProviderId,
    readonly name: string,
    private baseUrl: string,
    private apiKey: string,
    private model: string,
  ) {}

  async testConnection(): Promise<AiConnectionResult> {
    const start = Date.now();
    try {
      await this.chat([{ role: 'user', content: 'ping' }], { maxTokens: 8, temperature: 0 });
      return {
        ok: true,
        message: `${this.name} 连接成功`,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      };
    }
  }

  async chat(messages: AiMessage[], options: AiChatOptions = {}): Promise<string> {
    if (!this.apiKey.trim()) {
      throw new Error('未配置 API Key');
    }

    const url = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.2,
        stream: false,
      }),
    });

    const body = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (!response.ok) {
      throw new Error(body.error?.message ?? `HTTP ${response.status}`);
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('API 返回空内容');
    }
    return content;
  }
}

export class DeepSeekProvider extends OpenAiCompatibleProvider {
  constructor(apiKey: string, model: string, baseUrl: string) {
    super('deepseek', 'DeepSeek', baseUrl, apiKey, model);
  }
}
