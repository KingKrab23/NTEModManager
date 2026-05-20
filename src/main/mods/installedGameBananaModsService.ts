import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  InstallGameBananaModRequest,
  InstallGameBananaModResult,
  InstalledGameBananaModSummary,
  UninstallGameBananaModRequest,
  UninstallGameBananaModResult,
  UpdateInstalledGameBananaModRequest,
  UpdateInstalledGameBananaModResult,
} from '../../shared/mods';
import { restoreInstalledModFilesWithRollback } from '../filesystem/installedModTransaction';
import { validateGameInstallLayout } from '../filesystem/nteInstallLayout';
import {
  type DetailedInstallGameBananaModResult,
  type GameBananaModInstallerService,
} from './gameBananaModInstallerService';
import {
  type InstalledGameBananaModRecord,
  type InstalledGameBananaModsRepository,
} from './jsonInstalledGameBananaModsRepository';

interface InstalledGameBananaModsServiceDependencies {
  installerService: GameBananaModInstallerService;
  repository: InstalledGameBananaModsRepository;
  rollbackRootDirectory?: string;
}

export interface InstalledGameBananaModsService {
  install: (
    gamePath: string,
    request: InstallGameBananaModRequest,
  ) => Promise<InstallGameBananaModResult>;
  list: () => Promise<InstalledGameBananaModSummary[]>;
  uninstall: (
    gamePath: string,
    request: UninstallGameBananaModRequest,
  ) => Promise<UninstallGameBananaModResult>;
  updateToLatest: (
    gamePath: string,
    request: UpdateInstalledGameBananaModRequest,
  ) => Promise<UpdateInstalledGameBananaModResult>;
}

export function createInstalledGameBananaModsService(
  dependencies: InstalledGameBananaModsServiceDependencies,
): InstalledGameBananaModsService {
  const rollbackRootDirectory =
    dependencies.rollbackRootDirectory ??
    join(tmpdir(), 'nte-mod-manager', 'rollbacks', 'mods');

  return {
    async install(gamePath, request) {
      return installRecordedMod(
        dependencies,
        rollbackRootDirectory,
        gamePath,
        request,
      );
    },
    async list() {
      const records = await dependencies.repository.read();

      return records
        .slice()
        .sort((left, right) =>
          right.installedAt.localeCompare(left.installedAt),
        )
        .map((record) => ({
          installedAt: record.installedAt,
          installedFileId: record.installedFileId,
          installedFileName: record.installedFileName,
          installedFilesCount: record.installedFiles.length,
          installedVersion: record.installedVersion,
          modId: record.modId,
          modName: record.modName,
          ownerName: record.ownerName,
          previewImageUrl: record.previewImageUrl,
          profileUrl: record.profileUrl,
        }));
    },
    async uninstall(gamePath, request) {
      const records = await dependencies.repository.read();
      const record = records.find((item) => item.modId === request.modId);

      if (!record) {
        throw new Error(`No installed mod record exists for ${request.modId}.`);
      }

      await uninstallRecordedMod(gamePath, record, rollbackRootDirectory);
      await dependencies.repository.write(
        records.filter((item) => item.modId !== request.modId),
      );

      return {
        modId: record.modId,
        modName: record.modName,
        notes: [
          `Removed ${record.modName} from the installed-mod registry.`,
          record.backupDirectory
            ? `Restored replaced files from ${record.backupDirectory}.`
            : 'No replaced files needed to be restored during uninstall.',
        ],
        removedFiles: record.installedFiles.map((file) => ({
          action: file.action,
          destinationPath: file.destinationPath,
          origin: file.origin,
          sourceFileName: file.sourceFileName,
        })),
      };
    },
    async updateToLatest(gamePath, request) {
      const records = await dependencies.repository.read();
      const record = records.find((item) => item.modId === request.modId);

      if (!record) {
        throw new Error(`No installed mod record exists for ${request.modId}.`);
      }

      const latestInstallResult =
        await dependencies.installerService.inspectLatest(request.modId);

      if (latestInstallResult.selectedFileId === record.installedFileId) {
        return {
          backupDirectory: null,
          downloadedFileName: null,
          downloadUrl: null,
          installedFiles: [],
          modId: record.modId,
          modName: record.modName,
          notes: [
            `${record.modName} is already on the newest supported GameBanana file (${record.installedFileName}).`,
          ],
          previousFileId: record.installedFileId,
          selectedFileId: record.installedFileId,
          sigTemplateDirectory: null,
          status: 'already-latest',
        };
      }

      const installResult = await installRecordedMod(
        dependencies,
        rollbackRootDirectory,
        gamePath,
        {
          fileId: latestInstallResult.selectedFileId,
          modId: record.modId,
        },
      );

      return {
        backupDirectory: installResult.backupDirectory,
        downloadedFileName: installResult.downloadedFileName,
        downloadUrl: installResult.downloadUrl,
        installedFiles: installResult.installedFiles,
        modId: installResult.modId,
        modName: installResult.modName,
        notes: installResult.notes,
        previousFileId: record.installedFileId,
        selectedFileId: installResult.selectedFileId,
        sigTemplateDirectory: installResult.sigTemplateDirectory,
        status: 'updated',
      };
    },
  };
}

async function installRecordedMod(
  dependencies: InstalledGameBananaModsServiceDependencies,
  rollbackRootDirectory: string,
  gamePath: string,
  request: InstallGameBananaModRequest,
): Promise<InstallGameBananaModResult> {
  const records = await dependencies.repository.read();
  const existingRecord =
    records.find((record) => record.modId === request.modId) ?? null;

  if (existingRecord) {
    await uninstallRecordedMod(gamePath, existingRecord, rollbackRootDirectory);
  }

  const installResult = await dependencies.installerService.install(
    gamePath,
    request,
  );
  const nextRecord = createRecordFromInstallResult(installResult);
  const nextRecords = records.filter(
    (record) => record.modId !== nextRecord.modId,
  );

  nextRecords.push(nextRecord);
  await dependencies.repository.write(nextRecords);

  return {
    ...toPublicInstallResult(installResult),
    previousFileId: existingRecord?.installedFileId ?? null,
    status: existingRecord ? 'updated' : 'installed',
  };
}

function toPublicInstallResult(
  result: DetailedInstallGameBananaModResult,
): Omit<InstallGameBananaModResult, 'previousFileId' | 'status'> {
  return {
    backupDirectory: result.backupDirectory,
    downloadedFileName: result.downloadedFileName,
    downloadUrl: result.downloadUrl,
    installedFiles: result.installedFiles.map((file) => ({
      action: file.action,
      destinationPath: file.destinationPath,
      origin: file.origin,
      sourceFileName: file.sourceFileName,
    })),
    modId: result.modId,
    modName: result.modName,
    notes: result.notes,
    selectedFileId: result.selectedFileId,
    sigTemplateDirectory: result.sigTemplateDirectory,
  };
}

function createRecordFromInstallResult(
  result: DetailedInstallGameBananaModResult,
): InstalledGameBananaModRecord {
  return {
    backupDirectory: result.backupDirectory,
    installedAt: result.installedAt,
    installedFileId: result.selectedFileId,
    installedFileName: result.downloadedFileName,
    installedFiles: result.installedFiles.map((file) => ({
      action: file.action,
      backupPath: file.backupPath,
      destinationPath: file.destinationPath,
      origin: file.origin,
      sourceFileName: file.sourceFileName,
    })),
    installedVersion: result.selectedFileVersion,
    modId: result.modId,
    modName: result.modName,
    ownerName: result.ownerName,
    previewImageUrl: result.previewImageUrl,
    profileUrl: result.profileUrl,
    sigTemplateDirectory: result.sigTemplateDirectory,
  };
}

async function uninstallRecordedMod(
  gamePath: string,
  record: InstalledGameBananaModRecord,
  rollbackRootDirectory: string,
): Promise<void> {
  const layout = await validateGameInstallLayout(gamePath);

  await mkdir(rollbackRootDirectory, { recursive: true });
  const rollbackDirectory = await mkdtemp(
    join(rollbackRootDirectory, 'installed-mod-'),
  );

  try {
    await restoreInstalledModFilesWithRollback(record.installedFiles, {
      allowedRoot: layout.rootDirectory,
      rollbackDirectory,
    });
  } finally {
    await rm(rollbackDirectory, { force: true, recursive: true });
  }
}
