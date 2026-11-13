// Electron Preload Script for WorkBuddy Tools
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  arch: process.arch,
  isElectron: true,
  appVersion: '1.2.0',
  proxyRequest: (payload) => ipcRenderer.invoke('workbuddy:proxy', payload),
  openExternal: (url) => ipcRenderer.invoke('workbuddy:open-external', url),
  getSystemInfo: () => ipcRenderer.invoke('workbuddy:get-system-info'),
  downloadAndInstallUpdate: (payload) => ipcRenderer.invoke('workbuddy:download-and-install', payload),
  onUpdateProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('workbuddy:update-progress', listener);
    return () => ipcRenderer.removeListener('workbuddy:update-progress', listener);
  },
});
