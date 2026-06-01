import * as vscode from 'vscode';
import type { CacheService } from '../cache/CacheService';

const DEBOUNCE_MS = 500;

/**
 * 监听工作区文件变更，防抖后使扫描缓存失效。
 */
export class ScanWatcher {
  private watchers: vscode.FileSystemWatcher[] = [];
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private cacheService: CacheService,
    private onInvalidated?: (workspaceRoot: string) => void,
  ) {}

  register(context: vscode.ExtensionContext): void {
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const root = folder.uri.fsPath;
      const pattern = new vscode.RelativePattern(folder, '**/*');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      const schedule = () => this.scheduleInvalidate(root);
      watcher.onDidCreate(schedule);
      watcher.onDidChange(schedule);
      watcher.onDidDelete(schedule);

      this.watchers.push(watcher);
      context.subscriptions.push(watcher);
    }
  }

  dispose(): void {
    for (const t of this.timers.values()) {
      clearTimeout(t);
    }
    this.timers.clear();
    this.watchers = [];
  }

  private scheduleInvalidate(workspaceRoot: string): void {
    const existing = this.timers.get(workspaceRoot);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.timers.delete(workspaceRoot);
      void this.cacheService.invalidate(workspaceRoot);
      this.onInvalidated?.(workspaceRoot);
    }, DEBOUNCE_MS);

    this.timers.set(workspaceRoot, timer);
  }
}
