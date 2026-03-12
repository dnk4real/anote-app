import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadDesktopSnapshot,
  saveDesktopFolders,
  saveDesktopNotes,
  saveDesktopSettings,
  saveDesktopTombstones,
  syncDesktopData,
} from '../lib/desktop-bridge';
import type {
  AppLanguage,
  DesktopSettings,
  Folder,
  Note,
  NoteTombstone,
  SyncState,
} from '../lib/models';
import {
  buildNotePreview,
  formatRelativeDate,
  generateId,
  hasMeaningfulNoteContent,
  mergeSettings,
  sortNotes,
  stripHtml,
  toAppLanguage,
  updateOrInsertTombstone,
} from '../lib/note-utils';

export type SystemView = 'all' | 'starred' | 'trash';
export type WorkspaceView = 'notes' | 'settings';

export function useAnoteDesktop() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tombstones, setTombstones] = useState<NoteTombstone[]>([]);
  const [settings, setSettings] = useState<DesktopSettings>(mergeSettings(null));
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [systemView, setSystemView] = useState<SystemView>('all');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('notes');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle' });

  const language = useMemo<AppLanguage>(
    () => toAppLanguage(settings.languagePreference),
    [settings.languagePreference]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const snapshot = await loadDesktopSnapshot();
        if (!active) return;
        setNotes(snapshot.notes);
        setFolders(snapshot.folders);
        setTombstones(snapshot.tombstones);
        setSettings(snapshot.settings);
        setSelectedNoteId(snapshot.notes[0]?.id ?? null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const visibleNotes = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    return sortNotes(
      notes.filter((note) => {
        if (activeFolderId) {
          if (!note.folderIds.includes(activeFolderId) || note.isDeleted) {
            return false;
          }
        } else if (systemView === 'starred') {
          if (!note.isStarred || note.isDeleted) return false;
        } else if (systemView === 'trash') {
          if (!note.isDeleted) return false;
        } else if (note.isDeleted) {
          return false;
        }

        if (!normalized) return true;
        return stripHtml(note.content).toLowerCase().includes(normalized);
      })
    );
  }, [activeFolderId, notes, searchQuery, systemView]);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  useEffect(() => {
    if (workspaceView !== 'notes') return;
    if (selectedNoteId && visibleNotes.some((note) => note.id === selectedNoteId)) return;
    setSelectedNoteId(visibleNotes[0]?.id ?? null);
  }, [selectedNoteId, visibleNotes, workspaceView]);

  const persistNotes = useCallback(async (nextNotes: Note[]) => {
    setNotes(sortNotes(nextNotes));
    const saved = await saveDesktopNotes(nextNotes);
    setNotes(saved);
    return saved;
  }, []);

  const persistFolders = useCallback(async (nextFolders: Folder[]) => {
    setFolders(nextFolders);
    await saveDesktopFolders(nextFolders);
  }, []);

  const persistTombstones = useCallback(async (nextTombstones: NoteTombstone[]) => {
    setTombstones(nextTombstones);
    await saveDesktopTombstones(nextTombstones);
  }, []);

  const persistSettings = useCallback(async (nextSettings: DesktopSettings) => {
    setSettings(nextSettings);
    const saved = await saveDesktopSettings(nextSettings);
    setSettings(saved);
    return saved;
  }, []);

  const createNote = useCallback(
    async (content = '', folderId?: string) => {
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
      const saved = await persistNotes([note, ...notes]);
      setSelectedNoteId(note.id);
      setWorkspaceView('notes');
      if (folderId) {
        setActiveFolderId(folderId);
      }
      return saved.find((item) => item.id === note.id) ?? note;
    },
    [notes, persistNotes]
  );

  const updateNote = useCallback(
    async (id: string, updater: (note: Note) => Note) => {
      const nextNotes = notes.map((note) => {
        if (note.id !== id) return note;
        return updater(note);
      });
      await persistNotes(nextNotes);
    },
    [notes, persistNotes]
  );

  const updateNoteContent = useCallback(
    async (id: string, content: string) => {
      await updateNote(id, (note) => ({
        ...note,
        content,
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateNote]
  );

  const toggleStar = useCallback(
    async (id: string) => {
      await updateNote(id, (note) => ({
        ...note,
        isStarred: !note.isStarred,
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateNote]
  );

  const togglePin = useCallback(
    async (id: string) => {
      await updateNote(id, (note) => ({
        ...note,
        isPinned: !note.isPinned,
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateNote]
  );

  const moveToTrash = useCallback(
    async (id: string) => {
      await updateNote(id, (note) => ({
        ...note,
        isDeleted: true,
        isPinned: false,
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateNote]
  );

  const restoreNote = useCallback(
    async (id: string) => {
      await updateNote(id, (note) => ({
        ...note,
        isDeleted: false,
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateNote]
  );

  const permanentlyDeleteNote = useCallback(
    async (id: string) => {
      const nextNotes = notes.filter((note) => note.id !== id);
      const deletedAt = new Date().toISOString();
      await persistNotes(nextNotes);
      await persistTombstones(updateOrInsertTombstone(tombstones, { id, deletedAt }));
      if (selectedNoteId === id) {
        setSelectedNoteId(null);
      }
    },
    [notes, persistNotes, persistTombstones, selectedNoteId, tombstones]
  );

  const cleanupBlankNote = useCallback(
    async (id: string | null) => {
      if (!id) return;
      const note = notes.find((item) => item.id === id);
      if (!note) return;
      if (hasMeaningfulNoteContent(note.content)) return;
      await permanentlyDeleteNote(id);
    },
    [notes, permanentlyDeleteNote]
  );

  const assignFolder = useCallback(
    async (noteId: string, folderId: string) => {
      await updateNote(noteId, (note) => {
        const hasFolder = note.folderIds.includes(folderId);
        return {
          ...note,
          folderIds: hasFolder
            ? note.folderIds.filter((item) => item !== folderId)
            : [...note.folderIds, folderId],
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [updateNote]
  );

  const createFolder = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const now = new Date().toISOString();
      await persistFolders([
        ...folders,
        {
          id: generateId(),
          name: trimmed,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    },
    [folders, persistFolders]
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await persistFolders(
        folders.map((folder) =>
          folder.id === id
            ? {
                ...folder,
                name: trimmed,
                updatedAt: new Date().toISOString(),
              }
            : folder
        )
      );
    },
    [folders, persistFolders]
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      const nextFolders = folders.filter((folder) => folder.id !== id);
      const updatedNotes = notes.map((note) =>
        note.folderIds.includes(id)
          ? {
              ...note,
              folderIds: note.folderIds.filter((folderId) => folderId !== id),
              updatedAt: new Date().toISOString(),
            }
          : note
      );
      await Promise.all([persistFolders(nextFolders), persistNotes(updatedNotes)]);
      if (activeFolderId === id) {
        setActiveFolderId(null);
        setSystemView('all');
      }
    },
    [activeFolderId, folders, notes, persistFolders, persistNotes]
  );

  const updateSettings = useCallback(
    async (patch: Partial<DesktopSettings>) => {
      await persistSettings({
        ...settings,
        ...patch,
      });
    },
    [persistSettings, settings]
  );

  const noteRows = useMemo(
    () =>
      visibleNotes.map((note) => ({
        ...note,
        preview: buildNotePreview(note.content, language),
        subtitle: formatRelativeDate(note.updatedAt, language),
      })),
    [language, visibleNotes]
  );

  const syncNow = useCallback(async () => {
    setSyncState({ status: 'syncing' });
    try {
      const merged = await syncDesktopData({
        provider: settings.syncProvider,
        githubConfig: settings.githubConfig,
        webdavConfig: settings.webdavConfig,
        notes,
        folders,
        tombstones,
      });
      setNotes(merged.notes);
      setFolders(merged.folders);
      setTombstones(merged.tombstones);
      await Promise.all([
        saveDesktopNotes(merged.notes),
        saveDesktopFolders(merged.folders),
        saveDesktopTombstones(merged.tombstones),
      ]);
      setSyncState({ status: 'success', lastSyncAt: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      setSyncState({ status: 'error', error: message });
      throw error;
    }
  }, [folders, notes, settings.githubConfig, settings.syncProvider, settings.webdavConfig, tombstones]);

  return {
    loading,
    language,
    notes,
    folders,
    tombstones,
    settings,
    selectedNote,
    selectedNoteId,
    setSelectedNoteId,
    searchQuery,
    setSearchQuery,
    systemView,
    setSystemView,
    activeFolderId,
    setActiveFolderId,
    workspaceView,
    setWorkspaceView,
    syncState,
    setSyncState,
    visibleNotes,
    noteRows,
    createNote,
    updateNoteContent,
    toggleStar,
    togglePin,
    moveToTrash,
    restoreNote,
    permanentlyDeleteNote,
    cleanupBlankNote,
    assignFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    updateSettings,
    syncNow,
  };
}
