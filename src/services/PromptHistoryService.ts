import * as vscode from 'vscode';
import type { ModelStyle } from '../template/types';

export interface PromptHistoryEntry {
  id: string;
  createdAt: number;
  templateId: string;
  modelStyle: ModelStyle;
  userInput: string;
  promptPreview: string;
  estimatedTokens: number;
}

const MAX_HISTORY = 20;
const STORAGE_KEY = 'promptHistory';
const LAST_TEMPLATE_KEY = 'lastTemplateId';
const LAST_MODEL_KEY = 'lastModelStyle';

/**
 * 工作区级 Prompt 历史与常用模板记忆。
 */
export class PromptHistoryService {
  constructor(private context: vscode.ExtensionContext) {}

  async rememberUsage(templateId: string, modelStyle: ModelStyle): Promise<void> {
    await this.context.workspaceState.update(LAST_TEMPLATE_KEY, templateId);
    await this.context.workspaceState.update(LAST_MODEL_KEY, modelStyle);
  }

  getLastTemplateId(): string | undefined {
    return this.context.workspaceState.get<string>(LAST_TEMPLATE_KEY);
  }

  getLastModelStyle(): ModelStyle | undefined {
    return this.context.workspaceState.get<ModelStyle>(LAST_MODEL_KEY);
  }

  async addEntry(entry: Omit<PromptHistoryEntry, 'id' | 'createdAt'>): Promise<void> {
    const list = this.getHistory();
    const item: PromptHistoryEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      promptPreview: entry.promptPreview.slice(0, 500),
    };
    list.unshift(item);
    await this.context.workspaceState.update(STORAGE_KEY, list.slice(0, MAX_HISTORY));
  }

  getHistory(): PromptHistoryEntry[] {
    return this.context.workspaceState.get<PromptHistoryEntry[]>(STORAGE_KEY, []);
  }

  async clear(): Promise<void> {
    await this.context.workspaceState.update(STORAGE_KEY, []);
  }
}
