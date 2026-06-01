import * as vscode from 'vscode';
import { TemplateRegistry } from '../template/TemplateRegistry';
import { AUTO_TEMPLATE_META } from '../template/TemplateSelector';
import type { ModelStyle } from '../template/types';
import type { GenerationMode } from '../ai/modes/types';
import { GENERATION_MODE_LABELS } from '../ai/modes/types';
import type { ProjectContext } from '../types/ProjectContext';
import type { WebviewDeps } from './webviewDeps';
import { getLastAgentReport } from './AgentReportPanel';

/** 侧边栏 / 面板 Webview 共用消息处理 */
export class PromptWebviewHandler {
  private webviewReady = false;
  private pending: unknown[] = [];

  constructor(private deps: WebviewDeps) {}

  resetReady(): void {
    this.webviewReady = false;
    this.pending = [];
  }

  markReady(): unknown[] {
    this.webviewReady = true;
    const queue = [...this.pending];
    this.pending = [];
    return queue;
  }

  async handleMessage(
    msg: WebviewMessage,
    post: (payload: unknown) => void | Promise<void>,
  ): Promise<void> {
    if (msg.type === 'ready') {
      const queued = this.markReady();
      if (!(await this.deps.ensureReady())) {
        await post({
          type: 'error',
          message: '扩展仍在初始化，请稍候或执行 Developer: Reload Window',
        });
        return;
      }
      await this.postInit(post);
      for (const p of queued) {
        await post(p);
      }
      await this.postCachedScanIfAny(post);
      return;
    }

    if (!(await this.deps.ensureReady())) {
      await post({ type: 'error', message: '扩展尚未就绪，请稍后再试' });
      return;
    }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      await post({ type: 'error', message: '请先打开一个工作区文件夹。' });
      return;
    }
    const workspaceRoot = folder.uri.fsPath;
    const promptService = this.deps.getPromptService()!;

    try {
      switch (msg.type) {
        case 'rescan': {
          const ctx = await promptService.ensureScan(workspaceRoot, true);
          await this.postScanResult(post, ctx, true);
          break;
        }
        case 'generate':
          await this.runGenerate(workspaceRoot, msg, false, post);
          break;
        case 'preview': {
          const existing = promptService.getCachedContext();
          if (existing && existing.meta.rootPath === workspaceRoot) {
            await this.runGenerate(workspaceRoot, msg, false, post);
          }
          break;
        }
        case 'copy':
          await promptService.copyPrompt();
          await post({ type: 'copied' });
          break;
        case 'inject':
          await promptService.injectToCursor();
          await post({ type: 'copied' });
          break;
        case 'openAgentReport': {
          const report = getLastAgentReport();
          if (!report) {
            await post({ type: 'error', message: '暂无 Agent 报告，请先用 Agent 模式生成' });
          } else {
            this.deps.openAgentReport?.(report);
          }
          break;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await post({ type: 'error', message });
    }
  }

  /** 扩展完成异步初始化后，刷新 Webview 状态 */
  async refreshInit(post: (payload: unknown) => void | Promise<void>): Promise<void> {
    if (!(await this.deps.ensureReady())) {
      return;
    }
    await this.postInit(post);
    await this.postCachedScanIfAny(post);
  }

  async postInit(post: (payload: unknown) => void | Promise<void>): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const registry = new TemplateRegistry(this.deps.getExtensionPath(), folder?.uri.fsPath);
    const config = vscode.workspace.getConfiguration('projectPromptPro');
    const history = this.deps.getHistory();
    const autoSelect = config.get<boolean>('autoSelectTemplate', true);
    const lastTemplate = history?.getLastTemplateId();
    const lastModel = history?.getLastModelStyle();
    const defaultTemplateId = autoSelect
      ? 'auto'
      : (lastTemplate ?? config.get<string>('defaultTemplate', 'feature'));
    const templates = registry.listTemplates();
    if (autoSelect) {
      templates.unshift(AUTO_TEMPLATE_META);
    }
    await this.safePost(post, {
      type: 'init',
      templates,
      defaultTemplateId,
      defaultModelStyle: lastModel ?? config.get<string>('defaultModelStyle', 'default'),
      defaultGenerationMode: config.get<GenerationMode>('generationMode', 'prompt-only'),
      maxTokens: config.get<number>('maxTokens', 50000),
      autoCopyOnGenerate: config.get<boolean>('autoCopyOnGenerate', true),
      statusText: folder ? '输入需求后点击「生成 Prompt」' : '请先打开工作区文件夹',
    });
  }

  async postScanResult(
    post: (payload: unknown) => void | Promise<void>,
    ctx: ProjectContext,
    autoPreview: boolean,
  ): Promise<void> {
    await this.safePost(post, {
      type: 'scanResult',
      scan: this.serializeScan(ctx),
      statusText: this.formatScanStatus(ctx),
      maxTokens: vscode.workspace.getConfiguration('projectPromptPro').get<number>('maxTokens', 50000),
      autoPreview,
    });
  }

  private async postCachedScanIfAny(
    post: (payload: unknown) => void | Promise<void>,
  ): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const cached = this.deps.getPromptService()?.getCachedContext();
    if (folder && cached && cached.meta.rootPath === folder.uri.fsPath) {
      await post({
        type: 'scanResult',
        scan: this.serializeScan(cached),
        statusText: `缓存上下文 · ${cached.techStack}`,
        maxTokens: vscode.workspace.getConfiguration('projectPromptPro').get<number>('maxTokens', 50000),
        autoPreview: false,
      });
    }
  }

  private async runGenerate(
    workspaceRoot: string,
    msg: TemplateMessage,
    forceScan: boolean,
    post: (payload: unknown) => void | Promise<void>,
  ): Promise<void> {
    const promptService = this.deps.getPromptService()!;
    const isPreview = msg.type === 'preview';
    const generationMode: GenerationMode | undefined = isPreview
      ? 'prompt-only'
      : (msg.generationMode as GenerationMode | undefined);

    const result = await promptService.generate(
      workspaceRoot,
      {
        templateId: msg.templateId,
        userInput: msg.userInput,
        modelStyle: msg.modelStyle as ModelStyle,
        generationMode,
        onProgress: isPreview
          ? undefined
          : async (progressMsg) => {
              await this.safePost(post, { type: 'progress', message: progressMsg });
            },
      },
      forceScan,
    );

    if (isPreview) {
      await this.safePost(post, {
        type: 'promptReady',
        text: result.prompt,
        estimatedTokens: result.estimatedTokens,
        truncated: result.truncated,
        autoCopied: false,
        resolvedTemplateId: result.resolvedTemplateId,
        maxTokens: vscode.workspace.getConfiguration('projectPromptPro').get<number>('maxTokens', 50000),
        statusText: `预览 · ~${result.estimatedTokens} tokens`,
        preview: true,
      });
      return;
    }

    const registry = new TemplateRegistry(this.deps.getExtensionPath(), workspaceRoot);
    const templateMeta = registry.listTemplates().find((t) => t.id === result.resolvedTemplateId);
    const sourceLabel = templateMeta?.source === 'workspace' ? '工作区模板' : '内置模板';
    const templateLabel =
      result.templateId === 'auto'
        ? `自动→${result.resolvedTemplateId}`
        : result.resolvedTemplateId;
    const modeLabel =
      result.generationMode !== 'prompt-only'
        ? ` · ${GENERATION_MODE_LABELS[result.generationMode]}`
        : result.assistApplied
          ? ' · Assist'
          : '';
    const agentLabel =
      result.generationMode === 'agent' && result.agentSteps
        ? ` · ${result.agentSteps} 轮`
        : '';
    const cacheLabel = result.context.meta.cached ? ' · 缓存命中' : '';
    const truncLabel = result.truncated ? ' · 已截断' : '';
    const copyLabel = result.autoCopied ? ' · 已复制' : '';

    await this.safePost(post, {
      type: 'promptReady',
      text: result.prompt,
      estimatedTokens: result.estimatedTokens,
      truncated: result.truncated,
      autoCopied: result.autoCopied,
      resolvedTemplateId: result.resolvedTemplateId,
      generationMode: result.generationMode,
      assistApplied: result.assistApplied,
      agentSteps: result.agentSteps,
      hasAgentReport: !!result.agentResult,
      maxTokens: vscode.workspace.getConfiguration('projectPromptPro').get<number>('maxTokens', 50000),
      statusText: `已生成（${templateLabel} · ${sourceLabel}${modeLabel}${agentLabel}）· ~${result.estimatedTokens} tokens${cacheLabel}${truncLabel}${copyLabel}`,
    });

    if (result.agentResult) {
      const openPanel = vscode.workspace
        .getConfiguration('projectPromptPro')
        .get<boolean>('agent.openReportPanel', true);
      if (openPanel) {
        this.deps.openAgentReport?.(result.agentResult);
      }
    }
  }

  private async safePost(
    post: (payload: unknown) => void | Promise<void>,
    payload: unknown,
  ): Promise<void> {
    if (this.webviewReady) {
      await post(payload);
    } else {
      this.pending.push(payload);
    }
  }

  private formatScanStatus(ctx: ProjectContext): string {
    const cache = ctx.meta.cached ? '缓存' : `${ctx.meta.durationMs}ms`;
    const snippets = ctx.snippets.length > 0 ? ` · ${ctx.snippets.length} 片段` : '';
    return `已扫描 ${ctx.meta.fileCount} 文件（${cache}）· ${ctx.techStack}${snippets}`;
  }

  private serializeScan(ctx: ProjectContext) {
    return {
      fileCount: ctx.meta.fileCount,
      techStack: ctx.techStack,
      scannedAt: ctx.meta.scannedAt,
      durationMs: ctx.meta.durationMs,
      cached: ctx.meta.cached ?? false,
      estimatedContextTokens: ctx.meta.estimatedContextTokens,
      snippetCount: ctx.snippets.length,
    };
  }
}

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'rescan' }
  | { type: 'copy' }
  | { type: 'inject' }
  | { type: 'openAgentReport' }
  | TemplateMessage
  | PreviewMessage;

export interface TemplateMessage {
  type: 'generate' | 'preview';
  templateId: string;
  userInput: string;
  modelStyle: string;
  generationMode?: string;
  forceScan?: boolean;
}

export interface PreviewMessage extends TemplateMessage {
  type: 'preview';
}
