/** 默认排除的目录/文件模式 */
export const DEFAULT_EXCLUDES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/__pycache__/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/vendor/**',
  '**/test-out/**',
  '**/test/fixtures/**',
  '**/*.min.js',
  '**/*.map',
  '**/.env',
  '**/.env.*',
  '**/secrets/**',
  '**/*credentials*',
];

/** 入口文件候选（按优先级） */
export const ENTRY_CANDIDATES = [
  'src/extension.ts',
  'src/main.ts',
  'src/main.tsx',
  'src/main.js',
  'src/index.ts',
  'src/index.tsx',
  'src/index.js',
  'src/app.tsx',
  'src/App.tsx',
  'src/App.vue',
  'main.ts',
  'index.ts',
  'index.tsx',
];

/** Java Spring Boot 入口（不含 test/fixtures） */
export const JAVA_ENTRY_PATTERN = /src\/main\/java\/.*Application\.java$/;

/** 扫描时应忽略的测试/构建产物路径前缀 */
export const SCAN_NOISE_PREFIXES = ['test-out/', 'test/fixtures/'];

/** 是否属于测试样例或编译产物，不应进入 Prompt 上下文 */
export function isNoiseScanPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return SCAN_NOISE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** 生产代码优先：src/ 最高，test/fixtures 最低 */
export function scanPathPriority(relativePath: string): number {
  if (isNoiseScanPath(relativePath)) {
    return -1;
  }
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('src/')) {
    return 10;
  }
  if (normalized.startsWith('test/')) {
    return 1;
  }
  return 5;
}

/** 架构层目录规则 */
export const ARCHITECTURE_RULES: Array<{
  layer: string;
  patterns: string[];
  confidence: 'high' | 'medium' | 'low';
}> = [
  { layer: 'controller', patterns: ['**/controller/**', '**/controllers/**'], confidence: 'high' },
  { layer: 'service', patterns: ['**/service/**', '**/services/**'], confidence: 'high' },
  { layer: 'model', patterns: ['**/model/**', '**/models/**', '**/entity/**', '**/entities/**'], confidence: 'high' },
  { layer: 'repository', patterns: ['**/repository/**', '**/repositories/**', '**/mapper/**'], confidence: 'high' },
  { layer: 'views', patterns: ['**/views/**', '**/pages/**', '**/page/**'], confidence: 'high' },
  { layer: 'components', patterns: ['**/components/**', '**/component/**'], confidence: 'high' },
  { layer: 'store', patterns: ['**/store/**', '**/stores/**'], confidence: 'high' },
  { layer: 'api', patterns: ['**/api/**', '**/apis/**'], confidence: 'medium' },
  { layer: 'router', patterns: ['**/router/**', '**/routes/**'], confidence: 'high' },
  { layer: 'utils', patterns: ['**/utils/**', '**/util/**', '**/lib/**'], confidence: 'medium' },
];
