import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as GitHub from '../services/github';
import * as Storage from '../services/storage';
import { Folder, GitHubConfig, Note, SyncState } from '../types/note';

interface NotesContextType {
  notes: Note[];
  folders: Folder[];
  loading: boolean;
  searchQuery: string;
  syncState: SyncState;
  githubConfig: GitHubConfig | null;

  setSearchQuery: (query: string) => void;
  loadNotes: () => Promise<void>;
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
  const [githubConfig, setGithubConfig] = useState<GitHubConfig | null>(null);

  const reloadAll = useCallback(async () => {
    const [storedNotes, storedFolders, config] = await Promise.all([
      Storage.getAllNotes(),
      Storage.getFolders(),
      GitHub.getGitHubConfig(),
    ]);

    setNotes(storedNotes);
    setFolders(storedFolders);
    setGithubConfig(config);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await reloadAll();
      setLoading(false);
    })();
  }, [reloadAll]);

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

  const createNote = useCallback(async (content: string, folderId?: string) => {
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
  }, [loadNotes]);

  const updateNote = useCallback(async (id: string, content: string) => {
    const existing = await Storage.getNote(id);
    if (!existing) return;

    await Storage.saveNote({
      ...existing,
      content,
      updatedAt: new Date().toISOString(),
    });

    await loadNotes();
  }, [loadNotes]);

  const removeNote = useCallback(async (id: string) => {
    const existing = await Storage.getNote(id);
    if (!existing) return;

    await Storage.saveNote({
      ...existing,
      isDeleted: true,
      isPinned: false,
      updatedAt: new Date().toISOString(),
    });

    await loadNotes();
  }, [loadNotes]);

  const restoreNote = useCallback(async (id: string) => {
    const existing = await Storage.getNote(id);
    if (!existing) return;

    await Storage.saveNote({
      ...existing,
      isDeleted: false,
      updatedAt: new Date().toISOString(),
    });

    await loadNotes();
  }, [loadNotes]);

  const permanentlyDeleteNote = useCallback(async (id: string) => {
    await Storage.deleteNote(id);
    await loadNotes();
  }, [loadNotes]);

  const toggleNoteStar = useCallback(async (id: string) => {
    await Storage.toggleStar(id);
    await loadNotes();
  }, [loadNotes]);

  const toggleNotePin = useCallback(async (id: string) => {
    await Storage.togglePin(id);
    await loadNotes();
  }, [loadNotes]);

  const createFolder = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const nextFolders = [
      ...folders,
      {
        id: generateId(),
        name: trimmed,
        createdAt: new Date().toISOString(),
      },
    ];

    await Storage.saveFolders(nextFolders);
    setFolders(nextFolders);
  }, [folders]);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const nextFolders = folders.map((folder) =>
      folder.id === id ? { ...folder, name: trimmed } : folder
    );

    await Storage.saveFolders(nextFolders);
    setFolders(nextFolders);
  }, [folders]);

  const deleteFolder = useCallback(async (id: string) => {
    const nextFolders = folders.filter((folder) => folder.id !== id);
    const allNotes = await Storage.getAllNotes();
    const updatedNotes = allNotes.map((note) => ({
      ...note,
      folderIds: note.folderIds.filter((folderId) => folderId !== id),
    }));

    await Promise.all([
      Storage.saveFolders(nextFolders),
      Storage.saveNotes(updatedNotes),
    ]);

    setFolders(nextFolders);
    await loadNotes();
  }, [folders, loadNotes]);

  const toggleNoteFolder = useCallback(async (noteId: string, folderId: string) => {
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
  }, [loadNotes]);

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

  const syncWithGitHub = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!githubConfig) {
      const error = 'GitHub is not configured';
      setSyncState({ status: 'error', error });
      return { ok: false, error };
    }

    setSyncState({ status: 'syncing' });

    try {
      const localNotes = await Storage.getAllNotes();
      const merged = await GitHub.syncNotes(githubConfig, localNotes);
      await Storage.saveNotes(merged);
      await loadNotes();
      setSyncState({ status: 'success', lastSyncAt: new Date().toISOString() });
      return { ok: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      setSyncState({ status: 'error', error: message });
      return { ok: false, error: message };
    }
  }, [githubConfig, loadNotes]);

  const value = useMemo(
    () => ({
      notes,
      folders,
      loading,
      searchQuery,
      syncState,
      githubConfig,
      setSearchQuery,
      loadNotes,
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
    }),
    [
      notes,
      folders,
      loading,
      searchQuery,
      syncState,
      githubConfig,
      loadNotes,
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
    ]
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesContextType {
  const context = useContext(NotesContext);
  if (!context) throw new Error('useNotes must be used within NotesProvider');
  return context;
}
