import { isAbsolute, resolve } from 'node:path';

import { type AppSettings, withUpdatedTimestamp } from '../../shared/settings';
import type { SettingsRepository } from './jsonSettingsRepository';

export interface SettingsService {
  getSettings: () => Promise<AppSettings>;
  updateGamePath: (gamePath: string) => Promise<AppSettings>;
}

export function createSettingsService(
  repository: SettingsRepository,
): SettingsService {
  return {
    async getSettings() {
      return repository.read();
    },
    async updateGamePath(gamePath) {
      const normalizedPath = normalizeGamePath(gamePath);
      const currentSettings = await repository.read();
      const nextSettings = withUpdatedTimestamp({
        ...currentSettings,
        gamePath: normalizedPath,
      });

      await repository.write(nextSettings);
      return nextSettings;
    },
  };
}

export function normalizeGamePath(candidate: string): string {
  const trimmed = candidate.trim();

  if (trimmed.length === 0) {
    throw new Error('Game path cannot be empty.');
  }

  if (!isAbsolute(trimmed)) {
    throw new Error('Game path must be an absolute directory path.');
  }

  return resolve(trimmed);
}
