import * as fs from 'fs';
import * as path from 'path';
import { TokenBudget } from '../token/TokenBudget';
import type { CodeSnippet, FileRef } from '../types/ProjectContext';
import { isNoiseScanPath, scanPathPriority } from './constants';
import { SensitiveFilter } from './SensitiveFilter';

const SAMPLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.vue',
  '.java',
  '.kt',
  '.py',
  '.go',
]);

const MAX_SNIPPETS = 8;
const MAX_TOKENS_PER_FILE = 400;

export class CodeSampler {
  private tokenBudget = new TokenBudget();

  constructor(private sensitiveFilter: SensitiveFilter) {}

  sample(rootPath: string, entries: FileRef[], allFiles: string[]): CodeSnippet[] {
    const candidates = this.pickCandidates(entries, allFiles);
    const snippets: CodeSnippet[] = [];

    for (const rel of candidates) {
      if (snippets.length >= MAX_SNIPPETS) {
        break;
      }
      if (isNoiseScanPath(rel) || this.sensitiveFilter.isSensitivePath(rel)) {
        continue;
      }
      const ext = path.extname(rel);
      if (!SAMPLE_EXTENSIONS.has(ext)) {
        continue;
      }

      const full = path.join(rootPath, rel);
      let content: string;
      try {
        content = fs.readFileSync(full, 'utf-8');
      } catch {
        continue;
      }

      if (content.length > 80_000) {
        content = content.slice(0, 80_000);
      }

      content = this.sensitiveFilter.redactContent(content);
      const summary = this.tokenBudget.truncateFileContent(content, MAX_TOKENS_PER_FILE);
      const lineCount = content.split('\n').length;

      snippets.push({ path: rel, summary, lineCount });
    }

    return snippets;
  }

  private pickCandidates(entries: FileRef[], allFiles: string[]): string[] {
    const scored = new Map<string, number>();

    const add = (p: string, bonus = 0) => {
      if (!allFiles.includes(p) || isNoiseScanPath(p)) {
        return;
      }
      const base = scanPathPriority(p);
      if (base < 0) {
        return;
      }
      scored.set(p, Math.max(scored.get(p) ?? base, base + bonus));
    };

    for (const e of entries) {
      if (e.role === 'entry') {
        add(e.path, 20);
      } else if (e.role === 'config') {
        add(e.path, 15);
      } else {
        add(e.path, 8);
      }
    }

    const patterns = [
      /^src\/extension\.ts$/,
      /router/i,
      /routes?\./i,
      /\/api\//i,
      /request\.(ts|js)$/i,
      /Application\.java$/,
      /Controller\.java$/,
    ];

    for (const pattern of patterns) {
      for (const f of allFiles) {
        if (pattern.test(f)) {
          add(f, pattern.source.includes('extension') ? 25 : 3);
        }
      }
    }

    return [...scored.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([p]) => p)
      .slice(0, MAX_SNIPPETS * 2);
  }
}
