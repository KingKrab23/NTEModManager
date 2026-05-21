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
    category: null,
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
  it('rejects unsupported GameBanana archive files before downloading them', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const fetchImpl = vi.fn();

    await createGameInstallLayout(gameRoot);

    const service = createGameBananaModInstallerService({
      backupRootDirectory: backupRoot,
      catalogService: {
        browseRecentMods: vi.fn(),
        getMod: vi.fn(async () => createCatalogMod('example-mod.tar')),
      },
      extractArchiveImpl: vi.fn(),
      fetchImpl: fetchImpl as typeof fetch,
      stagingRootDirectory: stagingRoot,
    });

    await expect(
      service.install(gameRoot, { fileId: 'file-1', modId: 1 }),
    ).rejects.toThrow(
      'The selected file example-mod.tar is not a supported .zip, .7z, or .rar archive.',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces a clear error when the download does not match the expected archive format', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const extractArchiveImpl = vi.fn();

    await createGameInstallLayout(gameRoot);

    const service = createGameBananaModInstallerService({
      backupRootDirectory: backupRoot,
      catalogService: {
        browseRecentMods: vi.fn(),
        getMod: vi.fn(async () => createCatalogMod('example-mod.7z')),
      },
      extractArchiveImpl,
      fetchImpl: vi.fn(
        async () => new Response('not-a-zip', { status: 200 }),
      ) as typeof fetch,
      stagingRootDirectory: stagingRoot,
    });

    await expect(
      service.install(gameRoot, { fileId: 'file-1', modId: 1 }),
    ).rejects.toThrow(
      'Downloaded example-mod.7z does not look like a valid 7Z payload. GameBanana may have returned a different file format or an incomplete response.',
    );
    expect(extractArchiveImpl).not.toHaveBeenCalled();
  });

  it('rewrites low-level archive extraction failures into a user-facing archive error', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const extractArchiveImpl = vi.fn(async () => {
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
      extractArchiveImpl,
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

  it('allows supported 7z archives through the installer pipeline', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const extractArchiveImpl = vi.fn(async (_archivePath, options) => {
      await mkdir(options.dir, { recursive: true });
      await writeFile(join(options.dir, 'example-mod.pak'), 'pak-data');
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

    const sevenZipBuffer = Uint8Array.from([
      0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 1,
    ]);
    const service = createGameBananaModInstallerService({
      backupRootDirectory: backupRoot,
      catalogService: {
        browseRecentMods: vi.fn(),
        getMod: vi.fn(async () => createCatalogMod('example-mod.7z')),
      },
      extractArchiveImpl,
      fetchImpl: vi.fn(
        async () =>
          new Response(sevenZipBuffer.buffer.slice(0), { status: 200 }),
      ) as typeof fetch,
      stagingRootDirectory: stagingRoot,
    });

    const result = await service.install(gameRoot, {
      fileId: 'file-1',
      modId: 1,
    });

    expect(result.downloadedFileName).toBe('example-mod.7z');
    expect(extractArchiveImpl).toHaveBeenCalledTimes(1);
    expect(result.installedFiles).toHaveLength(2);
    expect(result.installedFiles[0]?.destinationPath).toBe(
      join(
        gameRoot,
        'Client',
        'WindowsNoEditor',
        'HT',
        'Content',
        'Paks',
        '~mods',
        'Example mod-1',
        'example-mod.pak',
      ),
    );
  });

  it('allows supported rar archives through the installer pipeline', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const extractArchiveImpl = vi.fn(async (_archivePath, options) => {
      await mkdir(options.dir, { recursive: true });
      await writeFile(join(options.dir, 'example-mod.pak'), 'pak-data');
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

    const rarBuffer = Uint8Array.from([
      0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00,
    ]);
    const service = createGameBananaModInstallerService({
      backupRootDirectory: backupRoot,
      catalogService: {
        browseRecentMods: vi.fn(),
        getMod: vi.fn(async () => createCatalogMod('example-mod.rar')),
      },
      extractArchiveImpl,
      fetchImpl: vi.fn(
        async () => new Response(rarBuffer.buffer.slice(0), { status: 200 }),
      ) as typeof fetch,
      stagingRootDirectory: stagingRoot,
    });

    const result = await service.install(gameRoot, {
      fileId: 'file-1',
      modId: 1,
    });

    expect(result.downloadedFileName).toBe('example-mod.rar');
    expect(extractArchiveImpl).toHaveBeenCalledTimes(1);
    expect(result.installedFiles).toHaveLength(2);
  });

  it('preserves archive paths under ~mods instead of flattening same-named assets into Paks', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const extractArchiveImpl = vi.fn(async (_archivePath, options) => {
      await mkdir(join(options.dir, 'Content', 'Paks', 'Chiz'), {
        recursive: true,
      });
      await writeFile(
        join(options.dir, 'Content', 'Paks', 'Chiz', 'mod_P.pak'),
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

    const zipLikeBuffer = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    const service = createGameBananaModInstallerService({
      backupRootDirectory: backupRoot,
      catalogService: {
        browseRecentMods: vi.fn(),
        getMod: vi.fn(async () => createCatalogMod('example-mod.zip')),
      },
      extractArchiveImpl,
      fetchImpl: vi.fn(
        async () =>
          new Response(zipLikeBuffer.buffer.slice(0), { status: 200 }),
      ) as typeof fetch,
      stagingRootDirectory: stagingRoot,
    });

    const result = await service.install(gameRoot, {
      fileId: 'file-1',
      modId: 1,
    });

    expect(result.installedFiles[0]?.destinationPath).toBe(
      join(
        gameRoot,
        'Client',
        'WindowsNoEditor',
        'HT',
        'Content',
        'Paks',
        '~mods',
        'Example mod-1',
        'Chiz',
        'mod_P.pak',
      ),
    );
    expect(result.installedFiles[1]?.destinationPath).toBe(
      join(
        gameRoot,
        'Client',
        'WindowsNoEditor',
        'HT',
        'Content',
        'Paks',
        '~mods',
        'Example mod-1',
        'Chiz',
        'mod_P.sig',
      ),
    );
  });
});
