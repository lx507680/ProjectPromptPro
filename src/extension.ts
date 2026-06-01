import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CacheService } from './cache/CacheService';
import { AiService } from './ai/AiService';
import { AiModeRunner } from './ai/AiModeRunner';
import type { GenerationMode } from './ai/modes/types';
import type { ModelStyle } from './template/types';
import { PromptService } from './services/PromptService';
import { PromptHistoryService } from './services/PromptHistoryService';
import { ProjectScanner } from './scanner/ProjectScanner';
import { ScanWatcher } from './scanner/ScanWatcher';
import { TemplateRegistry } from './template/TemplateRegistry';
import { TemplateWatcher } from './template/TemplateWatcher';
import { runPromptWizard } from './ui/PromptWizard';
import { openPromptPanel } from './webview/PromptPanel';
import { openAiSettingsPanel } from './webview/AiSettingsPanel';
import { openAgentReportPanel, openLastAgentReport } from './webview/AgentReportPanel';
import { openMcpSettingsPanel } from './webview/McpSettingsPanel';
import { PromptWebviewHandler } from './webview/PromptWebviewHandler';
import { SidebarProvider } from './webview/SidebarProvider';
import type { WebviewDeps } from './webview/webviewDeps';
import { getWorkspaceFolderSync, pickWorkspaceFolder } from './utils/workspace';

const OUTPUT_CHANNEL_NAME = 'Project Prompt Pro';

let outputChannel: vscode.OutputChannel;
let scanner: ProjectScanner;
let promptService: PromptService;
let historyService: PromptHistoryService;
let aiService: AiService;
let aiModeRunner: AiModeRunner;
let cacheService: CacheService;
let extensionPath: string;
let webviewHandler: PromptWebviewHandler;
let sidebarProvider: SidebarProvider;
let webviewDeps: WebviewDeps;
let vscodeContext: vscode.ExtensionContext;
let initError: string | undefined;

export function activate(context: vscode.ExtensionContext): void {
  vscodeContext = context;
  extensionPath = context.extensionPath;

  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('正在激活 Project Prompt Pro…');

  // 命令必须最先注册，避免 Webview 初始化失败导致命令不可用
  registerCommands(context);
  outputChannel.appendLine('命令已注册');

  webviewDeps = {
    getPromptService: () => promptService,
    getExtensionPath: () => extensionPath,
    getHistory: () => historyService,
    ensureReady: ensureServicesReady,
    openAgentReport: (report) => openAgentReportPanel(vscodeContext, report),
  };
  webviewHandler = new PromptWebviewHandler(webviewDeps);

  try {
    sidebarProvider = new SidebarProvider(context.extensionUri, webviewHandler);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
    );
    outputChannel.appendLine('侧边栏 Webview 已注册');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`⚠️ 侧边栏 Webview 注册失败: ${msg}`);
    void vscode.window.showWarningMessage(
      `Project Prompt Pro 侧边栏加载失败，请使用命令面板「生成项目 Prompt」。${msg}`,
    );
  }

  void initializeExtension(context);
}

export function deactivate(): void {
  // subscriptions 由 context 自动 dispose
}

async function initializeExtension(context: vscode.ExtensionContext): Promise<void> {
  try {
    historyService = new PromptHistoryService(context);
    aiService = new AiService(context);
    aiModeRunner = new AiModeRunner(aiService, context);
    cacheService = new CacheService(context);
    scanner = new ProjectScanner(cacheService);
    promptService = new PromptService(scanner, extensionPath, historyService, aiModeRunner);

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    statusBar.text = '$(sparkle) 生成项目 Prompt';
    statusBar.tooltip = 'Project Prompt Pro：扫描项目并生成结构化 Prompt';
    statusBar.command = 'project-prompt-pro.generateProjectPrompt';
    statusBar.show();
    context.subscriptions.push(statusBar);

    const scanWatcher = new ScanWatcher(cacheService, (root) => {
      outputChannel.appendLine(`[缓存失效] ${root}`);
    });
    scanWatcher.register(context);
    context.subscriptions.push({ dispose: () => scanWatcher.dispose() });

    const templateWatcher = new TemplateWatcher();
    templateWatcher.register(context, () => {
      promptService.invalidateTemplateCache();
      outputChannel.appendLine('[模板] 检测到变更，已热重载');
    });
    context.subscriptions.push({ dispose: () => templateWatcher.dispose() });

    initError = undefined;
    outputChannel.appendLine(`✅ 已激活 @ ${extensionPath}`);
    outputChannel.appendLine(
      `工作区：${getWorkspaceFolderSync()?.folder.name ?? '（未打开文件夹）'}`,
    );

    await sidebarProvider.notifyServicesReady();
    void warmCacheOnActivate();
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`❌ 初始化失败: ${initError}`);
    void vscode.window.showErrorMessage(`Project Prompt Pro 初始化失败：${initError}`);
  }
}

async function ensureServicesReady(): Promise<boolean> {
  if (promptService) {
    return true;
  }
  if (initError) {
    void vscode.window.showErrorMessage(`Project Prompt Pro 初始化失败：${initError}`);
    return false;
  }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (promptService) {
      return true;
    }
    if (initError) {
      void vscode.window.showErrorMessage(`Project Prompt Pro 初始化失败：${initError}`);
      return false;
    }
  }
  void vscode.window.showWarningMessage('扩展仍在加载，请稍后再试或 Reload Window');
  return false;
}

function registerCommands(context: vscode.ExtensionContext): void {
  const run = (name: string, fn: () => void | Promise<void>, needsService = true) => {
    return vscode.commands.registerCommand(name, () => {
      outputChannel.appendLine(`[命令] ${name}`);
      void (async () => {
        if (needsService && !(await ensureServicesReady())) {
          return;
        }
        try {
          await fn();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          outputChannel.appendLine(`[错误] ${message}`);
          void vscode.window.showErrorMessage(`Project Prompt Pro：${message}`);
        }
      })();
    });
  };

  context.subscriptions.push(
    run('project-prompt-pro.generateProjectPrompt', () => runPrimaryFlow()),
    run('project-prompt-pro.rescan', () => runRescan(false)),
    run('project-prompt-pro.showContext', () => runRescan(true)),
    run('project-prompt-pro.generate', () => runPrimaryFlow()),
    run('project-prompt-pro.openSidebar', () => focusSidebar()),
    run('project-prompt-pro.openPromptWindow', () => runPromptWizard(promptService, extensionPath)),
    run('project-prompt-pro.openWizard', () => runPromptWizard(promptService, extensionPath)),
    run('project-prompt-pro.openPromptWebview', () => openPromptPanel(vscodeContext, webviewHandler)),
    run('project-prompt-pro.reloadWebview', () => reloadSidebar(), false),
    run('project-prompt-pro.copyPrompt', () => copyLastPrompt()),
    run('project-prompt-pro.injectCursor', () => injectToCursor()),
    run('project-prompt-pro.openTemplateFolder', () => openTemplateFolder()),
    run('project-prompt-pro.openTeamTemplates', () => openTeamTemplates()),
    run('project-prompt-pro.showHistory', () => showHistory()),
    run('project-prompt-pro.clearCache', () => clearCache()),
    run('project-prompt-pro.openAiSettings', () => openAiSettingsPanel(vscodeContext, aiService)),
    run('project-prompt-pro.openMcpSettings', () => openMcpSettingsPanel(vscodeContext, aiModeRunner)),
    run('project-prompt-pro.openAgentReport', () => openLastAgentReport(vscodeContext)),
  );
}

/** 主流程：打开侧边栏 → 输入大白话需求 → 扫描并生成 → 复制 */
async function runPrimaryFlow(): Promise<void> {
  const workspace = await pickWorkspaceFolder();
  if (!workspace) {
    return;
  }

  await focusSidebar();

  const config = vscode.workspace.getConfiguration('projectPromptPro');
  const autoSelect = config.get<boolean>('autoSelectTemplate', true);
  const lastTemplate = historyService?.getLastTemplateId();
  const defaultTemplate = autoSelect
    ? 'auto'
    : (lastTemplate ?? config.get<string>('defaultTemplate', 'feature'));

  const userInput = await vscode.window.showInputBox({
    title: '生成项目 Prompt',
    prompt: '用一句话描述你的需求（大白话即可）',
    placeHolder: '例如：用户登录接口加一个短信验证码',
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
      const generationMode = config.get<GenerationMode>('generationMode', 'prompt-only');

      const result = await promptService.generate(
        workspace.rootPath,
        {
          templateId: defaultTemplate,
          userInput: userInput.trim(),
          modelStyle:
            historyService?.getLastModelStyle() ??
            config.get<ModelStyle>('defaultModelStyle', 'default'),
          generationMode,
          onProgress: (msg) => progress.report({ message: msg }),
        },
        false,
      );

      const templateLabel =
        result.templateId === 'auto'
          ? `自动 → ${result.resolvedTemplateId}`
          : result.resolvedTemplateId;
      const modeLabel =
        result.generationMode === 'assist'
          ? ' · Assist 精炼'
          : result.generationMode === 'agent'
            ? ` · Agent ${result.agentSteps ?? 0} 轮`
            : '';
      const copyLabel = result.autoCopied ? ' · 已复制到剪贴板' : '';
      const trunc = result.truncated ? '（已按 Token 预算截断）' : '';
      if (result.agentResult && config.get<boolean>('agent.openReportPanel', true)) {
        openAgentReportPanel(vscodeContext, result.agentResult);
      }

      const choice = await vscode.window.showInformationMessage(
        `Prompt 已生成 · 模板 ${templateLabel}${modeLabel} · 约 ${result.estimatedTokens} tokens${copyLabel}${trunc ? ' ' + trunc : ''}`,
        ...(result.agentResult ? ['查看 Agent 报告'] : []),
        '在侧边栏预览',
        '注入 Cursor',
        ...(result.autoCopied ? [] : ['复制']),
      );

      if (choice === '查看 Agent 报告' && result.agentResult) {
        openAgentReportPanel(vscodeContext, result.agentResult);
      } else if (choice === '复制') {
        await promptService.copyPrompt(result.prompt);
      } else if (choice === '注入 Cursor') {
        await promptService.injectToCursor(result.prompt);
      } else if (choice === '在侧边栏预览') {
        await sidebarProvider?.showGeneratedPrompt(result.prompt, result.estimatedTokens);
      }
    },
  );
}

async function warmCacheOnActivate(): Promise<void> {
  const workspace = getWorkspaceFolderSync();
  if (!workspace) {
    return;
  }
  try {
    await promptService.ensureScan(workspace.rootPath, false);
    outputChannel.appendLine(`预热扫描完成：${workspace.folder.name}`);
  } catch {
    // ignore
  }
}

async function focusSidebar(): Promise<void> {
  await vscode.commands.executeCommand('workbench.view.extension.project-prompt-pro');
}

async function reloadSidebar(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.reloadWindow');
}

async function copyLastPrompt(): Promise<void> {
  await promptService.copyPrompt();
}

async function injectToCursor(): Promise<void> {
  await promptService.injectToCursor();
}

async function clearCache(): Promise<void> {
  const workspace = await pickWorkspaceFolder();
  if (!workspace) {
    return;
  }
  await cacheService.invalidate(workspace.rootPath);
  void vscode.window.showInformationMessage('扫描缓存已清除');
}

async function openTemplateFolder(): Promise<void> {
  const workspace = await pickWorkspaceFolder();
  if (!workspace) {
    return;
  }

  const registry = new TemplateRegistry(extensionPath, workspace.rootPath);
  const dir = registry.ensureWorkspaceTemplateDir();
  if (!dir) {
    return;
  }

  const samplePath = vscode.Uri.file(`${dir}/feature.md`);
  if (!fs.existsSync(samplePath.fsPath)) {
    fs.writeFileSync(samplePath.fsPath, registry.getTemplateContent('feature') + '\n', 'utf-8');
  }

  const doc = await vscode.workspace.openTextDocument(samplePath);
  await vscode.window.showTextDocument(doc);
}

async function openTeamTemplates(): Promise<void> {
  const workspace = await pickWorkspaceFolder();
  if (!workspace) {
    return;
  }

  const registry = new TemplateRegistry(extensionPath, workspace.rootPath);
  const jsonPath = registry.getTeamTemplateJsonPath();
  if (!jsonPath) {
    return;
  }

  const vscodeDir = path.dirname(jsonPath);
  fs.mkdirSync(vscodeDir, { recursive: true });

  if (!fs.existsSync(jsonPath)) {
    const sample = {
      version: 1,
      templates: {
        feature:
          '【系统角色】团队定制模板\n\n【用户需求】\n{{userInput}}\n\n技术栈：{{techStack}}\n目录：{{directoryTree}}',
      },
    };
    fs.writeFileSync(jsonPath, JSON.stringify(sample, null, 2), 'utf-8');
  }

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(jsonPath));
  await vscode.window.showTextDocument(doc);
}

async function showHistory(): Promise<void> {
  const items = historyService?.getHistory() ?? [];
  if (items.length === 0) {
    void vscode.window.showInformationMessage('暂无历史 Prompt');
    return;
  }

  const pick = await vscode.window.showQuickPick(
    items.map((h) => ({
      label: h.userInput.slice(0, 60) || '（空需求）',
      description: `${h.templateId} · ~${h.estimatedTokens} tokens`,
      detail: new Date(h.createdAt).toLocaleString(),
      entry: h,
    })),
    { title: 'Prompt 历史（最近 20 条）', placeHolder: '选择一条以复制预览' },
  );
  if (!pick) {
    return;
  }

  const doc = await vscode.workspace.openTextDocument({
    content: pick.entry.promptPreview,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc);
  await promptService.copyPrompt(pick.entry.promptPreview);
}

async function runRescan(openDocument: boolean): Promise<void> {
  const workspace = await pickWorkspaceFolder();
  if (!workspace) {
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: '扫描项目…' },
    async () => {
      const ctx = await promptService.ensureScan(workspace.rootPath, true);
      outputChannel.appendLine(formatScanSummary(ctx));
      void vscode.window.showInformationMessage(
        `扫描完成：${ctx.meta.fileCount} 文件 · ${ctx.techStack}`,
      );

      if (openDocument) {
        const doc = await vscode.workspace.openTextDocument({
          content: JSON.stringify(ctx, null, 2),
          language: 'json',
        });
        await vscode.window.showTextDocument(doc);
      }

      await sidebarProvider?.refreshAfterScan(ctx);
    },
  );
}

function formatScanSummary(ctx: import('./types/ProjectContext').ProjectContext): string {
  return `扫描: ${ctx.meta.fileCount} 文件, ${ctx.techStack}`;
}
