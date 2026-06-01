import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { AiService } from '../ai/AiService';
import type { AiProviderId } from '../ai/types';
import { DEFAULT_BASE_URLS, DEFAULT_MODELS } from '../ai/types';

let activePanel: vscode.WebviewPanel | undefined;

export function openAiSettingsPanel(
  context: vscode.ExtensionContext,
  aiService: AiService,
): void {
  if (activePanel) {
    activePanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'projectPromptProAiSettings',
    'AI 设置 · Project Prompt Pro',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    },
  );

  activePanel = panel;
  panel.webview.html = loadAiSettingsHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage((msg) =>
    void handleAiSettingsMessage(msg, aiService, panel),
  );

  panel.onDidDispose(() => {
    activePanel = undefined;
  });
}

async function handleAiSettingsMessage(
  msg: AiSettingsMessage,
  aiService: AiService,
  panel: vscode.WebviewPanel,
): Promise<void> {
  const post = (payload: unknown) => panel.webview.postMessage(payload);

  try {
    switch (msg.type) {
      case 'ready': {
        const runtime = await aiService.loadRuntimeConfig();
        await post({
          type: 'init',
          provider: runtime.provider,
          baseUrl: runtime.baseUrl,
          model: runtime.model,
          hasApiKey: runtime.hasApiKey,
          defaults: { baseUrls: DEFAULT_BASE_URLS, models: DEFAULT_MODELS },
        });
        break;
      }
      case 'save': {
        const result = await aiService.saveSettings({
          provider: msg.provider,
          baseUrl: msg.baseUrl,
          model: msg.model,
          apiKey: msg.apiKey,
        });
        const runtime = await aiService.loadRuntimeConfig();
        await post({
          type: 'saved',
          hasApiKey: runtime.hasApiKey,
          message: result.message,
        });
        break;
      }
      case 'test': {
        const result = await aiService.testConnection({
          provider: msg.provider,
          baseUrl: msg.baseUrl,
          model: msg.model,
          apiKey: msg.apiKey,
        });
        await post({ type: 'testResult', ...result });
        break;
      }
    }
  } catch (err) {
    await post({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function loadAiSettingsHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  const htmlPath = path.join(extensionUri.fsPath, 'media', 'ai-settings.html');
  if (!fs.existsSync(htmlPath)) {
    return `<!DOCTYPE html><body style="padding:12px;color:#ccc">未找到 ai-settings.html</body></html>`;
  }

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

type AiSettingsMessage =
  | { type: 'ready' }
  | {
      type: 'save';
      provider: AiProviderId;
      baseUrl: string;
      model: string;
      apiKey?: string;
    }
  | {
      type: 'test';
      provider: AiProviderId;
      baseUrl: string;
      model: string;
      apiKey?: string;
    };
