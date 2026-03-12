import type { SyncSummary, SyncProvider } from '@anote/shared-types';

export interface SyncClient {
  provider: SyncProvider;
  sync(): Promise<SyncSummary>;
}

export function createUnimplementedSyncClient(provider: SyncProvider): SyncClient {
  return {
    provider,
    async sync() {
      return {
        ok: false,
        provider,
        error: `Sync client for ${provider} has not been implemented in the shared package yet.`,
      };
    },
  };
}
