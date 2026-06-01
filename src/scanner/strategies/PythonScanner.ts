import * as fs from 'fs';
import * as path from 'path';
import { PythonDepsParser } from '../parsers/PythonDepsParser';
import type { TechScanner, TechStackInfo } from './TechScanner';

/**
 * Python 项目扫描：检测 requirements.txt / pyproject.toml。
 */
export class PythonScanner implements TechScanner {
  private parser = new PythonDepsParser();

  detect(rootPath: string): boolean {
    return (
      fs.existsSync(path.join(rootPath, 'requirements.txt')) ||
      fs.existsSync(path.join(rootPath, 'pyproject.toml')) ||
      fs.existsSync(path.join(rootPath, 'setup.py'))
    );
  }

  async parse(rootPath: string): Promise<TechStackInfo> {
    const deps = this.parser.parse(rootPath);
    const configFiles: string[] = [];

    if (fs.existsSync(path.join(rootPath, 'requirements.txt'))) {
      configFiles.push('requirements.txt');
    }
    if (fs.existsSync(path.join(rootPath, 'pyproject.toml'))) {
      configFiles.push('pyproject.toml');
    }
    if (fs.existsSync(path.join(rootPath, 'setup.py'))) {
      configFiles.push('setup.py');
    }

    const depNames = new Set(deps.map((d) => d.name.toLowerCase()));
    const parts: string[] = ['Python'];
    if (depNames.has('fastapi')) {
      parts.push('FastAPI');
    } else if (depNames.has('flask')) {
      parts.push('Flask');
    } else if (depNames.has('django')) {
      parts.push('Django');
    }

    return {
      stackType: 'python',
      label: parts.join(' · '),
      deps,
      configFiles,
    };
  }
}
