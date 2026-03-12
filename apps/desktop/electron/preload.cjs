const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anoteDesktop', {
  platform: process.platform,
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    close: () => ipcRenderer.invoke('window:close'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    getMaximized: () => ipcRenderer.invoke('window:get-maximized'),
    onMaximizedChange: (callback) => {
      const listener = (_event, isMaximized) => callback(Boolean(isMaximized));
      ipcRenderer.on('window:maximized-changed', listener);
      return () => ipcRenderer.removeListener('window:maximized-changed', listener);
    },
  },
  storage: {
    loadAppState: () => ipcRenderer.invoke('storage:load-app-state'),
    saveNotes: (notes) => ipcRenderer.invoke('storage:save-notes', notes),
    saveFolders: (folders) => ipcRenderer.invoke('storage:save-folders', folders),
    saveTombstones: (tombstones) => ipcRenderer.invoke('storage:save-tombstones', tombstones),
    saveSettings: (settings) => ipcRenderer.invoke('storage:save-settings', settings),
  },
  sync: {
    run: (payload) => ipcRenderer.invoke('sync:run', payload),
  },
  meta: {
    getAppVersion: () => ipcRenderer.invoke('meta:get-app-version'),
  },
  fonts: {
    getAvailability: () => ipcRenderer.invoke('fonts:get-availability'),
    downloadPreset: (preset) => ipcRenderer.invoke('fonts:download-preset', preset),
    getPresetSources: (preset) => ipcRenderer.invoke('fonts:get-preset-sources', preset),
  },
  export: {
    saveLongImage: (payload) => ipcRenderer.invoke('export:save-long-image', payload),
  },
});
