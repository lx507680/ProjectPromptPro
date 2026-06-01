import type { TemplateMeta } from './types';

export type BuiltinTemplateId = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test';

const BUGFIX_PATTERNS = [
  /\b(error|exception|bug|fix|fail|crash|null|undefined)\b/i,
  /TypeError|SyntaxError|ReferenceError|NullPointerException/i,
  /修复|报错|崩溃|异常|出错|不工作|失败|无法|报错信息/,
  /stack\s*trace|at\s+\w+\.\w+/i,
  /cannot read propert/i,
];

const REFACTOR_PATTERNS = [/重构|refactor|rename|重命名|extract|抽取|拆分|优化结构|clean\s*up/i];

const DOCS_PATTERNS = [/文档|注释|readme|doc\b|comment|说明文档|javadoc|jsdoc/i];

const TEST_PATTERNS = [/单元测试|unit\s*test|测试用例|coverage|jest|vitest|pytest|mocha|spec\b/i];

/** 根据用户需求自动推断最合适的内置模板 */
export function inferTemplateId(userInput: string): BuiltinTemplateId {
  const text = userInput.trim();
  if (!text) {
    return 'feature';
  }

  if (BUGFIX_PATTERNS.some((p) => p.test(text))) {
    return 'bugfix';
  }
  if (TEST_PATTERNS.some((p) => p.test(text))) {
    return 'test';
  }
  if (REFACTOR_PATTERNS.some((p) => p.test(text))) {
    return 'refactor';
  }
  if (DOCS_PATTERNS.some((p) => p.test(text))) {
    return 'docs';
  }
  return 'feature';
}

/** 将 UI 中的 auto 解析为具体模板 id */
export function resolveTemplateId(templateId: string, userInput: string): string {
  if (templateId === 'auto') {
    return inferTemplateId(userInput);
  }
  return templateId;
}

export const AUTO_TEMPLATE_META: TemplateMeta = {
  id: 'auto',
  name: '自动识别',
  description: '根据需求关键词自动选择 feature / bugfix / refactor 等模板',
  icon: '✨',
  source: 'builtin',
};
