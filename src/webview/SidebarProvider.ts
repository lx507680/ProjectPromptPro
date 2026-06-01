import * as vscode from 'vscode';
import type { ProjectContext } from '../types/ProjectContext';
import { loadSidebarHtml } from './loadSidebarHtml';
import { PromptWebviewHandler } from './PromptWebviewHandler';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'project-prompt-pro.sidebar';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly handler: PromptWebviewHandler,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    this.handler.resetReady();

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    this.applyHtml(webviewView);

    webviewView.webview.onDidReceiveMessage((msg) =>
      void this.handler.handleMessage(msg, async (payload) => this.postMessage(payload)),
    );
  }

  /** 异步初始化完成后刷新 Webview（若用户已打开侧边栏） */
  async notifyServicesReady(): Promise<void> {
    if (!this.view) {
      return;
    }
    await this.handler.refreshInit((payload) => this.postMessage(payload));
  }

  private applyHtml(webviewView: vscode.WebviewView): void {
    try {
      webviewView.webview.html = loadSidebarHtml(webviewView.webview, this.extensionUri);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      webviewView.webview.html = `<!DOCTYPE html><body style="padding:12px;color:#f88;background:#252526;font-family:sans-serif">
        <h3>界面加载失败</h3><p>${msg}</p>
        <p>请执行命令：<b>生成项目 Prompt</b></p>
      </body></html>`;
    }
  }

  async refreshAfterScan(context: ProjectContext): Promise<void> {
    if (!this.view) {
      return;
    }
    await this.handler.postScanResult((p) => this.postMessage(p), context, true);
  }

  async showGeneratedPrompt(text: string, estimatedTokens: number): Promise<void> {
    if (!this.view) {
      await vscode.commands.executeCommand('workbench.view.extension.project-prompt-pro');
      return;
    }
    const maxTokens = vscode.workspace
      .getConfiguration('projectPromptPro')
      .get<number>('maxTokens', 50000);
    await this.postMessage({
      type: 'promptReady',
      text,
      estimatedTokens,
      truncated: false,
      maxTokens,
      statusText: `已生成 · ~${estimatedTokens} tokens · 已复制到剪贴板`,
    });
  }

  private async postMessage(payload: unknown): Promise<void> {
    if (!this.view) {
      return;
    }
    await this.view.webview.postMessage(payload);
  }
}
