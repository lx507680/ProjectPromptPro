import type { ProjectContext } from '../types/ProjectContext';
import { TokenBudget } from './TokenBudget';

export interface SmartTruncateResult {
  context: ProjectContext;
  truncated: boolean;
  estimatedTokens: number;
}

/**
 * Token 控制器：DeepSeek 64K 上下文，默认预留 14K 给 AI 输出。
 * 截断策略（按优先级）：
 * 1. 截断目录树（保留深度 <= 3）
 * 2. 截断代码示例（只保留第一个片段）
 * 3. 删除非核心依赖（devDependencies）
 */
export class TokenController {
  static readonly DEFAULT_MAX_TOKENS = 50000;

  private tokenBudget = new TokenBudget();

  smartTruncate(context: ProjectContext, maxTokens = TokenController.DEFAULT_MAX_TOKENS): SmartTruncateResult {
    let ctx: ProjectContext = { ...context, deps: [...context.deps], snippets: [...context.snippets] };
    let truncated = false;

    let current = this.estimateContext(ctx);
    if (current <= maxTokens) {
      return { context: ctx, truncated: false, estimatedTokens: current };
    }

    // 1. 截断目录树深度
    const shallowTree = this.limitTreeDepth(ctx.structure, 3);
    if (shallowTree !== ctx.structure) {
      ctx = { ...ctx, structure: shallowTree };
      truncated = true;
      current = this.estimateContext(ctx);
      if (current <= maxTokens) {
        return this.finalize(ctx, truncated, maxTokens);
      }
    }

    // 2. 截断代码示例：只保留第一个
    if (ctx.snippets.length > 1) {
      ctx = { ...ctx, snippets: ctx.snippets.slice(0, 1) };
      truncated = true;
    }
    if (ctx.snippets.length === 1) {
      const first = ctx.snippets[0];
      const snippetBudget = Math.floor(maxTokens * 0.12);
      const trimmed = this.tokenBudget.truncateFileContent(first.summary, snippetBudget);
      ctx = {
        ...ctx,
        snippets: [{ ...first, summary: trimmed }],
      };
      truncated = true;
      current = this.estimateContext(ctx);
      if (current <= maxTokens) {
        return this.finalize(ctx, truncated, maxTokens);
      }
    }

    // 3. 删除 devDependencies
    const coreDeps = ctx.deps.filter((d) => d.scope !== 'devDependencies');
    if (coreDeps.length < ctx.deps.length) {
      ctx = { ...ctx, deps: coreDeps };
      truncated = true;
      current = this.estimateContext(ctx);
      if (current <= maxTokens) {
        return this.finalize(ctx, truncated, maxTokens);
      }
    }

    // 4. 最终：按字符截断结构树
    const structureBudget = Math.floor(maxTokens * 0.3);
    const treeResult = this.tokenBudget.truncateText(ctx.structure, structureBudget);
    ctx = { ...ctx, structure: treeResult.text };
    truncated = true;

    return this.finalize(ctx, truncated, maxTokens);
  }

  /** 对最终 Prompt 应用预算 */
  applyPromptBudget(prompt: string, maxTokens: number) {
    return this.tokenBudget.applyToPrompt(prompt, maxTokens);
  }

  estimateContext(context: ProjectContext): number {
    const payload = {
      techStack: context.techStack,
      deps: context.deps,
      structure: context.structure,
      snippets: context.snippets.map((s) => s.summary),
      codeStyle: context.codeStyle,
      apiStyle: context.apiStyle,
    };
    return this.estimateTokens(payload);
  }

  /** 粗略估算：JSON 字符数 / 2 */
  estimateTokens(obj: unknown): number {
    const jsonStr = JSON.stringify(obj);
    return Math.ceil(jsonStr.length / 2);
  }

  private finalize(
    ctx: ProjectContext,
    truncated: boolean,
    maxTokens: number,
  ): SmartTruncateResult {
    const estimated = this.estimateContext(ctx);
    return {
      context: {
        ...ctx,
        meta: {
          ...ctx.meta,
          estimatedContextTokens: Math.min(estimated, maxTokens),
        },
      },
      truncated,
      estimatedTokens: Math.min(estimated, maxTokens),
    };
  }

  /** 将目录树文本限制到指定深度（按 ├── 前缀层级） */
  private limitTreeDepth(tree: string, maxDepth: number): string {
    const lines = tree.split('\n');
    const kept: string[] = [];
    let truncatedMarker = false;

    for (const line of lines) {
      const depth = this.treeLineDepth(line);
      if (depth <= maxDepth) {
        kept.push(line);
      } else if (!truncatedMarker) {
        kept.push(`${'│   '.repeat(maxDepth)}└── …（已截断更深层级）`);
        truncatedMarker = true;
      }
    }

    return kept.join('\n');
  }

  private treeLineDepth(line: string): number {
    const prefix = line.match(/^([│├└─\s]*)/)?.[1] ?? '';
    const segments = prefix.split('│').length - 1 + (prefix.includes('├──') || prefix.includes('└──') ? 1 : 0);
    return Math.max(0, segments);
  }
}
