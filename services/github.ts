import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { GitHubConfig, Note } from '../types/note';

const GITHUB_CONFIG_KEY = '@a_note_github_config';
const GITHUB_TOKEN_KEY = 'a_note_github_token';

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

interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  content: string;
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

async function githubFetch(
  config: GitHubConfig,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `https://api.github.com/repos/${config.repo}/contents/${path}`;

  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
}

function noteToMarkdown(note: Note): string {
  const frontmatter = [
    '---',
    `id: "${note.id}"`,
    `createdAt: "${note.createdAt}"`,
    `updatedAt: "${note.updatedAt}"`,
    `isPinned: ${note.isPinned}`,
    `isStarred: ${note.isStarred}`,
    `isDeleted: ${note.isDeleted}`,
    `folderIds: [${note.folderIds.map((item) => `"${item}"`).join(', ')}]`,
    '---',
  ].join('\n');

  return `${frontmatter}\n\n${note.content}`;
}

function markdownToNote(filename: string, markdown: string, sha: string): Note {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);

  if (!match) {
    const now = new Date().toISOString();
    return {
      id: filename.replace(/\.md$/, ''),
      content: markdown,
      createdAt: now,
      updatedAt: now,
      isPinned: false,
      isStarred: false,
      isDeleted: false,
      folderIds: [],
      sha,
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
    id: getValue('id') || filename.replace(/\.md$/, ''),
    content,
    createdAt: getValue('createdAt') || new Date().toISOString(),
    updatedAt: getValue('updatedAt') || new Date().toISOString(),
    isPinned: getValue('isPinned') === 'true',
    isStarred: getValue('isStarred') === 'true',
    isDeleted: getValue('isDeleted') === 'true',
    folderIds,
    sha,
  };
}

function noteToFilename(note: Note): string {
  const firstLine = note.content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30)
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();

  return `${note.createdAt.slice(0, 10)}-${firstLine || note.id.slice(0, 8)}.md`;
}

export async function validateToken(config: GitHubConfig): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${config.token}` },
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function ensureNotesDir(config: GitHubConfig): Promise<void> {
  const response = await githubFetch(config, 'notes');

  if (response.status === 404) {
    await githubFetch(config, 'notes/.gitkeep', {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Initialize notes directory',
        content: encodeBase64(''),
        branch: config.branch,
      }),
    });
  }
}

export async function pullNotes(config: GitHubConfig): Promise<Note[]> {
  await ensureNotesDir(config);
  const response = await githubFetch(config, 'notes');
  if (!response.ok) return [];

  const files = (await response.json()) as Array<{ name: string; path: string; sha: string }>;
  const markdownFiles = files.filter((file) => file.name.endsWith('.md'));

  const notes: Note[] = [];

  for (const file of markdownFiles) {
    const fileResponse = await githubFetch(config, file.path);
    if (!fileResponse.ok) continue;

    const data = (await fileResponse.json()) as GitHubFileContent;
    const decoded = decodeBase64(data.content);
    notes.push(markdownToNote(file.name, decoded, data.sha));
  }

  return notes;
}

export async function pushNote(
  config: GitHubConfig,
  note: Note,
  existingSha?: string
): Promise<string> {
  const filename = noteToFilename(note);

  const body: Record<string, unknown> = {
    message: existingSha ? `Update note ${note.id}` : `Create note ${note.id}`,
    content: encodeBase64(noteToMarkdown(note)),
    branch: config.branch,
  };

  if (existingSha) {
    body.sha = existingSha;
  }

  const response = await githubFetch(config, `notes/${filename}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to push note');
  }

  const data = await response.json();
  return data.content.sha as string;
}

export async function syncNotes(config: GitHubConfig, localNotes: Note[]): Promise<Note[]> {
  const remoteNotes = await pullNotes(config);

  const localMap = new Map(localNotes.map((note) => [note.id, note]));
  const remoteMap = new Map(remoteNotes.map((note) => [note.id, note]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

  const merged: Note[] = [];

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local && remote) {
      const localTime = new Date(local.updatedAt).getTime();
      const remoteTime = new Date(remote.updatedAt).getTime();

      if (localTime >= remoteTime) {
        const sha = await pushNote(config, local, remote.sha);
        merged.push({ ...local, sha });
      } else {
        merged.push(remote);
      }
    } else if (local) {
      const sha = await pushNote(config, local);
      merged.push({ ...local, sha });
    } else if (remote) {
      merged.push(remote);
    }
  }

  return merged;
}
