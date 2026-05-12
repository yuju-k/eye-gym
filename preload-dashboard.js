const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onNavigate: (callback) => ipcRenderer.on('navigate', (_event, view) => callback(view)),
  sendState: (state) => ipcRenderer.send('state-update', state),
  setDimOverlay: (opacity) => ipcRenderer.invoke('set-dim-overlay', { opacity }),
});
