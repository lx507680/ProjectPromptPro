import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function loadSidebarHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  const htmlPath = path.join(extensionUri.fsPath, 'media', 'sidebar.html');
  if (fs.existsSync(htmlPath)) {
    return fs
      .readFileSync(htmlPath, 'utf-8')
      .replace(/\{\{CSP\}\}/g, csp)
      .replace(/\{\{NONCE\}\}/g, nonce);
  }

  return getFallbackHtml(csp, nonce);
}

function getFallbackHtml(csp: string, nonce: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" /></head>
<body style="padding:12px;font-family:sans-serif;color:#ccc;background:#252526">
<h3>Project Prompt Pro</h3>
<p>未找到 media/sidebar.html，请重新安装扩展。</p>
<p>可先用命令面板：<b>Project Prompt Pro: Generate Prompt</b></p>
<script nonce="${nonce}">try{acquireVsCodeApi().postMessage({type:'ready'})}catch(e){}</script>
</body></html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
