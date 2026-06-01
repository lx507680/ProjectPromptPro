import type { PromptHistoryService } from '../services/PromptHistoryService';
import type { PromptService } from '../services/PromptService';
import type { AgentReportViewModel } from '../ai/modes/types';

/** Webview 延迟依赖：支持扩展异步初始化 */
export interface WebviewDeps {
  getPromptService: () => PromptService | undefined;
  getExtensionPath: () => string;
  getHistory: () => PromptHistoryService | undefined;
  ensureReady: () => Promise<boolean>;
  openAgentReport?: (report: AgentReportViewModel) => void;
}
