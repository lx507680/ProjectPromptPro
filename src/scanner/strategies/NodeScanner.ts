import * as fs from 'fs';
import * as path from 'path';
import { TechStackDetector } from '../../analyzer/TechStackDetector';
import { PackageJsonParser } from '../parsers/PackageJsonParser';
import type { TechScanner, TechStackInfo } from './TechScanner';

/**
 * Node/前端项目扫描：检测 package.json，解析 dependencies / devDependencies / scripts。
 */
export class NodeScanner implements TechScanner {
  private parser = new PackageJsonParser();

  constructor(private rulesPath?: string) {}

  detect(rootPath: string): boolean {
    return fs.existsSync(path.join(rootPath, 'package.json'));
  }

  async parse(rootPath: string): Promise<TechStackInfo> {
    const pkg = this.parser.parse(rootPath);
    if (!pkg) {
      return {
        stackType: 'unknown',
        label: '（未能识别 Node 项目）',
        deps: [],
        configFiles: [],
      };
    }

    let label = 'Node.js';
    if (this.rulesPath && fs.existsSync(this.rulesPath)) {
      const detector = new TechStackDetector(this.rulesPath);
      label = detector.detect(pkg.deps, rootPath);
    }

    const raw = pkg.raw ?? {};
    const engines = raw.engines as Record<string, string> | undefined;
    if (engines?.vscode && typeof raw.main === 'string' && raw.main.includes('extension')) {
      const ts = pkg.deps.find((d) => d.name === 'typescript');
      label = ts
        ? `VS Code 扩展 · TypeScript ${ts.version.replace(/^[\^~]+/, '')}`
        : 'VS Code 扩展 · TypeScript';
    }

    const configFiles = ['package.json'];
    if (fs.existsSync(path.join(rootPath, 'tsconfig.json'))) {
      configFiles.push('tsconfig.json');
    }
    if (fs.existsSync(path.join(rootPath, 'vite.config.ts'))) {
      configFiles.push('vite.config.ts');
    }

    return {
      stackType: 'node',
      label,
      deps: pkg.deps,
      scripts: pkg.scripts,
      configFiles,
    };
  }
}
