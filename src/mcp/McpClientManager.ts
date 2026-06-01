import * as vscode from 'vscode';
import type { McpServerConfig } from './config';
import { externalToolName } from './config';
import { McpConfigLoader } from './McpConfigLoader';
import { McpHttpClient } from './McpHttpClient';
import { McpStdioClient, type McpToolDefinition } from './McpStdioClient';

type McpClient = McpStdioClient | McpHttpClient;

export interface ExternalMcpToolMeta {
  registeredName: string;
  serverId: string;
  serverName: string;
  toolName: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export class McpClientManager {
  private loader: McpConfigLoader;
  private clients = new Map<string, McpClient>();
  private externalTools: ExternalMcpToolMeta[] = [];

  constructor(context?: vscode.ExtensionContext) {
    this.loader = new McpConfigLoader(context);
  }

  getConfigLoader(): McpConfigLoader {
    return this.loader;
  }

  listConfiguredServers(): McpServerConfig[] {
    return this.loader.loadAll();
  }

  getExternalTools(): ExternalMcpToolMeta[] {
    return [...this.externalTools];
  }

  /** 连接所有已启用的外部 MCP Server 并刷新工具列表 */
  async connectAll(): Promise<{ connected: number; failed: string[] }> {
    this.disconnectAll();
    const enabled = this.loader.loadEnabled();
    const failed: string[] = [];
    let connected = 0;

    for (const cfg of enabled) {
      try {
        const client = this.createClient(cfg);
        await client.connect();
        const tools = await client.listTools();
        this.clients.set(cfg.id, client);
        for (const tool of tools) {
          this.externalTools.push(this.toExternalMeta(cfg, tool));
        }
        connected++;
      } catch (err) {
        failed.push(`${cfg.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { connected, failed };
  }

  async testServer(serverId: string): Promise<{ ok: boolean; message: string; toolCount?: number }> {
    const cfg = this.loader.loadAll().find((s) => s.id === serverId);
    if (!cfg) {
      return { ok: false, message: `未找到 Server: ${serverId}` };
    }
    const client = this.createClient(cfg);
    try {
      const result = await client.testConnection();
      client.dispose();
      return result;
    } catch (err) {
      client.dispose();
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async callExternalTool(
    registeredName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const meta = this.externalTools.find((t) => t.registeredName === registeredName);
    if (!meta) {
      return JSON.stringify({ error: `未注册的外部工具: ${registeredName}` });
    }
    const client = this.clients.get(meta.serverId);
    if (!client) {
      return JSON.stringify({ error: `MCP Server "${meta.serverId}" 未连接` });
    }
    return client.callTool(meta.toolName, args);
  }

  disconnectAll(): void {
    for (const client of this.clients.values()) {
      client.dispose();
    }
    this.clients.clear();
    this.externalTools = [];
  }

  private createClient(cfg: McpServerConfig): McpClient {
    if (cfg.transport === 'http') {
      return new McpHttpClient(cfg);
    }
    return new McpStdioClient(cfg);
  }

  private toExternalMeta(cfg: McpServerConfig, tool: McpToolDefinition): ExternalMcpToolMeta {
    return {
      registeredName: externalToolName(cfg.id, tool.name),
      serverId: cfg.id,
      serverName: cfg.name,
      toolName: tool.name,
      description: tool.description ?? `外部 MCP 工具 (${cfg.name})`,
      inputSchema: tool.inputSchema,
    };
  }
}
