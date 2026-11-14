import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('replayAPI', {
  openReplay: () => ipcRenderer.invoke('replay:open'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateProgress: (callback: (progress: { phase: string; percent: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: { phase: string; percent: number }) => callback(progress);
    ipcRenderer.on('updates:progress', listener);
    return () => ipcRenderer.removeListener('updates:progress', listener);
  },
  loadPlayer: (playerId: string, onProgress?: (progress: {loaded:number;pages:number;status:string}) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: {loaded:number;pages:number;status:string}) => onProgress?.(progress);
    ipcRenderer.on('player:load-progress', listener);
    return ipcRenderer.invoke('player:load', playerId).finally(() => ipcRenderer.removeListener('player:load-progress', listener));
  },
  resolveMapPreview: (gameId: string) => ipcRenderer.invoke('map:resolve-preview', gameId),
  importReplayUrl: (url: string) => ipcRenderer.invoke('replay:import-url', url),
  getReplayEngineAssets: () => ipcRenderer.invoke('replay:get-engine-assets'),
  saveReplayJson: (gameId: string) => ipcRenderer.invoke('replay:save-json', gameId),
  openOfficialReplay: (gameId: string) => ipcRenderer.invoke('replay:open-official', gameId)
});
export {};
