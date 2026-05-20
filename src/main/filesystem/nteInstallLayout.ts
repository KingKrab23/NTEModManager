import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface GameInstallLayout {
  binariesDirectory: string;
  launcherDataDirectory: string;
  paksDirectory: string;
  rootDirectory: string;
}

export async function validateGameInstallLayout(
  gamePath: string,
): Promise<GameInstallLayout> {
  const rootDirectory = resolve(gamePath);
  const launcherDataDirectory = join(rootDirectory, 'NTEGlobal');
  const binariesDirectory = join(
    rootDirectory,
    'Client',
    'WindowsNoEditor',
    'HT',
    'Binaries',
    'Win64',
  );
  const paksDirectory = join(
    rootDirectory,
    'Client',
    'WindowsNoEditor',
    'HT',
    'Content',
    'Paks',
  );

  await Promise.all([
    assertDirectoryExists(rootDirectory, 'game root'),
    assertDirectoryExists(launcherDataDirectory, 'NTEGlobal'),
    assertDirectoryExists(binariesDirectory, 'Win64 binaries'),
    assertDirectoryExists(paksDirectory, 'Pak files directory'),
  ]);

  return {
    binariesDirectory,
    launcherDataDirectory,
    paksDirectory,
    rootDirectory,
  };
}

export async function findFirstSignatureTemplate(
  directoryPath: string,
): Promise<string | null> {
  const filePaths = await findFilesRecursively(directoryPath);

  return (
    filePaths.find((filePath) => filePath.toLowerCase().endsWith('.sig')) ??
    null
  );
}

async function assertDirectoryExists(
  directoryPath: string,
  label: string,
): Promise<void> {
  let directoryStats;

  try {
    directoryStats = await stat(directoryPath);
  } catch (error) {
    if (isFileMissingError(error)) {
      throw new Error(
        `The configured game folder is missing the expected ${label}: ${directoryPath}`,
        { cause: error },
      );
    }

    throw error;
  }

  if (!directoryStats.isDirectory()) {
    throw new Error(
      `The configured game folder has an invalid ${label} path: ${directoryPath}`,
    );
  }
}

async function findFilesRecursively(directoryPath: string): Promise<string[]> {
  const directoryEntries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const matches: string[] = [];

  for (const entry of directoryEntries) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      matches.push(...(await findFilesRecursively(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      matches.push(entryPath);
    }
  }

  return matches;
}

function isFileMissingError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
