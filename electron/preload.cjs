// Electron Preload Script for WorkBuddy Tools
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  arch: process.arch,
  isElectron: true,
  appVersion: '1.2.0',
  proxyRequest: (payload) => ipcRenderer.invoke('workbuddy:proxy', payload),
  openExternal: (url) => ipcRenderer.invoke('workbuddy:open-external', url),
});
