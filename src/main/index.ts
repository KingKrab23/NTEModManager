import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

import { createModFrameworkService } from './framework/modFrameworkService';
import { createMainWindow } from './platform/createMainWindow';
import { registerAppIpc } from './platform/registerAppIpc';
import { createJsonSettingsRepository } from './settings/jsonSettingsRepository';
import { createSettingsService } from './settings/settingsService';

async function bootstrap(): Promise<void> {
  const settingsRepository = createJsonSettingsRepository(
    join(app.getPath('userData'), 'settings.json'),
  );
  const settingsService = createSettingsService(settingsRepository);
  const modFrameworkService = createModFrameworkService({
    backupRootDirectory: join(
      app.getPath('userData'),
      'backups',
      'mod-framework',
    ),
    stagingRootDirectory: join(app.getPath('temp'), 'nte-mod-manager'),
  });

  registerAppIpc({ modFrameworkService, settingsService });
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
