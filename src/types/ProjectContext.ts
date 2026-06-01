import type { RelevanceResult } from '../matcher/RelevanceMatcher';
import { getModelHint } from '../template/modelHints';
import type { ModelStyle, TemplateRenderContext, TemplateVars } from '../template/types';
import { TokenBudget } from '../token/TokenBudget';

/** 依赖项 */
export interface DependencyInfo {
  name: string;
  version: string;
  scope: 'dependencies' | 'devDependencies' | 'peerDependencies';
}

/** 架构层提示 */
export interface ArchitectureHint {
  layer: string;
  paths: string[];
  confidence: 'high' | 'medium' | 'low';
}

/** 文件引用 */
export interface FileRef {
  path: string;
  role: 'entry' | 'router' | 'config' | 'api' | 'other';
}

/** 代码片段（W3 将接入 Token 截断） */
export interface CodeSnippet {
  path: string;
  summary: string;
  lineCount: number;
}

/** 扫描元信息 */
export interface ScanMeta {
  rootPath: string;
  scannedAt: number;
  fileCount: number;
  durationMs: number;
  gitBranch?: string;
  gitHead?: string;
  /** 是否命中 workspaceState 缓存 */
  cached?: boolean;
  /** 增量：本次变更文件数 */
  changedFileCount?: number;
  estimatedContextTokens?: number;
}

/**
 * 扫描管道单一事实来源。
 * 模板变量由 toTemplateVars() 派生（W2）。
 */
export interface ProjectContext {
  meta: ScanMeta;
  techStack: string;
  deps: DependencyInfo[];
  structure: string;
  architecture: ArchitectureHint[];
  entries: FileRef[];
  /** 生产代码文件路径（用于需求关键词匹配） */
  files: string[];
  routes?: string;
  apiStyle?: string;
  codeStyle?: string;
  snippets: CodeSnippet[];
}

/** 将 ProjectContext 转为模板渲染上下文（变量 + 条件 + 循环） */
export function toTemplateRenderContext(
  context: ProjectContext,
  options: { userInput?: string; modelStyle?: ModelStyle; relevance?: RelevanceResult } = {},
): TemplateRenderContext {
  const vars = toTemplateVars(context, options);
  const stack = context.techStack.toLowerCase();
  const depNames = new Set(context.deps.map((d) => d.name.toLowerCase()));

  const flags: Record<string, boolean> = {
    react: stack.includes('react') || depNames.has('react'),
    vue: stack.includes('vue') || depNames.has('vue'),
    spring: stack.includes('spring') || context.deps.some((d) => d.name.includes('spring')),
    python: stack.includes('python') || depNames.has('fastapi') || depNames.has('flask'),
    typescript: stack.includes('typescript') || depNames.has('typescript'),
    java: stack.includes('java') || stack.includes('spring boot'),
    vscode: stack.includes('vs code') || stack.includes('vscode'),
  };

  const lists: Record<string, string[]> = {
    deps: context.deps.slice(0, 30).map((d) => `${d.name}@${d.version}`),
    snippets: context.snippets.map((s) => `${s.path}: ${s.summary.split('\n')[0]}`),
  };

  return { vars, flags, lists };
}

/** 将 ProjectContext 转为模板变量（TemplateEngine 使用） */
export function toTemplateVars(
  context: ProjectContext,
  options: { userInput?: string; modelStyle?: ModelStyle; relevance?: RelevanceResult } = {},
): TemplateVars {
  const userInput = options.userInput ?? '';
  const modelStyle = options.modelStyle ?? 'default';
  const relevance = options.relevance;

  const depsText =
    context.deps.length === 0
      ? '（未识别）'
      : context.deps
          .slice(0, 40)
          .map((d) => `${d.name}@${d.version}`)
          .join(', ');

  const architecture =
    context.architecture.length === 0
      ? '（未识别分层）'
      : context.architecture.map((a) => `${a.layer}: ${a.paths.join(', ')}`).join(' · ');

  const entries =
    context.entries.length === 0
      ? '（未识别）'
      : context.entries.map((e) => `[${e.role}] ${e.path}`).join('\n');

  const modelHint = getModelHint(modelStyle);
  const modelHintLine = modelHint ? `\n【模型偏好】${modelHint}` : '';

  const tokenBudget = new TokenBudget();
  const snippetBudget = 1500;
  const { text: codeSnippets } = tokenBudget.formatSnippets(context.snippets, snippetBudget);

  const structure = context.structure || '（未识别）';
  const apiStyle = context.apiStyle || '（未识别）';
  const reusableList = buildReusableList(context);

  return {
    techStack: context.techStack || '（未识别）',
    deps: depsText,
    structure,
    directoryTree: structure,
    apiStyle,
    apiExample: apiStyle,
    codeStyle: context.codeStyle || '（未识别）',
    userInput,
    modelHint: modelHintLine,
    architecture,
    entries,
    codeSnippets: codeSnippets || '（无采样代码片段）',
    reusableList,
    relevantFiles: relevance?.relevantFilesText ?? '（未进行需求匹配）',
    relevantSnippets: relevance?.relevantSnippetsText ?? '',
  };
}

function buildReusableList(context: ProjectContext): string {
  const lines: string[] = [];
  for (const hint of context.architecture) {
    if (hint.layer === 'components' || hint.layer === 'utils' || hint.layer === 'api') {
      lines.push(`[${hint.layer}] ${hint.paths.join(', ')}`);
    }
  }
  const apiRefs = context.entries.filter((e) => e.role === 'api' || e.role === 'router');
  for (const ref of apiRefs) {
    lines.push(`[${ref.role}] ${ref.path}`);
  }
  if (context.snippets.length > 0) {
    for (const s of context.snippets.slice(0, 8)) {
      lines.push(`${s.path}: ${s.summary.split('\n')[0]}`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : '（未识别可复用模块，请根据目录结构自行查找）';
}
