import * as fs from 'fs';
import * as path from 'path';
import type { DependencyInfo } from '../types/ProjectContext';

interface StackRule {
  id: string;
  label: string;
  deps?: string[];
  versionFrom?: string;
  files?: string[];
  markers?: string[];
}

interface StackRulesFile {
  frameworks: StackRule[];
  ui: StackRule[];
  state: StackRule[];
  build: StackRule[];
  backend: StackRule[];
}

/**
 * 根据 dependencies 与 stack-rules.json 推断技术栈摘要。
 */
export class TechStackDetector {
  private rules: StackRulesFile;

  constructor(rulesPath: string) {
    const raw = fs.readFileSync(rulesPath, 'utf-8');
    this.rules = JSON.parse(raw) as StackRulesFile;
  }

  detect(deps: DependencyInfo[], rootPath: string): string {
    const depMap = new Map(deps.map((d) => [d.name, d.version]));
    const parts: string[] = [];

    const matchGroup = (group: StackRule[]): void => {
      for (const rule of group) {
        if (rule.deps) {
          for (const depName of rule.deps) {
            const ver = depMap.get(depName);
            if (ver !== undefined) {
              const from = rule.versionFrom ? depMap.get(rule.versionFrom) ?? ver : ver;
              parts.push(`${rule.label} ${this.cleanVersion(from)}`);
              break;
            }
          }
        }
        if (rule.files) {
          for (const file of rule.files) {
            if (fs.existsSync(path.join(rootPath, file))) {
              if (rule.markers && this.fileContainsMarkers(path.join(rootPath, file), rule.markers)) {
                parts.push(rule.label);
              } else if (!rule.markers) {
                parts.push(rule.label);
              }
              break;
            }
          }
        }
      }
    };

    matchGroup(this.rules.frameworks);
    matchGroup(this.rules.ui);
    matchGroup(this.rules.state);
    matchGroup(this.rules.build);
    matchGroup(this.rules.backend);

    if (depMap.has('typescript')) {
      parts.push(`TypeScript ${this.cleanVersion(depMap.get('typescript')!)}`);
    }

    return parts.length > 0 ? parts.join(' · ') : '（未能自动识别技术栈）';
  }

  private cleanVersion(version: string): string {
    return version.replace(/^[\^~>=<]+/, '');
  }

  private fileContainsMarkers(filePath: string, markers: string[]): boolean {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return markers.some((m) => content.includes(m));
    } catch {
      return false;
    }
  }
}
