import {
  type AppLanguage,
  type DesktopSettings,
  DEFAULT_DESKTOP_SETTINGS,
  type FontPreset,
  type Note,
  type NoteTombstone,
} from './models';

export const INLINE_IMAGE_QUALITY = 0.7;
export const MAX_INLINE_IMAGE_BYTES = 1_250_000;
export const MAX_INLINE_IMAGE_SHORT_EDGE = 1080;

export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.isStarred !== b.isStarred) return a.isStarred ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8203;|&#8204;|&#8205;|&#65279;/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getWordCount(html: string): number {
  const text = stripHtml(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function hasMeaningfulNoteContent(content: string): boolean {
  const html = String(content || '');
  const hasMedia = /<(img|video|audio|iframe|svg|canvas)\b/i.test(html);
  const text = stripHtml(html).replace(/\s+/g, '').trim();
  return hasMedia || text.length > 0;
}

export function buildNotePreview(html: string, language: AppLanguage): string {
  const emptyText =
    language === 'zh' ? '现在还是空的，写点什么吧？' : "It's empty now, maybe write something?";
  const plain = stripHtml(html);
  if (!plain) return emptyText;
  if (plain.length <= 96) return plain;

  const sliced = plain.slice(0, 96);
  const lastSpace = sliced.lastIndexOf(' ');
  const safe =
    lastSpace >= 40 && /[A-Za-z]/.test(sliced[lastSpace - 1] ?? '')
      ? sliced.slice(0, lastSpace)
      : sliced;
  return `${safe.trim()}...`;
}

export function buildSuggestedNoteFileName(html: string, language: AppLanguage): string {
  const preview = buildNotePreview(html, language)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return preview || 'anote-note';
}

export function formatRelativeDate(value: string, language: AppLanguage): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function mergeSettings(raw: unknown): DesktopSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<DesktopSettings>;
  const fontPreset = toFontPreset(value.fontPreset);
  const languagePreference = toLanguagePreference(value.languagePreference);
  return {
    ...DEFAULT_DESKTOP_SETTINGS,
    ...value,
    fontPreset,
    languagePreference,
  };
}

export function toAppLanguage(preference: DesktopSettings['languagePreference']): AppLanguage {
  if (preference === 'en' || preference === 'zh') return preference;
  const locale = String(Intl.DateTimeFormat().resolvedOptions().locale || '').toLowerCase();
  return locale.startsWith('zh') ? 'zh' : 'en';
}

export function updateOrInsertTombstone(
  tombstones: NoteTombstone[],
  next: NoteTombstone
): NoteTombstone[] {
  const existingIndex = tombstones.findIndex((item) => item.id === next.id);
  if (existingIndex < 0) {
    return [...tombstones, next];
  }

  return tombstones.map((item, index) => {
    if (index !== existingIndex) return item;
    const currentTs = new Date(item.deletedAt).getTime();
    const nextTs = new Date(next.deletedAt).getTime();
    return nextTs >= currentTs ? next : item;
  });
}

export async function fileToCompressedInlineImage(file: File): Promise<{ src: string; bytes: number }> {
  const bitmap = await createImageBitmap(file);
  const shortEdge = Math.min(bitmap.width, bitmap.height);
  const scale = shortEdge > 0 ? Math.min(1, MAX_INLINE_IMAGE_SHORT_EDGE / shortEdge) : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Cannot create image canvas.');
  }
  context.drawImage(bitmap, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', INLINE_IMAGE_QUALITY);
  const base64 = dataUrl.split(',')[1] ?? '';
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_INLINE_IMAGE_BYTES) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  return {
    src: dataUrl,
    bytes,
  };
}

function toFontPreset(value: unknown): FontPreset {
  if (
    value === 'system' ||
    value === 'sarasa_gothic' ||
    value === 'source_han_serif' ||
    value === 'glow_sans'
  ) {
    return value;
  }
  return DEFAULT_DESKTOP_SETTINGS.fontPreset;
}

function toLanguagePreference(value: unknown): DesktopSettings['languagePreference'] {
  if (value === 'system' || value === 'en' || value === 'zh') {
    return value;
  }
  return DEFAULT_DESKTOP_SETTINGS.languagePreference;
}
