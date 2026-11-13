// Electron Preload Script for WorkBuddy Tools
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  arch: process.arch,
  isElectron: true,
  appVersion: '1.0.0',
  proxyRequest: (payload) => ipcRenderer.invoke('workbuddy:proxy', payload),
  openExternal: (url) => ipcRenderer.invoke('workbuddy:open-external', url),
  getSystemInfo: () => ipcRenderer.invoke('workbuddy:get-system-info'),
  checkLatestRelease: () => ipcRenderer.invoke('workbuddy:check-latest-release'),
  downloadAndInstallUpdate: (payload) => ipcRenderer.invoke('workbuddy:download-and-install', payload),
  runAcpTurn: (payload) => ipcRenderer.invoke('workbuddy:acp-turn', payload),
  getLicenseInfo: () => ipcRenderer.invoke('workbuddy:license-get-info'),
  saveLicenseConfig: (payload) => ipcRenderer.invoke('workbuddy:license-save', payload),
  requestLicenseApi: (payload) => ipcRenderer.invoke('workbuddy:license-request', payload),
  windowMinimize: () => ipcRenderer.invoke('workbuddy:window-minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('workbuddy:window-toggle-maximize'),
  windowIsMaximized: () => ipcRenderer.invoke('workbuddy:window-is-maximized'),
  windowClose: () => ipcRenderer.invoke('workbuddy:window-close'),
  onWindowMaximizedChanged: (callback) => {
    const listener = (_event, isMax) => callback(Boolean(isMax));
    ipcRenderer.on('workbuddy:window-maximized-changed', listener);
    return () => ipcRenderer.removeListener('workbuddy:window-maximized-changed', listener);
  },
  onUpdateProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('workbuddy:update-progress', listener);
    return () => ipcRenderer.removeListener('workbuddy:update-progress', listener);
  },
});
