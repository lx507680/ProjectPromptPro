import type { ProjectContext } from '../types/ProjectContext';

export interface FileFingerprint {
  mtimeMs: number;
  size: number;
}

export interface ScanCacheEntry {
  version: 1;
  context: ProjectContext;
  fingerprints: Record<string, FileFingerprint>;
  gitHead?: string;
  configHash: string;
  savedAt: number;
}
