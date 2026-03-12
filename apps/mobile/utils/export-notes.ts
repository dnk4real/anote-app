import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import parse, { type HTMLElement, type Node, NodeType, type TextNode } from 'node-html-parser';
import type { Folder, Note } from '../types/note';

const EXPORT_DIR = 'note-exports';
const NOTE_DIR = 'notes';
const ASSET_DIR = 'assets';
const MAX_FILE_STEM_LENGTH = 52;
const IMAGE_NAME_PAD = 2;

type ExportImageAsset = {
  path: string;
  base64: string;
};

type RenderContext = {
  noteStem: string;
  images: ExportImageAsset[];
};

type ExportOptions = {
  shareTitle: string;
};

type ExportResult = {
  uri: string;
  fileName: string;
  exportedCount: number;
  shared: boolean;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function collapseWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function escapeYaml(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function sanitizeFilePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILE_STEM_LENGTH);
}

function formatFileTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'undated';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
}

function formatArchiveTimestamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function guessImageExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('heic')) return 'heic';
  if (normalized.includes('bmp')) return 'bmp';
  return 'jpg';
}

function isMeaningfulTextNode(node: Node): node is TextNode {
  return node.nodeType === NodeType.TEXT_NODE && collapseWhitespace(decodeHtmlEntities(node.rawText)).trim().length > 0;
}

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === NodeType.ELEMENT_NODE;
}

function isBlockElement(node: Node): boolean {
  if (!isElement(node)) return false;
  const tag = node.tagName.toLowerCase();
  return (
    tag === 'div' ||
    tag === 'p' ||
    tag === 'h1' ||
    tag === 'h2' ||
    tag === 'h3' ||
    tag === 'blockquote' ||
    tag === 'ul' ||
    tag === 'ol' ||
    tag === 'li' ||
    tag === 'img'
  );
}

function isCenterAligned(element: HTMLElement): boolean {
  const align = (element.getAttribute('align') || '').toLowerCase();
  const style = (element.getAttribute('style') || '').toLowerCase();
  return align === 'center' || /text-align\s*:\s*center/.test(style);
}

function hasNestedBlockChildren(element: HTMLElement): boolean {
  return element.childNodes.some((child) => {
    if (!isElement(child)) return false;
    if (child.classList.contains('note-image-block')) return true;
    const tag = child.tagName.toLowerCase();
    return tag === 'div' || tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'blockquote' || tag === 'ul' || tag === 'ol';
  });
}

function buildNoteStem(note: Note, index: number, plainText: string): string {
  const snippet = sanitizeFilePart(plainText.split('\n')[0] || plainText || '');
  const prefix = formatFileTimestamp(note.updatedAt || note.createdAt);
  const base = snippet || `note-${String(index + 1).padStart(3, '0')}`;
  return sanitizeFilePart(`${prefix}_${base}`) || `${prefix}_note-${String(index + 1).padStart(3, '0')}`;
}

function normalizeInlineMarkdown(value: string): string {
  return collapseWhitespace(value)
    .replace(/ +([,.;:!?])/g, '$1')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function registerImage(src: string, context: RenderContext): string {
  const dataUriMatch = src.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
  const nextIndex = context.images.length + 1;
  const imageName = `${context.noteStem}-image-${String(nextIndex).padStart(IMAGE_NAME_PAD, '0')}`;

  if (dataUriMatch) {
    const mimeType = dataUriMatch[1];
    const base64 = dataUriMatch[2];
    const extension = guessImageExtension(mimeType);
    const path = `${ASSET_DIR}/${imageName}.${extension}`;
    context.images.push({ path, base64 });
    return `../${path}`;
  }

  return src;
}

function renderInlineNode(node: Node, context: RenderContext): string {
  if (node.nodeType === NodeType.TEXT_NODE) {
    return collapseWhitespace(decodeHtmlEntities(node.rawText));
  }

  if (!isElement(node)) return '';
  const tag = node.tagName.toLowerCase();

  if (tag === 'br') return '\n';
  if (tag === 'img') {
    const src = node.getAttribute('src');
    if (!src) return '';
    return `![Image](${registerImage(src, context)})`;
  }

  const inner = renderInlineNodes(node.childNodes, context);

  if (tag === 'strong' || tag === 'b') {
    const content = normalizeInlineMarkdown(inner);
    return content ? `**${content}**` : '';
  }

  if (tag === 'em' || tag === 'i') {
    const content = normalizeInlineMarkdown(inner);
    return content ? `*${content}*` : '';
  }

  if (tag === 'a') {
    const href = node.getAttribute('href');
    const label = normalizeInlineMarkdown(inner) || href || '';
    if (!href) return label;
    return `[${label}](${href})`;
  }

  return inner;
}

function renderInlineNodes(nodes: Node[], context: RenderContext): string {
  return nodes.map((node) => renderInlineNode(node, context)).join('');
}

function renderList(element: HTMLElement, context: RenderContext, ordered: boolean): string {
  const items = element.childNodes.filter((child): child is HTMLElement => isElement(child) && child.tagName.toLowerCase() === 'li');

  return items
    .map((item, index) => {
      const blocks = renderBlockNodes(item.childNodes, context)
        .map((block) => block.trim())
        .filter(Boolean);
      const itemBody = blocks.join('\n\n').trim() || normalizeInlineMarkdown(renderInlineNodes(item.childNodes, context));
      if (!itemBody) return '';

      const marker = ordered ? `${index + 1}.` : '-';
      const lines = itemBody.split('\n');
      return lines
        .map((line, lineIndex) => {
          if (lineIndex === 0) return `${marker} ${line}`;
          return line ? `  ${line}` : '';
        })
        .join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

function renderBlockElement(element: HTMLElement, context: RenderContext): string[] {
  const tag = element.tagName.toLowerCase();

  if (element.classList.contains('note-image-handle') ||
      element.classList.contains('note-image-bubble') ||
      element.classList.contains('note-image-drop-line') ||
      element.classList.contains('note-image-drag-proxy')) {
    return [];
  }

  if (element.classList.contains('note-image-block')) {
    const img = element.querySelector('img');
    const src = img?.getAttribute('src');
    if (!src) return [];
    return [`![Image](${registerImage(src, context)})`];
  }

  if (tag === 'img') {
    const src = element.getAttribute('src');
    if (!src) return [];
    return [`![Image](${registerImage(src, context)})`];
  }

  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    const level = tag === 'h1' ? '#' : tag === 'h2' ? '##' : '###';
    const content = normalizeInlineMarkdown(renderInlineNodes(element.childNodes, context));
    return content ? [`${level} ${content}`] : [];
  }

  if (tag === 'blockquote') {
    const innerBlocks = renderBlockNodes(element.childNodes, context)
      .map((block) => block.trim())
      .filter(Boolean);
    const content = innerBlocks.join('\n\n').trim() || normalizeInlineMarkdown(renderInlineNodes(element.childNodes, context));
    if (!content) return [];
    return [
      content
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n'),
    ];
  }

  if (tag === 'ul') {
    const content = renderList(element, context, false);
    return content ? [content] : [];
  }

  if (tag === 'ol') {
    const content = renderList(element, context, true);
    return content ? [content] : [];
  }

  if (tag === 'div' || tag === 'p' || tag === 'li') {
    if (hasNestedBlockChildren(element)) {
      const blocks = renderBlockNodes(element.childNodes, context);
      if (isCenterAligned(element) && blocks.length > 0) {
        return [`<div align="center">\n${blocks.join('\n\n')}\n</div>`];
      }
      return blocks;
    }

    const content = normalizeInlineMarkdown(renderInlineNodes(element.childNodes, context));
    if (!content) return [];
    if (isCenterAligned(element)) {
      return [`<div align="center">\n${content}\n</div>`];
    }
    return [content];
  }

  const content = normalizeInlineMarkdown(renderInlineNodes(element.childNodes, context));
  return content ? [content] : [];
}

function renderBlockNodes(nodes: Node[], context: RenderContext): string[] {
  const blocks: string[] = [];
  let inlineBuffer = '';

  const flushInlineBuffer = () => {
    const content = normalizeInlineMarkdown(inlineBuffer);
    if (content) blocks.push(content);
    inlineBuffer = '';
  };

  for (const node of nodes) {
    if (node.nodeType === NodeType.TEXT_NODE) {
      if (isMeaningfulTextNode(node)) {
        inlineBuffer += renderInlineNode(node, context);
      }
      continue;
    }

    if (!isElement(node)) continue;

    if (isBlockElement(node) || node.classList.contains('note-image-block')) {
      flushInlineBuffer();
      blocks.push(...renderBlockElement(node, context));
      continue;
    }

    inlineBuffer += renderInlineNode(node, context);
  }

  flushInlineBuffer();

  return blocks.filter((block) => block.trim().length > 0);
}

function stripPreviewHtml(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function noteToMarkdown(note: Note, foldersById: Map<string, string>, index: number): { fileName: string; markdown: string; images: ExportImageAsset[] } {
  const root = parse(note.content || '', {
    lowerCaseTagName: true,
    comment: false,
    preserveTagNesting: true,
  });

  root
    .querySelectorAll('.note-image-handle, .note-image-bubble, .note-image-drop-line, .note-image-drag-proxy')
    .forEach((node) => node.remove());

  const plainText = stripPreviewHtml(note.content);
  const noteStem = buildNoteStem(note, index, plainText);
  const context: RenderContext = {
    noteStem,
    images: [],
  };

  const body = renderBlockNodes(root.childNodes, context).join('\n\n').trim();
  const folderNames = note.folderIds
    .map((folderId) => foldersById.get(folderId))
    .filter((name): name is string => Boolean(name));

  const frontMatterLines = [
    '---',
    `id: ${escapeYaml(note.id)}`,
    `created_at: ${escapeYaml(note.createdAt)}`,
    `updated_at: ${escapeYaml(note.updatedAt)}`,
    `starred: ${note.isStarred ? 'true' : 'false'}`,
    `pinned: ${note.isPinned ? 'true' : 'false'}`,
  ];

  if (folderNames.length > 0) {
    frontMatterLines.push('folders:');
    folderNames.forEach((name) => {
      frontMatterLines.push(`  - ${escapeYaml(name)}`);
    });
  } else {
    frontMatterLines.push('folders: []');
  }

  frontMatterLines.push('---', '');

  const markdown = `${frontMatterLines.join('\n')}${body}`.trimEnd() + '\n';

  return {
    fileName: `${noteStem}.md`,
    markdown,
    images: context.images,
  };
}

async function ensureExportDirectory(): Promise<string> {
  const baseDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDirectory) {
    throw new Error('Export directory is unavailable on this device.');
  }

  const exportDirectory = `${baseDirectory}${EXPORT_DIR}/`;
  await FileSystem.makeDirectoryAsync(exportDirectory, { intermediates: true });
  return exportDirectory;
}

export async function exportNotesAsMarkdownZip(notes: Note[], folders: Folder[], options: ExportOptions): Promise<ExportResult> {
  const exportableNotes = notes.filter((note) => !note.isDeleted);
  if (exportableNotes.length === 0) {
    throw new Error('NO_EXPORTABLE_NOTES');
  }

  const foldersById = new Map(folders.map((folder) => [folder.id, folder.name]));
  const zip = new JSZip();
  const notesFolder = zip.folder(NOTE_DIR);
  if (!notesFolder) {
    throw new Error('Failed to initialize export archive.');
  }

  for (let index = 0; index < exportableNotes.length; index += 1) {
    const note = exportableNotes[index];
    const rendered = noteToMarkdown(note, foldersById, index);
    notesFolder.file(rendered.fileName, rendered.markdown);
    rendered.images.forEach((image) => {
      zip.file(image.path, image.base64, { base64: true });
    });
  }

  const archiveBaseName = `anote-notes-${formatArchiveTimestamp()}`;
  const archiveFileName = `${archiveBaseName}.zip`;
  const exportDirectory = await ensureExportDirectory();
  const archiveUri = `${exportDirectory}${archiveFileName}`;
  await FileSystem.deleteAsync(archiveUri, { idempotent: true });

  const archiveBase64 = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  await FileSystem.writeAsStringAsync(archiveUri, archiveBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const sharingAvailable = await Sharing.isAvailableAsync();
  if (sharingAvailable) {
    await Sharing.shareAsync(archiveUri, {
      mimeType: 'application/zip',
      UTI: 'public.zip-archive',
      dialogTitle: options.shareTitle,
    });
  }

  return {
    uri: archiveUri,
    fileName: archiveFileName,
    exportedCount: exportableNotes.length,
    shared: sharingAvailable,
  };
}
