import type { McpServerConfig } from './config';
import type { McpToolDefinition } from './McpStdioClient';

/** MCP JSON-RPC over HTTP POST（适用于暴露 HTTP 端点的 MCP Server） */
export class McpHttpClient {
  private nextId = 1;
  private sessionInitialized = false;

  constructor(private config: McpServerConfig) {}

  get serverId(): string {
    return this.config.id;
  }

  async connect(): Promise<void> {
    if (!this.config.url) {
      throw new Error(`MCP Server "${this.config.id}" 缺少 url`);
    }
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'project-prompt-pro', version: '1.3.0' },
    });
    await this.request('notifications/initialized', {});
    this.sessionInitialized = true;
  }

  async listTools(): Promise<McpToolDefinition[]> {
    this.ensureConnected();
    const result = (await this.request('tools/list', {})) as { tools?: McpToolDefinition[] };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    this.ensureConnected();
    const result = (await this.request('tools/call', { name, arguments: args })) as {
      content?: Array<{ text?: string }>;
      isError?: boolean;
    };
    if (result.isError) {
      return JSON.stringify({ error: result.content?.map((c) => c.text).join('\n') });
    }
    return result.content?.map((c) => c.text ?? '').join('\n') || JSON.stringify(result);
  }

  async testConnection(): Promise<{ ok: boolean; message: string; toolCount?: number }> {
    try {
      await this.connect();
      const tools = await this.listTools();
      return { ok: true, message: `HTTP MCP 已连接，${tools.length} 个工具`, toolCount: tools.length };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  dispose(): void {
    this.sessionInitialized = false;
  }

  private ensureConnected(): void {
    if (!this.sessionInitialized) {
      throw new Error(`MCP Server "${this.config.id}" 未连接`);
    }
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const body = { jsonrpc: '2.0', id, method, params };
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.config.headers ?? {}),
    };
    const response = await fetch(this.config.url!, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const parsed = JSON.parse(text) as {
      result?: unknown;
      error?: { message?: string };
    };
    if (parsed.error) {
      throw new Error(parsed.error.message ?? 'MCP HTTP 错误');
    }
    return parsed.result;
  }
}
