import {
  DEFAULT_FONT_AVAILABILITY,
  DEFAULT_DESKTOP_SETTINGS,
  type DesktopSettings,
  type DesktopSnapshot,
  type FontAvailabilityMap,
  type FontPresetSources,
  type Folder,
  type Note,
  type NoteTombstone,
} from './models';
import { mergeSettings, sortNotes } from './note-utils';

function requireBridge() {
  if (!window.anoteDesktop?.storage) {
    throw new Error('Desktop storage bridge is unavailable.');
  }
  return window.anoteDesktop.storage;
}

export async function loadDesktopSnapshot(): Promise<DesktopSnapshot> {
  const bridge = requireBridge();
  const snapshot = await bridge.loadAppState();
  return {
    notes: sortNotes((snapshot.notes ?? []) as Note[]),
    folders: (snapshot.folders ?? []) as Folder[],
    tombstones: (snapshot.tombstones ?? []) as NoteTombstone[],
    settings: mergeSettings(snapshot.settings ?? DEFAULT_DESKTOP_SETTINGS),
  };
}

export async function saveDesktopNotes(notes: Note[]): Promise<Note[]> {
  const bridge = requireBridge();
  const saved = await bridge.saveNotes(notes);
  return sortNotes(saved as Note[]);
}

export async function saveDesktopFolders(folders: Folder[]): Promise<void> {
  const bridge = requireBridge();
  await bridge.saveFolders(folders);
}

export async function saveDesktopTombstones(tombstones: NoteTombstone[]): Promise<void> {
  const bridge = requireBridge();
  await bridge.saveTombstones(tombstones);
}

export async function saveDesktopSettings(settings: DesktopSettings): Promise<DesktopSettings> {
  const bridge = requireBridge();
  const next = await bridge.saveSettings(settings as unknown as Record<string, unknown>);
  return mergeSettings(next);
}

export async function syncDesktopData(payload: {
  provider: 'github' | 'webdav';
  githubConfig: DesktopSettings['githubConfig'];
  webdavConfig: DesktopSettings['webdavConfig'];
  notes: Note[];
  folders: Folder[];
  tombstones: NoteTombstone[];
}): Promise<Pick<DesktopSnapshot, 'notes' | 'folders' | 'tombstones'>> {
  if (!window.anoteDesktop?.sync) {
    throw new Error('Desktop sync bridge is unavailable.');
  }
  const result = await window.anoteDesktop.sync.run(payload as unknown as Record<string, unknown>);
  return {
    notes: sortNotes((result.notes ?? []) as Note[]),
    folders: (result.folders ?? []) as Folder[],
    tombstones: (result.tombstones ?? []) as NoteTombstone[],
  };
}

export async function getDesktopAppVersion(): Promise<string> {
  return (await window.anoteDesktop?.meta?.getAppVersion?.()) ?? '0.1.0';
}

export async function getDesktopFontAvailability(): Promise<FontAvailabilityMap> {
  const raw = await window.anoteDesktop?.fonts?.getAvailability?.();
  return {
    ...DEFAULT_FONT_AVAILABILITY,
    ...(raw ?? {}),
  };
}

export async function downloadDesktopFontPreset(
  preset: Exclude<DesktopSettings['fontPreset'], 'system'>
): Promise<FontAvailabilityMap> {
  const raw = await window.anoteDesktop?.fonts?.downloadPreset?.(preset);
  return {
    ...DEFAULT_FONT_AVAILABILITY,
    ...(raw ?? {}),
  };
}

export async function getDesktopFontPresetSources(
  preset: Exclude<DesktopSettings['fontPreset'], 'system'>
): Promise<FontPresetSources | null> {
  const sources = await window.anoteDesktop?.fonts?.getPresetSources?.(preset);
  if (!sources) return null;
  return sources as FontPresetSources;
}

export async function saveDesktopLongImage(payload: {
  html: string;
  width: number;
  suggestedName?: string;
}): Promise<{ filePath: string | null }> {
  if (!window.anoteDesktop?.export) {
    throw new Error('Desktop export bridge is unavailable.');
  }
  return window.anoteDesktop.export.saveLongImage(payload);
}
