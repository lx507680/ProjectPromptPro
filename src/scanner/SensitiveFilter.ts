/** 敏感文件路径模式（脱敏扫描时跳过内容读取） */
const SENSITIVE_PATH_PATTERNS = [
  /^\.env/i,
  /\.env\./i,
  /secrets?\./i,
  /credentials/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.keystore$/i,
  /id_rsa/i,
  /\.npmrc$/i,
  /docker-compose.*\.local/i,
];

const SECRET_CONTENT_PATTERNS = [
  /api[_-]?key\s*=/i,
  /secret\s*=/i,
  /password\s*=/i,
  /private[_-]?key/i,
];

export class SensitiveFilter {
  constructor(private enabled: boolean) {}

  isSensitivePath(relativePath: string): boolean {
    if (!this.enabled) {
      return false;
    }
    const normalized = relativePath.replace(/\\/g, '/');
    return SENSITIVE_PATH_PATTERNS.some((p) => p.test(normalized));
  }

  redactContent(content: string): string {
    if (!this.enabled) {
      return content;
    }
    let result = content;
    for (const pattern of SECRET_CONTENT_PATTERNS) {
      result = result.replace(pattern, (m) => `${m.split('=')[0]}=***`);
    }
    return result;
  }
}
