const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getBackendConfig: () => ipcRenderer.invoke('backend:get-config'),
});
