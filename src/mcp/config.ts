/** 外部 MCP Server 配置（兼容 Cursor mcp.json 与 VS Code 设置） */
export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: 'stdio' | 'http';
  /** stdio：启动命令 */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** http：JSON-RPC POST 端点 */
  url?: string;
  headers?: Record<string, string>;
  /** 配置来源（展示用） */
  source?: 'settings' | 'workspace' | 'global';
}

/** Cursor / Claude Desktop 风格 mcp.json */
export interface McpJsonFile {
  mcpServers?: Record<
    string,
    {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
      url?: string;
      headers?: Record<string, string>;
      disabled?: boolean;
    }
  >;
}

export const EXTERNAL_TOOL_PREFIX = 'ext__';

/** 解析 mcp.json 或 settings JSON 数组 */
export function parseMcpServersJson(
  raw: string,
  source: McpServerConfig['source'] = 'settings',
): McpServerConfig[] {
  const parsed = JSON.parse(raw) as McpJsonFile | McpServerConfig[];
  if (Array.isArray(parsed)) {
    return parsed.map((s) => ({
      ...s,
      id: s.id || s.name,
      name: s.name || s.id,
      enabled: s.enabled !== false,
      source: s.source ?? source,
    }));
  }
  return parseMcpJsonFile(parsed, source);
}

export function parseMcpJsonFile(
  file: McpJsonFile,
  source: McpServerConfig['source'],
): McpServerConfig[] {
  const servers = file.mcpServers ?? {};
  return Object.entries(servers).map(([id, cfg]) => {
    const transport: McpServerConfig['transport'] = cfg.url ? 'http' : 'stdio';
    return {
      id,
      name: id,
      enabled: cfg.disabled !== true,
      transport,
      command: cfg.command,
      args: cfg.args,
      env: cfg.env,
      cwd: cfg.cwd,
      url: cfg.url,
      headers: cfg.headers,
      source,
    };
  });
}

/** 外部工具注册名：ext__{serverId}__{toolName} */
export function externalToolName(serverId: string, toolName: string): string {
  return `${EXTERNAL_TOOL_PREFIX}${serverId}__${toolName}`;
}

export function parseExternalToolName(
  registeredName: string,
): { serverId: string; toolName: string } | null {
  if (!registeredName.startsWith(EXTERNAL_TOOL_PREFIX)) {
    return null;
  }
  const rest = registeredName.slice(EXTERNAL_TOOL_PREFIX.length);
  const sep = rest.indexOf('__');
  if (sep <= 0) {
    return null;
  }
  return { serverId: rest.slice(0, sep), toolName: rest.slice(sep + 2) };
}
