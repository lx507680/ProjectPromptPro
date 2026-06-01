import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { FileFingerprint } from './types';

export class IncrementalScanner {
  buildFingerprints(rootPath: string, files: string[]): Record<string, FileFingerprint> {
    const map: Record<string, FileFingerprint> = {};
    for (const rel of files) {
      const fp = this.statFile(rootPath, rel);
      if (fp) {
        map[rel] = fp;
      }
    }
    return map;
  }

  /** 指纹未变则返回 true */
  isValid(
    cached: Record<string, FileFingerprint>,
    current: Record<string, FileFingerprint>,
  ): boolean {
    const cachedKeys = Object.keys(cached);
    const currentKeys = Object.keys(current);
    if (cachedKeys.length !== currentKeys.length) {
      return false;
    }
    for (const key of cachedKeys) {
      const a = cached[key];
      const b = current[key];
      if (!b || a.mtimeMs !== b.mtimeMs || a.size !== b.size) {
        return false;
      }
    }
    return true;
  }

  getChangedPaths(
    cached: Record<string, FileFingerprint>,
    current: Record<string, FileFingerprint>,
  ): string[] {
    const changed: string[] = [];
    const all = new Set([...Object.keys(cached), ...Object.keys(current)]);
    for (const p of all) {
      const a = cached[p];
      const b = current[p];
      if (!a || !b || a.mtimeMs !== b.mtimeMs || a.size !== b.size) {
        changed.push(p);
      }
    }
    return changed;
  }

  hashConfig(parts: unknown[]): string {
    return crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12);
  }

  private statFile(rootPath: string, rel: string): FileFingerprint | null {
    try {
      const st = fs.statSync(path.join(rootPath, rel));
      if (!st.isFile()) {
        return null;
      }
      return { mtimeMs: st.mtimeMs, size: st.size };
    } catch {
      return null;
    }
  }
}
