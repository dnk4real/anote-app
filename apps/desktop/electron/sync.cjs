const RETRY_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const NOTES_DIR = 'notes';
const SYNC_DIR = 'sync';
const FOLDERS_FILE = `${SYNC_DIR}/folders.json`;
const TOMBSTONES_FILE = `${SYNC_DIR}/tombstones.json`;
const DEFAULT_WEBDAV_FILE = 'a-note-sync.json';
const VALIDATE_OK_STATUS = new Set([200, 204, 207]);

function toTimestamp(value) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
}

function normalizeNote(raw, fallbackId) {
  const obj = raw && typeof raw === 'object' ? raw : {};
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
    ...(typeof obj.sha === 'string' ? { sha: obj.sha } : {}),
  };
}

function normalizeFolder(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  if (!obj.id || !obj.name || !obj.createdAt) return null;
  return {
    id: String(obj.id),
    name: String(obj.name),
    createdAt: String(obj.createdAt),
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : String(obj.createdAt),
  };
}

function normalizeTombstone(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  if (!obj.id || !obj.deletedAt) return null;
  return {
    id: String(obj.id),
    deletedAt: String(obj.deletedAt),
  };
}

function pickNewerNote(a, b) {
  return toTimestamp(a.updatedAt) >= toTimestamp(b.updatedAt) ? a : b;
}

function pickNewerFolder(a, b) {
  return toTimestamp(a.updatedAt || a.createdAt) >= toTimestamp(b.updatedAt || b.createdAt) ? a : b;
}

function mergeTombstones(localTombstones, remoteTombstones) {
  const map = new Map();
  for (const tombstone of [...localTombstones, ...remoteTombstones]) {
    const current = map.get(tombstone.id);
    if (!current || toTimestamp(tombstone.deletedAt) >= toTimestamp(current.deletedAt)) {
      map.set(tombstone.id, tombstone);
    }
  }
  return map;
}

function mergeFolders(localFolders, remoteFolders) {
  const map = new Map();
  for (const folder of [...localFolders, ...remoteFolders]) {
    const normalized = {
      ...folder,
      updatedAt: folder.updatedAt || folder.createdAt,
    };
    const current = map.get(normalized.id);
    map.set(normalized.id, current ? pickNewerFolder(current, normalized) : normalized);
  }
  return Array.from(map.values());
}

function mergeNotes(localNotes, remoteNotes, tombstoneMap) {
  const localMap = new Map(localNotes.map((note) => [note.id, note]));
  const remoteMap = new Map(remoteNotes.map((note) => [note.id, note]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const merged = [];

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);
    if (!local && !remote) continue;
    const winner = local && remote ? pickNewerNote(local, remote) : (local || remote);
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

function normalizeServerUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function normalizeFileName(value) {
  const trimmed = String(value || '').trim();
  return trimmed || DEFAULT_WEBDAV_FILE;
}

function encodePath(path) {
  return path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function encodeBase64(value) {
  return Buffer.from(String(value), 'utf8').toString('base64');
}

function decodeBase64(value) {
  return Buffer.from(String(value).replace(/\n/g, ''), 'base64').toString('utf8');
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, token, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const shouldRetry = method === 'GET' || method === 'HEAD';
  const maxAttempts = shouldRetry ? 3 : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          ...((options.headers && typeof options.headers === 'object') ? options.headers : {}),
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

  throw lastError || new Error('GitHub request failed');
}

function contentsUrl(config, path, includeRef = true) {
  const encodedPath = encodePath(path);
  const base = `https://api.github.com/repos/${config.repo}/contents/${encodedPath}`;
  if (!includeRef) return base;
  return `${base}?ref=${encodeURIComponent(config.branch)}`;
}

function apiUrl(path) {
  return `https://api.github.com${path}`;
}

async function getErrorMessage(response) {
  try {
    const payload = await response.json();
    if (payload && typeof payload.message === 'string') {
      return payload.message;
    }
  } catch {
    // ignore
  }

  try {
    const text = await response.text();
    if (text) return text;
  } catch {
    // ignore
  }

  return `GitHub request failed (${response.status})`;
}

async function listDirectory(config, path) {
  const response = await fetchWithRetry(contentsUrl(config, path, true), config.token);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

async function readFile(config, path) {
  const response = await fetchWithRetry(contentsUrl(config, path, true), config.token);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return response.json();
}

async function putFile(config, path, content, message, sha) {
  const body = {
    message,
    content: encodeBase64(content),
    branch: config.branch,
    ...(sha ? { sha } : {}),
  };
  const response = await fetchWithRetry(contentsUrl(config, path, false), config.token, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const payload = await response.json();
  return payload.content.sha;
}

async function deleteFile(config, path, sha, message) {
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

async function ensureDirectory(config, path) {
  const entries = await listDirectory(config, path);
  if (entries.length > 0) return;
  await putFile(config, `${path}/.gitkeep`, '', `Initialize ${path} directory`);
}

function legacyMarkdownToNote(filename, markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  const now = new Date().toISOString();
  const fallbackId = filename.replace(/\.md$/i, '');
  if (!match) {
    return normalizeNote(
      {
        id: fallbackId,
        content: markdown,
        createdAt: now,
        updatedAt: now,
        isPinned: false,
        isStarred: false,
        isDeleted: false,
        folderIds: [],
      },
      fallbackId
    );
  }

  const meta = match[1];
  const content = match[2];
  const getValue = (key) => {
    const value = meta.match(new RegExp(`${key}:\\s*"?([^"\\n]*)"?`));
    return value ? value[1] : '';
  };
  const foldersRaw = meta.match(/folderIds:\s*\[([^\]]*)\]/)?.[1] ?? '';
  const folderIds = foldersRaw
    .split(',')
    .map((part) => part.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);

  return normalizeNote(
    {
      id: getValue('id') || fallbackId,
      content,
      createdAt: getValue('createdAt') || now,
      updatedAt: getValue('updatedAt') || now,
      isPinned: getValue('isPinned') === 'true',
      isStarred: getValue('isStarred') === 'true',
      isDeleted: getValue('isDeleted') === 'true',
      folderIds,
    },
    fallbackId
  );
}

function noteToJson(note) {
  return JSON.stringify(
    {
      id: note.id,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      isPinned: note.isPinned,
      isStarred: note.isStarred,
      isDeleted: note.isDeleted,
      folderIds: note.folderIds,
    },
    null,
    2
  );
}

function isSameNote(a, b) {
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

async function pullRemoteJsonFile(config, path, normalize) {
  const file = await readFile(config, path);
  if (!file) return { data: [] };
  try {
    const parsed = JSON.parse(decodeBase64(file.content));
    const data = Array.isArray(parsed) ? parsed.map((item) => normalize(item)).filter(Boolean) : [];
    return { data, sha: file.sha };
  } catch {
    return { data: [], sha: file.sha };
  }
}

async function pullNotes(config) {
  const entries = await listDirectory(config, NOTES_DIR);
  const refsById = new Map();
  const jsonShaById = new Map();
  const latestNoteById = new Map();

  for (const file of entries.filter((entry) => entry.type === 'file')) {
    if (file.name === '.gitkeep') continue;
    const isJson = file.name.endsWith('.json');
    const isMarkdown = file.name.endsWith('.md');
    if (!isJson && !isMarkdown) continue;

    const contentFile = await readFile(config, file.path);
    if (!contentFile) continue;

    let note = null;
    if (isJson) {
      try {
        note = normalizeNote(JSON.parse(decodeBase64(contentFile.content)), file.name.replace(/\.json$/i, ''));
      } catch {
        note = null;
      }
    } else {
      note = legacyMarkdownToNote(file.name, decodeBase64(contentFile.content));
    }

    if (!note) continue;
    if (isJson) {
      jsonShaById.set(note.id, contentFile.sha);
    }

    const refs = refsById.get(note.id) || [];
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

    const nextTs = toTimestamp(note.updatedAt);
    const currentTs = toTimestamp(existing.note.updatedAt);
    if (nextTs > currentTs || (nextTs === currentTs && isJson && !existing.isJson)) {
      latestNoteById.set(note.id, { note, isJson });
    }
  }

  return {
    notes: Array.from(latestNoteById.values()).map((entry) => entry.note),
    refsById,
    jsonShaById,
  };
}

async function pushNotes(config, notes, remoteNotesMap, jsonShaById) {
  const pushed = [];
  for (const note of notes) {
    const existingSha = jsonShaById.get(note.id);
    const remoteNote = remoteNotesMap.get(note.id);
    const shouldPush = !remoteNote || !existingSha || !isSameNote(note, remoteNote);
    if (!shouldPush) {
      pushed.push({ ...note, sha: existingSha });
      continue;
    }
    const sha = await putFile(
      config,
      `${NOTES_DIR}/${note.id}.json`,
      noteToJson(note),
      existingSha ? `Update note ${note.id}` : `Create note ${note.id}`,
      existingSha
    );
    pushed.push({ ...note, sha });
  }
  return pushed;
}

async function cleanupRemoteNoteFiles(config, refsById, keptIds) {
  for (const [id, refs] of refsById.entries()) {
    const keepPath = `${NOTES_DIR}/${id}.json`;
    const shouldDeleteAll = !keptIds.has(id);

    for (const ref of refs) {
      if (!shouldDeleteAll && ref.path === keepPath && ref.format === 'json') continue;
      await deleteFile(config, ref.path, ref.sha, `Delete obsolete note file for ${id}`);
    }
  }
}

async function validateGitHubConfig(config) {
  const [owner, repoName, ...extra] = String(config.repo || '').trim().split('/');
  if (!config.token || !owner || !repoName || extra.length > 0) return false;

  try {
    const [userResponse, repoResponse, branchResponse] = await Promise.all([
      fetchWithRetry(apiUrl('/user'), config.token),
      fetchWithRetry(
        apiUrl(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`),
        config.token
      ),
      fetchWithRetry(
        apiUrl(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/branches/${encodeURIComponent(config.branch)}`
        ),
        config.token
      ),
    ]);
    return userResponse.ok && repoResponse.ok && branchResponse.ok;
  } catch {
    return false;
  }
}

async function syncGitHub(config, localNotes, localFolders, localTombstones) {
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
  await cleanupRemoteNoteFiles(config, refsById, new Set(pushedNotes.map((note) => note.id)));
  await Promise.all([
    putFile(config, FOLDERS_FILE, JSON.stringify(mergedFolders, null, 2), 'Sync folders', pulledFolders.sha),
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

function buildAuthHeader(config) {
  return `Basic ${encodeBase64(`${config.username}:${config.password}`)}`;
}

function buildWebdavFileUrl(config) {
  const serverUrl = normalizeServerUrl(config.serverUrl);
  const fileName = normalizeFileName(config.fileName);
  const encoded = fileName
    .split('/')
    .filter(Boolean)
    .map((item) => encodeURIComponent(item))
    .join('/');
  return `${serverUrl}${encoded}`;
}

async function pullRemoteState(config) {
  const response = await fetch(buildWebdavFileUrl(config), {
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

  let state = { notes: [], folders: [], tombstones: [] };
  try {
    const payload = await response.json();
    state = {
      notes: Array.isArray(payload.notes) ? payload.notes.map((item) => normalizeNote(item, 'note')).filter(Boolean) : [],
      folders: Array.isArray(payload.folders) ? payload.folders.map((item) => normalizeFolder(item)).filter(Boolean) : [],
      tombstones: Array.isArray(payload.tombstones)
        ? payload.tombstones.map((item) => normalizeTombstone(item)).filter(Boolean)
        : [],
    };
  } catch {
    // keep empty state
  }

  return {
    state,
    etag: response.headers.get('etag') || undefined,
  };
}

async function putRemoteState(config, state, etag) {
  const response = await fetch(buildWebdavFileUrl(config), {
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

async function validateWebDAVConfig(config) {
  const normalized = {
    ...config,
    serverUrl: normalizeServerUrl(config.serverUrl),
    fileName: normalizeFileName(config.fileName),
  };
  if (!normalized.serverUrl || !normalized.username || !normalized.password) {
    return false;
  }

  const headers = {
    Authorization: buildAuthHeader(normalized),
  };

  try {
    const propfind = await fetch(normalized.serverUrl, {
      method: 'PROPFIND',
      headers: {
        ...headers,
        Depth: '0',
      },
    });
    if (propfind.status === 401 || propfind.status === 403) return false;
    if (VALIDATE_OK_STATUS.has(propfind.status)) return true;

    const fallback = await fetch(normalized.serverUrl, {
      method: 'GET',
      headers,
    });

    if (fallback.status === 401 || fallback.status === 403) return false;
    return fallback.ok || fallback.status === 404 || fallback.status === 405;
  } catch {
    return false;
  }
}

async function syncWebDAV(config, localNotes, localFolders, localTombstones) {
  const normalizedConfig = {
    ...config,
    serverUrl: normalizeServerUrl(config.serverUrl),
    username: String(config.username || '').trim(),
    fileName: normalizeFileName(config.fileName),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pulled = await pullRemoteState(normalizedConfig);
    const tombstoneMap = mergeTombstones(localTombstones, pulled.state.tombstones);
    const mergedNotes = mergeNotes(localNotes, pulled.state.notes, tombstoneMap);
    const mergedFolders = mergeFolders(localFolders, pulled.state.folders);
    const mergedTombstones = Array.from(tombstoneMap.values());

    const nextState = {
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

async function syncWithProvider(provider, payload) {
  if (provider === 'github') {
    const valid = await validateGitHubConfig(payload.githubConfig || {});
    if (!valid) {
      throw new Error('Invalid GitHub configuration');
    }
    return syncGitHub(
      payload.githubConfig,
      payload.notes || [],
      payload.folders || [],
      payload.tombstones || []
    );
  }

  if (provider === 'webdav') {
    const valid = await validateWebDAVConfig(payload.webdavConfig || {});
    if (!valid) {
      throw new Error('Invalid WebDAV configuration');
    }
    return syncWebDAV(
      payload.webdavConfig,
      payload.notes || [],
      payload.folders || [],
      payload.tombstones || []
    );
  }

  throw new Error(`Unsupported sync provider: ${provider}`);
}

module.exports = {
  syncWithProvider,
};
