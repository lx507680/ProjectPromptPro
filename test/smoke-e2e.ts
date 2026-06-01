/**
 * 端到端冒烟测试：扫描 → 模板渲染 → Prompt 生成（无需 VS Code API）
 * 运行：npx ts-node --project tsconfig.test.json test/smoke-e2e.ts
 * 或：npm run test:smoke
 */
import * as fs from 'fs';
import * as path from 'path';
import { TemplateEngine } from '../src/template/TemplateEngine';
import { TemplateRegistry } from '../src/template/TemplateRegistry';
import { TokenController } from '../src/token/TokenController';
import { toTemplateRenderContext } from '../src/types/ProjectContext';
import { headlessScan } from './helpers/headlessScan';

const ROOT = path.resolve(__dirname, '../..');
const FIXTURES = path.join(ROOT, 'test/fixtures');
const EXTENSION_PATH = ROOT;

const TEMPLATES = ['feature', 'bugfix', 'refactor', 'docs', 'test'] as const;

interface CaseResult {
  fixture: string;
  template: string;
  ok: boolean;
  techStack: string;
  tokenEstimate: number;
  truncated: boolean;
  checks: string[];
  error?: string;
}

function checkPromptStructure(prompt: string, templateId: string): string[] {
  const checks: string[] = [];
  const required = ['[Context]', '[Objective]', '[Style]', '[Tone]', '[Audience]', '[Response]', '<code>'];
  for (const tag of required) {
    if (prompt.includes(tag)) {
      checks.push(`✓ 含 ${tag}`);
    } else {
      checks.push(`✗ 缺少 ${tag}`);
    }
  }
  if (templateId === 'bugfix' && prompt.includes('<error>')) {
    checks.push('✓ 含 <error>');
  } else if (templateId === 'bugfix') {
    checks.push('✗ 缺少 <error>');
  }
  if (!prompt.includes('[未识别:')) {
    checks.push('✓ 无未识别变量');
  } else {
    checks.push('✗ 存在未识别变量');
  }
  return checks;
}

async function runCase(fixtureName: string, templateId: string): Promise<CaseResult> {
  const fixturePath = path.join(FIXTURES, fixtureName);
  const userInput =
    templateId === 'bugfix'
      ? 'TypeError: Cannot read property "token" of undefined\n复现：点击登录按钮，未传 token 时崩溃'
      : '用户登录接口加一个短信验证码';

  try {
    const { context } = await headlessScan(fixturePath);
    const registry = new TemplateRegistry(EXTENSION_PATH, fixturePath);
    const template = registry.getTemplateContent(templateId);
    const { vars, flags, lists } = toTemplateRenderContext(context, {
      userInput,
      modelStyle: 'default',
    });

    const engine = new TemplateEngine();
    let prompt = engine.render(template, vars, flags, lists);

    const controller = new TokenController();
    const budget = controller.applyPromptBudget(prompt, 50000);
    prompt = budget.text;

    const checks = checkPromptStructure(prompt, templateId);
    const ok = checks.every((c) => c.startsWith('✓'));

    return {
      fixture: fixtureName,
      template: templateId,
      ok,
      techStack: context.techStack,
      tokenEstimate: budget.estimatedTokens,
      truncated: budget.truncated,
      checks,
    };
  } catch (err) {
    return {
      fixture: fixtureName,
      template: templateId,
      ok: false,
      techStack: '',
      tokenEstimate: 0,
      truncated: false,
      checks: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Project Prompt Pro — 端到端冒烟测试');
  console.log('═══════════════════════════════════════════\n');

  const fixtures = ['vue-vite', 'react-vite', 'spring-boot'];
  const results: CaseResult[] = [];

  for (const fixture of fixtures) {
    for (const template of TEMPLATES) {
      results.push(await runCase(fixture, template));
    }
  }

  // 用插件自身项目再测一次
  results.push(await runCaseOnProject());

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const status = r.ok ? 'PASS' : 'FAIL';
    if (r.ok) {
      passed++;
    } else {
      failed++;
    }

    console.log(`[${status}] ${r.fixture} × ${r.template}`);
    if (r.error) {
      console.log(`       错误: ${r.error}`);
    } else {
      console.log(`       技术栈: ${r.techStack}`);
      console.log(`       Token: ~${r.tokenEstimate}${r.truncated ? ' (已截断)' : ''}`);
      for (const c of r.checks) {
        console.log(`       ${c}`);
      }
    }
    console.log('');
  }

  // 输出一份 feature 模板样例
  const sample = results.find((r) => r.fixture === 'vue-vite' && r.template === 'feature' && r.ok);
  if (sample) {
    const { context } = await headlessScan(path.join(FIXTURES, 'vue-vite'));
    const registry = new TemplateRegistry(EXTENSION_PATH, path.join(FIXTURES, 'vue-vite'));
    const template = registry.getTemplateContent('feature');
    const { vars, flags, lists } = toTemplateRenderContext(context, {
      userInput: '用户登录接口加一个短信验证码',
      modelStyle: 'default',
    });
    const prompt = new TemplateEngine().render(template, vars, flags, lists);
    const preview = prompt.slice(0, 1200);
    const outPath = path.join(ROOT, 'test-out', 'smoke-sample-prompt.txt');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, prompt, 'utf-8');
    console.log('───────────────────────────────────────────');
    console.log('样例 Prompt 预览（vue-vite × feature，前 1200 字）：');
    console.log('───────────────────────────────────────────');
    console.log(preview + (prompt.length > 1200 ? '\n…[截断预览]' : ''));
    console.log(`\n完整样例已写入: ${outPath}\n`);
  }

  console.log('═══════════════════════════════════════════');
  console.log(`  结果: ${passed} 通过, ${failed} 失败 / 共 ${results.length} 项`);
  console.log('═══════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

async function runCaseOnProject(): Promise<CaseResult> {
  const fixtureName = 'project-prompt-pro (自身)';
  const templateId = 'feature';
  const userInput = '给 Sidebar Webview 增加 Bug 模板的双输入框';

  try {
    const { context } = await headlessScan(ROOT);
    const registry = new TemplateRegistry(EXTENSION_PATH, ROOT);
    const template = registry.getTemplateContent(templateId);
    const { vars, flags, lists } = toTemplateRenderContext(context, {
      userInput,
      modelStyle: 'deepseek',
    });

    const engine = new TemplateEngine();
    let prompt = engine.render(template, vars, flags, lists);
    const controller = new TokenController();
    const budget = controller.applyPromptBudget(prompt, 50000);
    prompt = budget.text;

    const checks = checkPromptStructure(prompt, templateId);
    checks.push(context.deps.length > 0 ? '✓ 识别到依赖' : '✗ 未识别依赖');
    checks.push(context.snippets.length > 0 ? '✓ 采样到代码片段' : '✗ 无代码片段');

    const ok = checks.every((c) => c.startsWith('✓'));

    return {
      fixture: fixtureName,
      template: templateId,
      ok,
      techStack: context.techStack,
      tokenEstimate: budget.estimatedTokens,
      truncated: budget.truncated,
      checks,
    };
  } catch (err) {
    return {
      fixture: fixtureName,
      template: templateId,
      ok: false,
      techStack: '',
      tokenEstimate: 0,
      truncated: false,
      checks: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
