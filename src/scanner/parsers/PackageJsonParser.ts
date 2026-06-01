import * as fs from 'fs';
import * as path from 'path';
import type { DependencyInfo } from '../../types/ProjectContext';

export interface PackageJsonResult {
  name?: string;
  version?: string;
  type?: string;
  scripts: Record<string, string>;
  deps: DependencyInfo[];
  raw?: Record<string, unknown>;
}

/**
 * 解析 package.json，提取依赖与 scripts。
 */
export class PackageJsonParser {
  parse(rootPath: string): PackageJsonResult | null {
    const filePath = path.join(rootPath, 'package.json');
    if (!fs.existsSync(filePath)) {
      return null;
    }

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return null;
    }

    const deps: DependencyInfo[] = [];
    const scopes = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

    for (const scope of scopes) {
      const block = raw[scope] as Record<string, string> | undefined;
      if (!block) {
        continue;
      }
      for (const [name, version] of Object.entries(block)) {
        deps.push({ name, version: String(version), scope });
      }
    }

    return {
      name: typeof raw.name === 'string' ? raw.name : undefined,
      version: typeof raw.version === 'string' ? raw.version : undefined,
      type: typeof raw.type === 'string' ? raw.type : undefined,
      scripts: (raw.scripts as Record<string, string>) ?? {},
      deps,
      raw,
    };
  }
}
