interface AnoteWindowControls {
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  getMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
}

interface AnoteStorageSnapshot {
  notes: unknown[];
  folders: unknown[];
  tombstones: unknown[];
  settings: Record<string, unknown>;
}

interface AnoteStorageBridge {
  loadAppState: () => Promise<AnoteStorageSnapshot>;
  saveNotes: (notes: unknown[]) => Promise<unknown[]>;
  saveFolders: (folders: unknown[]) => Promise<boolean>;
  saveTombstones: (tombstones: unknown[]) => Promise<boolean>;
  saveSettings: (settings: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface AnoteSyncBridge {
  run: (payload: Record<string, unknown>) => Promise<{
    notes: unknown[];
    folders: unknown[];
    tombstones: unknown[];
  }>;
}

interface AnoteMetaBridge {
  getAppVersion: () => Promise<string>;
}

interface AnoteFontsBridge {
  getAvailability: () => Promise<Record<string, { installed: boolean; downloading: boolean }>>;
  downloadPreset: (preset: string) => Promise<Record<string, { installed: boolean; downloading: boolean }>>;
  getPresetSources: (preset: string) => Promise<{
    regularDataUrl: string;
    boldDataUrl: string;
  } | null>;
}

interface AnoteExportBridge {
  saveLongImage: (payload: {
    html: string;
    width: number;
    suggestedName?: string;
  }) => Promise<{ filePath: string | null }>;
}

interface AnoteDesktopBridge {
  platform: string;
  windowControls?: AnoteWindowControls;
  storage?: AnoteStorageBridge;
  sync?: AnoteSyncBridge;
  meta?: AnoteMetaBridge;
  fonts?: AnoteFontsBridge;
  export?: AnoteExportBridge;
}

interface Window {
  anoteDesktop?: AnoteDesktopBridge;
}
