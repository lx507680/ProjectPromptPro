import * as path from 'path';
import { TemplateEngine } from '../src/template/TemplateEngine';
import { inferTemplateId } from '../src/template/TemplateSelector';
import { extractKeywords } from '../src/matcher/KeywordExtractor';
import { RelevanceMatcher } from '../src/matcher/RelevanceMatcher';
import { extractSuggestedPrompt, parseFinalAnswer, parseToolCall } from '../src/mcp/parseToolCalls';
import { externalToolName, parseExternalToolName, parseMcpServersJson } from '../src/mcp/config';
import { McpToolRegistry } from '../src/mcp/McpToolRegistry';
import { TokenBudget } from '../src/token/TokenBudget';
import { TokenController } from '../src/token/TokenController';
import { PomXmlParser } from '../src/scanner/parsers/PomXmlParser';
import { headlessScan } from './helpers/headlessScan';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}: ${msg}`);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    throw new Error(msg);
  }
}

function assertMatch(value: string, pattern: RegExp, msg: string): void {
  if (!pattern.test(value)) {
    throw new Error(`${msg}: got "${value}"`);
  }
}

async function main(): Promise<void> {
  console.log('\nProject Prompt Pro — Test Runner\n');

  const PROJECT_ROOT = path.resolve(__dirname, '../..');
  const FIXTURES = path.join(PROJECT_ROOT, 'test/fixtures');

  console.log('unit: TemplateEngine');
  await test('replaces variables', () => {
    const engine = new TemplateEngine();
    const out = engine.render('{{techStack}}', { techStack: 'Vue 3' });
    assert(out === 'Vue 3', `expected Vue 3, got ${out}`);
  });

  await test('missing variable placeholder', () => {
  const engine = new TemplateEngine();
  const out = engine.render('{{missing}}', {});
  assert(out === '[未识别: missing]', out);
});

test('empty variable renders blank', () => {
  const engine = new TemplateEngine();
  const out = engine.render('prefix{{modelHint}}suffix', { modelHint: '' });
  assert(out === 'prefixsuffix', out);
});

  await test('renders conditionals', () => {
    const engine = new TemplateEngine();
    const tpl = '{{#if react}}React项目{{/if}}{{#if vue}}Vue项目{{/if}}';
    const out = engine.render(tpl, {}, { react: true, vue: false });
    assert(out === 'React项目', out);
  });

  await test('renders loops', () => {
    const engine = new TemplateEngine();
    const tpl = '{{#each deps}}- {{.}}\n{{/each}}';
    const out = engine.render(tpl, {}, {}, { deps: ['vue@3', 'vite@5'] });
    assert(out.includes('- vue@3'), out);
    assert(out.includes('- vite@5'), out);
  });

  console.log('\nunit: TokenBudget');
  await test('truncates long text', () => {
    const budget = new TokenBudget();
    const result = budget.truncateText('x'.repeat(40000), 100);
    assert(result.truncated, 'should truncate');
    assert(result.text.includes('已截断'), 'should contain marker');
  });

  console.log('\nunit: TokenController');
  await test('smart truncate removes devDependencies when over budget', () => {
    const controller = new TokenController();
    const context = {
      meta: { rootPath: '/', scannedAt: 0, fileCount: 1, durationMs: 0 },
      techStack: 'Test',
      deps: [
        { name: 'react', version: '18', scope: 'dependencies' as const },
        { name: 'eslint', version: '8', scope: 'devDependencies' as const },
      ],
      structure: 'a'.repeat(120000),
      architecture: [],
      entries: [],
      files: [],
      snippets: [
        { path: 'a.ts', summary: 'b'.repeat(80000), lineCount: 100 },
        { path: 'b.ts', summary: 'c'.repeat(80000), lineCount: 100 },
      ],
    };
    const result = controller.smartTruncate(context, 5000);
    assert(result.truncated, 'should truncate');
    assert(result.context.snippets.length <= 1, 'should keep one snippet');
    assert(!result.context.deps.some((d) => d.scope === 'devDependencies'), 'no devDeps');
  });

  console.log('\nunit: KeywordExtractor');
  await test('extracts english and camelCase keywords', () => {
    const keywords = extractKeywords('UserController 登录接口加 sms 验证码');
    assert(keywords.includes('usercontroller') || keywords.includes('user'), 'user keyword');
    assert(keywords.includes('登录') || keywords.includes('接口'), 'chinese keyword');
  });

  console.log('\nunit: TemplateSelector');
  await test('infers bugfix from error message', () => {
    assert(inferTemplateId('TypeError: Cannot read property x of undefined') === 'bugfix', 'bugfix');
  });
  await test('infers feature for normal request', () => {
    assert(inferTemplateId('用户列表页增加按邮箱搜索') === 'feature', 'feature');
  });
  await test('infers test template', () => {
    assert(inferTemplateId('为 UserService 写单元测试') === 'test', 'test');
  });

  console.log('\nunit: RelevanceMatcher');
  await test('matches controller file from user input', async () => {
    const { context } = await headlessScan(path.join(FIXTURES, 'spring-boot'));
    const matcher = new RelevanceMatcher();
    const matches = matcher.match('修复 UserController 返回 500', context);
    assert(matches.some((m) => m.path.includes('UserController')), 'UserController match');
  });
  await test('matches vue api from user input', async () => {
    const { context } = await headlessScan(path.join(FIXTURES, 'vue-vite'));
    const matcher = new RelevanceMatcher();
    const matches = matcher.match('修改 request 请求封装', context);
    assert(matches.some((m) => m.path.includes('request')), 'request.ts match');
  });

  console.log('\nunit: MCP parseToolCalls');
  await test('parses tool_call JSON', () => {
    const text = '分析中\n<tool_call>\n{"name":"read_file","arguments":{"path":"src/App.vue"}}\n</tool_call>';
    const call = parseToolCall(text);
    assert(!!call, 'tool call');
    assert(call!.name === 'read_file', 'name');
    assert(call!.arguments.path === 'src/App.vue', 'path');
  });
  await test('parses final_answer block', () => {
    const text = '<final_answer>\n## 改造步骤\n1. 改 foo\n</final_answer>';
    const ans = parseFinalAnswer(text);
    assert(!!ans && ans.includes('改造步骤'), 'final answer');
  });
  await test('extracts suggested prompt section', () => {
    const report = '## 推荐 Prompt（复制给 Cursor）\n请修改 UserController\n\n## 其他';
    const p = extractSuggestedPrompt(report);
    assert(p.includes('UserController'), 'suggested prompt');
  });

  console.log('\nunit: MCP config');
  await test('external tool name roundtrip', () => {
    const name = externalToolName('filesystem', 'read_file');
    assert(name === 'ext__filesystem__read_file', name);
    const parsed = parseExternalToolName(name);
    assert(parsed?.serverId === 'filesystem' && parsed.toolName === 'read_file', 'parse');
  });
  await test('parses cursor mcp.json format', () => {
    const servers = parseMcpServersJson(
      '{"mcpServers":{"git":{"command":"npx","args":["-y","@modelcontextprotocol/server-git"]}}}',
      'workspace',
    );
    assert(servers.length === 1 && servers[0].id === 'git', 'git server');
    assert(servers[0].transport === 'stdio', 'stdio');
  });

  console.log('\nunit: McpToolRegistry');
  await test('search_files tool finds controller', async () => {
    const { context } = await headlessScan(path.join(FIXTURES, 'spring-boot'));
    const registry = new McpToolRegistry();
    const ctx = registry.createContext(path.join(FIXTURES, 'spring-boot'), context, true);
    const out = await registry.execute('search_files', { query: 'UserController' }, ctx);
    assert(out.includes('UserController'), out);
  });
  await test('find_related_files tool ranks matches', async () => {
    const { context } = await headlessScan(path.join(FIXTURES, 'vue-vite'));
    const registry = new McpToolRegistry();
    const ctx = registry.createContext(path.join(FIXTURES, 'vue-vite'), context, true);
    const out = await registry.execute('find_related_files', { requirement: 'request axios' }, ctx);
    assert(out.includes('request'), out);
  });

  console.log('\nunit: PomXmlParser');
  await test('parses spring boot fixture', () => {
    const root = path.join(FIXTURES, 'spring-boot');
    const result = new PomXmlParser().parse(root);
    assert(!!result, 'no result');
    assert(result!.springBootVersion === '3.2.4', 'spring boot version');
    assert(result!.javaVersion === '17', 'java version');
  });

  console.log('\nintegration: fixtures');

  await test('vue-vite stack', async () => {
    const { context } = await headlessScan(path.join(FIXTURES, 'vue-vite'));
    assertMatch(context.techStack, /Vue/i, 'techStack');
    assert(context.deps.some((d) => d.name === 'vue'), 'vue dep');
    assert(context.snippets.length > 0, 'snippets');
  });

  await test('react-vite stack', async () => {
    const { context } = await headlessScan(path.join(FIXTURES, 'react-vite'));
    assertMatch(context.techStack, /React/i, 'techStack');
  });

  await test('spring-boot stack', async () => {
    const { context } = await headlessScan(path.join(FIXTURES, 'spring-boot'));
    assertMatch(context.techStack, /Spring Boot/i, 'techStack');
    assert(context.apiStyle === 'Spring MVC', 'api style');
  });

  await test('self project excludes test fixtures', async () => {
    const { context } = await headlessScan(PROJECT_ROOT);
    assertMatch(context.techStack, /VS Code|TypeScript/i, 'techStack');
    assert(!context.entries.some((e) => e.path.includes('test/fixtures')), 'no fixture entries');
    assert(!context.snippets.some((s) => s.path.includes('test/fixtures')), 'no fixture snippets');
    assert(!context.snippets.some((s) => s.path.includes('test-out')), 'no test-out snippets');
    assert(context.entries.some((e) => e.path === 'src/extension.ts'), 'extension entry');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
