import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { defaultAppSettings } from '../../src/shared/settings';
import { createJsonSettingsRepository } from '../../src/main/settings/jsonSettingsRepository';
import {
  createSettingsService,
  normalizeGamePath,
} from '../../src/main/settings/settingsService';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

async function createRepositoryUnderTempDir() {
  const directory = await mkdtemp(join(tmpdir(), 'nte-mod-manager-'));
  temporaryDirectories.push(directory);

  const repository = createJsonSettingsRepository(
    join(directory, 'settings.json'),
  );

  return {
    directory,
    repository,
  };
}

describe('createJsonSettingsRepository', () => {
  it('returns the default settings when the file does not exist yet', async () => {
    const { repository } = await createRepositoryUnderTempDir();

    await expect(repository.read()).resolves.toEqual(defaultAppSettings);
  });

  it('persists settings to disk through the service layer', async () => {
    const { directory, repository } = await createRepositoryUnderTempDir();
    const service = createSettingsService(repository);
    const gamePath = join(directory, 'NTE');

    const savedSettings = await service.updateGamePath(gamePath);
    const loadedSettings = await repository.read();

    expect(savedSettings.gamePath).toBe(gamePath);
    expect(savedSettings.lastUpdatedAt).toBeTypeOf('string');
    expect(loadedSettings).toEqual(savedSettings);
  });
});

describe('normalizeGamePath', () => {
  it('trims and resolves absolute paths', () => {
    const absolutePath = join(process.cwd(), 'fixtures', 'NTE');

    expect(normalizeGamePath(`  ${absolutePath}  `)).toBe(absolutePath);
  });

  it('rejects relative paths', () => {
    expect(() => normalizeGamePath('./NTE')).toThrow(
      'Game path must be an absolute directory path.',
    );
  });
});
