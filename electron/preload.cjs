// Electron Preload Script
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  appVersion: '0.5.9',
});
