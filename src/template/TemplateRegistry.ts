import * as fs from 'fs';
import * as path from 'path';
import type { TemplateMeta } from './types';

const BUILTIN_META: Omit<TemplateMeta, 'source'>[] = [
  { id: 'feature', name: '开发新功能', description: '最常用，强调目录规范与组件复用', icon: '🔧' },
  { id: 'bugfix', name: 'Bug 修复', description: '附带错误上下文与复现步骤', icon: '🐛' },
  { id: 'refactor', name: '重构', description: '行为不变，改善结构与可维护性', icon: '🔁' },
  { id: 'docs', name: '文档 / 注释', description: '生成文档或补充注释', icon: '📚' },
  { id: 'test', name: '写测试', description: '按项目测试框架生成用例', icon: '✅' },
];

const WORKSPACE_TEMPLATE_DIR = '.project-prompt-pro/templates';
const TEAM_TEMPLATE_JSON = '.vscode/project-prompt-templates.json';

interface TeamTemplateFile {
  templates?: Record<string, string>;
}

/**
 * 加载内置模板、工作区覆盖与团队 JSON 模板。
 * 优先级：.vscode/project-prompt-templates.json > .project-prompt-pro/templates > 内置
 */
export class TemplateRegistry {
  constructor(
    private extensionPath: string,
    private workspaceRoot?: string,
  ) {}

  listTemplates(): TemplateMeta[] {
    const teamIds = this.loadTeamTemplateIds();
    return BUILTIN_META.map((meta) => {
      const source = this.resolveSource(meta.id, teamIds);
      return { ...meta, source };
    });
  }

  getTemplateContent(templateId: string): string {
    const team = this.loadTeamTemplate(templateId);
    if (team) {
      return team;
    }

    const workspacePath = this.workspaceTemplatePath(templateId);
    if (workspacePath && fs.existsSync(workspacePath)) {
      return fs.readFileSync(workspacePath, 'utf-8');
    }

    const builtinPath = path.join(this.extensionPath, 'resources', 'templates', `${templateId}.md`);
    if (!fs.existsSync(builtinPath)) {
      throw new Error(`未找到模板：${templateId}`);
    }
    return fs.readFileSync(builtinPath, 'utf-8');
  }

  getWorkspaceTemplateDir(): string | undefined {
    if (!this.workspaceRoot) {
      return undefined;
    }
    return path.join(this.workspaceRoot, WORKSPACE_TEMPLATE_DIR);
  }

  ensureWorkspaceTemplateDir(): string | undefined {
    const dir = this.getWorkspaceTemplateDir();
    if (!dir) {
      return undefined;
    }
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  getTeamTemplateJsonPath(): string | undefined {
    if (!this.workspaceRoot) {
      return undefined;
    }
    return path.join(this.workspaceRoot, TEAM_TEMPLATE_JSON);
  }

  private resolveSource(
    templateId: string,
    teamIds: Set<string>,
  ): TemplateMeta['source'] {
    if (teamIds.has(templateId)) {
      return 'workspace';
    }
    const workspacePath = this.workspaceTemplatePath(templateId);
    if (workspacePath && fs.existsSync(workspacePath)) {
      return 'workspace';
    }
    return 'builtin';
  }

  private workspaceTemplatePath(templateId: string): string | undefined {
    if (!this.workspaceRoot) {
      return undefined;
    }
    return path.join(this.workspaceRoot, WORKSPACE_TEMPLATE_DIR, `${templateId}.md`);
  }

  private loadTeamTemplateIds(): Set<string> {
    const json = this.readTeamJson();
    return new Set(Object.keys(json?.templates ?? {}));
  }

  private loadTeamTemplate(templateId: string): string | undefined {
    const json = this.readTeamJson();
    const raw = json?.templates?.[templateId];
    if (!raw) {
      return undefined;
    }
    if (raw.includes('\n') || !raw.endsWith('.md')) {
      return raw;
    }
    const base = path.dirname(this.getTeamTemplateJsonPath() ?? '');
    const resolved = path.join(base, raw);
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, 'utf-8');
    }
    return raw;
  }

  private readTeamJson(): TeamTemplateFile | null {
    const filePath = this.getTeamTemplateJsonPath();
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TeamTemplateFile;
    } catch {
      return null;
    }
  }
}
