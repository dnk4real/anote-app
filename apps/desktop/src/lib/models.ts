export interface Folder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
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

export interface WebDAVConfig {
  serverUrl: string;
  username: string;
  password: string;
  fileName: string;
}

export type SyncProvider = 'github' | 'webdav';

export interface NoteTombstone {
  id: string;
  deletedAt: string;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncAt?: string;
  error?: string;
}

export type LanguagePreference = 'system' | 'en' | 'zh';
export type AppLanguage = 'en' | 'zh';
export type FontPreset = 'system' | 'sarasa_gothic' | 'source_han_serif' | 'glow_sans';
export type DownloadableFontPreset = Exclude<FontPreset, 'system'>;
export type LongImageTheme = 'light' | 'dark';

export type FontAvailabilityMap = Record<
  FontPreset,
  {
    installed: boolean;
    downloading: boolean;
  }
>;

export interface FontPresetSources {
  regularDataUrl: string;
  boldDataUrl: string;
}

export interface DesktopSettings {
  syncProvider: SyncProvider;
  githubConfig: GitHubConfig | null;
  webdavConfig: WebDAVConfig | null;
  languagePreference: LanguagePreference;
  fontPreset: FontPreset;
}

export interface DesktopSnapshot {
  notes: Note[];
  folders: Folder[];
  tombstones: NoteTombstone[];
  settings: DesktopSettings;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  syncProvider: 'github',
  githubConfig: null,
  webdavConfig: null,
  languagePreference: 'system',
  fontPreset: 'system',
};

export const DEFAULT_FONT_AVAILABILITY: FontAvailabilityMap = {
  system: { installed: true, downloading: false },
  sarasa_gothic: { installed: false, downloading: false },
  source_han_serif: { installed: false, downloading: false },
  glow_sans: { installed: false, downloading: false },
};
