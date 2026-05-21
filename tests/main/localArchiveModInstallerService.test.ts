import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLocalArchiveModInstallerService } from '../../src/main/mods/localArchiveModInstallerService';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function createGameInstallLayout(rootDirectory: string): Promise<void> {
  await mkdir(join(rootDirectory, 'NTEGlobal'), { recursive: true });
  await mkdir(
    join(rootDirectory, 'Client', 'WindowsNoEditor', 'HT', 'Binaries', 'Win64'),
    { recursive: true },
  );
  await mkdir(
    join(rootDirectory, 'Client', 'WindowsNoEditor', 'HT', 'Content', 'Paks'),
    { recursive: true },
  );
}

describe('createLocalArchiveModInstallerService', () => {
  it('rejects unsupported local archive extensions before extraction starts', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const archivePath = join(stagingRoot, 'custom-mod.tar');
    const extractArchiveImpl = vi.fn();

    await createGameInstallLayout(gameRoot);
    await writeFile(archivePath, 'not-an-archive');

    const service = createLocalArchiveModInstallerService({
      backupRootDirectory: backupRoot,
      extractArchiveImpl,
      stagingRootDirectory: stagingRoot,
    });

    await expect(service.install(gameRoot, archivePath)).rejects.toThrow(
      'The selected file custom-mod.tar is not a supported .zip, .7z, or .rar archive.',
    );
    expect(extractArchiveImpl).not.toHaveBeenCalled();
  });

  it('installs a supported local archive into a managed ~mods folder', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const archivePath = join(stagingRoot, 'Custom-NTE-Skin.7z');
    const extractArchiveImpl = vi.fn(async (_archivePath, options) => {
      await mkdir(join(options.dir, 'Content', 'Paks', 'CustomNteSkin'), {
        recursive: true,
      });
      await writeFile(
        join(options.dir, 'Content', 'Paks', 'CustomNteSkin', 'mod_P.pak'),
        'pak-data',
      );
    });

    await createGameInstallLayout(gameRoot);
    await writeFile(
      join(
        gameRoot,
        'Client',
        'WindowsNoEditor',
        'HT',
        'Content',
        'Paks',
        'template.sig',
      ),
      'template',
    );
    await writeFile(
      archivePath,
      Uint8Array.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 1]),
    );

    const service = createLocalArchiveModInstallerService({
      backupRootDirectory: backupRoot,
      extractArchiveImpl,
      stagingRootDirectory: stagingRoot,
    });

    const result = await service.install(gameRoot, archivePath);

    expect(result.modName).toBe('Custom NTE Skin');
    expect(result.archivePath).toBe(archivePath);
    expect(result.installedFiles).toHaveLength(2);
    expect(result.installDirectory).toBe(
      join(
        gameRoot,
        'Client',
        'WindowsNoEditor',
        'HT',
        'Content',
        'Paks',
        '~mods',
        'Custom NTE Skin-local',
      ),
    );
    expect(result.installedFiles[0]?.destinationPath).toBe(
      join(
        gameRoot,
        'Client',
        'WindowsNoEditor',
        'HT',
        'Content',
        'Paks',
        '~mods',
        'Custom NTE Skin-local',
        'CustomNteSkin',
        'mod_P.pak',
      ),
    );
  });
});
