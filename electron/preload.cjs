// Electron Preload Script
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  appVersion: '1.1.0',
  proxyRequest: (payload) => ipcRenderer.invoke('workbuddy:proxy', payload),
});
