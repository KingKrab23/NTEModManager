import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGameBananaModInstallerService } from '../../src/main/mods/gameBananaModInstallerService';
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

function createCatalogMod(fileName: string): CatalogMod {
  return {
    body: 'Description',
    createdAt: '2026-05-19T12:00:00.000Z',
    downloads: 10,
    files: [
      {
        addedAt: '2026-05-19T12:00:00.000Z',
        description: 'File',
        downloadCount: 5,
        downloadUrl: 'https://gamebanana.com/dl/example',
        fileName,
        fileSizeBytes: 1024,
        id: 'file-1',
        isArchived: false,
        version: '1.0.0',
      },
    ],
    id: 1,
    installInstructions: '',
    likes: 1,
    name: 'Example mod',
    ownerName: 'Uploader',
    previewImageUrl: null,
    profileUrl: 'https://gamebanana.com/mods/1',
    selectedFileId: 'file-1',
    summary: 'Description',
  };
}

describe('createGameBananaModInstallerService', () => {
  it('rejects non-zip GameBanana files before downloading them', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const fetchImpl = vi.fn();

    await createGameInstallLayout(gameRoot);

    const service = createGameBananaModInstallerService({
      backupRootDirectory: backupRoot,
      catalogService: {
        browseRecentMods: vi.fn(),
        getMod: vi.fn(async () => createCatalogMod('example-mod.7z')),
      },
      extractZipImpl: vi.fn(),
      fetchImpl: fetchImpl as typeof fetch,
      stagingRootDirectory: stagingRoot,
    });

    await expect(
      service.install(gameRoot, { fileId: 'file-1', modId: 1 }),
    ).rejects.toThrow(
      'The selected file example-mod.7z is not a supported .zip archive.',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces a clear error when the download is not a zip payload', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const extractZipImpl = vi.fn();

    await createGameInstallLayout(gameRoot);

    const service = createGameBananaModInstallerService({
      backupRootDirectory: backupRoot,
      catalogService: {
        browseRecentMods: vi.fn(),
        getMod: vi.fn(async () => createCatalogMod('example-mod.zip')),
      },
      extractZipImpl,
      fetchImpl: vi.fn(
        async () => new Response('not-a-zip', { status: 200 }),
      ) as typeof fetch,
      stagingRootDirectory: stagingRoot,
    });

    await expect(
      service.install(gameRoot, { fileId: 'file-1', modId: 1 }),
    ).rejects.toThrow(
      'Downloaded example-mod.zip is not a ZIP archive. GameBanana may have returned a different file format or an incomplete response.',
    );
    expect(extractZipImpl).not.toHaveBeenCalled();
  });

  it('rewrites low-level zip extraction failures into a user-facing archive error', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const extractZipImpl = vi.fn(async () => {
      throw new Error('end of central directory record signature not found');
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

    const zipLikeBuffer = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    const service = createGameBananaModInstallerService({
      backupRootDirectory: backupRoot,
      catalogService: {
        browseRecentMods: vi.fn(),
        getMod: vi.fn(async () => createCatalogMod('example-mod.zip')),
      },
      extractZipImpl,
      fetchImpl: vi.fn(
        async () =>
          new Response(zipLikeBuffer.buffer.slice(0), { status: 200 }),
      ) as typeof fetch,
      stagingRootDirectory: stagingRoot,
    });

    await expect(
      service.install(gameRoot, { fileId: 'file-1', modId: 1 }),
    ).rejects.toThrow(
      'Downloaded example-mod.zip is not a valid ZIP archive or was truncated before extraction finished.',
    );
  });
});
