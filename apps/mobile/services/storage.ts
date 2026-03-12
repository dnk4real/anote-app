import AsyncStorage from '@react-native-async-storage/async-storage';
import { Folder, Note, NoteTombstone } from '../types/note';

const NOTES_KEY = '@a_note_notes';
const NOTES_BACKUP_KEY = '@a_note_notes_backup';
const FOLDERS_KEY = '@a_note_folders';
const TOMBSTONES_KEY = '@a_note_tombstones';
const MAX_NOTES_PAYLOAD_BYTES = 5_500_000;

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.isStarred !== b.isStarred) return a.isStarred ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function utf8ByteLength(value: string): number {
  const encoded = encodeURIComponent(value);
  let bytes = 0;
  for (let i = 0; i < encoded.length; i += 1) {
    if (encoded[i] === '%') {
      bytes += 1;
      i += 2;
    } else {
      bytes += 1;
    }
  }
  return bytes;
}

function parseNotes(raw: string | null): Note[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as Note[];
  } catch {
    return null;
  }
}

async function writeNotes(notes: Note[]): Promise<void> {
  const sorted = sortNotes(notes);
  const serialized = JSON.stringify(sorted);
  const payloadBytes = utf8ByteLength(serialized);
  if (payloadBytes > MAX_NOTES_PAYLOAD_BYTES) {
    throw new Error('Note data is too large for local storage. Please reduce image size.');
  }

  const existing = await AsyncStorage.getItem(NOTES_KEY);
  if (existing) {
    await AsyncStorage.setItem(NOTES_BACKUP_KEY, existing);
  }
  await AsyncStorage.setItem(NOTES_KEY, serialized);
}

export async function getAllNotes(): Promise<Note[]> {
  try {
    const primaryRaw = await AsyncStorage.getItem(NOTES_KEY);
    if (!primaryRaw) return [];
    const primaryNotes = parseNotes(primaryRaw);
    if (primaryNotes) return sortNotes(primaryNotes);

    const backupRaw = await AsyncStorage.getItem(NOTES_BACKUP_KEY);
    if (!backupRaw) return [];
    const backupNotes = parseNotes(backupRaw);
    if (!backupNotes) return [];

    await AsyncStorage.setItem(NOTES_KEY, backupRaw);
    return sortNotes(backupNotes);
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

  await writeNotes(notes);
}

export async function saveNotes(notes: Note[]): Promise<void> {
  await writeNotes(notes);
}

export async function deleteNote(id: string): Promise<void> {
  const notes = await getAllNotes();
  await writeNotes(notes.filter((note) => note.id !== id));
}

export async function toggleStar(id: string): Promise<Note | null> {
  const notes = await getAllNotes();
  const note = notes.find((item) => item.id === id);
  if (!note) return null;

  note.isStarred = !note.isStarred;
  note.updatedAt = new Date().toISOString();
  await writeNotes(notes);
  return note;
}

export async function togglePin(id: string): Promise<Note | null> {
  const notes = await getAllNotes();
  const note = notes.find((item) => item.id === id);
  if (!note) return null;

  note.isPinned = !note.isPinned;
  note.updatedAt = new Date().toISOString();
  await writeNotes(notes);
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
