import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
} from 'electron';

import {
  appIpcChannels,
  type ChooseGameDirectoryResult,
  type InstallModFrameworkResult,
} from '../../shared/ipc';
import type { CatalogBrowseResult } from '../../shared/catalog';
import type {
  InstallGameBananaModRequest,
  InstallGameBananaModResult,
  InstalledGameBananaModSummary,
  UninstallGameBananaModRequest,
  UninstallGameBananaModResult,
  UpdateInstalledGameBananaModRequest,
  UpdateInstalledGameBananaModResult,
} from '../../shared/mods';
import type { GameBananaCatalogService } from '../catalog/gameBananaCatalogService';
import type { ModFrameworkService } from '../framework/modFrameworkService';
import type { InstalledGameBananaModsService } from '../mods/installedGameBananaModsService';
import type { SettingsService } from '../settings/settingsService';

interface RegisterAppIpcDependencies {
  gameBananaCatalogService: GameBananaCatalogService;
  installedGameBananaModsService: InstalledGameBananaModsService;
  modFrameworkService: ModFrameworkService;
  settingsService: SettingsService;
}

function getDialogOwnerWindow(
  event: IpcMainInvokeEvent,
): BrowserWindow | undefined {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);

  if (parentWindow && !parentWindow.isDestroyed()) {
    return parentWindow;
  }

  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow && !focusedWindow.isDestroyed()) {
    return focusedWindow;
  }

  return undefined;
}

async function promptForDirectory(
  event: IpcMainInvokeEvent,
): Promise<string | null> {
  const ownerWindow = getDialogOwnerWindow(event);
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, {
        properties: ['openDirectory'],
        title: 'Choose your NTE installation folder',
      })
    : await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Choose your NTE installation folder',
      });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

export function registerAppIpc({
  gameBananaCatalogService,
  installedGameBananaModsService,
  modFrameworkService,
  settingsService,
}: RegisterAppIpcDependencies): void {
  ipcMain.handle(appIpcChannels.getSettings, async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle(
    appIpcChannels.chooseGameDirectory,
    async (event): Promise<ChooseGameDirectoryResult> => {
      const selectedPath = await promptForDirectory(event);
      const currentSettings = await settingsService.getSettings();

      if (!selectedPath) {
        return {
          canceled: true,
          settings: currentSettings,
        };
      }

      const settings = await settingsService.updateGamePath(selectedPath);

      return {
        canceled: false,
        settings,
      };
    },
  );

  ipcMain.handle(
    appIpcChannels.installModFramework,
    async (): Promise<InstallModFrameworkResult> => {
      const settings = await settingsService.getSettings();

      if (!settings.gamePath) {
        throw new Error(
          'Choose your NTE installation folder before installing the mod framework.',
        );
      }

      return modFrameworkService.install(settings.gamePath);
    },
  );

  ipcMain.handle(
    appIpcChannels.listGameBananaMods,
    async (_event, page: number): Promise<CatalogBrowseResult> => {
      return gameBananaCatalogService.browseRecentMods(page);
    },
  );

  ipcMain.handle(
    appIpcChannels.installGameBananaMod,
    async (
      _event,
      request: InstallGameBananaModRequest,
    ): Promise<InstallGameBananaModResult> => {
      const settings = await settingsService.getSettings();

      if (!settings.gamePath) {
        throw new Error(
          'Choose your NTE installation folder before installing a mod.',
        );
      }

      return installedGameBananaModsService.install(settings.gamePath, request);
    },
  );

  ipcMain.handle(
    appIpcChannels.listInstalledGameBananaMods,
    async (): Promise<InstalledGameBananaModSummary[]> => {
      return installedGameBananaModsService.list();
    },
  );

  ipcMain.handle(
    appIpcChannels.uninstallGameBananaMod,
    async (
      _event,
      request: UninstallGameBananaModRequest,
    ): Promise<UninstallGameBananaModResult> => {
      const settings = await settingsService.getSettings();

      if (!settings.gamePath) {
        throw new Error(
          'Choose your NTE installation folder before uninstalling a mod.',
        );
      }

      return installedGameBananaModsService.uninstall(
        settings.gamePath,
        request,
      );
    },
  );

  ipcMain.handle(
    appIpcChannels.updateInstalledGameBananaMod,
    async (
      _event,
      request: UpdateInstalledGameBananaModRequest,
    ): Promise<UpdateInstalledGameBananaModResult> => {
      const settings = await settingsService.getSettings();

      if (!settings.gamePath) {
        throw new Error(
          'Choose your NTE installation folder before updating a mod.',
        );
      }

      return installedGameBananaModsService.updateToLatest(
        settings.gamePath,
        request,
      );
    },
  );
}
