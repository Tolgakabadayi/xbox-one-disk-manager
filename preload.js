const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkElevation: () => ipcRenderer.invoke('check-elevation'),
  relaunchAdmin: () => ipcRenderer.invoke('relaunch-admin'),
  getDisks: () => ipcRenderer.invoke('get-disks'),
  getUsbDrives: () => ipcRenderer.invoke('get-usb-drives'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // SSD Formatlama & GUID
  runXboxFormatting: (params) => ipcRenderer.invoke('run-xbox-formatting', params),
  injectGuidOnly: (params) => ipcRenderer.invoke('inject-guid-only', params),
  
  // USB OSU1 Kurulumu & İndirme
  getOsuStatus: () => ipcRenderer.invoke('get-osu-status'),
  startOsuDownload: () => ipcRenderer.invoke('start-osu-download'),
  selectZipFile: () => ipcRenderer.invoke('select-zip-file'),
  prepareOsuUsb: (params) => ipcRenderer.invoke('prepare-osu-usb', params),

  onLogChunk: (callback) => {
    const handler = (event, chunk) => callback(chunk);
    ipcRenderer.on('log-chunk', handler);
    return () => ipcRenderer.removeListener('log-chunk', handler);
  },

  onProgressUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('progress-update', handler);
    return () => ipcRenderer.removeListener('progress-update', handler);
  }
});
