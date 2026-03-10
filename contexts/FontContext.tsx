import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Font from 'expo-font';
import * as FileSystem from 'expo-file-system/legacy';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { TextStyle } from 'react-native';

const FONT_PRESET_KEY = '@a_note_font_preset';
const FONT_DOWNLOAD_DIR = `${FileSystem.documentDirectory}fonts/`;
const GITHUB_RELEASE_BASE_URL = 'https://github.com/dnk4real/anote-app/releases/download/fonts-2026-03-10';

export type FontPreset = 'system' | 'sarasa_gothic' | 'source_han_serif' | 'glow_sans';
type DownloadableFontPreset = Exclude<FontPreset, 'system'>;

interface FontOption {
  id: FontPreset;
  label: string;
}

type FontAvailabilityMap = Record<FontPreset, { installed: boolean; downloading: boolean }>;

interface FontContextValue {
  fontPreset: FontPreset;
  fontOptions: FontOption[];
  fontAvailability: FontAvailabilityMap;
  appFontStyle: TextStyle;
  appHeadingFontStyle: TextStyle;
  editorFontFaceCss: string;
  editorFontFamily: string;
  setFontPreset: (preset: FontPreset) => Promise<void>;
  downloadFontPreset: (preset: DownloadableFontPreset) => Promise<void>;
}

type RemoteFontAsset = {
  regular: { fileName: string; url: string };
  bold: { fileName: string; url: string };
};

const FONT_OPTIONS: FontOption[] = [
  { id: 'system', label: '系统' },
  { id: 'sarasa_gothic', label: '更纱黑体' },
  { id: 'source_han_serif', label: '思源宋体' },
  { id: 'glow_sans', label: '未来荧黑' },
];

const REMOTE_FONT_ASSETS: Record<DownloadableFontPreset, RemoteFontAsset> = {
  sarasa_gothic: {
    regular: {
      fileName: 'SarasaMonoSC-Regular.ttf',
      url: `${GITHUB_RELEASE_BASE_URL}/SarasaMonoSC-Regular.ttf`,
    },
    bold: {
      fileName: 'SarasaMonoSC-Bold.ttf',
      url: `${GITHUB_RELEASE_BASE_URL}/SarasaMonoSC-Bold.ttf`,
    },
  },
  source_han_serif: {
    regular: {
      fileName: 'SourceHanSerifCN-Regular.otf',
      url: `${GITHUB_RELEASE_BASE_URL}/SourceHanSerifCN-Regular.otf`,
    },
    bold: {
      fileName: 'SourceHanSerifCN-Bold.otf',
      url: `${GITHUB_RELEASE_BASE_URL}/SourceHanSerifCN-Bold.otf`,
    },
  },
  glow_sans: {
    regular: {
      fileName: 'GlowSansSC-Normal-Book.otf',
      url: `${GITHUB_RELEASE_BASE_URL}/GlowSansSC-Normal-Book.otf`,
    },
    bold: {
      fileName: 'GlowSansSC-Normal-ExtraBold.otf',
      url: `${GITHUB_RELEASE_BASE_URL}/GlowSansSC-Normal-ExtraBold.otf`,
    },
  },
};

const RN_FONT_FAMILY: Record<DownloadableFontPreset, { regular: string; bold: string }> = {
  sarasa_gothic: { regular: 'SarasaMonoSC-Regular', bold: 'SarasaMonoSC-Bold' },
  source_han_serif: { regular: 'SourceHanSerifCN-Regular', bold: 'SourceHanSerifCN-Bold' },
  glow_sans: { regular: 'GlowSansSC-Normal-Book', bold: 'GlowSansSC-Normal-ExtraBold' },
};

const FontContext = createContext<FontContextValue | undefined>(undefined);

function toFontPreset(raw: string | null): FontPreset | null {
  if (!raw) return null;

  // Backward compatibility for old keys.
  if (raw === 'sans') return 'sarasa_gothic';
  if (raw === 'source_han_sans') return 'sarasa_gothic';
  if (raw === 'serif') return 'source_han_serif';

  if (
    raw === 'system' ||
    raw === 'sarasa_gothic' ||
    raw === 'source_han_serif' ||
    raw === 'glow_sans'
  ) {
    return raw;
  }

  return null;
}

function createDefaultAvailability(): FontAvailabilityMap {
  return {
    system: { installed: true, downloading: false },
    sarasa_gothic: { installed: false, downloading: false },
    source_han_serif: { installed: false, downloading: false },
    glow_sans: { installed: false, downloading: false },
  };
}

function getFontUrisForPreset(preset: DownloadableFontPreset): { regular: string; bold: string } {
  const asset = REMOTE_FONT_ASSETS[preset];
  return {
    regular: `${FONT_DOWNLOAD_DIR}${asset.regular.fileName}`,
    bold: `${FONT_DOWNLOAD_DIR}${asset.bold.fileName}`,
  };
}

async function ensureFontDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(FONT_DOWNLOAD_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(FONT_DOWNLOAD_DIR, { intermediates: true });
  }
}

async function fileExists(uri: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists;
}

async function isPresetDownloaded(preset: DownloadableFontPreset): Promise<boolean> {
  const uris = getFontUrisForPreset(preset);
  const [regularExists, boldExists] = await Promise.all([fileExists(uris.regular), fileExists(uris.bold)]);
  return regularExists && boldExists;
}

async function downloadFile(url: string, targetUri: string): Promise<void> {
  const tempUri = `${targetUri}.tmp`;
  try {
    await FileSystem.deleteAsync(tempUri, { idempotent: true });
    const result = await FileSystem.downloadAsync(url, tempUri);
    if (typeof result.status === 'number' && result.status >= 400) {
      throw new Error(`Download failed (${result.status})`);
    }
    await FileSystem.deleteAsync(targetUri, { idempotent: true });
    await FileSystem.moveAsync({ from: tempUri, to: targetUri });
  } finally {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {
      // ignore temp cleanup failures
    });
  }
}

function escapeCssUrl(value: string): string {
  return value.replace(/'/g, '%27');
}

function buildEditorFontConfig(
  preset: FontPreset,
  fontSourceUris: Partial<Record<DownloadableFontPreset, { regular: string; bold: string }>>
): {
  faceCss: string;
  family: string;
} {
  if (preset === 'system') {
    return {
      faceCss: '',
      family: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
    };
  }

  const uris = fontSourceUris[preset];
  if (!uris) {
    return {
      faceCss: '',
      family: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
    };
  }

  const regularUri = escapeCssUrl(uris.regular);
  const boldUri = escapeCssUrl(uris.bold);
  const family = `ANoteEditor_${preset}`;

  const faceCss = `
    @font-face {
      font-family: '${family}';
      src: url('${regularUri}');
      font-style: normal;
      font-weight: 400;
    }
    @font-face {
      font-family: '${family}';
      src: url('${boldUri}');
      font-style: normal;
      font-weight: 700;
    }
  `;

  return {
    faceCss,
    family: `'${family}', "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`,
  };
}

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [fontPreset, setFontPresetState] = useState<FontPreset>('system');
  const [fontAvailability, setFontAvailability] = useState<FontAvailabilityMap>(createDefaultAvailability);
  const [fontSourceUris, setFontSourceUris] = useState<
    Partial<Record<DownloadableFontPreset, { regular: string; bold: string }>>
  >({});

  const loadPresetFontFiles = useCallback(async (preset: DownloadableFontPreset) => {
    const uris = getFontUrisForPreset(preset);
    await Font.loadAsync({
      [RN_FONT_FAMILY[preset].regular]: uris.regular,
      [RN_FONT_FAMILY[preset].bold]: uris.bold,
    });
    setFontSourceUris((previous) => ({ ...previous, [preset]: uris }));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(FONT_PRESET_KEY);
        const parsed = toFontPreset(saved);

        const presets: DownloadableFontPreset[] = ['sarasa_gothic', 'source_han_serif', 'glow_sans'];
        const installedEntries = await Promise.all(
          presets.map(async (preset) => [preset, await isPresetDownloaded(preset)] as const)
        );

        setFontAvailability((previous) => {
          const next: FontAvailabilityMap = {
            ...previous,
            system: { installed: true, downloading: false },
          };
          for (const [preset, installed] of installedEntries) {
            next[preset] = { installed, downloading: false };
          }
          return next;
        });

        let nextPreset = parsed ?? 'system';
        if (nextPreset !== 'system') {
          const installed = installedEntries.find(([preset]) => preset === nextPreset)?.[1] ?? false;
          if (!installed) {
            nextPreset = 'system';
          } else {
            await loadPresetFontFiles(nextPreset);
          }
        }

        setFontPresetState(nextPreset);
        if (nextPreset !== parsed) {
          await AsyncStorage.setItem(FONT_PRESET_KEY, nextPreset);
        }
      } catch {
        // ignore load failures and keep default preset
      }
    })();
  }, [loadPresetFontFiles]);

  const setFontPreset = useCallback(
    async (preset: FontPreset) => {
      if (preset !== 'system') {
        const installed = await isPresetDownloaded(preset);
        if (!installed) {
          setFontAvailability((previous) => ({
            ...previous,
            [preset]: { ...previous[preset], installed: false, downloading: false },
          }));
          throw new Error('FONT_NOT_DOWNLOADED');
        }
        await loadPresetFontFiles(preset);
        setFontAvailability((previous) => ({
          ...previous,
          [preset]: { ...previous[preset], installed: true, downloading: false },
        }));
      }

      setFontPresetState(preset);
      try {
        await AsyncStorage.setItem(FONT_PRESET_KEY, preset);
      } catch {
        // ignore persist failures to avoid blocking UI
      }
    },
    [loadPresetFontFiles]
  );

  const downloadFontPreset = useCallback(
    async (preset: DownloadableFontPreset) => {
      if (fontAvailability[preset].downloading) return;

      setFontAvailability((previous) => ({
        ...previous,
        [preset]: {
          ...previous[preset],
          downloading: true,
        },
      }));

      try {
        await ensureFontDirectory();
        const remote = REMOTE_FONT_ASSETS[preset];
        const uris = getFontUrisForPreset(preset);

        await downloadFile(remote.regular.url, uris.regular);
        await downloadFile(remote.bold.url, uris.bold);
        await loadPresetFontFiles(preset);

        setFontAvailability((previous) => ({
          ...previous,
          [preset]: { installed: true, downloading: false },
        }));
      } catch (error) {
        setFontAvailability((previous) => ({
          ...previous,
          [preset]: { ...previous[preset], downloading: false },
        }));
        throw error;
      }
    },
    [fontAvailability, loadPresetFontFiles]
  );

  const appFontStyle = useMemo<TextStyle>(() => {
    if (fontPreset === 'system') return {};
    const family = RN_FONT_FAMILY[fontPreset].regular;
    return { fontFamily: family, fontWeight: '400' };
  }, [fontPreset]);

  const appHeadingFontStyle = useMemo<TextStyle>(() => {
    if (fontPreset === 'system') return {};
    const family = RN_FONT_FAMILY[fontPreset].bold;
    return { fontFamily: family, fontWeight: '400' };
  }, [fontPreset]);

  const editorConfig = useMemo(() => buildEditorFontConfig(fontPreset, fontSourceUris), [fontPreset, fontSourceUris]);

  const value = useMemo<FontContextValue>(
    () => ({
      fontPreset,
      fontOptions: FONT_OPTIONS,
      fontAvailability,
      appFontStyle,
      appHeadingFontStyle,
      editorFontFaceCss: editorConfig.faceCss,
      editorFontFamily: editorConfig.family,
      setFontPreset,
      downloadFontPreset,
    }),
    [
      appFontStyle,
      appHeadingFontStyle,
      downloadFontPreset,
      editorConfig.faceCss,
      editorConfig.family,
      fontAvailability,
      fontPreset,
      setFontPreset,
    ]
  );

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

export function useFontSettings(): FontContextValue {
  const context = useContext(FontContext);
  if (!context) throw new Error('useFontSettings must be used within FontProvider');
  return context;
}
