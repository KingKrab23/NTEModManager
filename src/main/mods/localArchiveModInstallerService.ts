import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

import { getSupportedGameBananaArchiveFormat } from '../../shared/catalog';
import type { InstallLocalArchiveModResult } from '../../shared/mods';
import {
  extractArchive,
  getArchiveSignatureLabel,
  isArchivePayloadSignatureValid,
  type ExtractArchiveFunction,
} from '../filesystem/archiveExtractor';
import {
  ensureSupportedArchiveFileName,
  formatManagedModInstallDirectoryName,
  installArchiveIntoManagedMods,
} from './archiveModInstallShared';

interface LocalArchiveModInstallerServiceDependencies {
  backupRootDirectory?: string;
  extractArchiveImpl?: ExtractArchiveFunction;
  stagingRootDirectory?: string;
}

export interface LocalArchiveModInstallerService {
  install: (
    gamePath: string,
    archivePath: string,
  ) => Promise<InstallLocalArchiveModResult>;
}

export function createLocalArchiveModInstallerService(
  dependencies: LocalArchiveModInstallerServiceDependencies = {},
): LocalArchiveModInstallerService {
  const extractArchiveImpl = dependencies.extractArchiveImpl ?? extractArchive;
  const stagingRootDirectory =
    dependencies.stagingRootDirectory ?? join(tmpdir(), 'nte-mod-manager');
  const backupRootDirectory =
    dependencies.backupRootDirectory ??
    join(tmpdir(), 'nte-mod-manager', 'backups', 'local-mods');

  return {
    async install(gamePath, archivePath) {
      const trimmedArchivePath = archivePath.trim();

      if (trimmedArchivePath.length === 0) {
        throw new Error(
          'Choose a local .zip, .7z, or .rar archive before installing.',
        );
      }

      const archiveFileName = basename(trimmedArchivePath);
      ensureSupportedArchiveFileName(archiveFileName);

      const archiveStats = await stat(trimmedArchivePath).catch(() => null);

      if (!archiveStats?.isFile()) {
        throw new Error(
          `Could not find the selected archive at ${archivePath}.`,
        );
      }

      await mkdir(stagingRootDirectory, { recursive: true });

      const stagingDirectory = await mkdtemp(
        join(stagingRootDirectory, 'local-mod-install-'),
      );

      try {
        const archiveBuffer = await readValidatedArchiveBuffer(
          trimmedArchivePath,
          archiveFileName,
        );
        const stagedArchivePath = join(stagingDirectory, archiveFileName);

        await writeFile(stagedArchivePath, archiveBuffer);

        const modName = deriveLocalArchiveModName(archiveFileName);
        const installResult = await installArchiveIntoManagedMods({
          archiveFileName,
          archivePath: stagedArchivePath,
          backupRootDirectory,
          extractArchiveImpl,
          gamePath,
          installDirectoryName: formatManagedModInstallDirectoryName(
            modName,
            'local',
          ),
        });
        const notes = [
          `Copied ${archiveFileName} from ${trimmedArchivePath}.`,
          `Installed into ${installResult.installDirectory}.`,
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
          archiveFileName,
          archivePath: trimmedArchivePath,
          backupDirectory: installResult.backupDirectory,
          installDirectory: installResult.installDirectory,
          installedFiles: installResult.installedFiles.map((file) => ({
            action: file.action,
            destinationPath: file.destinationPath,
            origin: file.origin,
            sourceFileName: file.sourceFileName,
          })),
          modName,
          notes,
          sigTemplateDirectory: installResult.sigTemplateDirectory,
        };
      } finally {
        await rm(stagingDirectory, { force: true, recursive: true });
      }
    },
  };
}

async function readValidatedArchiveBuffer(
  archivePath: string,
  archiveFileName: string,
): Promise<Buffer> {
  const archiveBuffer = await readFile(archivePath);
  const archiveFormat = getSupportedGameBananaArchiveFormat(archiveFileName);

  if (
    !archiveFormat ||
    !isArchivePayloadSignatureValid(archivePath, archiveBuffer)
  ) {
    throw new Error(
      `Selected file ${archiveFileName} does not look like a valid ${archiveFormat ? getArchiveSignatureLabel(archiveFormat) : 'archive'} payload.`,
    );
  }

  return archiveBuffer;
}

function deriveLocalArchiveModName(archiveFileName: string): string {
  const baseName = basename(archiveFileName, extname(archiveFileName));
  const normalizedName = baseName.replace(/[_-]+/g, ' ').trim();

  return normalizedName.length > 0 ? normalizedName : archiveFileName;
}
