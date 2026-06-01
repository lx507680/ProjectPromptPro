import type { CodeSnippet } from '../types/ProjectContext';

export interface TokenBudgetResult {
  text: string;
  estimatedTokens: number;
  truncated: boolean;
}

/**
 * Token 预算：启发式估算（约 4 字符 = 1 token）。
 */
export class TokenBudget {
  estimate(text: string): number {
    return Math.ceil(text.length / 4);
  }

  truncateText(text: string, maxTokens: number): TokenBudgetResult {
    const estimated = this.estimate(text);
    if (estimated <= maxTokens) {
      return { text, estimatedTokens: estimated, truncated: false };
    }

    const maxChars = maxTokens * 4;
    const head = Math.floor(maxChars * 0.6);
    const tail = maxChars - head - 40;
    const truncatedText =
      text.slice(0, head) +
      `\n\n…[已截断，约 ${estimated} tokens → 预算 ${maxTokens}]…\n\n` +
      text.slice(-Math.max(tail, 0));

    return {
      text: truncatedText,
      estimatedTokens: maxTokens,
      truncated: true,
    };
  }

  /** 截断单文件摘要内容 */
  truncateFileContent(content: string, maxTokensPerFile: number): string {
    const lines = content.split('\n');
    const estimated = this.estimate(content);
    if (estimated <= maxTokensPerFile) { 
      return content;
    }

    const importExport = lines.filter(
      (l) =>
        /^\s*(import|export|from|require|public class|@RestController|@Service|@Mapper)/.test(l),
    );
    const head = lines.slice(0, 30).join('\n');
    const tail = lines.slice(-30).join('\n');
    const signature = importExport.slice(0, 20).join('\n');

    return [signature, head, '…', tail].filter(Boolean).join('\n');
  }

  formatSnippets(snippets: CodeSnippet[], maxTokens: number): { text: string; truncated: boolean } {
    const parts: string[] = [];
    let used = 0;
    let truncated = false;

    for (const s of snippets) {
      const block = `### ${s.path} (${s.lineCount} 行)\n${s.summary}\n`;
      const cost = this.estimate(block);
      if (used + cost > maxTokens) {
        truncated = true;
        break;
      }
      parts.push(block);
      used += cost;
    }

    if (snippets.length > 0 && parts.length === 0) {
      const first = snippets[0];
      const block = `### ${first.path}\n${this.truncateFileContent(first.summary, maxTokens)}`;
      return { text: block, truncated: true };
    }

    return { text: parts.join('\n'), truncated };
  }

  applyToPrompt(prompt: string, maxTokens: number): TokenBudgetResult {
    const estimated = this.estimate(prompt);
    if (estimated <= maxTokens) {
      return { text: prompt, estimatedTokens: estimated, truncated: false };
    }

    const marker = '【关键代码片段】';
    const idx = prompt.indexOf(marker);
    if (idx > 0) {
      const headBudget = Math.floor(maxTokens * 0.75);
      const head = this.truncateText(prompt.slice(0, idx), headBudget);
      const tailBudget = maxTokens - head.estimatedTokens;
      const tailRaw = prompt.slice(idx);
      const tail = this.truncateText(tailRaw, Math.max(tailBudget, 200));
      return {
        text: head.text + tail.text,
        estimatedTokens: this.estimate(head.text + tail.text),
        truncated: true,
      };
    }

    return this.truncateText(prompt, maxTokens);
  }
}
