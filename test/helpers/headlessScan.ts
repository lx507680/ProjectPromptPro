import fg from 'fast-glob';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectScannerManager } from '../../src/scanner/strategies/ProjectScannerManager';
import { CodeSampler } from '../../src/scanner/CodeSampler';
import { FileWalker } from '../../src/scanner/FileWalker';
import { SensitiveFilter } from '../../src/scanner/SensitiveFilter';
import { TsConfigParser } from '../../src/scanner/parsers/TsConfigParser';
import { DEFAULT_EXCLUDES, ENTRY_CANDIDATES, JAVA_ENTRY_PATTERN, isNoiseScanPath } from '../../src/scanner/constants';
import type { ProjectContext } from '../../src/types/ProjectContext';

function findExtensionRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'resources', 'stack-rules.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('无法定位扩展根目录（缺少 resources/stack-rules.json）');
}

const EXTENSION_ROOT = findExtensionRoot();

export interface HeadlessScanResult {
  context: ProjectContext;
  walkFileCount: number;
}

/** 无 VS Code API 的扫描（供测试与 CI 使用） */
export async function headlessScan(fixtureRoot: string): Promise<HeadlessScanResult> {
  const fileWalker = new FileWalker();
  const entries = fg.sync('**/*', {
    cwd: fixtureRoot,
    absolute: false,
    onlyFiles: true,
    dot: false,
    ignore: DEFAULT_EXCLUDES,
  });
  const files = entries.map((e) => e.replace(/\\/g, '/')).sort();

  const rulesFile = path.join(EXTENSION_ROOT, 'resources', 'stack-rules.json');
  const manager = new ProjectScannerManager(rulesFile);
  const stackResults = await manager.scanAll(fixtureRoot);
  const primary = stackResults[0];
  let techStack = primary?.label ?? 'unknown';
  if (stackResults.length > 1) {
    techStack = stackResults.map((s) => s.label).join(' + ');
  }
  const deps = mergeDeps(...stackResults.map((s) => s.deps));

  const tsConfig = new TsConfigParser().parse(fixtureRoot);
  const prodFiles = files.filter((f) => !isNoiseScanPath(f));
  const architecture = fileWalker.detectArchitecture(prodFiles);
  const structure = fileWalker.buildTree(prodFiles, 4);
  const entryRefs = detectEntries(fixtureRoot, prodFiles);
  const sampler = new CodeSampler(new SensitiveFilter(true));
  const snippets = sampler.sample(fixtureRoot, entryRefs, prodFiles);

  const context: ProjectContext = {
    meta: {
      rootPath: fixtureRoot,
      scannedAt: Date.now(),
      fileCount: files.length,
      durationMs: 0,
    },
    techStack,
    deps,
    structure,
    architecture,
    entries: entryRefs,
    files: prodFiles,
    apiStyle: detectApiStyle(prodFiles, architecture),
    codeStyle: tsConfig ? `strict=${tsConfig.compilerOptions.strict}` : 'n/a',
    snippets,
  };

  return { context, walkFileCount: files.length };
}

function mergeDeps(
  ...groups: import('../../src/types/ProjectContext').DependencyInfo[][]
) {
  const map = new Map<string, import('../../src/types/ProjectContext').DependencyInfo>();
  for (const group of groups) {
    for (const d of group) {
      map.set(d.name, d);
    }
  }
  return [...map.values()];
}

function detectEntries(rootPath: string, files: string[]) {
  const refs: import('../../src/types/ProjectContext').FileRef[] = [];

  for (const candidate of ENTRY_CANDIDATES) {
    if (files.includes(candidate)) {
      refs.push({ path: candidate, role: 'entry' });
    }
  }

  for (const f of files) {
    if (JAVA_ENTRY_PATTERN.test(f)) {
      refs.push({ path: f, role: 'entry' });
      break;
    }
  }

  if (fs.existsSync(path.join(rootPath, 'pom.xml'))) {
    refs.push({ path: 'pom.xml', role: 'config' });
  }
  return refs;
}

function detectApiStyle(
  files: string[],
  architecture: import('../../src/types/ProjectContext').ArchitectureHint[],
) {
  if (files.some((f) => f.includes('Controller.java'))) {
    return 'Spring MVC';
  }
  if (architecture.some((a) => a.layer === 'api')) {
    return 'api/';
  }
  return 'unknown';
}
