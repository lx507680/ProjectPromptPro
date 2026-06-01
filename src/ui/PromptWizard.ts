import * as vscode from 'vscode';
import { PromptService } from '../services/PromptService';
import { TemplateRegistry } from '../template/TemplateRegistry';
import type { ModelStyle } from '../template/types';
import { MODEL_OPTIONS } from '../template/modelHints';
import { pickWorkspaceFolder } from '../utils/workspace';

/** 原生向导（不依赖 Webview，Cursor / VS Code 均可用） */
export async function runPromptWizard(
  promptService: PromptService,
  extensionPath: string,
): Promise<void> {
  const workspace = await pickWorkspaceFolder();
  if (!workspace) {
    return;
  }
  const { rootPath } = workspace;

  const registry = new TemplateRegistry(extensionPath, rootPath);
  const templates = registry.listTemplates();

  const templatePick = await vscode.window.showQuickPick(
    templates.map((t) => ({
      label: `${t.icon} ${t.name}`,
      description: t.description,
      detail: t.source === 'workspace' ? '工作区模板' : '内置模板',
      id: t.id,
    })),
    {
      title: 'Project Prompt Pro · 选择模板',
      placeHolder: '选择 Prompt 模板',
      ignoreFocusOut: true,
    },
  );
  if (!templatePick) {
    return;
  }

  const modelPick = await vscode.window.showQuickPick(
    MODEL_OPTIONS.map((m) => ({ label: m.label, id: m.id })),
    {
      title: 'Project Prompt Pro · 模型风格',
      placeHolder: '仅影响 Prompt 措辞',
      ignoreFocusOut: true,
    },
  );
  if (!modelPick) {
    return;
  }

  const userInput = await vscode.window.showInputBox({
    title: 'Project Prompt Pro · 你的需求',
    prompt: '描述要实现的功能或要修复的问题',
    placeHolder: '例如：在用户列表页增加按邮箱搜索，复用现有 Controller',
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim() ? null : '请输入需求描述'),
  });
  if (userInput === undefined) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Project Prompt Pro',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: '正在扫描并生成 Prompt…' });

      const result = await promptService.generate(
        rootPath,
        {
          templateId: templatePick.id,
          userInput: userInput.trim(),
          modelStyle: modelPick.id as ModelStyle,
        },
        false,
      );

      if (!result.autoCopied) {
        await promptService.copyPrompt(result.prompt);
      }

      const doc = await vscode.workspace.openTextDocument({
        content: result.prompt,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: false,
      });

      const copyLabel = result.autoCopied ? ' · 已复制到剪贴板' : '';
      const trunc = result.truncated ? '（已按 Token 预算截断）' : '';
      void vscode.window.showInformationMessage(
        `Prompt 已生成 · 约 ${result.estimatedTokens} tokens${copyLabel}${trunc}`,
      );
    },
  );
}
