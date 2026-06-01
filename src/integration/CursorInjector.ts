import * as vscode from 'vscode';
import { ClipboardService } from './ClipboardService';

const CURSOR_CHAT_COMMANDS = [
  'cursor.chat.setInput',
  'aichat.newchataction',
  'composer.newAgentChat',
  'cursor.chat.open',
  'workbench.action.chat.open',
];

const CURSOR_SET_INPUT = 'cursor.chat.setInput';

/**
 * Cursor / VS Code 聊天集成：多种注入方案 + 降级。
 */
export class CursorInjector {
  constructor(private clipboard: ClipboardService) {}

  async injectOrCopy(prompt: string, truncated: boolean): Promise<'injected' | 'copied' | 'markdown'> {
    await this.clipboard.copy(prompt);

    // 方案 2：打开 Chat 并尝试 setInput
    const injected = await this.injectToCursor(prompt);
    if (injected) {
      void vscode.window.showInformationMessage(
        `Prompt 已注入 Cursor 聊天框${truncated ? ' · 内容已截断' : ''}`,
      );
      return 'injected';
    }

    // 方案 1：复制 + 模拟粘贴（需编辑器焦点）
    const pasted = await this.injectByCommand(prompt);
    if (pasted) {
      void vscode.window.showInformationMessage(
        `Prompt 已复制并尝试粘贴${truncated ? ' · 内容已截断' : ''}`,
      );
      return 'injected';
    }

    // 方案 3：打开聊天面板 + 提示手动粘贴
    for (const cmd of CURSOR_CHAT_COMMANDS) {
      try {
        const available = await vscode.commands.getCommands(true);
        if (available.includes(cmd)) {
          await vscode.commands.executeCommand(cmd);
          void vscode.window.showInformationMessage(
            `Prompt 已复制。请在 Cursor 聊天框中粘贴（Cmd/Ctrl+V）${truncated ? ' · 内容已截断' : ''}`,
          );
          return 'copied';
        }
      } catch {
        // try next
      }
    }

    await this.clipboard.copyWithFeedback(prompt, truncated);
    return 'copied';
  }

  /** 方案 1：剪贴板 + VSCode 粘贴命令 */
  async injectByCommand(content: string): Promise<boolean> {
    try {
      await vscode.env.clipboard.writeText(content);
      const available = await vscode.commands.getCommands(true);
      if (available.includes('editor.action.clipboardPasteAction')) {
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  /** 方案 2：Cursor 内部命令 */
  async injectToCursor(content: string): Promise<boolean> {
    try {
      const available = await vscode.commands.getCommands(true);
      if (available.includes(CURSOR_SET_INPUT)) {
        await vscode.commands.executeCommand('cursor.chat.open');
        await vscode.commands.executeCommand(CURSOR_SET_INPUT, content);
        return true;
      }
      if (available.includes('cursor.chat.open')) {
        await vscode.commands.executeCommand('cursor.chat.open');
        await vscode.env.clipboard.writeText(content);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  /** 方案 3：生成 Markdown 预览文件 */
  async generateMarkdownFile(content: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
      content: `# Generated Prompt\n\n${content}`,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
    void vscode.window.showInformationMessage('Prompt 已写入 Markdown 预览，可手动复制');
  }
}
