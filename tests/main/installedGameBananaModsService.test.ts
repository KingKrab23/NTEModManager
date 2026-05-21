import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInstalledGameBananaModsService } from '../../src/main/mods/installedGameBananaModsService';
import {
  createJsonInstalledGameBananaModsRepository,
  type InstalledGameBananaModsRepository,
} from '../../src/main/mods/jsonInstalledGameBananaModsRepository';
import {
  formatManagedModDirectoryName,
  getManagedModDirectoryPaths,
} from '../../src/main/mods/managedModDirectory';

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

describe('createInstalledGameBananaModsService', () => {
  it('records installed mods and uninstalls them by restoring backups and removing created files', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const dataRoot = await createTempDirectory('nte-data-');
    const rollbackRoot = await createTempDirectory('nte-rollback-');
    const paksDirectory = join(
      gameRoot,
      'Client',
      'WindowsNoEditor',
      'HT',
      'Content',
      'Paks',
    );
    const installDirectoryName = formatManagedModDirectoryName(
      'Nanally - Nude!!!',
      675801,
    );
    const modDirectoryPath = join(paksDirectory, '~mods', installDirectoryName);
    const replacedDestinationPath = join(modDirectoryPath, 'Nanally_v13.pak');
    const createdDestinationPath = join(modDirectoryPath, 'Nanally_v13.sig');
    const backupDirectory = join(dataRoot, 'backups', 'mods', 'install-1');
    const backupPath = join(backupDirectory, 'Nanally_v13.pak');
    const repository = createJsonInstalledGameBananaModsRepository(
      join(dataRoot, 'installed-gamebanana-mods.json'),
    );

    await createGameInstallLayout(gameRoot);
    await mkdir(backupDirectory, { recursive: true });
    await writeFile(backupPath, 'original-pak');

    const service = createInstalledGameBananaModsService({
      installerService: {
        inspectLatest: vi.fn(async () => ({
          files: [
            {
              addedAt: '2026-05-19T12:00:00.000Z',
              description: 'Latest build',
              downloadCount: 995,
              downloadUrl: 'https://gamebanana.com/dl/1703928',
              fileName: 'nanally_b79c4.zip',
              fileSizeBytes: 17788073,
              id: '1703928',
              isArchived: false,
              version: 'V1.3',
            },
          ],
          modId: 675801,
          modName: 'Nanally - Nude!!!',
          selectedFileId: '1703928',
        })),
        install: vi.fn(async () => ({
          backupDirectory,
          downloadedFileName: 'nanally_b79c4.zip',
          downloadUrl: 'https://gamebanana.com/dl/1703928',
          installedAt: '2026-05-19T12:04:00.000Z',
          installedFiles: [
            {
              action: 'replaced' as const,
              backupPath,
              destinationPath: replacedDestinationPath,
              origin: 'archive' as const,
              sourceFileName: 'Nanally_v13.pak',
            },
            {
              action: 'created' as const,
              backupPath: null,
              destinationPath: createdDestinationPath,
              origin: 'sig-template' as const,
              sourceFileName: 'template.sig',
            },
          ],
          modId: 675801,
          modName: 'Nanally - Nude!!!',
          notes: ['Installed test mod.'],
          ownerName: 'LinStar_',
          previewImageUrl: null,
          previousFileId: null,
          profileUrl: 'https://gamebanana.com/mods/675801',
          selectedFileId: '1703928',
          selectedFileVersion: 'V1.3',
          sigTemplateDirectory: paksDirectory,
          status: 'installed' as const,
        })),
      },
      repository,
      rollbackRootDirectory: rollbackRoot,
    });

    const installResult = await service.install(gameRoot, {
      fileId: '1703928',
      modId: 675801,
    });

    expect(installResult.status).toBe('installed');
    await mkdir(modDirectoryPath, { recursive: true });
    await writeFile(replacedDestinationPath, 'modded-pak');
    await writeFile(createdDestinationPath, 'generated-sig');

    const installedMods = await service.list();
    expect(installedMods).toHaveLength(1);
    expect(installedMods[0]).toMatchObject({
      availableFiles: [
        expect.objectContaining({
          fileName: 'nanally_b79c4.zip',
          id: '1703928',
        }),
      ],
      installedFileId: '1703928',
      isEnabled: true,
      modId: 675801,
      modName: 'Nanally - Nude!!!',
      selectedUpdateFileId: '1703928',
    });

    const uninstallResult = await service.uninstall(gameRoot, {
      modId: 675801,
    });

    expect(uninstallResult.modName).toBe('Nanally - Nude!!!');
    await expect(readFile(replacedDestinationPath, 'utf8')).resolves.toBe(
      'original-pak',
    );
    await expect(readFile(createdDestinationPath, 'utf8')).rejects.toThrow();
    await expect(service.list()).resolves.toEqual([]);
  });

  it('reports already-latest when the installed record already matches the newest file id', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const dataRoot = await createTempDirectory('nte-data-');
    const rollbackRoot = await createTempDirectory('nte-rollback-');
    const repository: InstalledGameBananaModsRepository =
      createJsonInstalledGameBananaModsRepository(
        join(dataRoot, 'installed-gamebanana-mods.json'),
      );

    await createGameInstallLayout(gameRoot);
    await repository.write([
      {
        backupDirectory: null,
        installDirectoryName: formatManagedModDirectoryName(
          'Nanally - Nude!!!',
          675801,
        ),
        installedAt: '2026-05-19T12:04:00.000Z',
        installedFileId: '1703928',
        installedFileName: 'nanally_b79c4.zip',
        installedFiles: [],
        installedVersion: 'V1.3',
        isEnabled: true,
        modId: 675801,
        modName: 'Nanally - Nude!!!',
        ownerName: 'LinStar_',
        previewImageUrl: null,
        profileUrl: 'https://gamebanana.com/mods/675801',
        sigTemplateDirectory: join(
          gameRoot,
          'Client',
          'WindowsNoEditor',
          'HT',
          'Content',
          'Paks',
        ),
      },
    ]);

    const installerService = {
      inspectLatest: vi.fn(async () => ({
        files: [
          {
            addedAt: '2026-05-19T12:00:00.000Z',
            description: 'Latest build',
            downloadCount: 995,
            downloadUrl: 'https://gamebanana.com/dl/1703928',
            fileName: 'nanally_b79c4.zip',
            fileSizeBytes: 17788073,
            id: '1703928',
            isArchived: false,
            version: 'V1.3',
          },
        ],
        modId: 675801,
        modName: 'Nanally - Nude!!!',
        selectedFileId: '1703928',
      })),
      install: vi.fn(),
    };
    const service = createInstalledGameBananaModsService({
      installerService: installerService as never,
      repository,
      rollbackRootDirectory: rollbackRoot,
    });

    const result = await service.updateToLatest(gameRoot, {
      fileId: null,
      modId: 675801,
    });

    expect(result.status).toBe('already-latest');
    expect(result.notes[0]).toContain(
      'already on the newest supported GameBanana file',
    );
    expect(installerService.install).not.toHaveBeenCalled();
  });

  it('moves installed mods into and out of backup storage', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const dataRoot = await createTempDirectory('nte-data-');
    const rollbackRoot = await createTempDirectory('nte-rollback-');
    const disabledStorageRoot = join(dataRoot, 'backups', 'mods', 'disabled');
    const paksDirectory = join(
      gameRoot,
      'Client',
      'WindowsNoEditor',
      'HT',
      'Content',
      'Paks',
    );
    const installDirectoryName = formatManagedModDirectoryName(
      'Nanally - Nude!!!',
      675801,
    );
    const enabledDirectoryPath = join(
      paksDirectory,
      '~mods',
      installDirectoryName,
    );
    const { disabledDirectoryPath } = getManagedModDirectoryPaths(
      paksDirectory,
      installDirectoryName,
      {
        disabledStorageRootDirectory: disabledStorageRoot,
      },
    );
    const installedFilePath = join(enabledDirectoryPath, 'Nanally_v13.pak');
    const repository = createJsonInstalledGameBananaModsRepository(
      join(dataRoot, 'installed-gamebanana-mods.json'),
    );

    await createGameInstallLayout(gameRoot);
    await mkdir(enabledDirectoryPath, { recursive: true });
    await writeFile(installedFilePath, 'modded-pak');
    await repository.write([
      {
        backupDirectory: null,
        installDirectoryName,
        installedAt: '2026-05-19T12:04:00.000Z',
        installedFileId: '1703928',
        installedFileName: 'nanally_b79c4.zip',
        installedFiles: [
          {
            action: 'created',
            backupPath: null,
            destinationPath: installedFilePath,
            origin: 'archive',
            sourceFileName: 'Nanally_v13.pak',
          },
        ],
        installedVersion: 'V1.3',
        isEnabled: true,
        modId: 675801,
        modName: 'Nanally - Nude!!!',
        ownerName: 'LinStar_',
        previewImageUrl: null,
        profileUrl: 'https://gamebanana.com/mods/675801',
        sigTemplateDirectory: paksDirectory,
      },
    ]);

    const service = createInstalledGameBananaModsService({
      disabledStorageRootDirectory: disabledStorageRoot,
      installerService: {
        inspectLatest: vi.fn(),
        install: vi.fn(),
      } as never,
      repository,
      rollbackRootDirectory: rollbackRoot,
    });

    const disableResult = await service.setEnabled(gameRoot, {
      enabled: false,
      modId: 675801,
    });

    expect(disableResult.status).toBe('disabled');
    await expect(
      readFile(join(disabledDirectoryPath, 'Nanally_v13.pak'), 'utf8'),
    ).resolves.toBe('modded-pak');
    await expect(readFile(installedFilePath, 'utf8')).rejects.toThrow();
    await expect(service.list()).resolves.toMatchObject([
      {
        isEnabled: false,
        modId: 675801,
      },
    ]);

    const enableResult = await service.setEnabled(gameRoot, {
      enabled: true,
      modId: 675801,
    });

    expect(enableResult.status).toBe('enabled');
    await expect(readFile(installedFilePath, 'utf8')).resolves.toBe(
      'modded-pak',
    );
    await expect(
      readFile(join(disabledDirectoryPath, 'Nanally_v13.pak'), 'utf8'),
    ).rejects.toThrow();
  });
});
