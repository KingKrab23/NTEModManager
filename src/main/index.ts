import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

import { createGameBananaCatalogService } from './catalog/gameBananaCatalogService';
import { createModFrameworkService } from './framework/modFrameworkService';
import { createCensorshipRemoverInstallerService } from './mods/censorshipRemoverInstallerService';
import { createGameBananaModInstallerService } from './mods/gameBananaModInstallerService';
import { createInstalledGameBananaModsService } from './mods/installedGameBananaModsService';
import { createJsonInstalledGameBananaModsRepository } from './mods/jsonInstalledGameBananaModsRepository';
import { createLocalArchiveModInstallerService } from './mods/localArchiveModInstallerService';
import { createMainWindow } from './platform/createMainWindow';
import { registerAppIpc } from './platform/registerAppIpc';
import { createJsonSettingsRepository } from './settings/jsonSettingsRepository';
import { createSettingsService } from './settings/settingsService';

async function bootstrap(): Promise<void> {
  const settingsRepository = createJsonSettingsRepository(
    join(app.getPath('userData'), 'settings.json'),
  );
  const settingsService = createSettingsService(settingsRepository);
  const gameBananaCatalogService = createGameBananaCatalogService();
  const installedGameBananaModsRepository =
    createJsonInstalledGameBananaModsRepository(
      join(app.getPath('userData'), 'installed-gamebanana-mods.json'),
    );
  const modFrameworkService = createModFrameworkService({
    backupRootDirectory: join(
      app.getPath('userData'),
      'backups',
      'mod-framework',
    ),
    stagingRootDirectory: join(app.getPath('temp'), 'nte-mod-manager'),
  });
  const censorshipRemoverInstallerService =
    createCensorshipRemoverInstallerService({
      backupRootDirectory: join(
        app.getPath('userData'),
        'backups',
        'censorship-remover',
      ),
      catalogService: gameBananaCatalogService,
      stagingRootDirectory: join(app.getPath('temp'), 'nte-mod-manager'),
    });
  const gameBananaModInstallerService = createGameBananaModInstallerService({
    backupRootDirectory: join(app.getPath('userData'), 'backups', 'mods'),
    catalogService: gameBananaCatalogService,
    stagingRootDirectory: join(app.getPath('temp'), 'nte-mod-manager'),
  });
  const localArchiveModInstallerService = createLocalArchiveModInstallerService(
    {
      backupRootDirectory: join(
        app.getPath('userData'),
        'backups',
        'local-mods',
      ),
      stagingRootDirectory: join(app.getPath('temp'), 'nte-mod-manager'),
    },
  );
  const installedGameBananaModsService = createInstalledGameBananaModsService({
    disabledStorageRootDirectory: join(
      app.getPath('userData'),
      'backups',
      'mods',
      'disabled',
    ),
    installerService: gameBananaModInstallerService,
    repository: installedGameBananaModsRepository,
    rollbackRootDirectory: join(
      app.getPath('userData'),
      'rollbacks',
      'installed-mods',
    ),
  });

  registerAppIpc({
    censorshipRemoverInstallerService,
    gameBananaCatalogService,
    installedGameBananaModsService,
    localArchiveModInstallerService,
    modFrameworkService,
    settingsService,
  });
  await createMainWindow();
}

app.whenReady().then(async () => {
  await bootstrap();

  app.on('activate', async () => {
    if (app.isReady() && BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
