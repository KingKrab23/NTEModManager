import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  directoryTransactionFs,
  moveDirectoryWithinRoot,
} from '../../src/main/filesystem/directoryTransaction';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();

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

describe('moveDirectoryWithinRoot', () => {
  it('falls back to copy and remove when rename hits EXDEV', async () => {
    const rootDirectory = await createTempDirectory('nte-move-root-');
    const sourcePath = join(rootDirectory, 'source');
    const destinationPath = join(rootDirectory, 'destination');
    const nestedDirectoryPath = join(sourcePath, 'nested');
    const nestedFilePath = join(nestedDirectoryPath, 'mod.pak');

    await mkdir(nestedDirectoryPath, { recursive: true });
    await writeFile(nestedFilePath, 'modded-pak', 'utf8');

    const renameSpy = vi
      .spyOn(directoryTransactionFs, 'rename')
      .mockRejectedValueOnce(
        Object.assign(new Error('cross-device move'), {
          code: 'EXDEV',
        }),
      );

    await moveDirectoryWithinRoot(sourcePath, destinationPath, {
      allowedRoot: rootDirectory,
    });

    expect(renameSpy).toHaveBeenCalledTimes(1);
    await expect(
      readFile(join(destinationPath, 'nested', 'mod.pak'), 'utf8'),
    ).resolves.toBe('modded-pak');
    await expect(readFile(nestedFilePath, 'utf8')).rejects.toThrow();
  });
});
