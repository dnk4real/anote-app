import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { TextStyle } from 'react-native';

const FONT_PRESET_KEY = '@a_note_font_preset';

export type FontPreset = 'system' | 'sarasa_gothic' | 'source_han_serif' | 'glow_sans';

interface FontOption {
  id: FontPreset;
  label: string;
}

interface FontContextValue {
  fontPreset: FontPreset;
  fontOptions: FontOption[];
  appFontStyle: TextStyle;
  appHeadingFontStyle: TextStyle;
  editorFontFaceCss: string;
  editorFontFamily: string;
  setFontPreset: (preset: FontPreset) => Promise<void>;
}

type FontAssetGroup = {
  regular: number;
  bold: number;
};

const FONT_OPTIONS: FontOption[] = [
  { id: 'system', label: '系统' },
  { id: 'sarasa_gothic', label: '更纱黑体' },
  { id: 'source_han_serif', label: '思源宋体' },
  { id: 'glow_sans', label: '未来荧黑' },
];

const FONT_ASSETS: Record<Exclude<FontPreset, 'system'>, FontAssetGroup> = {
  sarasa_gothic: {
    regular: require('../assets/fonts/SarasaMonoSC-Regular.ttf'),
    bold: require('../assets/fonts/SarasaMonoSC-Bold.ttf'),
  },
  source_han_serif: {
    regular: require('../assets/fonts/SourceHanSerifCN-Regular.otf'),
    bold: require('../assets/fonts/SourceHanSerifCN-Bold.otf'),
  },
  glow_sans: {
    regular: require('../assets/fonts/GlowSansSC-Normal-Book.otf'),
    bold: require('../assets/fonts/GlowSansSC-Normal-ExtraBold.otf'),
  },
};

const RN_FONT_FAMILY: Record<Exclude<FontPreset, 'system'>, { regular: string; bold: string }> = {
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

function escapeCssUrl(value: string): string {
  return value.replace(/'/g, '%27');
}

function buildEditorFontConfig(preset: FontPreset): {
  faceCss: string;
  family: string;
} {
  if (preset === 'system') {
    return {
      faceCss: '',
      family: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
    };
  }

  const assets = FONT_ASSETS[preset];
  const regularAsset = Asset.fromModule(assets.regular);
  const boldAsset = Asset.fromModule(assets.bold);
  const regularUri = escapeCssUrl(regularAsset.localUri || regularAsset.uri);
  const boldUri = escapeCssUrl(boldAsset.localUri || boldAsset.uri);

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

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(FONT_PRESET_KEY);
        const parsed = toFontPreset(saved);
        if (parsed) setFontPresetState(parsed);
      } catch {
        // ignore load failures and keep default preset
      }
    })();
  }, []);

  const setFontPreset = useCallback(async (preset: FontPreset) => {
    setFontPresetState(preset);
    try {
      await AsyncStorage.setItem(FONT_PRESET_KEY, preset);
    } catch {
      // ignore persist failures to avoid blocking UI
    }
  }, []);

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

  const editorConfig = useMemo(() => buildEditorFontConfig(fontPreset), [fontPreset]);

  const value = useMemo<FontContextValue>(
    () => ({
      fontPreset,
      fontOptions: FONT_OPTIONS,
      appFontStyle,
      appHeadingFontStyle,
      editorFontFaceCss: editorConfig.faceCss,
      editorFontFamily: editorConfig.family,
      setFontPreset,
    }),
    [appFontStyle, appHeadingFontStyle, editorConfig.faceCss, editorConfig.family, fontPreset, setFontPreset]
  );

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

export function useFontSettings(): FontContextValue {
  const context = useContext(FontContext);
  if (!context) throw new Error('useFontSettings must be used within FontProvider');
  return context;
}
