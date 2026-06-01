import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { McpServerConfig } from './config';
import { parseMcpServersJson } from './config';
import { MCP_SERVERS_KEY } from '../utils/settingsPersistence';

export class McpConfigLoader {
  constructor(private context?: vscode.ExtensionContext) {}

  loadAll(): McpServerConfig[] {
    const map = new Map<string, McpServerConfig>();
    for (const s of this.loadFromSettings()) {
      map.set(s.id, s);
    }
    for (const s of this.loadFromJsonFile(this.getWorkspaceMcpPath(), 'workspace')) {
      if (!map.has(s.id)) {
        map.set(s.id, s);
      }
    }
    for (const s of this.loadFromJsonFile(this.getGlobalMcpPath(), 'global')) {
      if (!map.has(s.id)) {
        map.set(s.id, s);
      }
    }
    return [...map.values()];
  }

  loadEnabled(): McpServerConfig[] {
    return this.loadAll().filter((s) => s.enabled);
  }

  getWorkspaceMcpPath(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    const vscodePath = path.join(folder.uri.fsPath, '.vscode', 'mcp.json');
    if (fs.existsSync(vscodePath)) {
      return vscodePath;
    }
    const rootPath = path.join(folder.uri.fsPath, 'mcp.json');
    return fs.existsSync(rootPath) ? rootPath : undefined;
  }

  getGlobalMcpPath(): string | undefined {
    const home = os.homedir();
    const candidates = [
      path.join(home, '.cursor', 'mcp.json'),
      path.join(home, '.config', 'cursor', 'mcp.json'),
    ];
    return candidates.find((p) => fs.existsSync(p));
  }

  parseServersJson(raw: string, source: McpServerConfig['source']): McpServerConfig[] {
    return parseMcpServersJson(raw, source);
  }

  /** 供 MCP 设置面板展示/编辑的 VS Code 设置项 */
  getSettingsServers(): McpServerConfig[] {
    return this.loadFromSettings();
  }

  private loadFromSettings(): McpServerConfig[] {
    const fromState = this.context?.globalState.get<McpServerConfig[]>(MCP_SERVERS_KEY);
    if (fromState && fromState.length > 0) {
      return fromState.map((s) => normalizeServer(s, 'settings'));
    }

    const root = vscode.workspace.getConfiguration().get<McpServerConfig[]>('projectPromptPro.mcp.servers');
    if (root?.length) {
      return root.map((s) => normalizeServer(s, 'settings'));
    }

    const config = vscode.workspace.getConfiguration('projectPromptPro');
    const servers = config.get<McpServerConfig[]>('mcp.servers', []);
    return servers.map((s) => normalizeServer(s, 'settings'));
  }

  private loadFromJsonFile(
    filePath: string | undefined,
    source: McpServerConfig['source'],
  ): McpServerConfig[] {
    if (!filePath) {
      return [];
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return parseMcpServersJson(raw, source);
    } catch {
      return [];
    }
  }
}

function normalizeServer(s: McpServerConfig, source: McpServerConfig['source']): McpServerConfig {
  return {
    ...s,
    id: s.id || s.name,
    name: s.name || s.id,
    enabled: s.enabled !== false,
    source,
  };
}
