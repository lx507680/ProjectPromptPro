const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '那', '把', '被', '让', '给', '用', '可以', '需要', '进行', '实现',
  '添加', '增加', '修改', '更新', '支持', '功能', '页面', '接口', '方法', '文件',
  'the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'with', 'and', 'or', 'is', 'are',
  'be', 'this', 'that', 'it', 'at', 'by', 'from', 'as', 'add', 'update', 'fix',
  'please', 'want', 'need', 'should', 'would', 'could',
]);

/** 从用户需求文本提取可用于文件匹配的关键词 */
export function extractKeywords(userInput: string): string[] {
  const raw = userInput.trim();
  if (!raw) {
    return [];
  }

  const tokens = new Set<string>();

  for (const m of raw.matchAll(/[A-Za-z][A-Za-z0-9]*(?:[A-Z][a-z0-9]+)+/g)) {
    splitCamelCase(m[0]).forEach((t) => tokens.add(t.toLowerCase()));
    tokens.add(m[0].toLowerCase());
  }

  for (const m of raw.matchAll(/[A-Za-z][A-Za-z0-9_-]{1,}/g)) {
    const word = m[0].toLowerCase();
    if (word.length >= 2 && !STOP_WORDS.has(word)) {
      tokens.add(word);
    }
  }

  for (const m of raw.matchAll(/[\u4e00-\u9fff]{2,8}/g)) {
    const phrase = m[0];
    if (!STOP_WORDS.has(phrase)) {
      tokens.add(phrase);
      if (phrase.length >= 4) {
        for (let i = 0; i + 2 <= phrase.length; i += 2) {
          const part = phrase.slice(i, i + 2);
          if (!STOP_WORDS.has(part)) {
            tokens.add(part);
          }
        }
      }
    }
  }

  return [...tokens]
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    .sort((a, b) => b.length - a.length)
    .slice(0, 24);
}

function splitCamelCase(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter((p) => p.length >= 2);
}
