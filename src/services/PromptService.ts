import * as vscode from 'vscode';
import { AiModeRunner } from '../ai/AiModeRunner';
import type { AgentReportViewModel, AgentRunResult } from '../ai/modes/types';
import type { GenerationMode } from '../ai/modes/types';
import { RelevanceMatcher } from '../matcher/RelevanceMatcher';
import { ClipboardService } from '../integration/ClipboardService';
import { CursorInjector } from '../integration/CursorInjector';
import { ProjectScanner } from '../scanner/ProjectScanner';
import { TemplateEngine } from '../template/TemplateEngine';
import { TemplateRegistry } from '../template/TemplateRegistry';
import { resolveTemplateId } from '../template/TemplateSelector';
import type { RenderOptions } from '../template/types';
import { TokenController } from '../token/TokenController';
import type { ProjectContext } from '../types/ProjectContext';
import { toTemplateRenderContext } from '../types/ProjectContext';
import { PromptHistoryService } from './PromptHistoryService';

export interface GenerateResult {
  prompt: string;
  context: ProjectContext;
  templateId: string;
  resolvedTemplateId: string;
  estimatedTokens: number;
  truncated: boolean;
  autoCopied: boolean;
  generationMode: GenerationMode;
  basePrompt?: string;
  assistApplied?: boolean;
  agentReport?: string;
  agentSteps?: number;
  agentResult?: AgentReportViewModel;
}

export class PromptService {
  private engine = new TemplateEngine();
  private tokenController = new TokenController();
  private relevanceMatcher = new RelevanceMatcher();
  private clipboard = new ClipboardService();
  private cursorInjector = new CursorInjector(this.clipboard);
  private lastPrompt: string | null = null;
  private lastTruncated = false;
  private templateVersion = 0;
  private aiModeRunner?: AiModeRunner;

  constructor(
    private scanner: ProjectScanner,
    private extensionPath: string,
    private history?: PromptHistoryService,
    aiModeRunner?: AiModeRunner,
  ) {
    this.aiModeRunner = aiModeRunner;
  }

  setAiModeRunner(runner: AiModeRunner): void {
    this.aiModeRunner = runner;
  }

  /** 模板热重载回调 */
  invalidateTemplateCache(): void {
    this.templateVersion++;
  }

  getLastPrompt(): string | null {
    return this.lastPrompt;
  }

  wasLastTruncated(): boolean {
    return this.lastTruncated;
  }

  getCachedContext(): ProjectContext | null {
    return this.scanner.getLastContext();
  }

  async ensureScan(workspaceRoot: string, force = false): Promise<ProjectContext> {
    const cached = this.scanner.getLastContext();
    if (!force && cached && cached.meta.rootPath === workspaceRoot) {
      return cached;
    }
    return this.scanner.scan({
      rootPath: workspaceRoot,
      extensionPath: this.extensionPath,
      force,
    });
  }

  async generate(
    workspaceRoot: string,
    options: RenderOptions,
    forceScan = false,
  ): Promise<GenerateResult> {
    const context = await this.ensureScan(workspaceRoot, forceScan);
    const config = vscode.workspace.getConfiguration('projectPromptPro');
    const mode = this.aiModeRunner?.resolveMode(options.generationMode) ?? 'prompt-only';
    await this.aiModeRunner?.requireProvider(mode);

    const resolvedTemplateId = resolveTemplateId(options.templateId, options.userInput);
    const registry = new TemplateRegistry(this.extensionPath, workspaceRoot);
    const template = registry.getTemplateContent(resolvedTemplateId);

    const sanitize = config.get<boolean>('sanitizeSecrets', true);
    const relevance =
      options.userInput.trim().length > 0
        ? this.relevanceMatcher.buildResult(workspaceRoot, options.userInput, context, sanitize)
        : undefined;

    const { vars, flags, lists } = toTemplateRenderContext(context, {
      userInput: options.userInput,
      modelStyle: options.modelStyle,
      relevance,
    });
    let prompt = this.engine.render(template, vars, flags, lists);

    const maxTokens = config.get<number>('maxTokens', TokenController.DEFAULT_MAX_TOKENS);
    const budgetResult = this.tokenController.applyPromptBudget(prompt, maxTokens);
    const basePrompt = budgetResult.text;
    prompt = basePrompt;
    this.lastTruncated = budgetResult.truncated;

    let assistApplied = false;
    let agentReport: string | undefined;
    let agentSteps: number | undefined;
    let agentResult: AgentReportViewModel | undefined;

    if (mode === 'assist' && this.aiModeRunner) {
      const provider = await this.aiModeRunner.getProvider();
      if (provider) {
        const assistResult = await this.aiModeRunner.getAssistService().refine(
          provider,
          prompt,
          options.userInput,
          options.onProgress,
        );
        if (assistResult.applied) {
          prompt = assistResult.refinedPrompt;
          assistApplied = true;
          options.onProgress?.('Assist：精炼完成');
        } else if (assistResult.skippedReason) {
          options.onProgress?.(`Assist：${assistResult.skippedReason}`);
        }
      }
    } else if (mode === 'agent' && this.aiModeRunner) {
      const provider = await this.aiModeRunner.getProvider();
      if (provider) {
        options.onProgress?.('Agent：启动 MCP 多轮分析…');
        const runResult = await this.aiModeRunner.getAgentOrchestrator().run({
          provider,
          workspaceRoot,
          userInput: options.userInput,
          context,
          onProgress: options.onProgress,
        });
        agentReport = runResult.report;
        agentSteps = runResult.stepsUsed;
        agentResult = this.toAgentViewModel(runResult, options.userInput);
        prompt = this.formatAgentOutput(runResult, basePrompt);
        options.onProgress?.(`Agent：完成（${runResult.stepsUsed} 轮，${runResult.toolCalls.length} 次工具调用）`);
      }
    }

    const finalBudget = this.tokenController.applyPromptBudget(prompt, maxTokens);
    prompt = finalBudget.text;
    if (finalBudget.truncated) {
      this.lastTruncated = true;
    }

    this.lastPrompt = prompt;

    await this.history?.rememberUsage(resolvedTemplateId, options.modelStyle);
    await this.history?.addEntry({
      templateId: resolvedTemplateId,
      modelStyle: options.modelStyle,
      userInput: options.userInput,
      promptPreview: prompt,
      estimatedTokens: finalBudget.estimatedTokens,
    });

    let autoCopied = false;
    if (config.get<boolean>('autoCopyOnGenerate', true)) {
      await this.clipboard.copyWithFeedback(prompt, this.lastTruncated);
      autoCopied = true;
    }

    return {
      prompt,
      context,
      templateId: options.templateId,
      resolvedTemplateId,
      estimatedTokens: finalBudget.estimatedTokens,
      truncated: this.lastTruncated,
      autoCopied,
      generationMode: mode,
      basePrompt: mode !== 'prompt-only' ? basePrompt : undefined,
      assistApplied,
      agentReport,
      agentSteps,
      agentResult,
    };
  }

  private toAgentViewModel(run: AgentRunResult, userInput: string): AgentReportViewModel {
    return {
      ...run,
      userInput,
      generatedAt: Date.now(),
    };
  }

  private formatAgentOutput(agentResult: AgentRunResult, fallbackPrompt: string): string {
    const sections = [
      '# Project Prompt Pro · Agent 分析报告',
      '',
      agentResult.report,
      '',
      '---',
      '',
      '## 快速复制区（推荐 Prompt）',
      '',
      agentResult.suggestedPrompt || fallbackPrompt,
    ];
    return sections.join('\n');
  }

  async copyPrompt(text?: string): Promise<void> {
    const content = text ?? this.lastPrompt;
    if (!content) {
      throw new Error('请先生成 Prompt');
    }
    await this.clipboard.copyWithFeedback(content, this.lastTruncated);
  }

  async injectToCursor(text?: string): Promise<void> {
    const content = text ?? this.lastPrompt;
    if (!content) {
      throw new Error('请先生成 Prompt');
    }
    const result = await this.cursorInjector.injectOrCopy(content, this.lastTruncated);
    if (result === 'copied') {
      // already notified
    }
  }

  async openPromptAsMarkdown(text?: string): Promise<void> {
    const content = text ?? this.lastPrompt;
    if (!content) {
      throw new Error('请先生成 Prompt');
    }
    await this.cursorInjector.generateMarkdownFile(content);
  }
}
