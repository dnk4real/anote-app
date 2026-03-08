import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, TextStyle } from 'react-native';

const FONT_PRESET_KEY = '@a_note_font_preset';

export type FontPreset = 'system' | 'sans' | 'serif';

interface FontOption {
  id: FontPreset;
  label: string;
  description: string;
}

interface FontContextValue {
  fontPreset: FontPreset;
  fontOptions: FontOption[];
  appFontStyle: TextStyle;
  editorFontStack: string;
  setFontPreset: (preset: FontPreset) => Promise<void>;
}

const FONT_OPTIONS: FontOption[] = [
  { id: 'system', label: 'System', description: 'Default system font' },
  { id: 'sans', label: 'Sans', description: 'Clean sans-serif look' },
  { id: 'serif', label: 'Serif', description: 'Book-like serif look' },
];

const EDITOR_FONT_STACK: Record<FontPreset, string> = {
  system: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
  sans: `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`,
  serif: `"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", serif`,
};

const FontContext = createContext<FontContextValue | undefined>(undefined);

function getReactNativeFontFamily(preset: FontPreset): string | undefined {
  if (preset === 'system') return undefined;
  if (preset === 'sans') {
    return Platform.select({
      ios: 'PingFang SC',
      android: 'sans-serif',
      default: undefined,
    });
  }
  return Platform.select({
    ios: 'Songti SC',
    android: 'serif',
    default: 'serif',
  });
}

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [fontPreset, setFontPresetState] = useState<FontPreset>('system');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(FONT_PRESET_KEY);
        if (saved === 'system' || saved === 'sans' || saved === 'serif') {
          setFontPresetState(saved);
        }
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
    const fontFamily = getReactNativeFontFamily(fontPreset);
    return fontFamily ? { fontFamily } : {};
  }, [fontPreset]);

  const value = useMemo<FontContextValue>(
    () => ({
      fontPreset,
      fontOptions: FONT_OPTIONS,
      appFontStyle,
      editorFontStack: EDITOR_FONT_STACK[fontPreset],
      setFontPreset,
    }),
    [appFontStyle, fontPreset, setFontPreset]
  );

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

export function useFontSettings(): FontContextValue {
  const context = useContext(FontContext);
  if (!context) throw new Error('useFontSettings must be used within FontProvider');
  return context;
}
