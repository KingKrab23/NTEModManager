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
import type { ModFrameworkService } from '../framework/modFrameworkService';
import type { SettingsService } from '../settings/settingsService';

interface RegisterAppIpcDependencies {
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
}
