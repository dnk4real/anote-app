const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { saveLongImage } = require('./export.cjs');
const { createFontService } = require('./fonts.cjs');
const { createStore } = require('./store.cjs');
const { syncWithProvider } = require('./sync.cjs');

const DEV_SERVER_URL = 'http://127.0.0.1:4173';
const IS_MAC = process.platform === 'darwin';
const WINDOW_BACKGROUND = '#f6f1ea';
let fontService = null;

function getStore() {
  return createStore(path.join(app.getPath('userData'), 'store'));
}

function getFonts() {
  if (!fontService) {
    fontService = createFontService(app.getPath('userData'));
  }
  return fontService;
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    title: 'anote',
    backgroundColor: WINDOW_BACKGROUND,
    autoHideMenuBar: true,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  const sendMaximizeState = () => {
    win.webContents.send('window:maximized-changed', win.isMaximized());
  };

  win.on('maximize', sendMaximizeState);
  win.on('unmaximize', sendMaximizeState);
  win.on('enter-full-screen', sendMaximizeState);
  win.on('leave-full-screen', sendMaximizeState);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

ipcMain.handle('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.minimize();
  }
});

ipcMain.handle('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.close();
  }
});

ipcMain.handle('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return false;
  }
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
});

ipcMain.handle('window:get-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
});

ipcMain.handle('storage:load-app-state', async () => {
  return getStore().loadAppState();
});

ipcMain.handle('storage:save-notes', async (_event, notes) => {
  return getStore().saveNotes(notes);
});

ipcMain.handle('storage:save-folders', async (_event, folders) => {
  await getStore().saveFolders(folders);
  return true;
});

ipcMain.handle('storage:save-tombstones', async (_event, tombstones) => {
  await getStore().saveTombstones(tombstones);
  return true;
});

ipcMain.handle('storage:save-settings', async (_event, settings) => {
  return getStore().saveSettings(settings);
});

ipcMain.handle('sync:run', async (_event, payload) => {
  return syncWithProvider(payload.provider, payload);
});

ipcMain.handle('meta:get-app-version', async () => {
  return app.getVersion();
});

ipcMain.handle('fonts:get-availability', async () => {
  return getFonts().getAvailability();
});

ipcMain.handle('fonts:download-preset', async (_event, preset) => {
  return getFonts().downloadPreset(preset);
});

ipcMain.handle('fonts:get-preset-sources', async (_event, preset) => {
  return getFonts().getPresetSources(preset);
});

ipcMain.handle('export:save-long-image', async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || undefined;
  return saveLongImage(win, payload);
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
