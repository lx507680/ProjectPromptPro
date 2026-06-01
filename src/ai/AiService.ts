import * as vscode from 'vscode';
import { AiSecretStorage } from './AiSecretStorage';
import { DeepSeekProvider, OpenAiCompatibleProvider } from './providers/OpenAiCompatibleProvider';
import type { AiProvider, AiProviderId, AiRuntimeConfig } from './types';
import { DEFAULT_BASE_URLS, DEFAULT_MODELS } from './types';
import {
  AI_SETTINGS_KEY,
  type PersistedAiSettings,
  tryUpdateGlobalConfig,
} from '../utils/settingsPersistence';

export class AiService {
  private secretStorage: AiSecretStorage;

  constructor(private context: vscode.ExtensionContext) {
    this.secretStorage = new AiSecretStorage(context);
  }

  getSecretStorage(): AiSecretStorage {
    return this.secretStorage;
  }

  async loadRuntimeConfig(): Promise<Omit<AiRuntimeConfig, 'apiKey'> & { hasApiKey: boolean }> {
    const saved = this.context.globalState.get<PersistedAiSettings>(AI_SETTINGS_KEY);
    const config = vscode.workspace.getConfiguration('projectPromptPro');

    const provider =
      (saved?.provider as AiProviderId | undefined) ??
      config.get<AiProviderId>('ai.provider', 'none');
    const baseUrl =
      saved?.baseUrl ?? config.get<string>('ai.baseUrl', '') ?? DEFAULT_BASE_URLS[provider];
    const model =
      saved?.model ?? config.get<string>('ai.model', '') ?? DEFAULT_MODELS[provider];

    const hasApiKey = await this.secretStorage.hasApiKey();
    return {
      provider,
      baseUrl: baseUrl || DEFAULT_BASE_URLS[provider],
      model: model || DEFAULT_MODELS[provider],
      hasApiKey,
    };
  }

  async getProvider(): Promise<AiProvider | null> {
    const runtime = await this.buildRuntimeConfig();
    if (!runtime || runtime.provider === 'none') {
      return null;
    }
    return this.createProvider(runtime);
  }

  async buildRuntimeConfig(): Promise<AiRuntimeConfig | null> {
    const runtime = await this.loadRuntimeConfig();
    if (runtime.provider === 'none') {
      return null;
    }
    const apiKey = (await this.secretStorage.getApiKey()) ?? '';
    if (!apiKey.trim()) {
      return null;
    }
    return {
      provider: runtime.provider,
      baseUrl: runtime.baseUrl || DEFAULT_BASE_URLS[runtime.provider],
      model: runtime.model || DEFAULT_MODELS[runtime.provider],
      apiKey,
    };
  }

  createProvider(runtime: AiRuntimeConfig): AiProvider {
    switch (runtime.provider) {
      case 'deepseek':
        return new DeepSeekProvider(runtime.apiKey, runtime.model, runtime.baseUrl);
      case 'openai':
        return new OpenAiCompatibleProvider(
          'openai',
          'OpenAI',
          runtime.baseUrl,
          runtime.apiKey,
          runtime.model,
        );
      case 'custom':
        return new OpenAiCompatibleProvider(
          'custom',
          'Custom',
          runtime.baseUrl,
          runtime.apiKey,
          runtime.model,
        );
      case 'anthropic':
        return new OpenAiCompatibleProvider(
          'anthropic',
          'Anthropic (兼容网关)',
          runtime.baseUrl,
          runtime.apiKey,
          runtime.model,
        );
      default:
        throw new Error(`不支持的 Provider: ${runtime.provider}`);
    }
  }

  async testConnection(settings: {
    provider: AiProviderId;
    baseUrl: string;
    model: string;
    apiKey?: string;
  }): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
    const apiKey = settings.apiKey?.trim() || (await this.secretStorage.getApiKey()) || '';
    if (!apiKey) {
      return { ok: false, message: '请先填写 API Key' };
    }
    const provider = this.createProvider({
      provider: settings.provider,
      baseUrl: settings.baseUrl || DEFAULT_BASE_URLS[settings.provider],
      model: settings.model || DEFAULT_MODELS[settings.provider],
      apiKey,
    });
    return provider.testConnection();
  }

  async saveSettings(settings: {
    provider: AiProviderId;
    baseUrl: string;
    model: string;
    apiKey?: string;
  }): Promise<{ target: 'settings' | 'globalState'; message: string }> {
    const payload: PersistedAiSettings = {
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
    };

    await this.context.globalState.update(AI_SETTINGS_KEY, payload);

    if (settings.apiKey !== undefined) {
      await this.secretStorage.setApiKey(settings.apiKey);
    }

    const okProvider = await tryUpdateGlobalConfig('projectPromptPro.ai.provider', settings.provider);
    const okBaseUrl = await tryUpdateGlobalConfig('projectPromptPro.ai.baseUrl', settings.baseUrl);
    const okModel = await tryUpdateGlobalConfig('projectPromptPro.ai.model', settings.model);

    const syncedToSettings = okProvider && okBaseUrl && okModel;
    return {
      target: syncedToSettings ? 'settings' : 'globalState',
      message: syncedToSettings
        ? '设置已保存（API Key 存于 Secret Storage）'
        : '设置已保存到扩展内部存储（API Key 存于 Secret Storage）。若需写入 settings.json，请 Reload Window 后重试。',
    };
  }
}
