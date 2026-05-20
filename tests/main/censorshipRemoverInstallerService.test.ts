import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCensorshipRemoverInstallerService } from '../../src/main/mods/censorshipRemoverInstallerService';
import type { CatalogMod } from '../../src/shared/catalog';

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

function createCatalogMod(files: CatalogMod['files']): CatalogMod {
  return {
    body: 'Description',
    category: null,
    createdAt: '2026-05-20T12:00:00.000Z',
    downloads: 100,
    files,
    id: 675148,
    installInstructions:
      'Simply extract the contents into %GAME_FOLDER%/Client/WindowsNoEditor/HT/Binaries/Win64.',
    likes: 10,
    name: 'Censorship Remover',
    ownerName: 'Uploader',
    previewImageUrl: null,
    profileUrl: 'https://gamebanana.com/mods/675148',
    selectedFileId: files[0]?.id ?? null,
    summary: 'Description',
  };
}

describe('createCensorshipRemoverInstallerService', () => {
  it('installs the newest supported non-archived file into Win64', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const extractArchiveImpl = vi.fn(async (_archivePath, options) => {
      const win64Directory = join(
        options.dir,
        'Client',
        'WindowsNoEditor',
        'HT',
        'Binaries',
        'Win64',
      );
      await mkdir(win64Directory, { recursive: true });
      await writeFile(join(win64Directory, 'dxgi.dll'), 'new-dll');
    });

    await createGameInstallLayout(gameRoot);
    await writeFile(
      join(
        gameRoot,
        'Client',
        'WindowsNoEditor',
        'HT',
        'Binaries',
        'Win64',
        'dxgi.dll',
      ),
      'old-dll',
    );

    const zipLikeBuffer = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    const service = createCensorshipRemoverInstallerService({
      backupRootDirectory: backupRoot,
      catalogService: {
        browseRecentMods: vi.fn(),
        getMod: vi.fn(async () =>
          createCatalogMod([
            {
              addedAt: '2026-05-19T12:00:00.000Z',
              description: 'Old build',
              downloadCount: 20,
              downloadUrl: 'https://gamebanana.com/dl/old-build',
              fileName: 'censorship-remover-old.zip',
              fileSizeBytes: 1024,
              id: 'old-build',
              isArchived: false,
              version: '1.0',
            },
            {
              addedAt: '2026-05-20T12:00:00.000Z',
              description: 'New build',
              downloadCount: 40,
              downloadUrl: 'https://gamebanana.com/dl/1700313',
              fileName: 'censorship-remover-v2.zip',
              fileSizeBytes: 2048,
              id: '1700313',
              isArchived: false,
              version: '2.0',
            },
          ]),
        ),
      },
      extractArchiveImpl,
      fetchImpl: vi.fn(
        async () =>
          new Response(zipLikeBuffer.buffer.slice(0), { status: 200 }),
      ) as typeof fetch,
      stagingRootDirectory: stagingRoot,
    });

    const result = await service.install(gameRoot);

    expect(result.downloadedFileName).toBe('censorship-remover-v2.zip');
    expect(result.selectedFileId).toBe('1700313');
    expect(result.installedFiles).toEqual([
      {
        action: 'replaced',
        destinationPath: join(
          gameRoot,
          'Client',
          'WindowsNoEditor',
          'HT',
          'Binaries',
          'Win64',
          'dxgi.dll',
        ),
        sourceFileName: 'dxgi.dll',
      },
    ]);
    await expect(
      readFile(
        join(
          gameRoot,
          'Client',
          'WindowsNoEditor',
          'HT',
          'Binaries',
          'Win64',
          'dxgi.dll',
        ),
        'utf8',
      ),
    ).resolves.toBe('new-dll');
  });

  it('rejects missing supported archives before downloading', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const fetchImpl = vi.fn();

    await createGameInstallLayout(gameRoot);

    const service = createCensorshipRemoverInstallerService({
      backupRootDirectory: backupRoot,
      catalogService: {
        browseRecentMods: vi.fn(),
        getMod: vi.fn(async () =>
          createCatalogMod([
            {
              addedAt: '2026-05-20T12:00:00.000Z',
              description: 'Unsupported build',
              downloadCount: 5,
              downloadUrl: 'https://gamebanana.com/dl/unsupported',
              fileName: 'censorship-remover.tar',
              fileSizeBytes: 2048,
              id: 'unsupported',
              isArchived: false,
              version: '1.0',
            },
          ]),
        ),
      },
      extractArchiveImpl: vi.fn(),
      fetchImpl: fetchImpl as typeof fetch,
      stagingRootDirectory: stagingRoot,
    });

    await expect(service.install(gameRoot)).rejects.toThrow(
      'Censorship Remover does not currently expose a supported non-archived .zip, .7z, or .rar file.',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
