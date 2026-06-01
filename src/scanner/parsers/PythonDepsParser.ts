import * as fs from 'fs';
import * as path from 'path';
import type { DependencyInfo } from '../../types/ProjectContext';

/**
 * 轻量解析 requirements.txt / pyproject.toml 依赖（正则，无 AST）。
 */
export class PythonDepsParser {
  parse(rootPath: string): DependencyInfo[] {
    const fromReq = this.parseRequirements(path.join(rootPath, 'requirements.txt'));
    if (fromReq.length > 0) {
      return fromReq;
    }
    return this.parsePyproject(path.join(rootPath, 'pyproject.toml'));
  }

  private parseRequirements(filePath: string): DependencyInfo[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const deps: DependencyInfo[] = [];
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) {
        continue;
      }
      const match = trimmed.match(/^([a-zA-Z0-9_.-]+)(?:\[.*\])?(?:([=<>!~]+)(.+))?$/);
      if (match) {
        deps.push({
          name: match[1],
          version: match[3]?.trim() || '*',
          scope: 'dependencies',
        });
      }
    }
    return deps;
  }

  private parsePyproject(filePath: string): DependencyInfo[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const deps: DependencyInfo[] = [];
    const depBlock = content.match(/\[project\.dependencies\]([\s\S]*?)(?:\[|$)/);
    if (depBlock) {
      const names = depBlock[1].match(/"([a-zA-Z0-9_.-]+)/g);
      if (names) {
        for (const n of names) {
          const name = n.replace(/"/g, '');
          deps.push({ name, version: '*', scope: 'dependencies' });
        }
      }
    }
    return deps;
  }
}
