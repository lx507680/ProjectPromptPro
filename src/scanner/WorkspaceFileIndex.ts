import fg from 'fast-glob';
import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_EXCLUDES } from './constants';

export interface WalkOptions {
  rootPath: string;
  maxFiles: number;
  extraExcludes?: string[];
}

export interface WalkResult {
  files: string[];
  truncated: boolean;
  source: 'vscode' | 'fast-glob';
}

/**
 * 工作区文件索引：优先 vscode.workspace.findFiles，降级 fast-glob。
 * 比递归 readdir 快 3-5 倍，并统一 ignore 规则。
 */
export class WorkspaceFileIndex {
  async walk(options: WalkOptions): Promise<WalkResult> {
    const excludes = [...DEFAULT_EXCLUDES, ...(options.extraExcludes ?? [])];
    const vscodeResult = await this.tryVsCodeWalk(options, excludes);
    if (vscodeResult) {
      return vscodeResult;
    }
    return this.walkWithFastGlob(options, excludes);
  }

  /** 批量搜索配置文件（fast-glob 专用） */
  async findConfigFiles(rootPath: string, patterns: string[]): Promise<string[]> {
    const entries = await fg(patterns, {
      cwd: rootPath,
      absolute: false,
      onlyFiles: true,
      dot: false,
      ignore: DEFAULT_EXCLUDES,
    });
    return entries.map((e) => e.replace(/\\/g, '/'));
  }

  private async tryVsCodeWalk(
    options: WalkOptions,
    excludes: string[],
  ): Promise<WalkResult | null> {
    const folder = vscode.workspace.workspaceFolders?.find(
      (f) => f.uri.fsPath === options.rootPath,
    );
    if (!folder) {
      return null;
    }

    try {
      const excludeGlob = `{${excludes.join(',')}}`;
      const pattern = new vscode.RelativePattern(folder, '**/*');
      const uris = await vscode.workspace.findFiles(
        pattern,
        excludeGlob,
        options.maxFiles,
      );
      const files = uris
        .map((u) => path.relative(options.rootPath, u.fsPath).replace(/\\/g, '/'))
        .filter(Boolean)
        .sort();

      return {
        files,
        truncated: files.length >= options.maxFiles,
        source: 'vscode',
      };
    } catch {
      return null;
    }
  }

  private async walkWithFastGlob(
    options: WalkOptions,
    excludes: string[],
  ): Promise<WalkResult> {
    const entries = await fg('**/*', {
      cwd: options.rootPath,
      absolute: false,
      onlyFiles: true,
      dot: false,
      ignore: excludes,
    });

    const truncated = entries.length > options.maxFiles;
    const files = entries
      .slice(0, options.maxFiles)
      .map((e) => e.replace(/\\/g, '/'))
      .sort();

    return { files, truncated, source: 'fast-glob' };
  }
}
