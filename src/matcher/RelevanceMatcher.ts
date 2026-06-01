import * as fs from 'fs';
import * as path from 'path';
import { TokenBudget } from '../token/TokenBudget';
import type { CodeSnippet, FileRef, ProjectContext } from '../types/ProjectContext';
import { isNoiseScanPath } from '../scanner/constants';
import { SensitiveFilter } from '../scanner/SensitiveFilter';
import { extractKeywords } from './KeywordExtractor';

export interface RelevantFileMatch {
  path: string;
  score: number;
  matchedKeywords: string[];
}

export interface RelevanceResult {
  matches: RelevantFileMatch[];
  relevantFilesText: string;
  relevantSnippetsText: string;
  snippets: CodeSnippet[];
}

const MAX_MATCHES = 5;
const MAX_TOKENS_PER_RELEVANT_FILE = 600;

export class RelevanceMatcher {
  private tokenBudget = new TokenBudget();

  match(userInput: string, context: ProjectContext): RelevantFileMatch[] {
    const keywords = extractKeywords(userInput);
    if (keywords.length === 0) {
      return [];
    }

    const files = collectCandidateFiles(context);
    const entryRoles = new Map(context.entries.map((e) => [e.path, e.role]));
    const scored: RelevantFileMatch[] = [];

    for (const filePath of files) {
      if (isNoiseScanPath(filePath)) {
        continue;
      }
      const { score, matchedKeywords } = scoreFile(filePath, keywords, entryRoles.get(filePath));
      if (score > 0) {
        scored.push({ path: filePath, score, matchedKeywords });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, MAX_MATCHES);
  }

  buildResult(
    rootPath: string,
    userInput: string,
    context: ProjectContext,
    sanitize = true,
  ): RelevanceResult {
    const matches = this.match(userInput, context);
    if (matches.length === 0) {
      return {
        matches: [],
        relevantFilesText: '（未能从需求中匹配到具体文件，请参考目录结构与代码片段）',
        relevantSnippetsText: '',
        snippets: [],
      };
    }

    const sensitiveFilter = new SensitiveFilter(sanitize);
    const snippets: CodeSnippet[] = [];

    for (const match of matches) {
      const snippet = this.loadSnippet(rootPath, match.path, sensitiveFilter);
      if (snippet) {
        snippets.push(snippet);
      }
    }

    const relevantFilesText = matches
      .map((m, i) => `${i + 1}. ${m.path}（匹配：${m.matchedKeywords.join(', ')}）`)
      .join('\n');

    const { text: relevantSnippetsText } = this.tokenBudget.formatSnippets(
      snippets,
      MAX_TOKENS_PER_RELEVANT_FILE * MAX_MATCHES,
    );

    return {
      matches,
      relevantFilesText,
      relevantSnippetsText: relevantSnippetsText || '（相关文件无法读取或无代码片段）',
      snippets,
    };
  }

  private loadSnippet(
    rootPath: string,
    relPath: string,
    sensitiveFilter: SensitiveFilter,
  ): CodeSnippet | null {
    if (sensitiveFilter.isSensitivePath(relPath)) {
      return null;
    }
    const full = path.join(rootPath, relPath);
    let content: string;
    try {
      content = fs.readFileSync(full, 'utf-8');
    } catch {
      return null;
    }
    if (content.length > 80_000) {
      content = content.slice(0, 80_000);
    }
    content = sensitiveFilter.redactContent(content);
    const summary = this.tokenBudget.truncateFileContent(content, MAX_TOKENS_PER_RELEVANT_FILE);
    return { path: relPath, summary, lineCount: content.split('\n').length };
  }
}

function collectCandidateFiles(context: ProjectContext): string[] {
  const set = new Set<string>();

  for (const f of context.files ?? []) {
    set.add(f);
  }
  for (const e of context.entries) {
    set.add(e.path);
  }
  for (const s of context.snippets) {
    set.add(s.path);
  }
  for (const hint of context.architecture) {
    for (const p of hint.paths) {
      set.add(p);
    }
  }

  return [...set];
}

function scoreFile(
  filePath: string,
  keywords: string[],
  role?: FileRef['role'],
): { score: number; matchedKeywords: string[] } {
  const normalized = filePath.toLowerCase().replace(/\\/g, '/');
  const segments = normalized.split(/[/._-]+/);
  const matchedKeywords: string[] = [];
  let score = 0;

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();
    if (normalized.includes(kw)) {
      matchedKeywords.push(keyword);
      score += kw.length >= 4 ? 12 : 8;
      if (path.basename(normalized).includes(kw)) {
        score += 6;
      }
      continue;
    }
    for (const seg of segments) {
      if (seg.length >= 2 && (seg.includes(kw) || kw.includes(seg))) {
        matchedKeywords.push(keyword);
        score += 5;
        break;
      }
    }
  }

  if (role === 'api' || role === 'router') {
    score += 2;
  } else if (role === 'entry') {
    score += 1;
  }

  return { score, matchedKeywords: [...new Set(matchedKeywords)] };
}
