import {
  getDesktopFontPresetSources,
} from './desktop-bridge';
import type { FontPreset, FontPresetSources } from './models';

const FONT_FAMILY_NAME: Record<Exclude<FontPreset, 'system'>, string> = {
  sarasa_gothic: 'AnoteSarasaGothic',
  source_han_serif: 'AnoteSourceHanSerif',
  glow_sans: 'AnoteGlowSans',
};

const DEFAULT_SANS_STACK = '"Noto Sans SC", "Source Han Sans SC", "Source Han Sans CN", "PingFang SC", "Microsoft YaHei", sans-serif';

const FALLBACK_STACKS: Record<FontPreset, string> = {
  system: DEFAULT_SANS_STACK,
  sarasa_gothic: DEFAULT_SANS_STACK,
  source_han_serif: '"Source Han Serif SC", "Source Han Serif CN", "Noto Serif CJK SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", serif',
  glow_sans: DEFAULT_SANS_STACK,
};

const loadedPresets = new Set<Exclude<FontPreset, 'system'>>();
const sourceCache = new Map<Exclude<FontPreset, 'system'>, FontPresetSources>();

function buildFontFaceCss(family: string, sources: FontPresetSources): string {
  return `
    @font-face {
      font-family: '${family}';
      src: url('${sources.regularDataUrl}');
      font-style: normal;
      font-weight: 400;
    }

    @font-face {
      font-family: '${family}';
      src: url('${sources.boldDataUrl}');
      font-style: normal;
      font-weight: 700;
    }
  `;
}

async function loadPresetIntoDocument(preset: Exclude<FontPreset, 'system'>, sources: FontPresetSources) {
  if (loadedPresets.has(preset)) {
    return;
  }

  const family = FONT_FAMILY_NAME[preset];
  const regularFace = new FontFace(family, `url(${sources.regularDataUrl})`, {
    style: 'normal',
    weight: '400',
  });
  const boldFace = new FontFace(family, `url(${sources.boldDataUrl})`, {
    style: 'normal',
    weight: '700',
  });

  await Promise.all([regularFace.load(), boldFace.load()]);
  document.fonts.add(regularFace);
  document.fonts.add(boldFace);
  loadedPresets.add(preset);
}

export async function resolveDesktopFontBundle(preset: FontPreset): Promise<{
  appFontFamily: string;
  editorFontFamily: string;
  editorFontFaceCss: string;
}> {
  if (preset === 'system') {
    return {
      appFontFamily: FALLBACK_STACKS.system,
      editorFontFamily: FALLBACK_STACKS.system,
      editorFontFaceCss: '',
    };
  }

  const cachedSources = sourceCache.get(preset);
  const sources = cachedSources ?? (await getDesktopFontPresetSources(preset));
  if (!sources) {
    return {
      appFontFamily: FALLBACK_STACKS[preset],
      editorFontFamily: FALLBACK_STACKS[preset],
      editorFontFaceCss: '',
    };
  }

  sourceCache.set(preset, sources);
  await loadPresetIntoDocument(preset, sources);
  const family = FONT_FAMILY_NAME[preset];
  const fullFamily = `'${family}', ${FALLBACK_STACKS[preset]}`;

  return {
    appFontFamily: fullFamily,
    editorFontFamily: fullFamily,
    editorFontFaceCss: buildFontFaceCss(family, sources),
  };
}
