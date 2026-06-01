import { ARCHITECTURE_RULES } from './constants';

export interface WalkOptions {
  rootPath: string;
  maxFiles: number;
  extraExcludes?: string[];
}

export interface WalkResult {
  files: string[];
  truncated: boolean;
}

/**
 * 目录树构建与架构层检测。
 * 文件遍历已迁移至 WorkspaceFileIndex（fast-glob / vscode.workspace.findFiles）。
 */
export class FileWalker {
  buildTree(files: string[], maxDepth: number): string {
    const root: TreeNode = { name: '', children: new Map() };

    for (const file of files) {
      const parts = file.split('/');
      let node = root;
      const depthLimit = Math.min(parts.length, maxDepth);

      for (let i = 0; i < depthLimit; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const isFile = isLast && parts.length === depthLimit && file.includes('.');

        if (!node.children.has(part)) {
          node.children.set(part, { name: part, children: new Map(), isFile });
        }
        node = node.children.get(part)!;

        if (i >= maxDepth - 1 && parts.length > maxDepth) {
          if (!node.children.has('…')) {
            node.children.set('…', { name: '…', children: new Map() });
          }
          break;
        }

        if (isFile && i === parts.length - 1) {
          node.isFile = true;
        }
      }
    }

    const lines: string[] = [];
    const render = (node: TreeNode, prefix: string): void => {
      const children = [...node.children.entries()].sort(([a], [b]) => {
        const aDir = !a.includes('.');
        const bDir = !b.includes('.');
        if (aDir !== bDir) {
          return aDir ? -1 : 1;
        }
        return a.localeCompare(b);
      });

      children.forEach(([name, child], index) => {
        const isLast = index === children.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const suffix = child.isFile || name.includes('.') ? '' : '/';
        lines.push(`${prefix}${connector}${name}${suffix}`);

        const nextPrefix = prefix + (isLast ? '    ' : '│   ');
        if (child.children.size > 0) {
          render(child, nextPrefix);
        }
      });
    };

    render(root, '');
    return lines.join('\n') || '（空目录）';
  }

  /** 检测架构层目录 */
  detectArchitecture(files: string[]): Array<{ layer: string; paths: string[]; confidence: 'high' | 'medium' | 'low' }> {
    const hints: Array<{ layer: string; paths: string[]; confidence: 'high' | 'medium' | 'low' }> = [];

    for (const rule of ARCHITECTURE_RULES) {
      const matched = new Set<string>();
      for (const file of files) {
        const dir = file.includes('/') ? file.split('/').slice(0, -1).join('/') : '';
        const segments = file.split('/');
        for (const pattern of rule.patterns) {
          const needle = pattern.replace(/\*\*\//g, '').replace(/\/\*\*/g, '').replace(/\*\*/g, '');
          if (segments.some((s) => s === needle) || file.includes(`/${needle}/`)) {
            const topDir = segments.find((s) => s === needle) ?? needle;
            matched.add(topDir);
          }
        }
        if (dir && rule.patterns.some((p) => file.startsWith(p.replace(/\*\*/g, '')))) {
          matched.add(dir.split('/')[0] ?? dir);
        }
      }
      if (matched.size > 0) {
        hints.push({
          layer: rule.layer,
          paths: [...matched].slice(0, 5),
          confidence: rule.confidence,
        });
      }
    }

    return hints;
  }
}

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  isFile?: boolean;
}
