import * as path from 'path';
import * as vscode from 'vscode';

export interface WorkspacePickResult {
  folder: vscode.WorkspaceFolder;
  rootPath: string;
}

/**
 * 获取当前应扫描的工作区根目录。
 * - 无工作区：提示并返回 undefined
 * - 多根工作区：让用户选择
 * - 仅打开单文件：提示打开所在文件夹
 */
export async function pickWorkspaceFolder(): Promise<WorkspacePickResult | undefined> {
  const folders = vscode.workspace.workspaceFolders;

  if (!folders || folders.length === 0) {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.fsPath) {
      const dir = path.dirname(editor.document.uri.fsPath);
      const openFolder = '打开当前文件所在文件夹';
      const cancel = '取消';
      const choice = await vscode.window.showWarningMessage(
        `当前未打开「文件夹工作区」，插件无法扫描整个项目。\n文件位置：${dir}`,
        openFolder,
        cancel,
      );
      if (choice === openFolder) {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dir));
      }
    } else {
      void vscode.window.showWarningMessage(
        '请使用菜单「文件 → 打开文件夹」打开项目根目录（不要只打开单个文件）。',
      );
    }
    return undefined;
  }

  if (folders.length === 1) {
    return { folder: folders[0], rootPath: folders[0].uri.fsPath };
  }

  const picked = await vscode.window.showQuickPick(
    folders.map((f) => ({
      label: f.name,
      description: f.uri.fsPath,
      folder: f,
    })),
    {
      title: 'Project Prompt Pro · 选择要扫描的项目',
      placeHolder: '当前工作区包含多个根目录',
    },
  );

  if (!picked) {
    return undefined;
  }

  return { folder: picked.folder, rootPath: picked.folder.uri.fsPath };
}

/** 同步获取单工作区；多根时返回第一个并带说明 */
export function getWorkspaceFolderSync(): WorkspacePickResult | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return { folder: folders[0], rootPath: folders[0].uri.fsPath };
}

export function formatWorkspaceHint(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return '未打开文件夹工作区';
  }
  if (folders.length === 1) {
    return `当前项目：${folders[0].name}`;
  }
  return `当前工作区：${folders.length} 个根目录（${folders.map((f) => f.name).join('、')}）`;
}
