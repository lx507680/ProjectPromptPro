import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { AiModeRunner } from '../ai/AiModeRunner';
import type { McpServerConfig } from '../mcp/config';
import { McpConfigLoader } from '../mcp/McpConfigLoader';
import { MCP_SERVERS_KEY, tryUpdateGlobalConfig } from '../utils/settingsPersistence';

let activePanel: vscode.WebviewPanel | undefined;

export function openMcpSettingsPanel(
  context: vscode.ExtensionContext,
  aiModeRunner: AiModeRunner,
): void {
  if (activePanel) {
    activePanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'projectPromptProMcpSettings',
    'MCP Server 设置',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    },
  );

  activePanel = panel;
  panel.webview.html = loadMcpSettingsHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage((msg) =>
    void handleMessage(msg, aiModeRunner, panel, context),
  );

  panel.onDidDispose(() => {
    activePanel = undefined;
  });
}

async function handleMessage(
  msg: McpSettingsMessage,
  aiModeRunner: AiModeRunner,
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
): Promise<void> {
  const post = (payload: unknown) => panel.webview.postMessage(payload);
  const loader = aiModeRunner.getMcpManager().getConfigLoader();

  try {
    switch (msg.type) {
      case 'ready': {
        await postInit(post, loader, context);
        break;
      }
      case 'saveSettings': {
        const servers = JSON.parse(msg.serversJson) as McpServerConfig[];
        await context.globalState.update(MCP_SERVERS_KEY, servers);
        const synced = await tryUpdateGlobalConfig('projectPromptPro.mcp.servers', servers);
        await post({
          type: 'saved',
          message: synced
            ? 'MCP 设置已保存到 VS Code 全局配置'
            : 'MCP 设置已保存到扩展内部存储。Reload Window 后可同步到 settings.json。',
        });
        await postInit(post, loader, context);
        break;
      }
      case 'testServer': {
        const result = await aiModeRunner.getMcpManager().testServer(msg.serverId);
        await post({ type: 'testResult', serverId: msg.serverId, ...result });
        break;
      }
      case 'openWorkspaceMcp': {
        await ensureWorkspaceMcpFile(loader);
        const mcpPath = loader.getWorkspaceMcpPath();
        if (mcpPath) {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(mcpPath));
          await vscode.window.showTextDocument(doc);
        }
        break;
      }
      case 'reload': {
        await postInit(post, loader, context);
        break;
      }
    }
  } catch (err) {
    await post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

async function postInit(
  post: (payload: unknown) => void,
  loader: McpConfigLoader,
  context: vscode.ExtensionContext,
): Promise<void> {
  const all = loader.loadAll();
  const settingsOnly = loader.getSettingsServers();
  const fromState = context.globalState.get<McpServerConfig[]>(MCP_SERVERS_KEY);
  const settingsJson = JSON.stringify(
    fromState?.length ? fromState : settingsOnly,
    null,
    2,
  );

  await post({
    type: 'init',
    servers: all,
    settingsJson,
    workspaceMcpPath: loader.getWorkspaceMcpPath() ?? '',
    globalMcpPath: loader.getGlobalMcpPath() ?? '',
    sampleJson: SAMPLE_MCP_JSON,
  });
}

async function ensureWorkspaceMcpFile(loader: McpConfigLoader): Promise<void> {
  const existing = loader.getWorkspaceMcpPath();
  if (existing) {
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('请先打开工作区文件夹');
  }
  const dir = path.join(folder.uri.fsPath, '.vscode');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'mcp.json');
  fs.writeFileSync(filePath, SAMPLE_MCP_JSON, 'utf-8');
}

const SAMPLE_MCP_JSON = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/your/project"]
    }
  }
}`;

function loadMcpSettingsHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  const htmlPath = path.join(extensionUri.fsPath, 'media', 'mcp-settings.html');
  return fs
    .readFileSync(htmlPath, 'utf-8')
    .replace(/\{\{CSP\}\}/g, csp)
    .replace(/\{\{NONCE\}\}/g, nonce);
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

type McpSettingsMessage =
  | { type: 'ready' }
  | { type: 'reload' }
  | { type: 'saveSettings'; serversJson: string }
  | { type: 'testServer'; serverId: string }
  | { type: 'openWorkspaceMcp' };
