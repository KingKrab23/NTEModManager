import { contextBridge, ipcRenderer } from 'electron';

import { appIpcChannels, type AppApi } from '../shared/ipc';

const appApi: AppApi = {
  chooseGameDirectory: () =>
    ipcRenderer.invoke(appIpcChannels.chooseGameDirectory),
  getSettings: () => ipcRenderer.invoke(appIpcChannels.getSettings),
  installModFramework: () =>
    ipcRenderer.invoke(appIpcChannels.installModFramework),
};

contextBridge.exposeInMainWorld('appApi', appApi);
