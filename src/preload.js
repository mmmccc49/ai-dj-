const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cloudio", {
  ready: () => ipcRenderer.invoke("app:ready"),
  getPlaylist: (input) => ipcRenderer.invoke("netease:playlist", input),
  getDailyRecommendations: () => ipcRenderer.invoke("netease:daily"),
  getHeartMode: () => ipcRenderer.invoke("netease:heart-mode"),
  getUserLibrary: () => ipcRenderer.invoke("netease:user-library"),
  getSongUrl: (songId) => ipcRenderer.invoke("netease:song-url", songId),
  searchSongs: (input, limit) => ipcRenderer.invoke("netease:search-songs", input, limit),
  searchPlaylists: (input, limit) => ipcRenderer.invoke("netease:search-playlists", input, limit),
  askDj: (payload) => ipcRenderer.invoke("ai:dj-chat", payload),
  speakDj: (text) => ipcRenderer.invoke("voice:tts", text),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  setViewMode: (mode) => ipcRenderer.invoke("window:set-view-mode", mode),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  onShortcut: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("player:shortcut", listener);
    return () => ipcRenderer.removeListener("player:shortcut", listener);
  }
});
