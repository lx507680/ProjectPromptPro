import type { TechScanner, TechStackInfo } from './TechScanner';
import { JavaScanner } from './JavaScanner';
import { NodeScanner } from './NodeScanner';
import { PythonScanner } from './PythonScanner';

/**
 * 扫描器管理器：按优先级尝试各 TechScanner 策略。
 */
export class ProjectScannerManager {
  private scanners: TechScanner[];

  constructor(rulesPath?: string) {
    this.scanners = [new NodeScanner(rulesPath), new JavaScanner(), new PythonScanner()];
  }

  async scan(rootPath: string): Promise<TechStackInfo | null> {
    for (const scanner of this.scanners) {
      if (scanner.detect(rootPath)) {
        return scanner.parse(rootPath);
      }
    }
    return null;
  }

  /** 多栈 monorepo：合并所有匹配策略的结果 */
  async scanAll(rootPath: string): Promise<TechStackInfo[]> {
    const results: TechStackInfo[] = [];
    for (const scanner of this.scanners) {
      if (scanner.detect(rootPath)) {
        results.push(await scanner.parse(rootPath));
      }
    }
    return results;
  }
}
