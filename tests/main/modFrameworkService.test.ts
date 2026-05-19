import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createModFrameworkService } from '../../src/main/framework/modFrameworkService';

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

function createFetchResponse(
  body: string | Uint8Array,
  init?: { status?: number; statusText?: string },
): Response {
  if (typeof body === 'string') {
    return new Response(body, init);
  }

  const arrayBuffer = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer;

  return new Response(arrayBuffer, init);
}

function createFakeFetch(): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (
      requestUrl.endsWith('/ThirteenAG/Ultimate-ASI-Loader/releases/latest')
    ) {
      return createFetchResponse(
        JSON.stringify({
          assets: [
            {
              browser_download_url: 'https://downloads.example/not-used.zip',
              name: 'Ultimate-ASI-Loader_x64.zip',
            },
          ],
          html_url:
            'https://github.com/ThirteenAG/Ultimate-ASI-Loader/releases/tag/v9.7.1',
          name: 'Ultimate ASI Loader v9.7.1',
          tag_name: 'v9.7.1',
        }),
        { status: 200 },
      );
    }

    if (
      requestUrl.endsWith(
        '/rm-NoobInCoding/UniversalSigBypasser/releases/latest',
      )
    ) {
      return createFetchResponse(
        JSON.stringify({
          assets: [
            {
              browser_download_url:
                'https://downloads.example/sig-bypasser.zip',
              name: 'SigBypasser_v1.2.zip',
            },
          ],
          html_url:
            'https://github.com/rm-NoobInCoding/UniversalSigBypasser/releases/tag/v1.2',
          name: 'Release 1.2',
          tag_name: 'v1.2',
        }),
        { status: 200 },
      );
    }

    if (
      requestUrl ===
      'https://github.com/ThirteenAG/Ultimate-ASI-Loader/releases/download/x64-latest/version-x64.zip'
    ) {
      return createFetchResponse(new Uint8Array([1, 2, 3]), { status: 200 });
    }

    if (requestUrl === 'https://downloads.example/sig-bypasser.zip') {
      return createFetchResponse(new Uint8Array([4, 5, 6]), { status: 200 });
    }

    return createFetchResponse('Not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }) as typeof fetch;
}

describe('createModFrameworkService', () => {
  it('downloads the framework archives and installs them into the configured game layout', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const binariesDirectory = join(
      gameRoot,
      'Client',
      'WindowsNoEditor',
      'HT',
      'Binaries',
      'Win64',
    );

    await createGameInstallLayout(gameRoot);
    await writeFile(join(gameRoot, 'version.dll'), 'old-root-version');
    await writeFile(
      join(binariesDirectory, 'version.dll'),
      'old-binaries-version',
    );

    const service = createModFrameworkService({
      backupRootDirectory: backupRoot,
      extractZipImpl: vi.fn(async (archivePath, options) => {
        await mkdir(options.dir, { recursive: true });

        if (archivePath.endsWith('version-x64.zip')) {
          await writeFile(join(options.dir, 'version.dll'), 'fresh-version');
          return;
        }

        await writeFile(
          join(options.dir, 'UniversalSigBypasser.asi'),
          'fresh-sig-bypass',
        );
      }),
      fetchImpl: createFakeFetch(),
      stagingRootDirectory: stagingRoot,
    });

    const result = await service.install(gameRoot);

    await expect(readFile(join(gameRoot, 'version.dll'), 'utf8')).resolves.toBe(
      'fresh-version',
    );
    await expect(
      readFile(join(gameRoot, 'NTEGlobal', 'version.dll'), 'utf8'),
    ).resolves.toBe('fresh-version');
    await expect(
      readFile(join(binariesDirectory, 'version.dll'), 'utf8'),
    ).resolves.toBe('fresh-version');
    await expect(
      readFile(join(binariesDirectory, 'UniversalSigBypasser.asi'), 'utf8'),
    ).resolves.toBe('fresh-sig-bypass');

    expect(result.installedFiles).toHaveLength(4);
    expect(result.backupDirectory).not.toBeNull();
    await expect(
      readFile(join(result.backupDirectory!, 'version.dll'), 'utf8'),
    ).resolves.toBe('old-root-version');
    await expect(
      readFile(
        join(
          result.backupDirectory!,
          'Client',
          'WindowsNoEditor',
          'HT',
          'Binaries',
          'Win64',
          'version.dll',
        ),
        'utf8',
      ),
    ).resolves.toBe('old-binaries-version');
    expect(result.sigTemplateDirectory).toBe(
      join(gameRoot, 'Client', 'WindowsNoEditor', 'HT', 'Content', 'Paks'),
    );
  });

  it('rolls back earlier copies if a later framework write fails', async () => {
    const gameRoot = await createTempDirectory('nte-game-');
    const stagingRoot = await createTempDirectory('nte-stage-');
    const backupRoot = await createTempDirectory('nte-backup-');
    const binariesDirectory = join(
      gameRoot,
      'Client',
      'WindowsNoEditor',
      'HT',
      'Binaries',
      'Win64',
    );

    await createGameInstallLayout(gameRoot);
    await writeFile(join(gameRoot, 'version.dll'), 'old-root-version');
    await writeFile(
      join(binariesDirectory, 'version.dll'),
      'old-binaries-version',
    );
    await mkdir(join(binariesDirectory, 'UniversalSigBypasser.asi'), {
      recursive: true,
    });

    const service = createModFrameworkService({
      backupRootDirectory: backupRoot,
      extractZipImpl: vi.fn(async (archivePath, options) => {
        await mkdir(options.dir, { recursive: true });

        if (archivePath.endsWith('version-x64.zip')) {
          await writeFile(join(options.dir, 'version.dll'), 'fresh-version');
          return;
        }

        await writeFile(
          join(options.dir, 'UniversalSigBypasser.asi'),
          'fresh-sig-bypass',
        );
      }),
      fetchImpl: createFakeFetch(),
      stagingRootDirectory: stagingRoot,
    });

    await expect(service.install(gameRoot)).rejects.toThrow();

    await expect(readFile(join(gameRoot, 'version.dll'), 'utf8')).resolves.toBe(
      'old-root-version',
    );
    await expect(
      readFile(join(binariesDirectory, 'version.dll'), 'utf8'),
    ).resolves.toBe('old-binaries-version');
    await expect(
      readFile(join(gameRoot, 'NTEGlobal', 'version.dll'), 'utf8'),
    ).rejects.toThrow();
  });
});
