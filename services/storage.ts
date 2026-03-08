import AsyncStorage from '@react-native-async-storage/async-storage';
import { Folder, Note, NoteTombstone } from '../types/note';

const NOTES_KEY = '@a_note_notes';
const FOLDERS_KEY = '@a_note_folders';
const TOMBSTONES_KEY = '@a_note_tombstones';

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.isStarred !== b.isStarred) return a.isStarred ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function getAllNotes(): Promise<Note[]> {
  try {
    const raw = await AsyncStorage.getItem(NOTES_KEY);
    if (!raw) return [];
    const notes = JSON.parse(raw) as Note[];
    return sortNotes(notes);
  } catch {
    return [];
  }
}

export async function getNote(id: string): Promise<Note | null> {
  const notes = await getAllNotes();
  return notes.find((note) => note.id === id) ?? null;
}

export async function saveNote(note: Note): Promise<void> {
  const notes = await getAllNotes();
  const index = notes.findIndex((item) => item.id === note.id);

  if (index >= 0) {
    notes[index] = note;
  } else {
    notes.unshift(note);
  }

  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(sortNotes(notes)));
}

export async function saveNotes(notes: Note[]): Promise<void> {
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(sortNotes(notes)));
}

export async function deleteNote(id: string): Promise<void> {
  const notes = await getAllNotes();
  await AsyncStorage.setItem(
    NOTES_KEY,
    JSON.stringify(notes.filter((note) => note.id !== id))
  );
}

export async function toggleStar(id: string): Promise<Note | null> {
  const notes = await getAllNotes();
  const note = notes.find((item) => item.id === id);
  if (!note) return null;

  note.isStarred = !note.isStarred;
  note.updatedAt = new Date().toISOString();
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(sortNotes(notes)));
  return note;
}

export async function togglePin(id: string): Promise<Note | null> {
  const notes = await getAllNotes();
  const note = notes.find((item) => item.id === id);
  if (!note) return null;

  note.isPinned = !note.isPinned;
  note.updatedAt = new Date().toISOString();
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(sortNotes(notes)));
  return note;
}

export async function searchNotes(query: string): Promise<Note[]> {
  const notes = await getAllNotes();
  if (!query.trim()) return notes;

  const normalized = query.trim().toLowerCase();
  return notes.filter((note) => note.content.toLowerCase().includes(normalized));
}

export async function getFolders(): Promise<Folder[]> {
  try {
    const raw = await AsyncStorage.getItem(FOLDERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Folder[];
  } catch {
    return [];
  }
}

export async function saveFolders(folders: Folder[]): Promise<void> {
  await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
}

export async function getTombstones(): Promise<NoteTombstone[]> {
  try {
    const raw = await AsyncStorage.getItem(TOMBSTONES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NoteTombstone[];
  } catch {
    return [];
  }
}

export async function saveTombstones(tombstones: NoteTombstone[]): Promise<void> {
  await AsyncStorage.setItem(TOMBSTONES_KEY, JSON.stringify(tombstones));
}

export async function upsertTombstone(tombstone: NoteTombstone): Promise<void> {
  const tombstones = await getTombstones();
  const index = tombstones.findIndex((item) => item.id === tombstone.id);

  if (index >= 0) {
    const current = tombstones[index];
    const currentTs = new Date(current.deletedAt).getTime();
    const nextTs = new Date(tombstone.deletedAt).getTime();
    tombstones[index] = nextTs >= currentTs ? tombstone : current;
  } else {
    tombstones.push(tombstone);
  }

  await saveTombstones(tombstones);
}

export async function removeTombstone(id: string): Promise<void> {
  const tombstones = await getTombstones();
  await saveTombstones(tombstones.filter((item) => item.id !== id));
}
