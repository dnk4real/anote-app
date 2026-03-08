export type LongImageTheme = 'light' | 'dark';

interface LongImagePalette {
  background: string;
  body: string;
  secondary: string;
  quoteBorder: string;
  imageBg: string;
}

interface LongImageOptions {
  html: string;
  theme: LongImageTheme;
  fontFaceCss?: string;
  fontFamily?: string;
}

export interface LongImageBuildResult {
  html: string;
  width: number;
}

const LONG_IMAGE_WIDTH = 1080;

const LONG_IMAGE_THEME: Record<LongImageTheme, LongImagePalette> = {
  light: {
    background: '#FEFDF8',
    body: '#4C443A',
    secondary: '#7A7064',
    quoteBorder: '#C2B8AA',
    imageBg: '#ECE5D9',
  },
  dark: {
    background: '#1C1714',
    body: '#E3DACC',
    secondary: '#B0A392',
    quoteBorder: '#5A4F45',
    imageBg: '#2A231E',
  },
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function sanitizeRichHtml(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .trim();
}

export function buildLongImage(options: LongImageOptions): LongImageBuildResult {
  const palette = LONG_IMAGE_THEME[options.theme];
  const contentHtml = sanitizeRichHtml(options.html) || '<div><br /></div>';
  const fontFaceCss = options.fontFaceCss || '';
  const fontFamily =
    options.fontFamily ||
    '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    ${fontFaceCss}
    :root {
      color-scheme: ${options.theme};
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: ${palette.background};
      color: ${palette.body};
      overflow: hidden;
      font-family: ${fontFamily};
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
      -webkit-font-smoothing: antialiased;
    }
    #content {
      box-sizing: border-box;
      width: 100%;
      min-height: 100%;
      padding: 55px 35px 55px 40px;
      font-size: 12px;
      line-height: 1.82;
      letter-spacing: 0.1px;
      font-weight: 400;
      color: ${palette.body};
      word-break: normal;
      overflow-wrap: break-word;
      line-break: strict;
      hanging-punctuation: allow-end;
      font-feature-settings: "palt" 1, "halt" 1;
      font-variant-east-asian: proportional-width;
    }
    #content * {
      box-sizing: border-box;
      max-width: 100%;
    }
    #content * {
      font-family: inherit !important;
      font-size: inherit !important;
      line-height: inherit !important;
      letter-spacing: inherit !important;
    }
    #content p,
    #content div,
    #content ul,
    #content ol,
    #content blockquote,
    #content h1,
    #content h2,
    #content h3 {
      margin: 0 0 12px;
    }
    #content ul,
    #content ol {
      padding-left: 1.35em;
    }
    #content li {
      margin: 0 0 0.4em;
    }
    #content li:last-child {
      margin-bottom: 0;
    }
    #content blockquote {
      padding: 4px 0 4px 9px;
      border-left: 2px solid ${palette.quoteBorder};
      color: ${palette.secondary};
    }
    #content img {
      display: block;
      width: auto;
      max-width: 100%;
      height: auto;
      border-radius: 0;
      margin: 10px 0;
      background: ${palette.imageBg};
    }
    #content b,
    #content strong {
      font-weight: 700 !important;
    }
    #content h2 {
      font-size: 15px !important;
      font-weight: 700 !important;
      line-height: 1.72 !important;
      margin: 0 0 13px !important;
    }
    #content i,
    #content em {
      font-style: italic !important;
    }
  </style>
</head>
<body>
  <div id="content">${contentHtml}</div>
</body>
</html>`;

  return {
    html,
    width: LONG_IMAGE_WIDTH,
  };
}
