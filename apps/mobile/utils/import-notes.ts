import * as FileSystem from 'expo-file-system/legacy';
import JSZip, { type JSZipObject } from 'jszip';
import type { Folder, Note } from '../types/note';

const NOTE_ROOT = 'notes/';
const ASSET_ROOT = 'assets/';
const SMARTISAN_ZIP_PATTERN = /(^|\/)smartisan-notes(?: \(\d+\))?\.zip$/i;
const SMARTISAN_TIME_PATTERN =
  /^(?:修改时间|创建时间)\s*[：:]\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*$/;

const IMPORT_ERROR_UNSUPPORTED = 'UNSUPPORTED_ARCHIVE';

type ImportFormat = 'anote' | 'smartisan';

type ImportArchive = {
  format: ImportFormat;
  zip: JSZip;
};

type ParsedImportNote = {
  content: string;
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
  isStarred: boolean;
  folderNames: string[];
};

export type ImportNotesResult = {
  notes: Note[];
  folders: Folder[];
  importedCount: number;
  createdFolderCount: number;
  format: ImportFormat;
};

type FrontMatter = {
  created_at?: string;
  updated_at?: string;
  starred?: string;
  pinned?: string;
  folders: string[];
};

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return trimmed;
}

function normalizeArchivePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
}

function guessMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}

function isZipEntryFile(entry: JSZipObject): boolean {
  return !entry.dir && !entry.name.startsWith('__MACOSX/');
}

function isOwnMarkdownArchive(zip: JSZip): boolean {
  return Object.values(zip.files).some((entry) => {
    if (!isZipEntryFile(entry)) return false;
    return /^notes\/[^/]+\.md$/i.test(normalizeArchivePath(entry.name));
  });
}

function isSmartisanArchive(zip: JSZip, fileName?: string): boolean {
  const markdownEntries = Object.values(zip.files).filter((entry) => {
    if (!isZipEntryFile(entry)) return false;
    return normalizeArchivePath(entry.name).toLowerCase().endsWith('.md');
  });

  if (markdownEntries.length === 0) return false;
  if (fileName && /smartisan-notes/i.test(fileName)) return true;

  return markdownEntries.some((entry) => {
    const path = normalizeArchivePath(entry.name);
    if (/^notes\/[^/]+\.md$/i.test(path)) return false;
    const parts = path.split('/').filter(Boolean);
    return parts.length >= 2;
  });
}

async function resolveImportArchive(zip: JSZip, fileName: string): Promise<ImportArchive> {
  if (isOwnMarkdownArchive(zip)) {
    return { format: 'anote', zip };
  }

  const nestedSmartisanEntry = Object.values(zip.files).find((entry) => {
    if (!isZipEntryFile(entry)) return false;
    return SMARTISAN_ZIP_PATTERN.test(normalizeArchivePath(entry.name));
  });

  if (nestedSmartisanEntry) {
    try {
      const nestedBytes = await nestedSmartisanEntry.async('uint8array');
      const nestedZip = await JSZip.loadAsync(nestedBytes);
      if (isSmartisanArchive(nestedZip, nestedSmartisanEntry.name)) {
        return { format: 'smartisan', zip: nestedZip };
      }
    } catch {
      throw new Error(IMPORT_ERROR_UNSUPPORTED);
    }
  }

  if (isSmartisanArchive(zip, fileName)) {
    return { format: 'smartisan', zip };
  }

  throw new Error(IMPORT_ERROR_UNSUPPORTED);
}

function parseBooleanFlag(value: string | undefined): boolean {
  return (value || '').trim().toLowerCase() === 'true';
}

function normalizeDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function parseFrontMatter(raw: string): { frontMatter: FrontMatter; body: string } {
  const normalized = normalizeNewlines(raw);
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontMatter: { folders: [] }, body: normalized };
  }

  const block = match[1];
  const body = normalized.slice(match[0].length);
  const frontMatter: FrontMatter = { folders: [] };
  let currentKey = '';

  block.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (currentKey === 'folders' && /^-\s+/.test(trimmed)) {
      frontMatter.folders.push(stripWrappingQuotes(trimmed.replace(/^-\s+/, '')));
      return;
    }

    const fieldMatch = trimmed.match(/^([a-z_]+):\s*(.*)$/i);
    if (!fieldMatch) return;

    const [, key, rawValue] = fieldMatch;
    currentKey = key;

    if (key === 'folders') {
      if (rawValue.trim() === '[]') {
        frontMatter.folders = [];
      }
      return;
    }

    if (key === 'created_at' || key === 'updated_at' || key === 'starred' || key === 'pinned') {
      frontMatter[key] = stripWrappingQuotes(rawValue);
    }
  });

  return { frontMatter, body };
}

function renderInlineMarkdown(text: string): string {
  let html = escapeHtml(text);

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    return `<a href="${escapeAttribute(url.trim())}">${label}</a>`;
  });

  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

  return html;
}

function buildImageBlock(src: string): string {
  return `<div class="note-image-block" data-image-width="98" style="width:98%;"><img src="${escapeAttribute(
    src
  )}" /></div>`;
}

function parseImageMarkdown(line: string): string | null {
  const match = line.trim().match(/^!\[[^\]]*]\((.+)\)$/);
  return match ? match[1].trim() : null;
}

function makeTextBlocks(lines: string[], centered = false): string {
  return lines
    .map((line) => {
      if (!line.trim()) return '<div><br></div>';
      const content = renderInlineMarkdown(line.trim());
      return centered
        ? `<div style="text-align:center;">${content}</div>`
        : `<div>${content}</div>`;
    })
    .join('');
}

function renderList(lines: string[], ordered: boolean): string {
  const items: string[][] = [];

  lines.forEach((line) => {
    const trimmed = line.trimEnd();
    const markerMatch = ordered
      ? trimmed.match(/^\s*\d+\.\s+(.*)$/)
      : trimmed.match(/^\s*[-*]\s+(.*)$/);

    if (markerMatch) {
      items.push([markerMatch[1]]);
      return;
    }

    if (items.length === 0) return;
    if (/^\s{2,}\S/.test(line)) {
      items[items.length - 1].push(line.trim());
    }
  });

  const tag = ordered ? 'ol' : 'ul';
  const itemHtml = items
    .map((itemLines) => {
      const content = itemLines
        .map((itemLine) => renderInlineMarkdown(itemLine))
        .join('<br />');
      return `<li>${content}</li>`;
    })
    .join('');

  return `<${tag}>${itemHtml}</${tag}>`;
}

function renderBlockquote(lines: string[]): string {
  const inner = lines
    .map((line) => {
      const stripped = line.replace(/^\s*>\s?/, '');
      if (!stripped.trim()) return '<div><br></div>';
      return `<div>${renderInlineMarkdown(stripped)}</div>`;
    })
    .join('');

  return `<blockquote>${inner}</blockquote>`;
}

function renderCenteredBlock(lines: string[], resolveAssetSource: (path: string) => string | null): string {
  const blocks: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push('<div><br></div>');
      return;
    }

    const imagePath = parseImageMarkdown(trimmed);
    if (imagePath) {
      const src = resolveAssetSource(imagePath);
      if (src) blocks.push(buildImageBlock(src));
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(
        `<h${level} style="text-align:center;">${renderInlineMarkdown(headingMatch[2])}</h${level}>`
      );
      return;
    }

    blocks.push(`<div style="text-align:center;">${renderInlineMarkdown(trimmed)}</div>`);
  });

  return blocks.join('');
}

function markdownToHtml(markdown: string, resolveAssetSource: (path: string) => string | null): string {
  const lines = normalizeNewlines(markdown).split('\n');
  const blocks: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('<div align="center">')) {
      const centeredLines: string[] = [];
      let current = trimmed.replace(/^<div align="center">/, '');

      while (true) {
        const closeIndex = current.indexOf('</div>');
        if (closeIndex >= 0) {
          const beforeClose = current.slice(0, closeIndex).trim();
          if (beforeClose) centeredLines.push(beforeClose);
          break;
        }

        if (current.trim()) centeredLines.push(current.trim());
        index += 1;
        if (index >= lines.length) break;
        current = lines[index];
      }

      blocks.push(renderCenteredBlock(centeredLines, resolveAssetSource));
      index += 1;
      continue;
    }

    const imagePath = parseImageMarkdown(trimmed);
    if (imagePath) {
      const src = resolveAssetSource(imagePath);
      if (src) {
        blocks.push(buildImageBlock(src));
      }
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(rawLine)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoteLine = lines[index];
        if (!quoteLine.trim()) break;
        if (!/^\s*>\s?/.test(quoteLine)) break;
        quoteLines.push(quoteLine);
        index += 1;
      }
      blocks.push(renderBlockquote(quoteLines));
      continue;
    }

    if (/^\s*[-*]\s+/.test(rawLine) || /^\s*\d+\.\s+/.test(rawLine)) {
      const ordered = /^\s*\d+\.\s+/.test(rawLine);
      const listLines: string[] = [];

      while (index < lines.length) {
        const listLine = lines[index];
        if (!listLine.trim()) break;
        const isItem = ordered ? /^\s*\d+\.\s+/.test(listLine) : /^\s*[-*]\s+/.test(listLine);
        const isContinuation = /^\s{2,}\S/.test(listLine);
        if (!isItem && !isContinuation) break;
        listLines.push(listLine);
        index += 1;
      }

      blocks.push(renderList(listLines, ordered));
      continue;
    }

    blocks.push(makeTextBlocks([rawLine]));
    index += 1;
  }

  return blocks.join('');
}

function parseSmartisanTimestamp(line: string): string | null {
  const match = line.trim().match(SMARTISAN_TIME_PATTERN);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second || '0')
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseSmartisanMarkdown(raw: string): { content: string; timestamp: string } {
  const normalized = normalizeNewlines(raw);
  const lines = normalized.split('\n');
  const fallbackTimestamp = new Date().toISOString();
  let timestamp = fallbackTimestamp;
  let startIndex = 0;

  for (let index = 0; index < Math.min(lines.length, 3); index += 1) {
    const parsedTime = parseSmartisanTimestamp(lines[index]);
    if (!parsedTime) continue;
    timestamp = parsedTime;
    startIndex = index + 1;
    while (startIndex < lines.length && !lines[startIndex].trim()) {
      startIndex += 1;
    }
    break;
  }

  const bodyLines = lines.slice(startIndex);
  return {
    content: makeTextBlocks(bodyLines),
    timestamp,
  };
}

function buildFolderState(existingFolders: Folder[], folderNames: string[]): {
  folders: Folder[];
  folderIdByName: Map<string, string>;
  createdFolderCount: number;
} {
  const folders = [...existingFolders];
  const folderIdByName = new Map<string, string>();

  existingFolders.forEach((folder) => {
    folderIdByName.set(folder.name, folder.id);
  });

  let createdFolderCount = 0;

  folderNames.forEach((folderName) => {
    const trimmed = folderName.trim();
    if (!trimmed || folderIdByName.has(trimmed)) return;

    const now = new Date().toISOString();
    const folder: Folder = {
      id: generateId(),
      name: trimmed,
      createdAt: now,
      updatedAt: now,
    };

    folders.push(folder);
    folderIdByName.set(trimmed, folder.id);
    createdFolderCount += 1;
  });

  return { folders, folderIdByName, createdFolderCount };
}

function resolveImportedAssetSource(
  assetMap: Map<string, string>,
  rawPath: string
): string | null {
  const normalized = normalizeArchivePath(rawPath)
    .replace(/^\.\.\//, '')
    .replace(/^notes\//, '');

  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('data:image/')) {
    return normalized;
  }

  const base64 = assetMap.get(normalized);
  if (!base64) return null;
  return `data:${guessMimeType(normalized)};base64,${base64}`;
}

async function parseOwnArchive(
  zip: JSZip,
  existingNotes: Note[],
  existingFolders: Folder[]
): Promise<ImportNotesResult> {
  const assetEntries = Object.values(zip.files).filter((entry) => {
    if (!isZipEntryFile(entry)) return false;
    return normalizeArchivePath(entry.name).startsWith(ASSET_ROOT);
  });

  const assetMap = new Map<string, string>();
  for (const entry of assetEntries) {
    assetMap.set(normalizeArchivePath(entry.name), await entry.async('base64'));
  }

  const noteEntries = Object.values(zip.files).filter((entry) => {
    if (!isZipEntryFile(entry)) return false;
    return /^notes\/[^/]+\.md$/i.test(normalizeArchivePath(entry.name));
  });

  if (noteEntries.length === 0) {
    throw new Error(IMPORT_ERROR_UNSUPPORTED);
  }

  const parsedNotes = await Promise.all(
    noteEntries.map(async (entry): Promise<ParsedImportNote> => {
      const raw = await entry.async('string');
      const { frontMatter, body } = parseFrontMatter(raw);
      const now = new Date().toISOString();

      return {
        content: markdownToHtml(body, (path) => resolveImportedAssetSource(assetMap, path)),
        createdAt: normalizeDate(frontMatter.created_at, now),
        updatedAt: normalizeDate(frontMatter.updated_at || frontMatter.created_at, now),
        isPinned: parseBooleanFlag(frontMatter.pinned),
        isStarred: parseBooleanFlag(frontMatter.starred),
        folderNames: frontMatter.folders.map((folderName) => folderName.trim()).filter(Boolean),
      };
    })
  );

  const folderNames = Array.from(
    new Set(parsedNotes.flatMap((note) => note.folderNames).filter(Boolean))
  );
  const { folders, folderIdByName, createdFolderCount } = buildFolderState(existingFolders, folderNames);

  const importedNotes = parsedNotes.map((note) => ({
    id: generateId(),
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    isPinned: note.isPinned,
    isStarred: note.isStarred,
    isDeleted: false,
    folderIds: note.folderNames
      .map((folderName) => folderIdByName.get(folderName))
      .filter((folderId): folderId is string => Boolean(folderId)),
  }));

  return {
    notes: [...importedNotes, ...existingNotes],
    folders,
    importedCount: importedNotes.length,
    createdFolderCount,
    format: 'anote',
  };
}

async function parseSmartisanArchive(
  zip: JSZip,
  existingNotes: Note[],
  existingFolders: Folder[]
): Promise<ImportNotesResult> {
  const markdownEntries = Object.values(zip.files).filter((entry) => {
    if (!isZipEntryFile(entry)) return false;
    const normalized = normalizeArchivePath(entry.name);
    if (!normalized.toLowerCase().endsWith('.md')) return false;
    return !normalized.startsWith(NOTE_ROOT);
  });

  if (markdownEntries.length === 0) {
    throw new Error(IMPORT_ERROR_UNSUPPORTED);
  }

  const parsedNotes = await Promise.all(
    markdownEntries.map(async (entry): Promise<ParsedImportNote> => {
      const raw = await entry.async('string');
      const { content, timestamp } = parseSmartisanMarkdown(raw);
      const pathParts = normalizeArchivePath(entry.name).split('/').filter(Boolean);
      const folderName =
        pathParts.length > 1 && pathParts[0] !== '未分类' ? pathParts[0].trim() : '';

      return {
        content,
        createdAt: timestamp,
        updatedAt: timestamp,
        isPinned: false,
        isStarred: false,
        folderNames: folderName ? [folderName] : [],
      };
    })
  );

  const folderNames = Array.from(
    new Set(parsedNotes.flatMap((note) => note.folderNames).filter(Boolean))
  );
  const { folders, folderIdByName, createdFolderCount } = buildFolderState(existingFolders, folderNames);

  const importedNotes: Note[] = parsedNotes.map((note) => ({
    id: generateId(),
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    isPinned: false,
    isStarred: false,
    isDeleted: false,
    folderIds: note.folderNames
      .map((folderName) => folderIdByName.get(folderName))
      .filter((folderId): folderId is string => Boolean(folderId)),
  }));

  return {
    notes: [...importedNotes, ...existingNotes],
    folders,
    importedCount: importedNotes.length,
    createdFolderCount,
    format: 'smartisan',
  };
}

export async function importNotesFromZip(
  uri: string,
  fileName: string,
  existingNotes: Note[],
  existingFolders: Folder[]
): Promise<ImportNotesResult> {
  const archiveBase64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archiveBase64, { base64: true });
  } catch {
    throw new Error(IMPORT_ERROR_UNSUPPORTED);
  }

  const archive = await resolveImportArchive(zip, fileName);

  if (archive.format === 'anote') {
    return parseOwnArchive(archive.zip, existingNotes, existingFolders);
  }

  return parseSmartisanArchive(archive.zip, existingNotes, existingFolders);
}

export { IMPORT_ERROR_UNSUPPORTED };
