import * as fs from 'fs';
import * as path from 'path';
import type { DependencyInfo } from '../../types/ProjectContext';

export interface PomXmlResult {
  artifactId?: string;
  version?: string;
  javaVersion?: string;
  springBootVersion?: string;
  deps: DependencyInfo[];
}

/**
 * 轻量 pom.xml 解析（正则，覆盖常见 Spring Boot 项目）。
 */
export class PomXmlParser {
  parse(rootPath: string): PomXmlResult | null {
    const filePath = path.join(rootPath, 'pom.xml');
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const xml = fs.readFileSync(filePath, 'utf-8');
    const deps = this.parseDependencies(xml);
    const springBootVersion = this.findSpringBootVersion(xml, deps);
    const javaVersion =
      this.extractTag(xml, 'java.version') ??
      this.extractProperty(xml, 'java.version') ??
      this.extractProperty(xml, 'maven.compiler.source');

    return {
      artifactId: this.extractTag(xml, 'artifactId') ?? undefined,
      version: this.extractTag(xml, 'version') ?? undefined,
      javaVersion: javaVersion ?? undefined,
      springBootVersion: springBootVersion ?? undefined,
      deps,
    };
  }

  private parseDependencies(xml: string): DependencyInfo[] {
    const deps: DependencyInfo[] = [];
    const blockRegex = /<dependency>([\s\S]*?)<\/dependency>/gi;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(xml)) !== null) {
      const block = match[1];
      const groupId = this.extractTag(block, 'groupId');
      const artifactId = this.extractTag(block, 'artifactId');
      const version = this.extractTag(block, 'version');
      if (!artifactId) {
        continue;
      }
      const name = groupId ? `${groupId}:${artifactId}` : artifactId;
      deps.push({
        name,
        version: version ?? 'managed',
        scope: 'dependencies',
      });
    }

    return deps;
  }

  private findSpringBootVersion(xml: string, deps: DependencyInfo[]): string | undefined {
    const parent = xml.match(/<artifactId>spring-boot-starter-parent<\/artifactId>[\s\S]*?<version>([^<]+)<\/version>/i);
    if (parent?.[1]) {
      return parent[1].trim();
    }
    const boot = deps.find((d) => d.name.includes('spring-boot-starter') && d.version !== 'managed');
    return boot?.version;
  }

  private extractTag(block: string, tag: string): string | null {
    const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
    const m = block.match(re);
    return m?.[1]?.trim() ?? null;
  }

  private extractProperty(xml: string, key: string): string | null {
    const re = new RegExp(`<${key}>([^<]*)</${key}>`, 'i');
    const inProps = xml.match(new RegExp(`<properties>[\\s\\S]*?${re.source}[\\s\\S]*?</properties>`, 'i'));
    if (inProps) {
      const m = inProps[0].match(re);
      return m?.[1]?.trim() ?? null;
    }
    const m = xml.match(re);
    return m?.[1]?.trim() ?? null;
  }
}
