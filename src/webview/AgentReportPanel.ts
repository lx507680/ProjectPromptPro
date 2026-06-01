import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { AgentReportViewModel } from '../ai/modes/types';

let activePanel: vscode.WebviewPanel | undefined;
let lastReport: AgentReportViewModel | undefined;

export function setLastAgentReport(report: AgentReportViewModel): void {
  lastReport = report;
}

export function getLastAgentReport(): AgentReportViewModel | undefined {
  return lastReport;
}

export function openAgentReportPanel(
  context: vscode.ExtensionContext,
  report: AgentReportViewModel,
): void {
  setLastAgentReport(report);

  if (activePanel) {
    activePanel.reveal(vscode.ViewColumn.Beside);
    activePanel.webview.html = renderAgentReportHtml(activePanel.webview, context.extensionUri, report);
    activePanel.title = 'Agent 分析报告';
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'projectPromptProAgentReport',
    'Agent 分析报告',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    },
  );

  activePanel = panel;
  panel.webview.html = renderAgentReportHtml(panel.webview, context.extensionUri, report);

  panel.webview.onDidReceiveMessage((msg) => {
    if (msg.type === 'copyReport') {
      void vscode.env.clipboard.writeText(report.report);
      void vscode.window.showInformationMessage('已复制完整报告');
    } else if (msg.type === 'copyPrompt') {
      void vscode.env.clipboard.writeText(report.suggestedPrompt);
      void vscode.window.showInformationMessage('已复制推荐 Prompt');
    } else if (msg.type === 'openMarkdown') {
      void openAsEditorDocument(formatFullMarkdown(report));
    }
  });

  panel.onDidDispose(() => {
    activePanel = undefined;
  });
}

export async function openLastAgentReport(context: vscode.ExtensionContext): Promise<void> {
  if (!lastReport) {
    throw new Error('暂无 Agent 报告，请先用 Agent 模式生成');
  }
  openAgentReportPanel(context, lastReport);
}

async function openAsEditorDocument(content: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
  await vscode.commands.executeCommand('markdown.showPreviewToSide');
}

function formatFullMarkdown(report: AgentReportViewModel): string {
  const toolSection =
    report.toolCalls.length > 0
      ? `\n\n## 工具调用记录\n\n${report.toolCalls
          .map(
            (t) =>
              `- Step ${t.step}: \`${t.tool}\` ${JSON.stringify(t.arguments).slice(0, 80)}`,
          )
          .join('\n')}`
      : '';

  return [
    '# Agent 分析报告',
    '',
    `> 需求：${report.userInput}`,
    `> 生成时间：${new Date(report.generatedAt).toLocaleString()} · ${report.stepsUsed} 轮`,
    '',
    report.report,
    '',
    '---',
    '',
    '## 推荐 Prompt（复制给 Cursor）',
    '',
    report.suggestedPrompt,
    toolSection,
  ].join('\n');
}

function renderAgentReportHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  report: AgentReportViewModel,
): string {
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  const htmlPath = path.join(extensionUri.fsPath, 'media', 'agent-report.html');
  if (!fs.existsSync(htmlPath)) {
    return `<!DOCTYPE html><body style="padding:12px;color:#ccc">未找到 agent-report.html</body></html>`;
  }

  const mcpInfo =
    report.mcpConnected !== undefined
      ? `外部 MCP：${report.mcpConnected} 已连接${report.mcpFailed?.length ? `，${report.mcpFailed.length} 失败` : ''}`
      : '';

  return fs
    .readFileSync(htmlPath, 'utf-8')
    .replace(/\{\{CSP\}\}/g, csp)
    .replace(/\{\{NONCE\}\}/g, nonce)
    .replace(/\{\{REPORT_HTML\}\}/g, markdownToSimpleHtml(report.report))
    .replace(/\{\{PROMPT_ESCAPED\}\}/g, escapeHtml(report.suggestedPrompt))
    .replace(/\{\{USER_INPUT\}\}/g, escapeHtml(report.userInput))
    .replace(/\{\{META\}\}/g, escapeHtml(`${report.stepsUsed} 轮 · ${report.toolCalls.length} 次工具调用 · ${mcpInfo}`))
    .replace(
      /\{\{TOOL_CALLS\}\}/g,
      report.toolCalls.length
        ? report.toolCalls
            .map(
              (t) =>
                `<li><code>${escapeHtml(t.tool)}</code> <span class="muted">${escapeHtml(JSON.stringify(t.arguments).slice(0, 60))}</span></li>`,
            )
            .join('')
        : '<li class="muted">无</li>',
    );
}

function markdownToSimpleHtml(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (line.startsWith('## ')) {
      html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith('- ')) {
      html.push(`<li>${escapeHtml(line.slice(2))}</li>`);
    } else if (/^\d+\.\s/.test(line)) {
      html.push(`<li>${escapeHtml(line.replace(/^\d+\.\s/, ''))}</li>`);
    } else if (line.trim()) {
      html.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  if (inCode && codeBuf.length) {
    html.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  }
  return html.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
