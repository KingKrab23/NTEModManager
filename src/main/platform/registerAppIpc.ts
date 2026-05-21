import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from 'electron';

import {
  appIpcChannels,
  type ChooseGameDirectoryResult,
  type ChooseLocalModArchiveResult,
  type InstallKnownGameBananaUtilityResult,
  type InstallModFrameworkResult,
  type ShowMessageBoxRequest,
} from '../../shared/ipc';
import type { CatalogBrowseResult } from '../../shared/catalog';
import type {
  InstallGameBananaModRequest,
  InstallGameBananaModResult,
  InstallLocalArchiveModRequest,
  InstallLocalArchiveModResult,
  InstalledGameBananaModSummary,
  SetInstalledGameBananaModEnabledRequest,
  SetInstalledGameBananaModEnabledResult,
  UninstallGameBananaModRequest,
  UninstallGameBananaModResult,
  UpdateInstalledGameBananaModRequest,
  UpdateInstalledGameBananaModResult,
} from '../../shared/mods';
import type { GameBananaCatalogService } from '../catalog/gameBananaCatalogService';
import type { CensorshipRemoverInstallerService } from '../mods/censorshipRemoverInstallerService';
import type { ModFrameworkService } from '../framework/modFrameworkService';
import type { InstalledGameBananaModsService } from '../mods/installedGameBananaModsService';
import type { LocalArchiveModInstallerService } from '../mods/localArchiveModInstallerService';
import type { SettingsService } from '../settings/settingsService';

interface RegisterAppIpcDependencies {
  censorshipRemoverInstallerService: CensorshipRemoverInstallerService;
  gameBananaCatalogService: GameBananaCatalogService;
  installedGameBananaModsService: InstalledGameBananaModsService;
  localArchiveModInstallerService: LocalArchiveModInstallerService;
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

async function promptForLocalModArchive(
  event: IpcMainInvokeEvent,
): Promise<string | null> {
  const ownerWindow = getDialogOwnerWindow(event);
  const dialogOptions: OpenDialogOptions = {
    filters: [
      {
        extensions: ['zip', '7z', 'rar'],
        name: 'Supported mod archives',
      },
    ],
    properties: ['openFile'],
    title: 'Choose a local NTE mod archive',
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

export function registerAppIpc({
  censorshipRemoverInstallerService,
  gameBananaCatalogService,
  installedGameBananaModsService,
  localArchiveModInstallerService,
  modFrameworkService,
  settingsService,
}: RegisterAppIpcDependencies): void {
  ipcMain.handle(appIpcChannels.getSettings, async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle(
    appIpcChannels.showMessageBox,
    async (event, request: ShowMessageBoxRequest): Promise<void> => {
      const ownerWindow = getDialogOwnerWindow(event);
      const dialogOptions = {
        buttons: ['OK'],
        message: request.message,
        noLink: true,
        title: request.title,
        type: 'error' as const,
      };

      if (ownerWindow) {
        await dialog.showMessageBox(ownerWindow, dialogOptions);
        return;
      }

      await dialog.showMessageBox(dialogOptions);
    },
  );

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
    appIpcChannels.chooseLocalModArchive,
    async (event): Promise<ChooseLocalModArchiveResult> => {
      const archivePath = await promptForLocalModArchive(event);

      return {
        archivePath,
        canceled: archivePath === null,
      };
    },
  );

  ipcMain.handle(
    appIpcChannels.installCensorshipRemover,
    async (): Promise<InstallKnownGameBananaUtilityResult> => {
      const settings = await settingsService.getSettings();

      if (!settings.gamePath) {
        throw new Error(
          'Choose your NTE installation folder before installing Censorship Remover.',
        );
      }

      return censorshipRemoverInstallerService.install(settings.gamePath);
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
    appIpcChannels.installLocalArchiveMod,
    async (
      _event,
      request: InstallLocalArchiveModRequest,
    ): Promise<InstallLocalArchiveModResult> => {
      const settings = await settingsService.getSettings();

      if (!settings.gamePath) {
        throw new Error(
          'Choose your NTE installation folder before installing a local archive.',
        );
      }

      return localArchiveModInstallerService.install(
        settings.gamePath,
        request.archivePath,
      );
    },
  );

  ipcMain.handle(
    appIpcChannels.listInstalledGameBananaMods,
    async (): Promise<InstalledGameBananaModSummary[]> => {
      return installedGameBananaModsService.list();
    },
  );

  ipcMain.handle(
    appIpcChannels.setInstalledGameBananaModEnabled,
    async (
      _event,
      request: SetInstalledGameBananaModEnabledRequest,
    ): Promise<SetInstalledGameBananaModEnabledResult> => {
      const settings = await settingsService.getSettings();

      if (!settings.gamePath) {
        throw new Error(
          'Choose your NTE installation folder before toggling a mod.',
        );
      }

      return installedGameBananaModsService.setEnabled(
        settings.gamePath,
        request,
      );
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
