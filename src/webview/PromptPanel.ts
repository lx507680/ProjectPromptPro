import * as vscode from 'vscode';
import { loadSidebarHtml } from './loadSidebarHtml';
import type { PromptWebviewHandler } from './PromptWebviewHandler';

let activePanel: vscode.WebviewPanel | undefined;

/** 在编辑器区域打开 Webview 面板（Cursor 侧边栏空白时的备用方案） */
export function openPromptPanel(
  context: vscode.ExtensionContext,
  handler: PromptWebviewHandler,
): void {
  if (activePanel) {
    activePanel.reveal(vscode.ViewColumn.One);
    return;
  }

  handler.resetReady();

  const panel = vscode.window.createWebviewPanel(
    'projectPromptProPanel',
    'Project Prompt Pro',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    },
  );

  activePanel = panel;
  panel.webview.html = loadSidebarHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage((msg) =>
    void handler.handleMessage(msg, async (payload) => {
      await panel.webview.postMessage(payload);
    }),
  );

  panel.onDidDispose(() => {
    activePanel = undefined;
    handler.resetReady();
  });
}
