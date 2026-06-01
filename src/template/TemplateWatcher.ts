import * as vscode from 'vscode';

const TEAM_TEMPLATE_JSON = '.vscode/project-prompt-templates.json';
const WORKSPACE_TEMPLATE_DIR = '.project-prompt-pro/templates';

/**
 * 监听团队 / 工作区模板变化，支持热重载。
 */
export class TemplateWatcher {
  private watchers: vscode.FileSystemWatcher[] = [];

  register(context: vscode.ExtensionContext, onChange: () => void): void {
    this.dispose();

    const teamPattern = `**/${TEAM_TEMPLATE_JSON}`;
    const workspacePattern = `**/${WORKSPACE_TEMPLATE_DIR}/**/*.md`;

    for (const pattern of [teamPattern, workspacePattern]) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const notify = () => onChange();
      watcher.onDidChange(notify);
      watcher.onDidCreate(notify);
      watcher.onDidDelete(notify);
      this.watchers.push(watcher);
      context.subscriptions.push(watcher);
    }
  }

  dispose(): void {
    for (const w of this.watchers) {
      w.dispose();
    }
    this.watchers = [];
  }
}
