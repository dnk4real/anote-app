export interface Folder {
  id: string;
  name: string;
  createdAt: string;
}

export interface Note {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
  isStarred: boolean;
  isDeleted: boolean;
  folderIds: string[];
  sha?: string;
}

export interface GitHubConfig {
  token: string;
  repo: string;
  branch: string;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncAt?: string;
  error?: string;
}
