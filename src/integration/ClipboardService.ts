import * as vscode from 'vscode';
import { TokenBudget } from '../token/TokenBudget';

export class ClipboardService {
  private tokenBudget = new TokenBudget();

  async copy(text: string): Promise<{ tokens: number }> {
    await vscode.env.clipboard.writeText(text);
    const tokens = this.tokenBudget.estimate(text);
    return { tokens };
  }

  async copyWithFeedback(text: string, truncated: boolean): Promise<void> {
    const { tokens } = await this.copy(text);
    const truncNote = truncated ? '（已按 Token 预算截断）' : '';
    void vscode.window.showInformationMessage(
      `已复制到剪贴板 · 约 ${tokens} tokens${truncNote}`,
    );
  }
}
