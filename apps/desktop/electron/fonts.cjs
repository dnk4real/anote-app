const fs = require('fs/promises');
const path = require('path');

const FONT_DOWNLOAD_DIR = 'fonts';
const GITHUB_RELEASE_BASE_URL = 'https://github.com/dnk4real/anote-app/releases/download/fonts-2026-03-10';
const VALID_PRESETS = new Set(['sarasa_gothic', 'source_han_serif', 'glow_sans']);

const REMOTE_FONT_ASSETS = {
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

function createDefaultAvailability() {
  return {
    system: { installed: true, downloading: false },
    sarasa_gothic: { installed: false, downloading: false },
    source_han_serif: { installed: false, downloading: false },
    glow_sans: { installed: false, downloading: false },
  };
}

function mimeTypeForFont(fileName) {
  if (fileName.endsWith('.ttf')) return 'font/ttf';
  if (fileName.endsWith('.otf')) return 'font/otf';
  return 'application/octet-stream';
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createFontService(userDataPath) {
  const fontsDir = path.join(userDataPath, FONT_DOWNLOAD_DIR);
  const downloading = new Set();

  function requirePreset(preset) {
    if (!VALID_PRESETS.has(preset)) {
      throw new Error(`Unsupported font preset: ${preset}`);
    }
  }

  function getFontPaths(preset) {
    const asset = REMOTE_FONT_ASSETS[preset];
    return {
      regular: path.join(fontsDir, asset.regular.fileName),
      bold: path.join(fontsDir, asset.bold.fileName),
    };
  }

  async function downloadFile(url, targetPath) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }

    const tempPath = `${targetPath}.tmp`;
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tempPath, buffer);
    await fs.rm(targetPath, { force: true });
    await fs.rename(tempPath, targetPath);
  }

  async function getAvailability() {
    await ensureDir(fontsDir);
    const availability = createDefaultAvailability();

    for (const preset of VALID_PRESETS) {
      const paths = getFontPaths(preset);
      const [regularExists, boldExists] = await Promise.all([
        fileExists(paths.regular),
        fileExists(paths.bold),
      ]);
      availability[preset] = {
        installed: regularExists && boldExists,
        downloading: downloading.has(preset),
      };
    }

    return availability;
  }

  async function downloadPreset(preset) {
    requirePreset(preset);
    if (downloading.has(preset)) {
      return getAvailability();
    }

    downloading.add(preset);
    await ensureDir(fontsDir);

    try {
      const asset = REMOTE_FONT_ASSETS[preset];
      const paths = getFontPaths(preset);
      await downloadFile(asset.regular.url, paths.regular);
      await downloadFile(asset.bold.url, paths.bold);
      return getAvailability();
    } finally {
      downloading.delete(preset);
    }
  }

  async function getPresetSources(preset) {
    requirePreset(preset);
    const asset = REMOTE_FONT_ASSETS[preset];
    const paths = getFontPaths(preset);
    const [regularExists, boldExists] = await Promise.all([
      fileExists(paths.regular),
      fileExists(paths.bold),
    ]);

    if (!regularExists || !boldExists) {
      return null;
    }

    const [regularBuffer, boldBuffer] = await Promise.all([
      fs.readFile(paths.regular),
      fs.readFile(paths.bold),
    ]);

    return {
      regularDataUrl: `data:${mimeTypeForFont(asset.regular.fileName)};base64,${regularBuffer.toString('base64')}`,
      boldDataUrl: `data:${mimeTypeForFont(asset.bold.fileName)};base64,${boldBuffer.toString('base64')}`,
    };
  }

  return {
    getAvailability,
    downloadPreset,
    getPresetSources,
  };
}

module.exports = {
  createFontService,
};
