import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

import type {
  InstallGameBananaModRequest,
  InstallGameBananaModResult,
  InstalledModFileOrigin,
} from '../../shared/mods';
import {
  type CatalogModFile,
  getSupportedGameBananaArchiveFormat,
  isSupportedGameBananaArchiveFileName,
} from '../../shared/catalog';
import {
  extractArchive,
  formatArchiveExtractionErrorMessage,
  getArchiveSignatureLabel,
  isArchivePayloadSignatureValid,
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
import type { GameBananaCatalogService } from '../catalog/gameBananaCatalogService';

const supportedModAssetExtensions = new Set(['.pak', '.sig', '.ucas', '.utoc']);
const modsDirectoryName = '~mods';

interface InstallPlanEntry extends FileCopyPlanEntry {
  origin: InstalledModFileOrigin;
}

interface SelectedInstallFile {
  downloadUrl: string;
  fileName: string;
  id: string;
  isArchived: boolean;
  version: string | null;
}

interface GameBananaModInstallerServiceDependencies {
  backupRootDirectory?: string;
  catalogService: GameBananaCatalogService;
  extractArchiveImpl?: ExtractArchiveFunction;
  fetchImpl?: typeof fetch;
  stagingRootDirectory?: string;
}

export interface GameBananaModInstallerService {
  inspectLatest: (modId: number) => Promise<{
    files: CatalogModFile[];
    modId: number;
    modName: string;
    selectedFileId: string;
  }>;
  install: (
    gamePath: string,
    request: InstallGameBananaModRequest,
  ) => Promise<DetailedInstallGameBananaModResult>;
}

export interface DetailedInstalledModFile {
  action: 'created' | 'replaced';
  backupPath: string | null;
  destinationPath: string;
  origin: InstalledModFileOrigin;
  sourceFileName: string;
}

export interface DetailedInstallGameBananaModResult extends InstallGameBananaModResult {
  installedAt: string;
  installedFiles: DetailedInstalledModFile[];
  ownerName: string;
  previewImageUrl: string | null;
  profileUrl: string;
  selectedFileVersion: string | null;
}

export function createGameBananaModInstallerService(
  dependencies: GameBananaModInstallerServiceDependencies,
): GameBananaModInstallerService {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const extractArchiveImpl = dependencies.extractArchiveImpl ?? extractArchive;
  const stagingRootDirectory =
    dependencies.stagingRootDirectory ?? join(tmpdir(), 'nte-mod-manager');
  const backupRootDirectory =
    dependencies.backupRootDirectory ??
    join(tmpdir(), 'nte-mod-manager', 'backups', 'mods');

  return {
    async inspectLatest(modId) {
      const mod = await dependencies.catalogService.getMod(modId);
      const selectedFile = selectInstallFile(mod.files, null);

      return {
        files: mod.files,
        modId: mod.id,
        modName: mod.name,
        selectedFileId: selectedFile.id,
      };
    },
    async install(gamePath, request) {
      const normalizedGamePath = normalizeGamePath(gamePath);
      const layout = await validateGameInstallLayout(normalizedGamePath);
      const mod = await dependencies.catalogService.getMod(request.modId);
      const selectedFile = selectInstallFile(mod.files, request.fileId);

      await mkdir(stagingRootDirectory, { recursive: true });
      await mkdir(backupRootDirectory, { recursive: true });

      const stagingDirectory = await mkdtemp(
        join(stagingRootDirectory, 'mod-install-'),
      );

      try {
        const archivePath = join(stagingDirectory, selectedFile.fileName);
        const extractedDirectory = join(stagingDirectory, 'extracted');
        const backupDirectory = join(
          backupRootDirectory,
          new Date().toISOString().replaceAll(':', '-'),
        );

        await downloadToFile(fetchImpl, selectedFile.downloadUrl, archivePath);

        try {
          await extractArchiveImpl(archivePath, { dir: extractedDirectory });
        } catch (error) {
          throw wrapArchiveExtractionError(selectedFile.fileName, error);
        }

        const extractedEntries = await collectInstallableEntries(
          extractedDirectory,
          join(
            layout.paksDirectory,
            modsDirectoryName,
            formatModInstallDirectoryName(mod.name, mod.id),
          ),
        );

        if (extractedEntries.length === 0) {
          throw new Error(
            'The downloaded archive did not contain supported Unreal mod assets (.pak, .sig, .ucas, .utoc).',
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
        const notes = [
          `Downloaded ${selectedFile.fileName} from ${selectedFile.downloadUrl}.`,
        ];

        if (synthesizedEntries.length > 0) {
          notes.push(
            `Created ${synthesizedEntries.length} missing .sig file${synthesizedEntries.length === 1 ? '' : 's'} from an existing Pak signature template.`,
          );
        }

        if (ignoredFileCount > 0) {
          notes.push(
            `Ignored ${ignoredFileCount} extracted file${ignoredFileCount === 1 ? '' : 's'} that were not recognized as installable Unreal mod assets.`,
          );
        }

        return {
          backupDirectory: copyResult.backupDirectory,
          downloadedFileName: selectedFile.fileName,
          downloadUrl: selectedFile.downloadUrl,
          installedAt: new Date().toISOString(),
          installedFiles: copyResult.files.map((file, index) => ({
            action: file.action,
            backupPath: file.backupPath,
            destinationPath: file.destinationPath,
            origin: installEntries[index]?.origin ?? 'archive',
            sourceFileName: basename(file.sourcePath),
          })),
          modId: mod.id,
          modName: mod.name,
          notes,
          ownerName: mod.ownerName,
          previewImageUrl: mod.previewImageUrl,
          previousFileId: null,
          profileUrl: mod.profileUrl,
          selectedFileId: selectedFile.id,
          selectedFileVersion: selectedFile.version,
          status: 'installed',
          sigTemplateDirectory: layout.paksDirectory,
        };
      } finally {
        await rm(stagingDirectory, { force: true, recursive: true });
      }
    },
  };
}

function selectInstallFile(
  files: readonly SelectedInstallFile[],
  requestedFileId: string | null,
): SelectedInstallFile {
  if (requestedFileId) {
    const selectedFile = files.find((file) => file.id === requestedFileId);

    if (!selectedFile) {
      throw new Error(
        `The selected file ${requestedFileId} was not found for this mod.`,
      );
    }

    if (selectedFile.isArchived) {
      throw new Error(
        'Archived GameBanana files cannot be installed from this browser.',
      );
    }

    if (!isSupportedGameBananaArchiveFileName(selectedFile.fileName)) {
      throw new Error(
        `The selected file ${selectedFile.fileName} is not a supported .zip, .7z, or .rar archive.`,
      );
    }

    return selectedFile;
  }

  const preferredFile =
    files.find(
      (file) =>
        !file.isArchived && isSupportedGameBananaArchiveFileName(file.fileName),
    ) ?? null;

  if (!preferredFile) {
    throw new Error(
      'This mod does not expose a supported non-archived .zip, .7z, or .rar file. The installer currently supports those archive formats only.',
    );
  }

  return preferredFile;
}

async function downloadToFile(
  fetchImpl: typeof fetch,
  sourceUrl: string,
  destinationPath: string,
): Promise<void> {
  const response = await fetchImpl(sourceUrl, {
    headers: {
      'User-Agent': 'NTE-Mod-Manager',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download ${sourceUrl} (${response.status} ${response.statusText}).`,
    );
  }

  const archiveBuffer = Buffer.from(await response.arrayBuffer());
  const archiveFormat = getSupportedGameBananaArchiveFormat(
    basename(destinationPath),
  );

  if (
    !archiveFormat ||
    !isArchivePayloadSignatureValid(destinationPath, archiveBuffer)
  ) {
    throw new Error(
      `Downloaded ${basename(destinationPath)} does not look like a valid ${archiveFormat ? getArchiveSignatureLabel(archiveFormat) : 'archive'} payload. GameBanana may have returned a different file format or an incomplete response.`,
    );
  }

  await writeFile(destinationPath, archiveBuffer);
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
  paksDirectory: string,
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
    const destinationPath = join(paksDirectory, relativeInstallPath);
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

function formatModInstallDirectoryName(modName: string, modId: number): string {
  const sanitizedName = modName
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[ .]+$/g, '')
    .slice(0, 60);

  return sanitizedName.length > 0
    ? `${sanitizedName}-${modId}`
    : `mod-${modId}`;
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
