import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Folder, GitHubConfig, Note, NoteTombstone } from '../types/note';

const GITHUB_CONFIG_KEY = '@a_note_github_config';
const GITHUB_TOKEN_KEY = 'a_note_github_token';
const NOTES_DIR = 'notes';
const SYNC_DIR = 'sync';
const FOLDERS_FILE = `${SYNC_DIR}/folders.json`;
const TOMBSTONES_FILE = `${SYNC_DIR}/tombstones.json`;
const RETRY_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  content: string;
  type: 'file';
}

interface GitHubDirectoryEntry {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir';
}

interface RemoteFileRef {
  path: string;
  sha: string;
  format: 'json' | 'markdown';
}

interface PulledNotes {
  notes: Note[];
  refsById: Map<string, RemoteFileRef[]>;
  jsonShaById: Map<string, string>;
}

interface PulledJsonFile<T> {
  data: T;
  sha?: string;
}

export interface SyncPayload {
  notes: Note[];
  folders: Folder[];
  tombstones: NoteTombstone[];
}

export async function saveGitHubConfig(config: GitHubConfig): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(GITHUB_TOKEN_KEY, config.token);
  } else {
    await SecureStore.setItemAsync(GITHUB_TOKEN_KEY, config.token);
  }

  await AsyncStorage.setItem(
    GITHUB_CONFIG_KEY,
    JSON.stringify({ repo: config.repo, branch: config.branch })
  );
}

export async function getGitHubConfig(): Promise<GitHubConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(GITHUB_CONFIG_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Omit<GitHubConfig, 'token'>;
    const token =
      Platform.OS === 'web'
        ? await AsyncStorage.getItem(GITHUB_TOKEN_KEY)
        : await SecureStore.getItemAsync(GITHUB_TOKEN_KEY);

    if (!token) return null;
    return { ...parsed, token };
  } catch {
    return null;
  }
}

export async function clearGitHubConfig(): Promise<void> {
  await AsyncStorage.removeItem(GITHUB_CONFIG_KEY);

  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(GITHUB_TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(GITHUB_TOKEN_KEY);
  }
}

function toTimestamp(value?: string): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function encodeBase64(value: string): string {
  return btoa(
    encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, part) =>
      String.fromCharCode(parseInt(part, 16))
    )
  );
}

function decodeBase64(value: string): string {
  return decodeURIComponent(
    atob(value.replace(/\n/g, ''))
      .split('')
      .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
      .join('')
  );
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeNote(raw: unknown, fallbackId: string): Note {
  const obj = (raw ?? {}) as Partial<Note>;
  const now = new Date().toISOString();

  return {
    id: normalizeString(obj.id, fallbackId),
    content: normalizeString(obj.content, ''),
    createdAt: normalizeString(obj.createdAt, now),
    updatedAt: normalizeString(obj.updatedAt, now),
    isPinned: normalizeBoolean(obj.isPinned, false),
    isStarred: normalizeBoolean(obj.isStarred, false),
    isDeleted: normalizeBoolean(obj.isDeleted, false),
    folderIds: normalizeStringArray(obj.folderIds),
  };
}

function normalizeFolder(raw: unknown): Folder | null {
  const obj = (raw ?? {}) as Partial<Folder>;
  if (!obj.id || !obj.name || !obj.createdAt) return null;

  return {
    id: obj.id,
    name: obj.name,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt ?? obj.createdAt,
  };
}

function normalizeTombstone(raw: unknown): NoteTombstone | null {
  const obj = (raw ?? {}) as Partial<NoteTombstone>;
  if (!obj.id || !obj.deletedAt) return null;

  return {
    id: obj.id,
    deletedAt: obj.deletedAt,
  };
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  const shouldRetry = method === 'GET' || method === 'HEAD';
  const maxAttempts = shouldRetry ? 3 : 1;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          ...((options.headers as Record<string, string>) || {}),
        },
      });

      if (attempt < maxAttempts && RETRY_STATUS.has(response.status)) {
        await wait(250 * attempt);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await wait(250 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('GitHub request failed');
}

function contentsUrl(config: GitHubConfig, path: string, includeRef = true): string {
  const encodedPath = encodePath(path);
  const base = `https://api.github.com/repos/${config.repo}/contents/${encodedPath}`;
  if (!includeRef) return base;
  const ref = encodeURIComponent(config.branch);
  return `${base}?ref=${ref}`;
}

function apiUrl(path: string): string {
  return `https://api.github.com${path}`;
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    if (payload.message) return payload.message;
  } catch {
    // ignore parse errors
  }

  try {
    const text = await response.text();
    if (text) return text;
  } catch {
    // ignore read errors
  }

  return `GitHub request failed (${response.status})`;
}

async function listDirectory(config: GitHubConfig, path: string): Promise<GitHubDirectoryEntry[]> {
  const response = await fetchWithRetry(contentsUrl(config, path, true), config.token);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(await getErrorMessage(response));

  const payload = (await response.json()) as GitHubDirectoryEntry[] | GitHubDirectoryEntry;
  if (!Array.isArray(payload)) return [];
  return payload;
}

async function readFile(config: GitHubConfig, path: string): Promise<GitHubFileContent | null> {
  const response = await fetchWithRetry(contentsUrl(config, path, true), config.token);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as GitHubFileContent;
}

async function putFile(
  config: GitHubConfig,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<string> {
  const body: Record<string, unknown> = {
    message,
    content: encodeBase64(content),
    branch: config.branch,
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetchWithRetry(contentsUrl(config, path, false), config.token, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await getErrorMessage(response));
  const payload = (await response.json()) as { content: { sha: string } };
  return payload.content.sha;
}

async function deleteFile(
  config: GitHubConfig,
  path: string,
  sha: string,
  message: string
): Promise<void> {
  const response = await fetchWithRetry(contentsUrl(config, path, false), config.token, {
    method: 'DELETE',
    body: JSON.stringify({
      message,
      sha,
      branch: config.branch,
    }),
  });

  if (response.status === 404) return;
  if (!response.ok) throw new Error(await getErrorMessage(response));
}

async function ensureDirectory(config: GitHubConfig, path: string): Promise<void> {
  const entries = await listDirectory(config, path);
  if (entries.length > 0) return;

  await putFile(config, `${path}/.gitkeep`, '', `Initialize ${path} directory`);
}

function legacyMarkdownToNote(filename: string, markdown: string): Note {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  const now = new Date().toISOString();
  const fallbackId = filename.replace(/\.md$/i, '');

  if (!match) {
    return {
      id: fallbackId,
      content: markdown,
      createdAt: now,
      updatedAt: now,
      isPinned: false,
      isStarred: false,
      isDeleted: false,
      folderIds: [],
    };
  }

  const meta = match[1];
  const content = match[2];
  const getValue = (key: string): string => {
    const value = meta.match(new RegExp(`${key}:\\s*"?([^"\\n]*)"?`));
    return value ? value[1] : '';
  };

  const foldersRaw = meta.match(/folderIds:\s*\[([^\]]*)\]/)?.[1] ?? '';
  const folderIds = foldersRaw
    .split(',')
    .map((part) => part.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);

  return {
    id: getValue('id') || fallbackId,
    content,
    createdAt: getValue('createdAt') || now,
    updatedAt: getValue('updatedAt') || now,
    isPinned: getValue('isPinned') === 'true',
    isStarred: getValue('isStarred') === 'true',
    isDeleted: getValue('isDeleted') === 'true',
    folderIds,
  };
}

function noteToJson(note: Note): string {
  const payload: Omit<Note, 'sha'> = {
    id: note.id,
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    isPinned: note.isPinned,
    isStarred: note.isStarred,
    isDeleted: note.isDeleted,
    folderIds: note.folderIds,
  };

  return JSON.stringify(payload, null, 2);
}

function isSameNote(a: Note, b: Note): boolean {
  return (
    a.content === b.content &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    a.isPinned === b.isPinned &&
    a.isStarred === b.isStarred &&
    a.isDeleted === b.isDeleted &&
    a.folderIds.length === b.folderIds.length &&
    a.folderIds.every((id, index) => id === b.folderIds[index])
  );
}

function pickNewerNote(a: Note, b: Note): Note {
  const aTs = toTimestamp(a.updatedAt);
  const bTs = toTimestamp(b.updatedAt);
  return aTs >= bTs ? a : b;
}

function pickNewerFolder(a: Folder, b: Folder): Folder {
  const aTs = toTimestamp(a.updatedAt ?? a.createdAt);
  const bTs = toTimestamp(b.updatedAt ?? b.createdAt);
  return aTs >= bTs ? a : b;
}

async function pullRemoteJsonFile<T>(
  config: GitHubConfig,
  path: string,
  normalize: (raw: unknown) => T | null
): Promise<PulledJsonFile<T[]>> {
  const file = await readFile(config, path);
  if (!file) return { data: [] };

  try {
    const decoded = decodeBase64(file.content);
    const parsed = JSON.parse(decoded) as unknown[];
    if (!Array.isArray(parsed)) return { data: [], sha: file.sha };
    const data = parsed.map((item) => normalize(item)).filter((item): item is T => item !== null);
    return { data, sha: file.sha };
  } catch {
    return { data: [], sha: file.sha };
  }
}

async function pullNotes(config: GitHubConfig): Promise<PulledNotes> {
  const entries = await listDirectory(config, NOTES_DIR);
  const refsById = new Map<string, RemoteFileRef[]>();
  const jsonShaById = new Map<string, string>();
  const latestNoteById = new Map<string, { note: Note; isJson: boolean }>();

  const files = entries.filter((entry) => entry.type === 'file');
  for (const file of files) {
    if (file.name === '.gitkeep') continue;
    const isJson = file.name.endsWith('.json');
    const isMarkdown = file.name.endsWith('.md');
    if (!isJson && !isMarkdown) continue;

    const contentFile = await readFile(config, file.path);
    if (!contentFile) continue;

    let note: Note | null = null;
    if (isJson) {
      try {
        const decoded = decodeBase64(contentFile.content);
        const parsed = JSON.parse(decoded);
        const fallbackId = file.name.replace(/\.json$/i, '');
        note = normalizeNote(parsed, fallbackId);
      } catch {
        note = null;
      }
    } else if (isMarkdown) {
      try {
        const decoded = decodeBase64(contentFile.content);
        note = legacyMarkdownToNote(file.name, decoded);
      } catch {
        note = null;
      }
    }

    if (!note) continue;

    if (isJson) {
      jsonShaById.set(note.id, contentFile.sha);
    }

    const refs = refsById.get(note.id) ?? [];
    refs.push({
      path: contentFile.path,
      sha: contentFile.sha,
      format: isJson ? 'json' : 'markdown',
    });
    refsById.set(note.id, refs);

    const existing = latestNoteById.get(note.id);
    if (!existing) {
      latestNoteById.set(note.id, { note, isJson });
      continue;
    }

    const currentTs = toTimestamp(existing.note.updatedAt);
    const nextTs = toTimestamp(note.updatedAt);
    const shouldReplace =
      nextTs > currentTs || (nextTs === currentTs && isJson && !existing.isJson);

    if (shouldReplace) {
      latestNoteById.set(note.id, { note, isJson });
    }
  }

  const notes = Array.from(latestNoteById.values()).map((entry) => entry.note);
  return { notes, refsById, jsonShaById };
}

function mergeTombstones(
  localTombstones: NoteTombstone[],
  remoteTombstones: NoteTombstone[]
): Map<string, NoteTombstone> {
  const map = new Map<string, NoteTombstone>();
  const all = [...localTombstones, ...remoteTombstones];

  for (const tombstone of all) {
    const current = map.get(tombstone.id);
    if (!current) {
      map.set(tombstone.id, tombstone);
      continue;
    }

    const currentTs = toTimestamp(current.deletedAt);
    const nextTs = toTimestamp(tombstone.deletedAt);
    if (nextTs >= currentTs) {
      map.set(tombstone.id, tombstone);
    }
  }

  return map;
}

function mergeFolders(localFolders: Folder[], remoteFolders: Folder[]): Folder[] {
  const map = new Map<string, Folder>();
  const all = [...localFolders, ...remoteFolders];

  for (const folder of all) {
    const normalized: Folder = {
      ...folder,
      updatedAt: folder.updatedAt ?? folder.createdAt,
    };
    const current = map.get(normalized.id);
    if (!current) {
      map.set(normalized.id, normalized);
      continue;
    }

    map.set(normalized.id, pickNewerFolder(current, normalized));
  }

  return Array.from(map.values());
}

function mergeNotes(
  localNotes: Note[],
  remoteNotes: Note[],
  tombstoneMap: Map<string, NoteTombstone>
): Note[] {
  const localMap = new Map(localNotes.map((note) => [note.id, note]));
  const remoteMap = new Map(remoteNotes.map((note) => [note.id, note]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

  const merged: Note[] = [];

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);
    if (!local && !remote) continue;

    const winner = local && remote ? pickNewerNote(local, remote) : local ?? remote;
    if (!winner) continue;

    const tombstone = tombstoneMap.get(id);
    if (!tombstone) {
      merged.push(winner);
      continue;
    }

    const winnerTs = toTimestamp(winner.updatedAt);
    const tombstoneTs = toTimestamp(tombstone.deletedAt);

    if (winnerTs > tombstoneTs) {
      tombstoneMap.delete(id);
      merged.push(winner);
    }
  }

  return merged;
}

async function pushNotes(
  config: GitHubConfig,
  notes: Note[],
  remoteNotesMap: Map<string, Note>,
  jsonShaById: Map<string, string>
): Promise<Note[]> {
  const pushed: Note[] = [];

  for (const note of notes) {
    const existingSha = jsonShaById.get(note.id);
    const remoteNote = remoteNotesMap.get(note.id);
    const shouldPush = !remoteNote || !existingSha || !isSameNote(note, remoteNote);

    if (!shouldPush) {
      pushed.push({ ...note, sha: existingSha });
      continue;
    }

    const path = `${NOTES_DIR}/${note.id}.json`;
    const sha = await putFile(
      config,
      path,
      noteToJson(note),
      existingSha ? `Update note ${note.id}` : `Create note ${note.id}`,
      existingSha
    );
    pushed.push({ ...note, sha });
  }

  return pushed;
}

async function cleanupRemoteNoteFiles(
  config: GitHubConfig,
  refsById: Map<string, RemoteFileRef[]>,
  keptIds: Set<string>
): Promise<void> {
  for (const [id, refs] of refsById.entries()) {
    const keepPath = `${NOTES_DIR}/${id}.json`;
    const shouldDeleteAll = !keptIds.has(id);

    for (const ref of refs) {
      if (!shouldDeleteAll && ref.path === keepPath && ref.format === 'json') {
        continue;
      }

      await deleteFile(config, ref.path, ref.sha, `Delete obsolete note file for ${id}`);
    }
  }
}

export async function validateToken(config: GitHubConfig): Promise<boolean> {
  try {
    const [owner, repoName, ...extra] = config.repo.trim().split('/');
    if (!owner || !repoName || extra.length > 0) return false;

    const userResponse = await fetchWithRetry(apiUrl('/user'), config.token);
    if (!userResponse.ok) return false;

    const repoResponse = await fetchWithRetry(
      apiUrl(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`),
      config.token
    );
    if (!repoResponse.ok) return false;

    const branchResponse = await fetchWithRetry(
      apiUrl(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/branches/${encodeURIComponent(config.branch)}`
      ),
      config.token
    );

    return branchResponse.ok;
  } catch {
    return false;
  }
}

export async function syncData(
  config: GitHubConfig,
  localNotes: Note[],
  localFolders: Folder[],
  localTombstones: NoteTombstone[]
): Promise<SyncPayload> {
  await Promise.all([ensureDirectory(config, NOTES_DIR), ensureDirectory(config, SYNC_DIR)]);

  const [{ notes: remoteNotes, refsById, jsonShaById }, pulledFolders, pulledTombstones] =
    await Promise.all([
      pullNotes(config),
      pullRemoteJsonFile(config, FOLDERS_FILE, normalizeFolder),
      pullRemoteJsonFile(config, TOMBSTONES_FILE, normalizeTombstone),
    ]);

  const tombstoneMap = mergeTombstones(localTombstones, pulledTombstones.data);
  const mergedNotes = mergeNotes(localNotes, remoteNotes, tombstoneMap);
  const mergedFolders = mergeFolders(localFolders, pulledFolders.data);
  const mergedTombstones = Array.from(tombstoneMap.values());
  const remoteNotesMap = new Map(remoteNotes.map((note) => [note.id, note]));

  const pushedNotes = await pushNotes(config, mergedNotes, remoteNotesMap, jsonShaById);
  await cleanupRemoteNoteFiles(
    config,
    refsById,
    new Set(pushedNotes.map((note) => note.id))
  );

  await Promise.all([
    putFile(
      config,
      FOLDERS_FILE,
      JSON.stringify(mergedFolders, null, 2),
      'Sync folders',
      pulledFolders.sha
    ),
    putFile(
      config,
      TOMBSTONES_FILE,
      JSON.stringify(mergedTombstones, null, 2),
      'Sync tombstones',
      pulledTombstones.sha
    ),
  ]);

  return {
    notes: pushedNotes,
    folders: mergedFolders,
    tombstones: mergedTombstones,
  };
}
