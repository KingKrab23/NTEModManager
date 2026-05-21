import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';

const activeInstalledModsDirectoryName = '~mods';

export interface InstalledModPathLike {
  destinationPath: string;
}

export function inferManagedModDirectoryName(options: {
  installDirectoryName?: string | null;
  installedFiles: readonly InstalledModPathLike[];
  modId: number;
  modName: string;
  sigTemplateDirectory: string;
}): string {
  const storedDirectoryName = options.installDirectoryName?.trim();

  if (storedDirectoryName) {
    return storedDirectoryName;
  }

  const enabledModsRoot = resolve(
    options.sigTemplateDirectory,
    activeInstalledModsDirectoryName,
  );

  for (const file of options.installedFiles) {
    const relativePath = relative(
      enabledModsRoot,
      resolve(file.destinationPath),
    );

    if (
      relativePath.length === 0 ||
      relativePath.startsWith('..') ||
      isAbsolute(relativePath)
    ) {
      continue;
    }

    const [directoryName] = relativePath.split(/[\\/]+/).filter(Boolean);

    if (directoryName) {
      return directoryName;
    }
  }

  return formatManagedModDirectoryName(options.modName, options.modId);
}

export function formatManagedModDirectoryName(
  modName: string,
  modId: number,
): string {
  const sanitizedName = modName
    .split('')
    .map((character) => {
      const characterCode = character.charCodeAt(0);

      if (characterCode <= 0x1f || '<>:"/\\|?*'.includes(character)) {
        return ' ';
      }

      return character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[ .]+$/g, '')
    .slice(0, 60);

  return sanitizedName.length > 0
    ? `${sanitizedName}-${modId}`
    : `mod-${modId}`;
}

export function getManagedModDirectoryPaths(
  sigTemplateDirectory: string,
  installDirectoryName: string,
  options?: {
    disabledStorageRootDirectory?: string;
  },
): {
  disabledDirectoryPath: string;
  enabledDirectoryPath: string;
} {
  const resolvedSigTemplateDirectory = resolve(sigTemplateDirectory);
  const disabledStorageRootDirectory = options?.disabledStorageRootDirectory;

  return {
    disabledDirectoryPath: disabledStorageRootDirectory
      ? join(
          resolve(disabledStorageRootDirectory),
          createManagedModStorageBucketName(resolvedSigTemplateDirectory),
          installDirectoryName,
        )
      : join(resolvedSigTemplateDirectory, 'disabled', installDirectoryName),
    enabledDirectoryPath: join(
      resolvedSigTemplateDirectory,
      activeInstalledModsDirectoryName,
      installDirectoryName,
    ),
  };
}

function createManagedModStorageBucketName(
  sigTemplateDirectory: string,
): string {
  return createHash('sha256')
    .update(sigTemplateDirectory)
    .digest('hex')
    .slice(0, 16);
}
