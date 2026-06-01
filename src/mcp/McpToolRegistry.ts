import * as fs from 'fs';
import * as path from 'path';
import { RelevanceMatcher } from '../matcher/RelevanceMatcher';
import { isNoiseScanPath } from '../scanner/constants';
import { SensitiveFilter } from '../scanner/SensitiveFilter';
import type { ProjectContext } from '../types/ProjectContext';
import { parseExternalToolName } from './config';
import type { McpClientManager } from './McpClientManager';
import type { McpTool, McpToolContext } from './types';

export class McpToolRegistry {
  private builtinTools = new Map<string, McpTool>();
  private externalRegistered = new Map<string, { description: string; serverName: string }>();

  constructor(private externalManager?: McpClientManager) {
    for (const tool of buildBuiltinTools()) {
      this.builtinTools.set(tool.name, tool);
    }
  }

  /** 连接外部 MCP 并注册其工具 */
  async refreshExternalTools(): Promise<{ connected: number; failed: string[] }> {
    this.externalRegistered.clear();
    if (!this.externalManager) {
      return { connected: 0, failed: [] };
    }
    const result = await this.externalManager.connectAll();
    for (const meta of this.externalManager.getExternalTools()) {
      this.externalRegistered.set(meta.registeredName, {
        description: `[${meta.serverName}] ${meta.description}`,
        serverName: meta.serverName,
      });
    }
    return result;
  }

  listTools(): McpTool[] {
    const builtin = [...this.builtinTools.values()];
    const external: McpTool[] = [...this.externalRegistered.entries()].map(([name, meta]) => ({
      name,
      description: meta.description,
      parameters: schemaToParameters(this.externalManager?.getExternalTools().find((t) => t.registeredName === name)?.inputSchema),
      execute: async (args, _ctx) => {
        if (!this.externalManager) {
          return JSON.stringify({ error: '外部 MCP 未启用' });
        }
        return this.externalManager.callExternalTool(name, args);
      },
    }));
    return [...builtin, ...external];
  }

  getTool(name: string): McpTool | undefined {
    return this.listTools().find((t) => t.name === name);
  }

  createContext(workspaceRoot: string, context: ProjectContext, sanitize = true): McpToolContext {
    return {
      workspaceRoot,
      context,
      relevanceMatcher: new RelevanceMatcher(),
      sensitiveFilter: new SensitiveFilter(sanitize),
    };
  }

  formatToolsForPrompt(): string {
    const sections: string[] = [];
    const builtin = [...this.builtinTools.values()];
    if (builtin.length > 0) {
      sections.push(
        '### 内置工具\n' +
          builtin
            .map((t) => formatToolDoc(t))
            .join('\n\n'),
      );
    }
    const external = [...this.externalRegistered.entries()];
    if (external.length > 0) {
      sections.push(
        '### 外部 MCP 工具\n' +
          external
            .map(([name, meta]) => `- ${name}: ${meta.description}`)
            .join('\n'),
      );
    }
    return sections.join('\n\n');
  }

  async execute(name: string, args: Record<string, unknown>, ctx: McpToolContext): Promise<string> {
    const external = parseExternalToolName(name);
    if (external && this.externalManager) {
      try {
        const result = await this.externalManager.callExternalTool(name, args);
        return result.length > 12_000 ? `${result.slice(0, 12_000)}\n…（已截断）` : result;
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      }
    }

    const tool = this.builtinTools.get(name);
    if (!tool) {
      return JSON.stringify({ error: `未知工具: ${name}` });
    }
    try {
      const result = await tool.execute(args, ctx);
      return result.length > 12_000 ? `${result.slice(0, 12_000)}\n…（已截断）` : result;
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  }
}

function formatToolDoc(t: McpTool): string {
  const params = Object.entries(t.parameters)
    .map(([k, v]) => `    - ${k} (${v.type}${v.required ? ', 必填' : ''}): ${v.description}`)
    .join('\n');
  return `- ${t.name}: ${t.description}\n${params}`;
}

function schemaToParameters(
  schema?: Record<string, unknown>,
): Record<string, { type: 'string' | 'number' | 'boolean'; description: string; required?: boolean }> {
  if (!schema || typeof schema !== 'object') {
    return {};
  }
  const props = schema.properties as Record<string, { type?: string; description?: string }> | undefined;
  const required = (schema.required as string[] | undefined) ?? [];
  if (!props) {
    return {};
  }
  const out: Record<string, { type: 'string' | 'number' | 'boolean'; description: string; required?: boolean }> = {};
  for (const [key, val] of Object.entries(props)) {
    const t = val.type === 'number' || val.type === 'integer' ? 'number' : val.type === 'boolean' ? 'boolean' : 'string';
    out[key] = { type: t, description: val.description ?? key, required: required.includes(key) };
  }
  return out;
}

function buildBuiltinTools(): McpTool[] {
  return [
    {
      name: 'get_project_summary',
      description: '获取项目技术栈、架构分层、入口文件、API 风格摘要',
      parameters: {},
      execute: async (_args, ctx) => {
        const c = ctx.context;
        return JSON.stringify(
          {
            techStack: c.techStack,
            apiStyle: c.apiStyle,
            codeStyle: c.codeStyle,
            architecture: c.architecture.map((a) => ({ layer: a.layer, paths: a.paths })),
            entries: c.entries.map((e) => ({ path: e.path, role: e.role })),
            fileCount: c.meta.fileCount,
            deps: c.deps.slice(0, 20).map((d) => `${d.name}@${d.version}`),
          },
          null,
          2,
        );
      },
    },
    {
      name: 'search_files',
      description: '按关键词搜索项目文件路径（模糊匹配）',
      parameters: {
        query: { type: 'string', description: '搜索关键词', required: true },
        limit: { type: 'number', description: '最多返回条数，默认 15' },
      },
      execute: async (args, ctx) => {
        const query = String(args.query ?? '').toLowerCase().trim();
        const limit = Math.min(Number(args.limit) || 15, 30);
        if (!query) {
          return JSON.stringify({ error: 'query 不能为空' });
        }
        const files = ctx.context.files ?? [];
        const matched = files
          .filter((f) => !isNoiseScanPath(f) && f.toLowerCase().includes(query))
          .slice(0, limit);
        return JSON.stringify({ query, matches: matched, total: matched.length }, null, 2);
      },
    },
    {
      name: 'find_related_files',
      description: '根据需求描述匹配最相关的文件（语义路径匹配）',
      parameters: {
        requirement: { type: 'string', description: '需求描述片段', required: true },
      },
      execute: async (args, ctx) => {
        const requirement = String(args.requirement ?? '').trim();
        if (!requirement) {
          return JSON.stringify({ error: 'requirement 不能为空' });
        }
        const matches = ctx.relevanceMatcher.match(requirement, ctx.context);
        return JSON.stringify(
          {
            requirement,
            matches: matches.map((m) => ({
              path: m.path,
              score: m.score,
              keywords: m.matchedKeywords,
            })),
          },
          null,
          2,
        );
      },
    },
    {
      name: 'read_file',
      description: '读取项目内单个文件的代码内容（自动截断）',
      parameters: {
        path: { type: 'string', description: '相对工作区根目录的文件路径', required: true },
        maxLines: { type: 'number', description: '最多读取行数，默认 120' },
      },
      execute: async (args, ctx) => {
        const rel = String(args.path ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
        if (!rel || isNoiseScanPath(rel)) {
          return JSON.stringify({ error: '无效或受限制的文件路径' });
        }
        if (ctx.sensitiveFilter.isSensitivePath(rel)) {
          return JSON.stringify({ error: '敏感文件已跳过' });
        }
        const full = path.join(ctx.workspaceRoot, rel);
        if (!full.startsWith(ctx.workspaceRoot)) {
          return JSON.stringify({ error: '路径越界' });
        }
        let content: string;
        try {
          content = fs.readFileSync(full, 'utf-8');
        } catch {
          return JSON.stringify({ error: `无法读取: ${rel}` });
        }
        const maxLines = Math.min(Number(args.maxLines) || 120, 300);
        const lines = content.split('\n');
        const truncated = lines.length > maxLines;
        const slice = lines.slice(0, maxLines).join('\n');
        const redacted = ctx.sensitiveFilter.redactContent(slice);
        return JSON.stringify(
          {
            path: rel,
            lineCount: lines.length,
            truncated,
            content: redacted,
          },
          null,
          2,
        );
      },
    },
    {
      name: 'list_directory_tree',
      description: '获取项目目录结构树（已截断）',
      parameters: {
        maxDepth: { type: 'number', description: '最大深度，默认 3' },
      },
      execute: async (_args, ctx) => {
        const tree = ctx.context.structure || '（无目录树）';
        const maxChars = 6000;
        const text = tree.length > maxChars ? `${tree.slice(0, maxChars)}\n…（已截断）` : tree;
        return JSON.stringify({ structure: text }, null, 2);
      },
    },
  ];
}
