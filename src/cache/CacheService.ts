import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { ProjectContext } from '../types/ProjectContext';
import { IncrementalScanner } from './IncrementalScanner';
import type { FileFingerprint, ScanCacheEntry } from './types';

const CACHE_VERSION = 1;
const STORAGE_PREFIX = 'ppp.scan.';

export class CacheService {
  private incremental = new IncrementalScanner();
  private dirtyWorkspaces = new Set<string>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  markDirty(workspaceRoot: string): void {
    this.dirtyWorkspaces.add(workspaceRoot);
  }

  isDirty(workspaceRoot: string): boolean {
    return this.dirtyWorkspaces.has(workspaceRoot);
  }

  clearDirty(workspaceRoot: string): void {
    this.dirtyWorkspaces.delete(workspaceRoot);
  }

  async load(
    workspaceRoot: string,
    currentFingerprints: Record<string, FileFingerprint>,
    gitHead: string | undefined,
    configHash: string,
  ): Promise<ProjectContext | null> {
    const config = vscode.workspace.getConfiguration('projectPromptPro');
    if (!config.get<boolean>('enableCache', true)) {
      return null;
    }
    if (this.isDirty(workspaceRoot)) {
      return null;
    }

    const entry = this.context.workspaceState.get<ScanCacheEntry>(
      this.storageKey(workspaceRoot),
    );
    if (!entry || entry.version !== CACHE_VERSION) {
      return null;
    }
    if (entry.context.meta.rootPath !== workspaceRoot) {
      return null;
    }
    if (entry.gitHead !== gitHead || entry.configHash !== configHash) {
      return null;
    }
    if (!this.incremental.isValid(entry.fingerprints, currentFingerprints)) {
      return null;
    }

    return {
      ...entry.context,
      meta: {
        ...entry.context.meta,
        cached: true,
        durationMs: 0,
        scannedAt: Date.now(),
      },
    };
  }

  async save(
    context: ProjectContext,
    fingerprints: Record<string, FileFingerprint>,
    gitHead: string | undefined,
    configHash: string,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('projectPromptPro');
    if (!config.get<boolean>('enableCache', true)) {
      return;
    }

    const entry: ScanCacheEntry = {
      version: CACHE_VERSION,
      context: { ...context, meta: { ...context.meta, cached: false } },
      fingerprints,
      gitHead,
      configHash,
      savedAt: Date.now(),
    };

    await this.context.workspaceState.update(this.storageKey(context.meta.rootPath), entry);
    this.clearDirty(context.meta.rootPath);
  }

  getCachedEntry(workspaceRoot: string): ScanCacheEntry | undefined {
    return this.context.workspaceState.get<ScanCacheEntry>(this.storageKey(workspaceRoot));
  }

  buildConfigHash(parts: unknown[]): string {
    return this.incremental.hashConfig(parts);
  }

  getIncrementalScanner(): IncrementalScanner {
    return this.incremental;
  }

  async invalidate(workspaceRoot: string): Promise<void> {
    this.markDirty(workspaceRoot);
    await this.context.workspaceState.update(this.storageKey(workspaceRoot), undefined);
  }

  private storageKey(workspaceRoot: string): string {
    const hash = crypto.createHash('sha1').update(workspaceRoot).digest('hex').slice(0, 16);
    return `${STORAGE_PREFIX}${hash}`;
  }
}
