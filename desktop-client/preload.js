const { contextBridge, ipcRenderer } = require('electron');
const { marked } = require('marked');

contextBridge.exposeInMainWorld('dnsApi', {
  fetchPage: (url, page) => ipcRenderer.invoke('fetchPage', { url, page }),
  openExternal: (url) => ipcRenderer.invoke('openExternal', url)
});

contextBridge.exposeInMainWorld('marked', {
  parse: (md) => marked.parse(md)
});
