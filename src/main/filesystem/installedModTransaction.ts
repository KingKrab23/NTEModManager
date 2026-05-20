import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export interface InstalledModRestoreEntry {
  action: 'created' | 'replaced';
  backupPath: string | null;
  destinationPath: string;
}

export async function restoreInstalledModFilesWithRollback(
  entries: InstalledModRestoreEntry[],
  options: {
    allowedRoot: string;
    rollbackDirectory: string;
  },
): Promise<void> {
  const allowedRoot = resolve(options.allowedRoot);
  const rollbackDirectory = resolve(options.rollbackDirectory);
  const appliedEntries: Array<{
    destinationPath: string;
    rollbackBackupPath: string | null;
  }> = [];

  try {
    for (const entry of entries) {
      const destinationPath = resolve(entry.destinationPath);
      ensurePathWithinRoot(allowedRoot, destinationPath);

      const relativeDestinationPath = relative(allowedRoot, destinationPath);
      const rollbackBackupPath = resolve(
        rollbackDirectory,
        relativeDestinationPath,
      );

      try {
        await mkdir(dirname(rollbackBackupPath), { recursive: true });
        await copyFile(destinationPath, rollbackBackupPath);
        appliedEntries.push({
          destinationPath,
          rollbackBackupPath,
        });
      } catch (error) {
        if (!isFileMissingError(error)) {
          throw error;
        }

        appliedEntries.push({
          destinationPath,
          rollbackBackupPath: null,
        });
      }

      if (entry.action === 'replaced') {
        if (!entry.backupPath) {
          throw new Error(
            `Cannot restore replaced file without a backup: ${destinationPath}`,
          );
        }

        await mkdir(dirname(destinationPath), { recursive: true });
        await copyFile(entry.backupPath, destinationPath);
        continue;
      }

      await rm(destinationPath, { force: true });
    }
  } catch (error) {
    await rollbackRestoredEntries(appliedEntries);
    throw error;
  }
}

async function rollbackRestoredEntries(
  entries: Array<{
    destinationPath: string;
    rollbackBackupPath: string | null;
  }>,
): Promise<void> {
  for (const entry of [...entries].reverse()) {
    if (entry.rollbackBackupPath) {
      await mkdir(dirname(entry.destinationPath), { recursive: true });
      await copyFile(entry.rollbackBackupPath, entry.destinationPath);
      continue;
    }

    await rm(entry.destinationPath, { force: true });
  }
}

function ensurePathWithinRoot(rootPath: string, candidatePath: string): void {
  const relativePath = relative(rootPath, candidatePath);

  if (
    relativePath.length === 0 ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `Refusing to write outside the configured game directory: ${candidatePath}`,
    );
  }
}

function isFileMissingError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
