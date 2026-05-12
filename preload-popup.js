const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  showDashboard: (view) => ipcRenderer.send('show-dashboard', view),
  quit: () => ipcRenderer.send('quit-app'),
  onUpdateState: (callback) => ipcRenderer.on('update-state', (_event, state) => callback(state)),
});
