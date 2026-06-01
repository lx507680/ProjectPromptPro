import type { DependencyInfo } from '../../types/ProjectContext';

/** 单技术栈扫描结果 */
export interface TechStackInfo {
  stackType: 'node' | 'java' | 'python' | 'unknown';
  label: string;
  deps: DependencyInfo[];
  scripts?: Record<string, string>;
  javaVersion?: string;
  springBootVersion?: string;
  configFiles: string[];
}

/** 策略接口：不同技术栈使用不同解析策略 */
export interface TechScanner {
  /** 是否适用于当前项目 */
  detect(rootPath: string): boolean;
  /** 解析技术栈与依赖 */
  parse(rootPath: string): Promise<TechStackInfo>;
}
