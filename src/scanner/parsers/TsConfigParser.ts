import * as fs from 'fs';
import * as path from 'path';

export interface TsConfigResult {
  compilerOptions: {
    target?: string;
    module?: string;
    strict?: boolean;
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
  include?: string[];
  exclude?: string[];
  pathAliases: string[];
}

/** 去掉单行与块注释后 JSON.parse */
function parseJsonWithComments(text: string): Record<string, unknown> | null {
  try {
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 解析 tsconfig.json / jsconfig.json（支持注释）。
 */
export class TsConfigParser {
  parse(rootPath: string): TsConfigResult | null {
    const candidates = ['tsconfig.json', 'jsconfig.json'];
    let filePath: string | undefined;

    for (const name of candidates) {
      const p = path.join(rootPath, name);
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    if (!filePath) {
      return null;
    }

    const text = fs.readFileSync(filePath, 'utf-8');
    const data = parseJsonWithComments(text);
    if (!data) {
      return null;
    }

    const opts = (data.compilerOptions as Record<string, unknown>) ?? {};
    const paths = opts.paths as Record<string, string[]> | undefined;
    const pathAliases: string[] = [];

    if (paths) {
      for (const [alias, targets] of Object.entries(paths)) {
        pathAliases.push(`${alias} → ${targets.join(', ')}`);
      }
    }

    return {
      compilerOptions: {
        target: opts.target as string | undefined,
        module: opts.module as string | undefined,
        strict: opts.strict as boolean | undefined,
        baseUrl: opts.baseUrl as string | undefined,
        paths,
      },
      include: data.include as string[] | undefined,
      exclude: data.exclude as string[] | undefined,
      pathAliases,
    };
  }
}
