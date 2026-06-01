import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { CacheService } from '../cache/CacheService';
import { TokenController } from '../token/TokenController';
import type { ArchitectureHint, DependencyInfo, FileRef, ProjectContext, ScanMeta } from '../types/ProjectContext';
import { CodeSampler } from './CodeSampler';
import { ENTRY_CANDIDATES, JAVA_ENTRY_PATTERN, isNoiseScanPath } from './constants';
import { FileWalker } from './FileWalker';
import { SensitiveFilter } from './SensitiveFilter';
import { ProjectScannerManager } from './strategies/ProjectScannerManager';
import { TsConfigParser } from './parsers/TsConfigParser';
import { WorkspaceFileIndex } from './WorkspaceFileIndex';

export interface ScanOptions {
  rootPath: string;
  extensionPath: string;
  force?: boolean;
  verbose?: boolean;
}

/**
 * 项目扫描引擎：策略模式识别技术栈 + fast-glob/vscode 文件索引 + Token 智能截断。
 */
export class ProjectScanner {
  private fileIndex = new WorkspaceFileIndex();
  private fileWalker = new FileWalker();
  private tsConfigParser = new TsConfigParser();
  private tokenController = new TokenController();
  private lastContext: ProjectContext | null = null;
  private scannerManager: ProjectScannerManager | null = null;

  constructor(private cacheService?: CacheService) {}

  getLastContext(): ProjectContext | null {
    return this.lastContext;
  }

  async scan(options: ScanOptions): Promise<ProjectContext> {
    const start = Date.now();
    const config = vscode.workspace.getConfiguration('projectPromptPro');
    const maxFiles = config.get<number>('maxScanFiles', 2000);
    const treeMaxDepth = config.get<number>('treeMaxDepth', 4);
    const extraExcludes = config.get<string[]>('excludePatterns', []);
    const sanitize = config.get<boolean>('sanitizeSecrets', true);
    const verbose = options.verbose ?? config.get<boolean>('verbose', false);
    const force = options.force ?? false;
    const maxTokens = config.get<number>('maxTokens', TokenController.DEFAULT_MAX_TOKENS);

    const configHash = this.cacheService?.buildConfigHash([
      maxFiles,
      treeMaxDepth,
      extraExcludes,
      sanitize,
      maxTokens,
    ]) ?? '';

    const walk = await this.fileIndex.walk({
      rootPath: options.rootPath,
      maxFiles,
      extraExcludes,
    });

    if (verbose) {
      console.log(`[PPP] file index via ${walk.source}, ${walk.files.length} files`);
    }

    const incremental = this.cacheService?.getIncrementalScanner();
    const fingerprints = incremental?.buildFingerprints(options.rootPath, walk.files) ?? {};
    const gitHead = await this.getGitHead(options.rootPath);
    const gitBranch = await this.getGitBranch(options.rootPath);

    if (!force && this.cacheService) {
      const cached = await this.cacheService.load(
        options.rootPath,
        fingerprints,
        gitHead,
        configHash,
      );
      if (cached) {
        if (verbose) {
          console.log('[PPP] cache hit');
        }
        this.lastContext = cached;
        return cached;
      }
    }

    const oldEntry = this.cacheService?.getCachedEntry(options.rootPath);
    const changedPaths =
      oldEntry && incremental
        ? incremental.getChangedPaths(oldEntry.fingerprints, fingerprints)
        : walk.files;

    const rulesFile = path.join(options.extensionPath, 'resources', 'stack-rules.json');
    this.scannerManager = new ProjectScannerManager(rulesFile);
    const stackResults = await this.scannerManager.scanAll(options.rootPath);
    const primary = stackResults[0];

    let techStack = primary?.label ?? '（未能自动识别技术栈）';
    let deps = this.mergeDeps(...stackResults.map((s) => s.deps));

    if (stackResults.length > 1) {
      techStack = stackResults.map((s) => s.label).join(' + ');
    }

    const tsConfig = this.tsConfigParser.parse(options.rootPath);
    const javaInfo = stackResults.find((s) => s.stackType === 'java');

    const prodFiles = walk.files.filter((f) => !isNoiseScanPath(f));

    const architecture = this.fileWalker.detectArchitecture(prodFiles) as ArchitectureHint[];
    const structure = this.fileWalker.buildTree(prodFiles, treeMaxDepth);
    const entries = this.detectEntries(options.rootPath, prodFiles);

    const sensitiveFilter = new SensitiveFilter(sanitize);
    const codeSampler = new CodeSampler(sensitiveFilter);
    const snippets = codeSampler.sample(options.rootPath, entries, prodFiles);

    const codeStyle = this.buildCodeStyleSummary(tsConfig, javaInfo?.javaVersion);
    const apiStyle = this.detectApiStyle(prodFiles, architecture);

    const meta: ScanMeta = {
      rootPath: options.rootPath,
      scannedAt: Date.now(),
      fileCount: walk.files.length,
      durationMs: Date.now() - start,
      gitBranch,
      gitHead,
      cached: false,
      changedFileCount: force ? walk.files.length : changedPaths.length,
    };

    let context: ProjectContext = {
      meta,
      techStack,
      deps,
      structure,
      architecture,
      entries,
      files: prodFiles,
      apiStyle,
      codeStyle,
      snippets,
    };

    const truncateResult = this.tokenController.smartTruncate(context, maxTokens);
    context = truncateResult.context;

    if (this.cacheService) {
      await this.cacheService.save(context, fingerprints, gitHead, configHash);
    }

    this.lastContext = context;
    if (verbose) {
      console.log(`[PPP] scanned ${walk.files.length} files in ${meta.durationMs}ms`);
    }
    return context;
  }

  private mergeDeps(...groups: DependencyInfo[][]): DependencyInfo[] {
    const map = new Map<string, DependencyInfo>();
    for (const group of groups) {
      for (const d of group) {
        map.set(d.name, d);
      }
    }
    return [...map.values()];
  }

  private detectEntries(rootPath: string, files: string[]): FileRef[] {
    const refs: FileRef[] = [];
    const prodFiles = files.filter((f) => !isNoiseScanPath(f));

    for (const candidate of ENTRY_CANDIDATES) {
      if (prodFiles.includes(candidate)) {
        refs.push({ path: candidate, role: 'entry' });
      }
    }

    for (const f of prodFiles) {
      if (JAVA_ENTRY_PATTERN.test(f)) {
        refs.push({ path: f, role: 'entry' });
        break;
      }
    }

    const routerFiles = prodFiles.filter(
      (f) =>
        f.includes('router') ||
        f.endsWith('routes.ts') ||
        f.endsWith('routes.tsx') ||
        f.includes('/routes/'),
    );
    for (const f of routerFiles.slice(0, 3)) {
      refs.push({ path: f, role: 'router' });
    }

    const apiFiles = prodFiles.filter(
      (f) =>
        (f.includes('/api/') || f.includes('Controller.java')) &&
        (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.java')),
    );
    for (const f of apiFiles.slice(0, 3)) {
      refs.push({ path: f, role: 'api' });
    }

    if (fs.existsSync(path.join(rootPath, 'vite.config.ts'))) {
      refs.push({ path: 'vite.config.ts', role: 'config' });
    }
    if (fs.existsSync(path.join(rootPath, 'pom.xml'))) {
      refs.push({ path: 'pom.xml', role: 'config' });
    }

    return refs;
  }

  private buildCodeStyleSummary(
    tsConfig: ReturnType<TsConfigParser['parse']>,
    javaVersion?: string,
  ): string {
    const parts: string[] = [];
    if (tsConfig) {
      const co = tsConfig.compilerOptions;
      if (co.target) {
        parts.push(`target=${co.target}`);
      }
      if (co.module) {
        parts.push(`module=${co.module}`);
      }
      if (co.strict !== undefined) {
        parts.push(`strict=${co.strict}`);
      }
      if (tsConfig.pathAliases.length > 0) {
        parts.push(`paths: ${tsConfig.pathAliases.slice(0, 5).join('; ')}`);
      }
    }
    if (javaVersion) {
      parts.push(`Java ${javaVersion}`);
    }
    return parts.join(', ') || '（未找到 tsconfig / pom 风格信息）';
  }

  private detectApiStyle(
    files: string[],
    architecture: ArchitectureHint[],
  ): string {
    const prodFiles = files.filter((f) => !isNoiseScanPath(f));

    if (prodFiles.some((f) => f === 'src/extension.ts' || f.endsWith('/extension.ts'))) {
      return 'VS Code 扩展（extension.ts + Webview + 命令注册）';
    }

    const hasApiDir = architecture.some((a) => a.layer === 'api');
    const hasController = prodFiles.some((f) => f.includes('Controller.java'));
    const hasAxios = prodFiles.some((f) => f.includes('axios') || f.includes('request.ts'));
    if (hasController) {
      return 'Spring MVC Controller 分层';
    }
    if (hasApiDir && hasAxios) {
      return '目录 api/ + 疑似 axios/request 封装';
    }
    if (hasApiDir) {
      return '目录 api/ 分层';
    }
    if (prodFiles.some((f) => f.includes('openapi') || f.includes('swagger'))) {
      return '疑似 OpenAPI/Swagger';
    }
    return '（未检测到明确 API 规范）';
  }

  private async getGitBranch(rootPath: string): Promise<string | undefined> {
    const repo = await this.getGitRepo(rootPath);
    return repo?.state?.HEAD?.name;
  }

  private async getGitHead(rootPath: string): Promise<string | undefined> {
    const repo = await this.getGitRepo(rootPath);
    return repo?.state?.HEAD?.commit;
  }

  private async getGitRepo(rootPath: string): Promise<{
    state?: { HEAD?: { name?: string; commit?: string } };
  } | null> {
    const gitExt = vscode.extensions.getExtension('vscode.git');
    if (!gitExt?.isActive) {
      return null;
    }
    try {
      const gitApi = gitExt.exports.getAPI(1);
      return (
        gitApi.repositories.find(
          (r: { rootUri: { fsPath: string } }) => r.rootUri.fsPath === rootPath,
        ) ?? null
      );
    } catch {
      return null;
    }
  }
}
