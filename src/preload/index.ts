import { contextBridge, ipcRenderer } from 'electron';

import { appIpcChannels, type AppApi } from '../shared/ipc';

const appApi: AppApi = {
  chooseGameDirectory: () =>
    ipcRenderer.invoke(appIpcChannels.chooseGameDirectory),
  getSettings: () => ipcRenderer.invoke(appIpcChannels.getSettings),
  installCensorshipRemover: () =>
    ipcRenderer.invoke(appIpcChannels.installCensorshipRemover),
  installGameBananaMod: (request) =>
    ipcRenderer.invoke(appIpcChannels.installGameBananaMod, request),
  installModFramework: () =>
    ipcRenderer.invoke(appIpcChannels.installModFramework),
  listInstalledGameBananaMods: () =>
    ipcRenderer.invoke(appIpcChannels.listInstalledGameBananaMods),
  listGameBananaMods: (page) =>
    ipcRenderer.invoke(appIpcChannels.listGameBananaMods, page),
  uninstallGameBananaMod: (request) =>
    ipcRenderer.invoke(appIpcChannels.uninstallGameBananaMod, request),
  updateInstalledGameBananaMod: (request) =>
    ipcRenderer.invoke(appIpcChannels.updateInstalledGameBananaMod, request),
};

contextBridge.exposeInMainWorld('appApi', appApi);
