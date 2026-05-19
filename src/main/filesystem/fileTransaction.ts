import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const retryableFileCopyErrorCodes = new Set(['EACCES', 'EBUSY', 'EPERM']);
const fileCopyRetryDelayMs = 250;
const fileCopyRetryLimit = 4;

export interface FileCopyPlanEntry {
  destinationPath: string;
  sourcePath: string;
}

export interface AppliedFileCopy {
  action: 'created' | 'replaced';
  backupPath: string | null;
  destinationPath: string;
  sourcePath: string;
}

export interface CopyFilesWithRollbackOptions {
  allowedRoot: string;
  backupDirectory: string;
}

export interface CopyFilesWithRollbackResult {
  backupDirectory: string | null;
  files: AppliedFileCopy[];
}

export async function copyFilesWithRollback(
  entries: FileCopyPlanEntry[],
  options: CopyFilesWithRollbackOptions,
): Promise<CopyFilesWithRollbackResult> {
  const allowedRoot = resolve(options.allowedRoot);
  const backupDirectory = resolve(options.backupDirectory);
  const appliedEntries: AppliedFileCopy[] = [];
  let usedBackupDirectory = false;

  try {
    for (const entry of entries) {
      const destinationPath = resolve(entry.destinationPath);
      ensurePathWithinRoot(allowedRoot, destinationPath);

      let backupPath: string | null = null;
      let action: AppliedFileCopy['action'] = 'created';

      try {
        const relativeDestinationPath = relative(allowedRoot, destinationPath);
        backupPath = resolve(backupDirectory, relativeDestinationPath);

        await mkdir(dirname(backupPath), { recursive: true });
        await copyFileWithRetry(destinationPath, backupPath);
        usedBackupDirectory = true;
        action = 'replaced';
      } catch (error) {
        if (!isFileMissingError(error)) {
          throw error;
        }

        backupPath = null;
      }

      await mkdir(dirname(destinationPath), { recursive: true });
      await copyFileWithRetry(entry.sourcePath, destinationPath);

      appliedEntries.push({
        action,
        backupPath,
        destinationPath,
        sourcePath: resolve(entry.sourcePath),
      });
    }
  } catch (error) {
    await rollbackAppliedCopies(appliedEntries);
    throw error;
  }

  return {
    backupDirectory: usedBackupDirectory ? backupDirectory : null,
    files: appliedEntries,
  };
}

async function rollbackAppliedCopies(
  entries: AppliedFileCopy[],
): Promise<void> {
  for (const entry of [...entries].reverse()) {
    if (entry.backupPath) {
      await mkdir(dirname(entry.destinationPath), { recursive: true });
      await copyFileWithRetry(entry.backupPath, entry.destinationPath);
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

async function copyFileWithRetry(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < fileCopyRetryLimit; attempt += 1) {
    try {
      await copyFile(sourcePath, destinationPath);
      return;
    } catch (error) {
      lastError = error;

      if (
        !isRetryableFileCopyError(error) ||
        attempt === fileCopyRetryLimit - 1
      ) {
        throw toFileCopyError(error, destinationPath);
      }

      await wait(fileCopyRetryDelayMs * (attempt + 1));
    }
  }

  throw toFileCopyError(lastError, destinationPath);
}

function isRetryableFileCopyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    retryableFileCopyErrorCodes.has(error.code)
  );
}

function toFileCopyError(error: unknown, destinationPath: string): Error {
  if (isRetryableFileCopyError(error)) {
    return new Error(
      `The file is locked and could not be updated: ${destinationPath}. Close Neverness to Everness, its launcher, and any modding tools that may be using this folder, then try again.`,
      { cause: error },
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(`Failed to update file: ${destinationPath}.`, {
    cause: error,
  });
}

async function wait(durationMs: number): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, durationMs);
  });
}
