import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as GitHub from '../services/github';
import * as Storage from '../services/storage';
import * as WebDAV from '../services/webdav';
import {
  Folder,
  GitHubConfig,
  Note,
  NoteTombstone,
  SyncProvider,
  SyncState,
  WebDAVConfig,
} from '../types/note';

const SYNC_PROVIDER_KEY = '@a_note_sync_provider';

interface NotesContextType {
  notes: Note[];
  folders: Folder[];
  loading: boolean;
  searchQuery: string;
  syncState: SyncState;
  syncProvider: SyncProvider;
  githubConfig: GitHubConfig | null;
  webdavConfig: WebDAVConfig | null;

  setSearchQuery: (query: string) => void;
  setSyncProvider: (provider: SyncProvider) => Promise<void>;
  loadNotes: () => Promise<void>;
  refreshData: () => Promise<void>;
  createNote: (content: string, folderId?: string) => Promise<Note>;
  updateNote: (id: string, content: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  permanentlyDeleteNote: (id: string) => Promise<void>;
  toggleNoteStar: (id: string) => Promise<void>;
  toggleNotePin: (id: string) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  toggleNoteFolder: (noteId: string, folderId: string) => Promise<void>;
  syncWithGitHub: () => Promise<{ ok: boolean; error?: string }>;
  saveGitHubConfig: (config: GitHubConfig) => Promise<void>;
  clearGitHubConfig: () => Promise<void>;
  saveWebDAVConfig: (config: WebDAVConfig) => Promise<void>;
  clearWebDAVConfig: () => Promise<void>;
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.isStarred !== b.isStarred) return a.isStarred ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle' });
  const [syncProvider, setSyncProviderState] = useState<SyncProvider>('github');
  const [githubConfig, setGithubConfig] = useState<GitHubConfig | null>(null);
  const [webdavConfig, setWebDAVConfig] = useState<WebDAVConfig | null>(null);
  const [tombstones, setTombstones] = useState<NoteTombstone[]>([]);

  const refreshData = useCallback(async () => {
    const [
      storedNotes,
      storedFolders,
      storedTombstones,
      github,
      webdav,
      persistedProvider,
    ] = await Promise.all([
      Storage.getAllNotes(),
      Storage.getFolders(),
      Storage.getTombstones(),
      GitHub.getGitHubConfig(),
      WebDAV.getWebDAVConfig(),
      AsyncStorage.getItem(SYNC_PROVIDER_KEY),
    ]);

    setFolders(storedFolders);
    setTombstones(storedTombstones);
    setGithubConfig(github);
    setWebDAVConfig(webdav);
    setSyncProviderState(persistedProvider === 'webdav' ? 'webdav' : 'github');

    if (!searchQuery.trim()) {
      setNotes(storedNotes);
      return;
    }

    const normalized = searchQuery.trim().toLowerCase();
    const filtered = storedNotes.filter((note) => note.content.toLowerCase().includes(normalized));
    setNotes(sortNotes(filtered));
  }, [searchQuery]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refreshData();
      setLoading(false);
    })();
  }, [refreshData]);

  const loadNotes = useCallback(async () => {
    if (!searchQuery.trim()) {
      const all = await Storage.getAllNotes();
      setNotes(all);
      return;
    }

    const searched = await Storage.searchNotes(searchQuery);
    setNotes(sortNotes(searched));
  }, [searchQuery]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const createNote = useCallback(
    async (content: string, folderId?: string) => {
      const now = new Date().toISOString();
      const note: Note = {
        id: generateId(),
        content,
        createdAt: now,
        updatedAt: now,
        isPinned: false,
        isStarred: false,
        isDeleted: false,
        folderIds: folderId ? [folderId] : [],
      };

      await Storage.saveNote(note);
      await loadNotes();
      return note;
    },
    [loadNotes]
  );

  const updateNote = useCallback(
    async (id: string, content: string) => {
      const existing = await Storage.getNote(id);
      if (!existing) return;

      await Storage.saveNote({
        ...existing,
        content,
        updatedAt: new Date().toISOString(),
      });

      await loadNotes();
    },
    [loadNotes]
  );

  const removeNote = useCallback(
    async (id: string) => {
      const existing = await Storage.getNote(id);
      if (!existing) return;

      await Storage.saveNote({
        ...existing,
        isDeleted: true,
        isPinned: false,
        updatedAt: new Date().toISOString(),
      });

      await loadNotes();
    },
    [loadNotes]
  );

  const restoreNote = useCallback(
    async (id: string) => {
      const existing = await Storage.getNote(id);
      if (!existing) return;

      await Storage.saveNote({
        ...existing,
        isDeleted: false,
        updatedAt: new Date().toISOString(),
      });

      await loadNotes();
    },
    [loadNotes]
  );

  const permanentlyDeleteNote = useCallback(
    async (id: string) => {
      const deletedAt = new Date().toISOString();
      await Promise.all([Storage.deleteNote(id), Storage.upsertTombstone({ id, deletedAt })]);
      setTombstones((prev) => {
        const exists = prev.some((item) => item.id === id);
        if (!exists) return [...prev, { id, deletedAt }];
        return prev.map((item) => (item.id === id ? { id, deletedAt } : item));
      });
      await loadNotes();
    },
    [loadNotes]
  );

  const toggleNoteStar = useCallback(
    async (id: string) => {
      await Storage.toggleStar(id);
      await loadNotes();
    },
    [loadNotes]
  );

  const toggleNotePin = useCallback(
    async (id: string) => {
      await Storage.togglePin(id);
      await loadNotes();
    },
    [loadNotes]
  );

  const createFolder = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      const now = new Date().toISOString();
      const nextFolders = [
        ...folders,
        {
          id: generateId(),
          name: trimmed,
          createdAt: now,
          updatedAt: now,
        },
      ];

      await Storage.saveFolders(nextFolders);
      setFolders(nextFolders);
    },
    [folders]
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      const now = new Date().toISOString();
      const nextFolders = folders.map((folder) =>
        folder.id === id ? { ...folder, name: trimmed, updatedAt: now } : folder
      );

      await Storage.saveFolders(nextFolders);
      setFolders(nextFolders);
    },
    [folders]
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      const nextFolders = folders.filter((folder) => folder.id !== id);
      const allNotes = await Storage.getAllNotes();
      const updatedNotes = allNotes.map((note) => {
        if (!note.folderIds.includes(id)) return note;
        return {
          ...note,
          folderIds: note.folderIds.filter((folderId) => folderId !== id),
          updatedAt: now,
        };
      });

      await Promise.all([Storage.saveFolders(nextFolders), Storage.saveNotes(updatedNotes)]);

      setFolders(nextFolders);
      await loadNotes();
    },
    [folders, loadNotes]
  );

  const toggleNoteFolder = useCallback(
    async (noteId: string, folderId: string) => {
      const existing = await Storage.getNote(noteId);
      if (!existing) return;

      const hasFolder = existing.folderIds.includes(folderId);
      const folderIds = hasFolder
        ? existing.folderIds.filter((id) => id !== folderId)
        : [...existing.folderIds, folderId];

      await Storage.saveNote({
        ...existing,
        folderIds,
        updatedAt: new Date().toISOString(),
      });

      await loadNotes();
    },
    [loadNotes]
  );

  const saveGitHubConfigFn = useCallback(async (config: GitHubConfig) => {
    const valid = await GitHub.validateToken(config);
    if (!valid) throw new Error('Invalid GitHub token');

    await GitHub.saveGitHubConfig(config);
    setGithubConfig(config);
  }, []);

  const clearGitHubConfigFn = useCallback(async () => {
    await GitHub.clearGitHubConfig();
    setGithubConfig(null);
  }, []);

  const saveWebDAVConfigFn = useCallback(async (config: WebDAVConfig) => {
    const normalized: WebDAVConfig = {
      serverUrl: config.serverUrl.trim(),
      username: config.username.trim(),
      password: config.password,
      fileName: (config.fileName || '').trim() || 'a-note-sync.json',
    };
    const valid = await WebDAV.validateConfig(normalized);
    if (!valid) throw new Error('Invalid WebDAV configuration');

    await WebDAV.saveWebDAVConfig(normalized);
    setWebDAVConfig(normalized);
  }, []);

  const clearWebDAVConfigFn = useCallback(async () => {
    await WebDAV.clearWebDAVConfig();
    setWebDAVConfig(null);
  }, []);

  const setSyncProvider = useCallback(async (provider: SyncProvider) => {
    setSyncProviderState(provider);
    await AsyncStorage.setItem(SYNC_PROVIDER_KEY, provider);
  }, []);

  const syncWithGitHub = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const syncingGitHub = syncProvider === 'github';
    if (syncingGitHub && !githubConfig) {
      const error = 'GitHub is not configured';
      setSyncState({ status: 'error', error });
      return { ok: false, error };
    }
    if (!syncingGitHub && !webdavConfig) {
      const error = 'WebDAV is not configured';
      setSyncState({ status: 'error', error });
      return { ok: false, error };
    }

    setSyncState({ status: 'syncing' });

    try {
      const [localNotes, localFolders, localTombstones] = await Promise.all([
        Storage.getAllNotes(),
        Storage.getFolders(),
        Storage.getTombstones(),
      ]);
      const merged = syncingGitHub
        ? await GitHub.syncData(
            githubConfig as GitHubConfig,
            localNotes,
            localFolders,
            localTombstones
          )
        : await WebDAV.syncData(
            webdavConfig as WebDAVConfig,
            localNotes,
            localFolders,
            localTombstones
          );
      await Promise.all([
        Storage.saveNotes(merged.notes),
        Storage.saveFolders(merged.folders),
        Storage.saveTombstones(merged.tombstones),
      ]);
      setFolders(merged.folders);
      setTombstones(merged.tombstones);
      await loadNotes();
      setSyncState({ status: 'success', lastSyncAt: new Date().toISOString() });
      return { ok: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      setSyncState({ status: 'error', error: message });
      return { ok: false, error: message };
    }
  }, [githubConfig, webdavConfig, syncProvider, loadNotes]);

  const value = useMemo(
    () => ({
      notes,
      folders,
      loading,
      searchQuery,
      syncState,
      syncProvider,
      githubConfig,
      webdavConfig,
      setSearchQuery,
      setSyncProvider,
      loadNotes,
      refreshData,
      createNote,
      updateNote,
      removeNote,
      restoreNote,
      permanentlyDeleteNote,
      toggleNoteStar,
      toggleNotePin,
      createFolder,
      renameFolder,
      deleteFolder,
      toggleNoteFolder,
      syncWithGitHub,
      saveGitHubConfig: saveGitHubConfigFn,
      clearGitHubConfig: clearGitHubConfigFn,
      saveWebDAVConfig: saveWebDAVConfigFn,
      clearWebDAVConfig: clearWebDAVConfigFn,
    }),
    [
      notes,
      folders,
      loading,
      searchQuery,
      syncState,
      syncProvider,
      githubConfig,
      webdavConfig,
      loadNotes,
      refreshData,
      createNote,
      updateNote,
      removeNote,
      restoreNote,
      permanentlyDeleteNote,
      toggleNoteStar,
      toggleNotePin,
      createFolder,
      renameFolder,
      deleteFolder,
      toggleNoteFolder,
      syncWithGitHub,
      saveGitHubConfigFn,
      clearGitHubConfigFn,
      saveWebDAVConfigFn,
      clearWebDAVConfigFn,
      setSyncProvider,
    ]
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesContextType {
  const context = useContext(NotesContext);
  if (!context) throw new Error('useNotes must be used within NotesProvider');
  return context;
}
