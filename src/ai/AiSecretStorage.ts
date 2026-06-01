import type * as vscode from 'vscode';

const SECRET_KEY = 'projectPromptPro.ai.apiKey';

export class AiSecretStorage {
  constructor(private context: vscode.ExtensionContext) {}

  async getApiKey(): Promise<string | undefined> {
    return this.context.secrets.get(SECRET_KEY);
  }

  async setApiKey(value: string): Promise<void> {
    const trimmed = value.trim();
    if (trimmed) {
      await this.context.secrets.store(SECRET_KEY, trimmed);
    } else {
      await this.context.secrets.delete(SECRET_KEY);
    }
  }

  async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!key?.trim();
  }
}
