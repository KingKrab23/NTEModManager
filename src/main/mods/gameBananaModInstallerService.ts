import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import type {
  InstallGameBananaModRequest,
  InstallGameBananaModResult,
} from '../../shared/mods';
import {
  type CatalogModFile,
  getSupportedGameBananaArchiveFormat,
  isSupportedGameBananaArchiveFileName,
} from '../../shared/catalog';
import {
  extractArchive,
  getArchiveSignatureLabel,
  isArchivePayloadSignatureValid,
  type ExtractArchiveFunction,
} from '../filesystem/archiveExtractor';
import type { GameBananaCatalogService } from '../catalog/gameBananaCatalogService';
import {
  type DetailedInstalledModFile,
  ensureSupportedArchiveFileName,
  formatManagedModInstallDirectoryName,
  installArchiveIntoManagedMods,
} from './archiveModInstallShared';

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

export type { DetailedInstalledModFile } from './archiveModInstallShared';

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
      const mod = await dependencies.catalogService.getMod(request.modId);
      const selectedFile = selectInstallFile(mod.files, request.fileId);

      await mkdir(stagingRootDirectory, { recursive: true });

      const stagingDirectory = await mkdtemp(
        join(stagingRootDirectory, 'mod-install-'),
      );

      try {
        const archivePath = join(stagingDirectory, selectedFile.fileName);

        await downloadToFile(fetchImpl, selectedFile.downloadUrl, archivePath);

        const installResult = await installArchiveIntoManagedMods({
          archiveFileName: selectedFile.fileName,
          archivePath,
          backupRootDirectory,
          extractArchiveImpl,
          gamePath,
          installDirectoryName: formatManagedModInstallDirectoryName(
            mod.name,
            String(mod.id),
          ),
        });
        const notes = [
          `Downloaded ${selectedFile.fileName} from ${selectedFile.downloadUrl}.`,
        ];

        if (installResult.synthesizedSignatureCount > 0) {
          notes.push(
            `Created ${installResult.synthesizedSignatureCount} missing .sig file${installResult.synthesizedSignatureCount === 1 ? '' : 's'} from an existing Pak signature template.`,
          );
        }

        if (installResult.ignoredFileCount > 0) {
          notes.push(
            `Ignored ${installResult.ignoredFileCount} extracted file${installResult.ignoredFileCount === 1 ? '' : 's'} that were not recognized as installable Unreal mod assets.`,
          );
        }

        return {
          backupDirectory: installResult.backupDirectory,
          downloadedFileName: selectedFile.fileName,
          downloadUrl: selectedFile.downloadUrl,
          installedAt: new Date().toISOString(),
          installedFiles: installResult.installedFiles,
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
          sigTemplateDirectory: installResult.sigTemplateDirectory,
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

    ensureSupportedArchiveFileName(selectedFile.fileName);

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
