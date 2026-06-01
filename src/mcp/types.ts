import type { ProjectContext } from '../types/ProjectContext';
import type { RelevanceMatcher } from '../matcher/RelevanceMatcher';
import type { SensitiveFilter } from '../scanner/SensitiveFilter';

export interface McpToolParameter {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  parameters: Record<string, McpToolParameter>;
  execute(args: Record<string, unknown>, ctx: McpToolContext): Promise<string>;
}

export interface McpToolContext {
  workspaceRoot: string;
  context: ProjectContext;
  relevanceMatcher: RelevanceMatcher;
  sensitiveFilter: SensitiveFilter;
}

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}
