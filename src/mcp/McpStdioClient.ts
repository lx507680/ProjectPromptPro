import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import type { McpServerConfig } from './config';

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number;
  result?: unknown;
  error?: { message?: string; code?: number };
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

const REQUEST_TIMEOUT_MS = 45_000;

/** MCP JSON-RPC over stdio（换行分隔） */
export class McpStdioClient {
  private proc?: ChildProcessWithoutNullStreams;
  private buffer = '';
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private initialized = false;

  constructor(private config: McpServerConfig) {}

  get serverId(): string {
    return this.config.id;
  }

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new Error(`MCP Server "${this.config.id}" 缺少 command`);
    }
    this.proc = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...this.config.env },
      cwd: this.config.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.on('error', (err) => this.rejectAll(err));
    this.proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        this.rejectAll(new Error(`MCP 进程退出 code=${code}`));
      }
    });
    this.proc.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk.toString()));
    this.proc.stderr.on('data', () => {
      // stderr 日志忽略，避免干扰 JSON-RPC
    });

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'project-prompt-pro', version: '1.3.0' },
    });
    this.notify('notifications/initialized', {});
    this.initialized = true;
  }

  async listTools(): Promise<McpToolDefinition[]> {
    this.ensureConnected();
    const result = (await this.request('tools/list', {})) as { tools?: McpToolDefinition[] };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    this.ensureConnected();
    const result = (await this.request('tools/call', { name, arguments: args })) as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    if (result.isError) {
      return JSON.stringify({ error: formatMcpContent(result.content) });
    }
    return formatMcpContent(result.content) || JSON.stringify(result);
  }

  async testConnection(): Promise<{ ok: boolean; message: string; toolCount?: number }> {
    try {
      await this.connect();
      const tools = await this.listTools();
      return { ok: true, message: `已连接，${tools.length} 个工具`, toolCount: tools.length };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  dispose(): void {
    this.proc?.kill();
    this.proc = undefined;
    this.initialized = false;
    this.rejectAll(new Error('MCP 连接已关闭'));
  }

  private ensureConnected(): void {
    if (!this.initialized || !this.proc) {
      throw new Error(`MCP Server "${this.config.id}" 未连接`);
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP 请求超时: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  private send(message: object): void {
    if (!this.proc?.stdin.writable) {
      throw new Error('MCP stdin 不可写');
    }
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (!line) {
        continue;
      }
      try {
        this.handleMessage(JSON.parse(line) as JsonRpcResponse);
      } catch {
        // 忽略非 JSON 行
      }
    }
  }

  private handleMessage(msg: JsonRpcResponse): void {
    if (msg.id === undefined) {
      return;
    }
    const pending = this.pending.get(msg.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(msg.id);
    if (msg.error) {
      pending.reject(new Error(msg.error.message ?? `MCP error ${msg.error.code ?? ''}`));
      return;
    }
    pending.resolve(msg.result);
  }

  private rejectAll(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}

function formatMcpContent(content?: Array<{ type?: string; text?: string }>): string {
  if (!content?.length) {
    return '';
  }
  return content
    .map((c) => c.text ?? '')
    .filter(Boolean)
    .join('\n');
}
