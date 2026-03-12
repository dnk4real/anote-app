const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const MAX_CAPTURE_HEIGHT = 16000;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sanitizeFileName(value) {
  return String(value || 'anote-note')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'anote-note';
}

async function waitForFontsAndImages(win) {
  await win.webContents.executeJavaScript(`
    Promise.all([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      Promise.all(
        Array.from(document.images || [])
          .filter((image) => !image.complete)
          .map(
            (image) =>
              new Promise((resolve) => {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
              })
          )
      )
    ]).then(() => true);
  `);
}

async function measureDocument(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const body = document.body;
      const doc = document.documentElement;
      const width = Math.ceil(Math.max(body ? body.scrollWidth : 0, doc ? doc.scrollWidth : 0));
      const height = Math.ceil(Math.max(body ? body.scrollHeight : 0, doc ? doc.scrollHeight : 0));
      return { width, height };
    })();
  `);
}

async function renderLongImageToBuffer(payload) {
  const width = Math.max(720, Math.min(1400, Math.round(Number(payload.width) || 1080)));
  const tempHtmlPath = path.join(
    os.tmpdir(),
    `anote-long-image-${Date.now()}-${Math.random().toString(16).slice(2)}.html`
  );
  const win = new BrowserWindow({
    show: false,
    frame: false,
    useContentSize: true,
    width,
    height: 900,
    backgroundColor: '#fefdf8',
    webPreferences: {
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  try {
    await fs.writeFile(tempHtmlPath, String(payload.html || ''), 'utf8');
    await win.loadFile(tempHtmlPath);
    await delay(64);
    await waitForFontsAndImages(win);
    await delay(48);

    const measured = await measureDocument(win);
    const height = Math.max(320, Math.ceil(measured.height || 0));
    if (height > MAX_CAPTURE_HEIGHT) {
      throw new Error('Long image is too tall to export on desktop.');
    }

    win.setContentSize(width, height);
    await delay(48);
    const image = await win.webContents.capturePage({ x: 0, y: 0, width, height });
    return image.toPNG();
  } finally {
    if (!win.isDestroyed()) {
      win.destroy();
    }
    await fs.rm(tempHtmlPath, { force: true }).catch(() => {
      // ignore temp cleanup failures
    });
  }
}

async function saveLongImage(parentWindow, payload) {
  const defaultName = `${sanitizeFileName(payload.suggestedName)}.png`;
  const result = await dialog.showSaveDialog(parentWindow, {
    title: 'Save long image',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'PNG image', extensions: ['png'] }],
  });

  if (result.canceled || !result.filePath) {
    return { filePath: null };
  }

  const pngBuffer = await renderLongImageToBuffer(payload);
  await fs.writeFile(result.filePath, pngBuffer);
  return { filePath: result.filePath };
}

module.exports = {
  saveLongImage,
};
