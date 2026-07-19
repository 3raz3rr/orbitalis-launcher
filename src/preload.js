const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcher", {
  getBootstrap: () => ipcRenderer.invoke("get-bootstrap"),
  probeServers: () => ipcRenderer.invoke("probe-servers"),
  fetchNews: () => ipcRenderer.invoke("fetch-news"),
  fetchStatus: (kind) => ipcRenderer.invoke("fetch-status", kind),
  fetchPlayer: () => ipcRenderer.invoke("fetch-player"),
  savePrefs: (patch) => ipcRenderer.invoke("save-prefs", patch),
  connect: (serverId) => ipcRenderer.invoke("connect", serverId),
  pickByond: () => ipcRenderer.invoke("pick-byond"),
  clearByondPath: () => ipcRenderer.invoke("clear-byond-path"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  openDiscord: (url) => ipcRenderer.invoke("open-discord", url),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  installUpdate: (payload) => ipcRenderer.invoke("install-update", payload),
  onUpdateDownloadProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("update-download-progress", listener);
    return () => ipcRenderer.removeListener("update-download-progress", listener);
  },
  patchByondAds: (options) => ipcRenderer.invoke("patch-byond-ads", options || {}),
  getByondPatchStatus: () => ipcRenderer.invoke("get-byond-patch-status"),
  runConnectionDiag: () => ipcRenderer.invoke("run-connection-diag"),
  saveDiagReport: (report) => ipcRenderer.invoke("save-diag-report", report),
  authLogin: () => ipcRenderer.invoke("auth-login"),
  authLogout: () => ipcRenderer.invoke("auth-logout"),
  authRefresh: () => ipcRenderer.invoke("auth-refresh"),
  onAuthChanged: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("auth-changed", listener);
    return () => ipcRenderer.removeListener("auth-changed", listener);
  },
});
