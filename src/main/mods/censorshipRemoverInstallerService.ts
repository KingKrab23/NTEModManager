import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';

import type {
  InstallKnownGameBananaUtilityResult,
  InstalledFrameworkFile,
} from '../../shared/ipc';
import {
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
import { validateGameInstallLayout } from '../filesystem/nteInstallLayout';
import { normalizeGamePath } from '../settings/settingsService';
import type { GameBananaCatalogService } from '../catalog/gameBananaCatalogService';

const censorshipRemoverModId = 675148;
const win64PathSegments = [
  'client',
  'windowsnoeditor',
  'ht',
  'binaries',
  'win64',
] as const;

interface SelectedInstallFile {
  addedAt?: string | null;
  downloadUrl: string;
  fileName: string;
  id: string;
  isArchived: boolean;
}

interface CensorshipRemoverInstallerServiceDependencies {
  backupRootDirectory?: string;
  catalogService: GameBananaCatalogService;
  extractArchiveImpl?: ExtractArchiveFunction;
  fetchImpl?: typeof fetch;
  stagingRootDirectory?: string;
}

export interface CensorshipRemoverInstallerService {
  install: (gamePath: string) => Promise<InstallKnownGameBananaUtilityResult>;
}

export function createCensorshipRemoverInstallerService(
  dependencies: CensorshipRemoverInstallerServiceDependencies,
): CensorshipRemoverInstallerService {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const extractArchiveImpl = dependencies.extractArchiveImpl ?? extractArchive;
  const stagingRootDirectory =
    dependencies.stagingRootDirectory ?? join(tmpdir(), 'nte-mod-manager');
  const backupRootDirectory =
    dependencies.backupRootDirectory ??
    join(tmpdir(), 'nte-mod-manager', 'backups', 'censorship-remover');

  return {
    async install(gamePath) {
      const normalizedGamePath = normalizeGamePath(gamePath);
      const layout = await validateGameInstallLayout(normalizedGamePath);
      const mod = await dependencies.catalogService.getMod(
        censorshipRemoverModId,
      );
      const selectedFile = selectLatestSupportedFile(mod.files);

      await mkdir(stagingRootDirectory, { recursive: true });
      await mkdir(backupRootDirectory, { recursive: true });

      const stagingDirectory = await mkdtemp(
        join(stagingRootDirectory, 'censorship-remover-'),
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

        const installEntries = await collectInstallEntries(
          extractedDirectory,
          layout.binariesDirectory,
        );

        if (installEntries.length === 0) {
          throw new Error(
            'The downloaded archive did not contain any files to install into Win64.',
          );
        }

        const copyResult = await copyFilesWithRollback(installEntries, {
          allowedRoot: layout.rootDirectory,
          backupDirectory,
        });

        return {
          backupDirectory: copyResult.backupDirectory,
          downloadedFileName: selectedFile.fileName,
          downloadUrl: selectedFile.downloadUrl,
          installedFiles: copyResult.files.map(toInstalledFile),
          installDirectory: layout.binariesDirectory,
          modId: mod.id,
          modName: mod.name,
          notes: [
            `Resolved the newest supported file from ${mod.profileUrl}.`,
            `Downloaded ${selectedFile.fileName} from ${selectedFile.downloadUrl}.`,
          ],
          profileUrl: mod.profileUrl,
          selectedFileId: selectedFile.id,
        };
      } finally {
        await rm(stagingDirectory, { force: true, recursive: true });
      }
    },
  };
}

function selectLatestSupportedFile(
  files: readonly SelectedInstallFile[],
): SelectedInstallFile {
  const selectedFile =
    [...files]
      .filter(
        (file) =>
          !file.isArchived &&
          isSupportedGameBananaArchiveFileName(file.fileName),
      )
      .sort((left, right) =>
        (right.addedAt ?? '').localeCompare(left.addedAt ?? ''),
      )[0] ?? null;

  if (!selectedFile) {
    throw new Error(
      'Censorship Remover does not currently expose a supported non-archived .zip, .7z, or .rar file.',
    );
  }

  return selectedFile;
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

  if (!isArchivePayloadSignatureValid(destinationPath, archiveBuffer)) {
    const archiveFormat = getSupportedGameBananaArchiveFormat(
      basename(destinationPath),
    );
    const archiveLabel = archiveFormat
      ? getArchiveSignatureLabel(archiveFormat)
      : 'archive';
    throw new Error(
      `Downloaded ${basename(destinationPath)} does not look like a valid ${archiveLabel} payload. GameBanana may have returned a different file format or an incomplete response.`,
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

async function collectInstallEntries(
  extractedDirectory: string,
  binariesDirectory: string,
): Promise<FileCopyPlanEntry[]> {
  const filePaths = await findFilesRecursively(extractedDirectory);
  const destinationEntries = new Map<string, FileCopyPlanEntry>();

  for (const sourcePath of filePaths) {
    const relativeInstallPath = deriveInstallRelativePath(
      extractedDirectory,
      sourcePath,
    );
    const destinationPath = join(binariesDirectory, relativeInstallPath);
    const destinationKey = destinationPath.toLowerCase();

    if (destinationEntries.has(destinationKey)) {
      throw new Error(
        `The archive maps multiple files to the same Win64 destination: ${destinationPath}`,
      );
    }

    destinationEntries.set(destinationKey, {
      destinationPath,
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
  const win64SegmentIndex = findWin64SegmentIndex(segments);

  if (win64SegmentIndex >= 0 && win64SegmentIndex < segments.length - 1) {
    return join(
      ...segments.slice(win64SegmentIndex + win64PathSegments.length),
    );
  }

  return join(...segments);
}

function findWin64SegmentIndex(segments: readonly string[]): number {
  for (
    let index = 0;
    index <= segments.length - win64PathSegments.length;
    index += 1
  ) {
    const matches = win64PathSegments.every(
      (segment, segmentIndex) =>
        segments[index + segmentIndex]?.toLowerCase() === segment,
    );

    if (matches) {
      return index;
    }
  }

  return -1;
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
      matches.push(resolve(entryPath));
    }
  }

  return matches;
}

function toInstalledFile(file: {
  action: 'created' | 'replaced';
  sourcePath: string;
  destinationPath: string;
}): InstalledFrameworkFile {
  return {
    action: file.action,
    destinationPath: file.destinationPath,
    sourceFileName: basename(file.sourcePath),
  };
}
