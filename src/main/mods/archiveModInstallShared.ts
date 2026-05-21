import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

import {
  getSupportedGameBananaArchiveFormat,
  isSupportedGameBananaArchiveFileName,
} from '../../shared/catalog';
import type { InstalledModFileOrigin } from '../../shared/mods';
import {
  formatArchiveExtractionErrorMessage,
  type ExtractArchiveFunction,
} from '../filesystem/archiveExtractor';
import {
  copyFilesWithRollback,
  type FileCopyPlanEntry,
} from '../filesystem/fileTransaction';
import {
  findFirstSignatureTemplate,
  validateGameInstallLayout,
} from '../filesystem/nteInstallLayout';
import { normalizeGamePath } from '../settings/settingsService';

const supportedModAssetExtensions = new Set(['.pak', '.sig', '.ucas', '.utoc']);
const modsDirectoryName = '~mods';

interface InstallPlanEntry extends FileCopyPlanEntry {
  origin: InstalledModFileOrigin;
}

export interface DetailedInstalledModFile {
  action: 'created' | 'replaced';
  backupPath: string | null;
  destinationPath: string;
  origin: InstalledModFileOrigin;
  sourceFileName: string;
}

interface InstallArchiveIntoManagedModsRequest {
  archiveFileName: string;
  archivePath: string;
  backupRootDirectory: string;
  extractArchiveImpl: ExtractArchiveFunction;
  gamePath: string;
  installDirectoryName: string;
}

export interface InstallArchiveIntoManagedModsResult {
  backupDirectory: string | null;
  ignoredFileCount: number;
  installDirectory: string;
  installedFiles: DetailedInstalledModFile[];
  sigTemplateDirectory: string;
  synthesizedSignatureCount: number;
}

export function ensureSupportedArchiveFileName(
  fileName: string,
  subjectLabel = 'The selected file',
): void {
  if (!isSupportedGameBananaArchiveFileName(fileName)) {
    throw new Error(
      `${subjectLabel} ${fileName} is not a supported .zip, .7z, or .rar archive.`,
    );
  }
}

export function formatManagedModInstallDirectoryName(
  modName: string,
  suffix: string,
): string {
  const sanitizedName = modName
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[ .]+$/g, '')
    .slice(0, 60);

  return sanitizedName.length > 0
    ? `${sanitizedName}-${suffix}`
    : `mod-${suffix}`;
}

export async function installArchiveIntoManagedMods({
  archiveFileName,
  archivePath,
  backupRootDirectory,
  extractArchiveImpl,
  gamePath,
  installDirectoryName,
}: InstallArchiveIntoManagedModsRequest): Promise<InstallArchiveIntoManagedModsResult> {
  const normalizedGamePath = normalizeGamePath(gamePath);
  const layout = await validateGameInstallLayout(normalizedGamePath);
  const extractedDirectory = join(dirname(archivePath), 'extracted');
  const installDirectory = join(
    layout.paksDirectory,
    modsDirectoryName,
    installDirectoryName,
  );

  await mkdir(backupRootDirectory, { recursive: true });

  const backupDirectory = join(
    backupRootDirectory,
    new Date().toISOString().replaceAll(':', '-'),
  );

  try {
    try {
      await extractArchiveImpl(archivePath, { dir: extractedDirectory });
    } catch (error) {
      throw wrapArchiveExtractionError(archiveFileName, error);
    }

    const extractedEntries = await collectInstallableEntries(
      extractedDirectory,
      installDirectory,
    );

    if (extractedEntries.length === 0) {
      throw new Error(
        'The archive did not contain supported Unreal mod assets (.pak, .sig, .ucas, .utoc).',
      );
    }

    const synthesizedEntries = await createMissingSignatureEntries(
      extractedEntries,
      layout.paksDirectory,
    );
    const installEntries = [...extractedEntries, ...synthesizedEntries];
    const copyResult = await copyFilesWithRollback(installEntries, {
      allowedRoot: layout.rootDirectory,
      backupDirectory,
    });
    const ignoredFileCount = await countIgnoredExtractedFiles(
      extractedDirectory,
      installEntries,
    );

    return {
      backupDirectory: copyResult.backupDirectory,
      ignoredFileCount,
      installDirectory,
      installedFiles: copyResult.files.map((file, index) => ({
        action: file.action,
        backupPath: file.backupPath,
        destinationPath: file.destinationPath,
        origin: installEntries[index]?.origin ?? 'archive',
        sourceFileName: basename(file.sourcePath),
      })),
      sigTemplateDirectory: layout.paksDirectory,
      synthesizedSignatureCount: synthesizedEntries.length,
    };
  } finally {
    await rm(extractedDirectory, { force: true, recursive: true });
  }
}

function wrapArchiveExtractionError(fileName: string, error: unknown): Error {
  const archiveFormat = getSupportedGameBananaArchiveFormat(fileName);

  if (!archiveFormat) {
    return error instanceof Error
      ? new Error(`Could not extract ${fileName}: ${error.message}`)
      : new Error(`Could not extract ${fileName}.`);
  }

  return new Error(
    formatArchiveExtractionErrorMessage(archiveFormat, fileName, error),
  );
}

async function collectInstallableEntries(
  extractedDirectory: string,
  installDirectory: string,
): Promise<InstallPlanEntry[]> {
  const filePaths = await findFilesRecursively(extractedDirectory);
  const destinationEntries = new Map<string, InstallPlanEntry>();

  for (const sourcePath of filePaths) {
    const extension = extname(sourcePath).toLowerCase();

    if (!supportedModAssetExtensions.has(extension)) {
      continue;
    }

    const relativeInstallPath = deriveInstallRelativePath(
      extractedDirectory,
      sourcePath,
    );
    const destinationPath = join(installDirectory, relativeInstallPath);
    const destinationKey = destinationPath.toLowerCase();

    if (destinationEntries.has(destinationKey)) {
      throw new Error(
        `The archive maps multiple files to the same install destination: ${destinationPath}`,
      );
    }

    destinationEntries.set(destinationKey, {
      destinationPath,
      origin: 'archive',
      sourcePath,
    });
  }

  return [...destinationEntries.values()];
}

function deriveInstallRelativePath(
  extractedDirectory: string,
  sourcePath: string,
): string {
  const relativeSourcePath = relative(extractedDirectory, sourcePath);
  const segments = relativeSourcePath.split(/[\\/]+/).filter(Boolean);
  const modsSegmentIndex = segments.findIndex(
    (segment) => segment.toLowerCase() === modsDirectoryName,
  );

  if (modsSegmentIndex >= 0 && modsSegmentIndex < segments.length - 1) {
    return join(...segments.slice(modsSegmentIndex + 1));
  }

  const paksSegmentIndex = segments.findIndex(
    (segment) => segment.toLowerCase() === 'paks',
  );

  if (paksSegmentIndex >= 0 && paksSegmentIndex < segments.length - 1) {
    return join(...segments.slice(paksSegmentIndex + 1));
  }

  return basename(sourcePath);
}

async function createMissingSignatureEntries(
  installEntries: readonly InstallPlanEntry[],
  paksDirectory: string,
): Promise<InstallPlanEntry[]> {
  const pakEntries = installEntries.filter(
    (entry) => extname(entry.destinationPath).toLowerCase() === '.pak',
  );
  const existingDestinations = new Set(
    installEntries.map((entry) => entry.destinationPath.toLowerCase()),
  );
  const synthesizedEntries: InstallPlanEntry[] = [];

  if (pakEntries.length === 0) {
    return synthesizedEntries;
  }

  const templatePath = await findFirstSignatureTemplate(paksDirectory);

  for (const pakEntry of pakEntries) {
    const signatureDestinationPath = replaceExtension(
      pakEntry.destinationPath,
      '.sig',
    );
    const signatureKey = signatureDestinationPath.toLowerCase();

    if (existingDestinations.has(signatureKey)) {
      continue;
    }

    if (await pathExists(signatureDestinationPath)) {
      continue;
    }

    if (!templatePath) {
      throw new Error(
        `The mod archive did not include ${basename(signatureDestinationPath)} and no existing .sig template was found in ${paksDirectory}.`,
      );
    }

    existingDestinations.add(signatureKey);
    synthesizedEntries.push({
      destinationPath: signatureDestinationPath,
      origin: 'sig-template',
      sourcePath: templatePath,
    });
  }

  return synthesizedEntries;
}

async function countIgnoredExtractedFiles(
  extractedDirectory: string,
  installEntries: readonly InstallPlanEntry[],
): Promise<number> {
  const allExtractedFiles = await findFilesRecursively(extractedDirectory);
  const installedSources = new Set(
    installEntries
      .filter((entry) => entry.origin === 'archive')
      .map((entry) => resolve(entry.sourcePath).toLowerCase()),
  );

  return allExtractedFiles.filter(
    (filePath) => !installedSources.has(resolve(filePath).toLowerCase()),
  ).length;
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

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    const stats = await stat(candidatePath);
    return stats.isFile();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function replaceExtension(filePath: string, nextExtension: string): string {
  return join(
    dirname(filePath),
    `${basename(filePath, extname(filePath))}${nextExtension}`,
  );
}
