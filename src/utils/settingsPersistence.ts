import * as vscode from 'vscode';

const AI_SETTINGS_KEY = 'projectPromptPro.aiSettings';
const MCP_SERVERS_KEY = 'projectPromptPro.mcpServers';

export interface PersistedAiSettings {
  provider: string;
  baseUrl: string;
  model: string;
}

/** 尝试写入 VS Code 用户设置；失败时不抛错 */
export async function tryUpdateGlobalConfig(fullKey: string, value: unknown): Promise<boolean> {
  try {
    await vscode.workspace
      .getConfiguration()
      .update(fullKey, value, vscode.ConfigurationTarget.Global);
    return true;
  } catch {
    return false;
  }
}

export { AI_SETTINGS_KEY, MCP_SERVERS_KEY };
