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
  logsMe: () => ipcRenderer.invoke("logs-me"),
  logsTree: (query) => ipcRenderer.invoke("logs-tree", query || {}),
  logsRound: (query) => ipcRenderer.invoke("logs-round", query),
  logsGenerate: (files) => ipcRenderer.invoke("logs-generate", files),
  logsView: (payload) => ipcRenderer.invoke("logs-view", payload),
  musicMe: () => ipcRenderer.invoke("music-me"),
  musicLibrary: (payload) => ipcRenderer.invoke("music-library", payload || {}),
  musicPlaylistGet: () => ipcRenderer.invoke("music-playlist-get"),
  musicPlaylistPut: (trackIds) =>
    ipcRenderer.invoke("music-playlist-put", trackIds),
  musicDelete: (trackId) => ipcRenderer.invoke("music-delete", trackId),
  musicPatch: (payload) => ipcRenderer.invoke("music-patch", payload),
  musicPickAndUpload: (meta) =>
    ipcRenderer.invoke("music-pick-and-upload", meta || {}),
  musicLocalStream: (trackId) =>
    ipcRenderer.invoke("music-local-stream", trackId),
});
