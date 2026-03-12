export type SyncProvider = 'github' | 'webdav';

export interface SyncSummary {
  ok: boolean;
  error?: string;
  provider: SyncProvider;
  syncedAt?: string;
}
