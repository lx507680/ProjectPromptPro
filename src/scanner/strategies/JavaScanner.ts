import * as fs from 'fs';
import * as path from 'path';
import { PomXmlParser } from '../parsers/PomXmlParser';
import type { TechScanner, TechStackInfo } from './TechScanner';

/**
 * Java 项目扫描：检测 pom.xml / build.gradle。
 */
export class JavaScanner implements TechScanner {
  private pomParser = new PomXmlParser();

  detect(rootPath: string): boolean {
    return (
      fs.existsSync(path.join(rootPath, 'pom.xml')) ||
      fs.existsSync(path.join(rootPath, 'build.gradle')) ||
      fs.existsSync(path.join(rootPath, 'build.gradle.kts'))
    );
  }

  async parse(rootPath: string): Promise<TechStackInfo> {
    const configFiles: string[] = [];
    const pom = this.pomParser.parse(rootPath);

    if (pom) {
      configFiles.push('pom.xml');
    }
    if (fs.existsSync(path.join(rootPath, 'build.gradle'))) {
      configFiles.push('build.gradle');
    }
    if (fs.existsSync(path.join(rootPath, 'build.gradle.kts'))) {
      configFiles.push('build.gradle.kts');
    }

    const parts: string[] = [];
    if (pom?.springBootVersion) {
      parts.push(`Spring Boot ${pom.springBootVersion}`);
    } else if (configFiles.some((f) => f.includes('gradle'))) {
      parts.push('Gradle');
    } else if (pom) {
      parts.push('Maven');
    }
    if (pom?.javaVersion) {
      parts.push(`Java ${pom.javaVersion}`);
    }

    return {
      stackType: 'java',
      label: parts.length > 0 ? parts.join(' · ') : 'Java',
      deps: pom?.deps ?? [],
      javaVersion: pom?.javaVersion,
      springBootVersion: pom?.springBootVersion,
      configFiles,
    };
  }
}
