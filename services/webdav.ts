import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Folder, Note, NoteTombstone, WebDAVConfig } from '../types/note';

const WEBDAV_CONFIG_KEY = '@a_note_webdav_config';
const WEBDAV_PASSWORD_KEY = 'a_note_webdav_password';
const DEFAULT_FILE_NAME = 'a-note-sync.json';
const VALIDATE_OK_STATUS = new Set([200, 204, 207]);

export interface SyncPayload {
  notes: Note[];
  folders: Folder[];
  tombstones: NoteTombstone[];
}

interface RemoteState {
  notes: Note[];
  folders: Folder[];
  tombstones: NoteTombstone[];
}

interface PulledState {
  state: RemoteState;
  etag?: string;
}

function normalizeServerUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function normalizeFileName(fileName?: string): string {
  const trimmed = (fileName ?? '').trim();
  return trimmed || DEFAULT_FILE_NAME;
}

function encodeBase64(value: string): string {
  return btoa(
    encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, part) =>
      String.fromCharCode(parseInt(part, 16))
    )
  );
}

function buildAuthHeader(config: WebDAVConfig): string {
  return `Basic ${encodeBase64(`${config.username}:${config.password}`)}`;
}

function buildFileUrl(config: WebDAVConfig): string {
  const serverUrl = normalizeServerUrl(config.serverUrl);
  const fileName = normalizeFileName(config.fileName);
  const encoded = fileName
    .split('/')
    .filter(Boolean)
    .map((item) => encodeURIComponent(item))
    .join('/');

  return `${serverUrl}${encoded}`;
}

function toTimestamp(value?: string): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function normalizeRemoteState(raw: unknown): RemoteState {
  const base = (raw ?? {}) as Partial<RemoteState>;

  const notes = Array.isArray(base.notes) ? (base.notes as Note[]) : [];
  const folders = Array.isArray(base.folders) ? (base.folders as Folder[]) : [];
  const tombstones = Array.isArray(base.tombstones) ? (base.tombstones as NoteTombstone[]) : [];

  return { notes, folders, tombstones };
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

function mergeTombstones(
  localTombstones: NoteTombstone[],
  remoteTombstones: NoteTombstone[]
): Map<string, NoteTombstone> {
  const map = new Map<string, NoteTombstone>();

  for (const tombstone of [...localTombstones, ...remoteTombstones]) {
    const current = map.get(tombstone.id);
    if (!current) {
      map.set(tombstone.id, tombstone);
      continue;
    }

    if (toTimestamp(tombstone.deletedAt) >= toTimestamp(current.deletedAt)) {
      map.set(tombstone.id, tombstone);
    }
  }

  return map;
}

function mergeFolders(localFolders: Folder[], remoteFolders: Folder[]): Folder[] {
  const map = new Map<string, Folder>();

  for (const folder of [...localFolders, ...remoteFolders]) {
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

    const winner = local && remote ? pickNewerNote(local, remote) : (local ?? remote);
    if (!winner) continue;

    const tombstone = tombstoneMap.get(id);
    if (!tombstone) {
      merged.push(winner);
      continue;
    }

    if (toTimestamp(winner.updatedAt) > toTimestamp(tombstone.deletedAt)) {
      tombstoneMap.delete(id);
      merged.push(winner);
    }
  }

  return merged;
}

async function pullRemoteState(config: WebDAVConfig): Promise<PulledState> {
  const url = buildFileUrl(config);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: buildAuthHeader(config),
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  if (response.status === 404) {
    return {
      state: { notes: [], folders: [], tombstones: [] },
    };
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('WebDAV auth failed');
  }

  if (!response.ok) {
    throw new Error(`WebDAV read failed (${response.status})`);
  }

  const etag = response.headers.get('etag') ?? undefined;

  try {
    const payload = await response.json();
    return { state: normalizeRemoteState(payload), etag };
  } catch {
    return {
      state: { notes: [], folders: [], tombstones: [] },
      etag,
    };
  }
}

async function putRemoteState(
  config: WebDAVConfig,
  state: RemoteState,
  etag?: string
): Promise<'ok' | 'conflict'> {
  const url = buildFileUrl(config);
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: buildAuthHeader(config),
      'Content-Type': 'application/json; charset=utf-8',
      ...(etag ? { 'If-Match': etag } : {}),
    },
    body: JSON.stringify(state, null, 2),
  });

  if (response.status === 409 || response.status === 412) {
    return 'conflict';
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('WebDAV auth failed');
  }

  if (!response.ok) {
    throw new Error(`WebDAV write failed (${response.status})`);
  }

  return 'ok';
}

export async function saveWebDAVConfig(config: WebDAVConfig): Promise<void> {
  const serverUrl = normalizeServerUrl(config.serverUrl);
  const fileName = normalizeFileName(config.fileName);

  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(WEBDAV_PASSWORD_KEY, config.password);
  } else {
    await SecureStore.setItemAsync(WEBDAV_PASSWORD_KEY, config.password);
  }

  await AsyncStorage.setItem(
    WEBDAV_CONFIG_KEY,
    JSON.stringify({
      serverUrl,
      username: config.username.trim(),
      fileName,
    })
  );
}

export async function getWebDAVConfig(): Promise<WebDAVConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(WEBDAV_CONFIG_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Omit<WebDAVConfig, 'password'>;
    const password =
      Platform.OS === 'web'
        ? await AsyncStorage.getItem(WEBDAV_PASSWORD_KEY)
        : await SecureStore.getItemAsync(WEBDAV_PASSWORD_KEY);

    if (!password) return null;

    return {
      serverUrl: normalizeServerUrl(parsed.serverUrl ?? ''),
      username: (parsed.username ?? '').trim(),
      password,
      fileName: normalizeFileName(parsed.fileName),
    };
  } catch {
    return null;
  }
}

export async function clearWebDAVConfig(): Promise<void> {
  await AsyncStorage.removeItem(WEBDAV_CONFIG_KEY);

  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(WEBDAV_PASSWORD_KEY);
  } else {
    await SecureStore.deleteItemAsync(WEBDAV_PASSWORD_KEY);
  }
}

export async function validateConfig(config: WebDAVConfig): Promise<boolean> {
  const serverUrl = normalizeServerUrl(config.serverUrl);
  const username = config.username.trim();
  const password = config.password;

  if (!serverUrl || !username || !password) {
    return false;
  }

  const headers = {
    Authorization: buildAuthHeader({
      ...config,
      serverUrl,
      username,
      fileName: normalizeFileName(config.fileName),
    }),
  };

  try {
    const propfind = await fetch(serverUrl, {
      method: 'PROPFIND',
      headers: {
        ...headers,
        Depth: '0',
      },
    });

    if (propfind.status === 401 || propfind.status === 403) return false;
    if (VALIDATE_OK_STATUS.has(propfind.status)) return true;

    const fallback = await fetch(serverUrl, {
      method: 'GET',
      headers,
    });

    if (fallback.status === 401 || fallback.status === 403) return false;
    return fallback.ok || fallback.status === 404 || fallback.status === 405;
  } catch {
    return false;
  }
}

export async function syncData(
  config: WebDAVConfig,
  localNotes: Note[],
  localFolders: Folder[],
  localTombstones: NoteTombstone[]
): Promise<SyncPayload> {
  const normalizedConfig: WebDAVConfig = {
    ...config,
    serverUrl: normalizeServerUrl(config.serverUrl),
    username: config.username.trim(),
    fileName: normalizeFileName(config.fileName),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pulled = await pullRemoteState(normalizedConfig);
    const tombstoneMap = mergeTombstones(localTombstones, pulled.state.tombstones);
    const mergedNotes = mergeNotes(localNotes, pulled.state.notes, tombstoneMap);
    const mergedFolders = mergeFolders(localFolders, pulled.state.folders);
    const mergedTombstones = Array.from(tombstoneMap.values());

    const nextState: RemoteState = {
      notes: mergedNotes,
      folders: mergedFolders,
      tombstones: mergedTombstones,
    };

    const result = await putRemoteState(normalizedConfig, nextState, pulled.etag);
    if (result === 'ok') {
      return nextState;
    }
  }

  throw new Error('WebDAV sync conflict, please retry');
}

