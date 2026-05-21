import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const retryableMoveErrorCodes = new Set(['EACCES', 'EBUSY', 'EPERM']);
const moveRetryDelayMs = 250;
const moveRetryLimit = 4;

export async function moveDirectoryWithinRoot(
  sourcePath: string,
  destinationPath: string,
  options: {
    allowedRoot: string;
  },
): Promise<void> {
  const allowedRoot = resolve(options.allowedRoot);
  const resolvedSourcePath = resolve(sourcePath);
  const resolvedDestinationPath = resolve(destinationPath);

  ensurePathWithinRoot(allowedRoot, resolvedSourcePath);
  ensurePathWithinRoot(allowedRoot, resolvedDestinationPath);

  if (resolvedSourcePath === resolvedDestinationPath) {
    return;
  }

  const sourceExists = await pathExists(resolvedSourcePath);
  const destinationExists = await pathExists(resolvedDestinationPath);

  if (!sourceExists && destinationExists) {
    return;
  }

  if (!sourceExists) {
    throw new Error(
      `The managed mod directory is missing: ${resolvedSourcePath}.`,
    );
  }

  if (destinationExists) {
    throw new Error(
      `The destination managed mod directory already exists: ${resolvedDestinationPath}.`,
    );
  }

  await mkdir(dirname(resolvedDestinationPath), { recursive: true });
  await renameWithRetry(resolvedSourcePath, resolvedDestinationPath);
}

function ensurePathWithinRoot(rootPath: string, candidatePath: string): void {
  const relativePath = relative(rootPath, candidatePath);

  if (
    relativePath.length === 0 ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `Refusing to move a directory outside the configured game directory: ${candidatePath}`,
    );
  }
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    const stats = await stat(candidatePath);
    return stats.isDirectory();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function renameWithRetry(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < moveRetryLimit; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      lastError = error;

      if (!isRetryableMoveError(error) || attempt === moveRetryLimit - 1) {
        throw toDirectoryMoveError(error, sourcePath);
      }

      await wait(moveRetryDelayMs * (attempt + 1));
    }
  }

  throw toDirectoryMoveError(lastError, sourcePath);
}

function isRetryableMoveError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    retryableMoveErrorCodes.has(error.code)
  );
}

function toDirectoryMoveError(error: unknown, directoryPath: string): Error {
  if (isRetryableMoveError(error)) {
    return new Error(
      `The mod folder is locked and could not be moved: ${directoryPath}. Close Neverness to Everness, its launcher, and any modding tools that may be using this folder, then try again.`,
      { cause: error },
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(`Failed to move mod folder: ${directoryPath}.`, {
    cause: error,
  });
}

async function wait(durationMs: number): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, durationMs);
  });
}
