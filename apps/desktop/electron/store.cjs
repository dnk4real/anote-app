const fs = require('fs/promises');
const path = require('path');

const NOTES_FILE = 'notes.json';
const NOTES_BACKUP_FILE = 'notes.backup.json';
const FOLDERS_FILE = 'folders.json';
const TOMBSTONES_FILE = 'tombstones.json';
const SETTINGS_FILE = 'settings.json';
const MAX_NOTES_PAYLOAD_BYTES = 5_500_000;

const DEFAULT_SETTINGS = {
  syncProvider: 'github',
  githubConfig: null,
  webdavConfig: null,
  languagePreference: 'system',
  fontPreset: 'system',
};

function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.isStarred !== b.isStarred) return a.isStarred ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function utf8ByteLength(value) {
  return Buffer.byteLength(String(value), 'utf8');
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function createStore(dataDir) {
  const notesPath = path.join(dataDir, NOTES_FILE);
  const notesBackupPath = path.join(dataDir, NOTES_BACKUP_FILE);
  const foldersPath = path.join(dataDir, FOLDERS_FILE);
  const tombstonesPath = path.join(dataDir, TOMBSTONES_FILE);
  const settingsPath = path.join(dataDir, SETTINGS_FILE);

  async function loadNotes() {
    try {
      const primaryRaw = await fs.readFile(notesPath, 'utf8');
      const parsed = JSON.parse(primaryRaw);
      if (Array.isArray(parsed)) {
        return sortNotes(parsed);
      }
    } catch {
      // fall back to backup
    }

    try {
      const backupRaw = await fs.readFile(notesBackupPath, 'utf8');
      const parsed = JSON.parse(backupRaw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      await fs.writeFile(notesPath, backupRaw, 'utf8');
      return sortNotes(parsed);
    } catch {
      return [];
    }
  }

  async function saveNotes(notes) {
    const sorted = sortNotes(Array.isArray(notes) ? notes : []);
    const serialized = JSON.stringify(sorted);
    if (utf8ByteLength(serialized) > MAX_NOTES_PAYLOAD_BYTES) {
      throw new Error('Note data is too large for local storage. Please reduce image size.');
    }

    await ensureDir(dataDir);

    try {
      const existing = await fs.readFile(notesPath, 'utf8');
      await fs.writeFile(notesBackupPath, existing, 'utf8');
    } catch {
      // ignore missing primary notes file
    }

    await fs.writeFile(notesPath, JSON.stringify(sorted, null, 2), 'utf8');
    return sorted;
  }

  async function loadFolders() {
    const folders = await readJson(foldersPath, []);
    return Array.isArray(folders) ? folders : [];
  }

  async function saveFolders(folders) {
    await ensureDir(dataDir);
    await writeJson(foldersPath, Array.isArray(folders) ? folders : []);
  }

  async function loadTombstones() {
    const tombstones = await readJson(tombstonesPath, []);
    return Array.isArray(tombstones) ? tombstones : [];
  }

  async function saveTombstones(tombstones) {
    await ensureDir(dataDir);
    await writeJson(tombstonesPath, Array.isArray(tombstones) ? tombstones : []);
  }

  async function loadSettings() {
    const settings = await readJson(settingsPath, DEFAULT_SETTINGS);
    return {
      ...DEFAULT_SETTINGS,
      ...(settings && typeof settings === 'object' ? settings : {}),
    };
  }

  async function saveSettings(settings) {
    await ensureDir(dataDir);
    const next = {
      ...DEFAULT_SETTINGS,
      ...(settings && typeof settings === 'object' ? settings : {}),
    };
    await writeJson(settingsPath, next);
    return next;
  }

  async function loadAppState() {
    await ensureDir(dataDir);
    const [notes, folders, tombstones, settings] = await Promise.all([
      loadNotes(),
      loadFolders(),
      loadTombstones(),
      loadSettings(),
    ]);

    return {
      notes,
      folders,
      tombstones,
      settings,
    };
  }

  return {
    loadAppState,
    loadNotes,
    saveNotes,
    loadFolders,
    saveFolders,
    loadTombstones,
    saveTombstones,
    loadSettings,
    saveSettings,
  };
}

module.exports = {
  createStore,
  DEFAULT_SETTINGS,
};
