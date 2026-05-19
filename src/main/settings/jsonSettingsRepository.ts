import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  defaultAppSettings,
  parseStoredSettings,
  type AppSettings,
} from '../../shared/settings';

export interface SettingsRepository {
  read: () => Promise<AppSettings>;
  write: (settings: AppSettings) => Promise<void>;
}

export function createJsonSettingsRepository(
  filePath: string,
): SettingsRepository {
  return {
    async read() {
      try {
        const raw = await readFile(filePath, 'utf8');
        return parseStoredSettings(JSON.parse(raw));
      } catch (error) {
        const fileMissing =
          error instanceof Error && 'code' in error && error.code === 'ENOENT';

        if (fileMissing) {
          return defaultAppSettings;
        }

        throw error;
      }
    },
    async write(settings) {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(
        filePath,
        `${JSON.stringify(settings, null, 2)}\n`,
        'utf8',
      );
    },
  };
}
