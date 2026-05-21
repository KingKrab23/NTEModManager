import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  InstallGameBananaModRequest,
  InstallGameBananaModResult,
  InstalledGameBananaModSummary,
  SetInstalledGameBananaModEnabledRequest,
  SetInstalledGameBananaModEnabledResult,
  UninstallGameBananaModRequest,
  UninstallGameBananaModResult,
  UpdateInstalledGameBananaModRequest,
  UpdateInstalledGameBananaModResult,
} from '../../shared/mods';
import {
  isSupportedGameBananaArchiveFileName,
  type CatalogModFile,
} from '../../shared/catalog';
import { moveDirectoryWithinRoot } from '../filesystem/directoryTransaction';
import { restoreInstalledModFilesWithRollback } from '../filesystem/installedModTransaction';
import { validateGameInstallLayout } from '../filesystem/nteInstallLayout';
import {
  type DetailedInstallGameBananaModResult,
  type GameBananaModInstallerService,
} from './gameBananaModInstallerService';
import {
  getManagedModDirectoryPaths,
  inferManagedModDirectoryName,
} from './managedModDirectory';
import {
  type InstalledGameBananaModRecord,
  type InstalledGameBananaModsRepository,
} from './jsonInstalledGameBananaModsRepository';

interface InstalledGameBananaModsServiceDependencies {
  disabledStorageRootDirectory?: string;
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
  setEnabled: (
    gamePath: string,
    request: SetInstalledGameBananaModEnabledRequest,
  ) => Promise<SetInstalledGameBananaModEnabledResult>;
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
  const disabledStorageRootDirectory =
    dependencies.disabledStorageRootDirectory ??
    join(tmpdir(), 'nte-mod-manager', 'backups', 'mods', 'disabled');

  return {
    async install(gamePath, request) {
      return installRecordedMod(
        dependencies,
        disabledStorageRootDirectory,
        rollbackRootDirectory,
        gamePath,
        request,
      );
    },
    async list() {
      const records = await dependencies.repository.read();
      const sortedRecords = records
        .slice()
        .sort((left, right) =>
          right.installedAt.localeCompare(left.installedAt),
        );

      return Promise.all(
        sortedRecords.map(async (record) => {
          const liveFiles = await loadLiveFilesForRecord(dependencies, record);

          return {
            availableFiles: liveFiles,
            installedAt: record.installedAt,
            installedFileId: record.installedFileId,
            installedFileName: record.installedFileName,
            installedFilesCount: record.installedFiles.length,
            installedVersion: record.installedVersion,
            isEnabled: isRecordEnabled(record),
            modId: record.modId,
            modName: record.modName,
            ownerName: record.ownerName,
            previewImageUrl: record.previewImageUrl,
            profileUrl: record.profileUrl,
            selectedUpdateFileId: pickSelectedUpdateFileId(
              liveFiles,
              record.installedFileId,
            ),
          };
        }),
      );
    },
    async setEnabled(gamePath, request) {
      const records = await dependencies.repository.read();
      const record = records.find((item) => item.modId === request.modId);

      if (!record) {
        throw new Error(`No installed mod record exists for ${request.modId}.`);
      }

      const alreadyInRequestedState =
        request.enabled === isRecordEnabled(record);

      if (alreadyInRequestedState) {
        return {
          isEnabled: request.enabled,
          modId: record.modId,
          modName: record.modName,
          notes: [
            request.enabled
              ? `${record.modName} is already enabled in the active ~mods directory.`
              : `${record.modName} is already parked in mod backup storage.`,
          ],
          status: request.enabled ? 'already-enabled' : 'already-disabled',
        };
      }

      await setRecordedModDirectoryState(
        gamePath,
        record,
        request.enabled,
        disabledStorageRootDirectory,
      );

      const updatedRecord: InstalledGameBananaModRecord = {
        ...record,
        isEnabled: request.enabled,
      };
      await dependencies.repository.write(
        records.map((item) =>
          item.modId === record.modId ? updatedRecord : item,
        ),
      );

      return {
        isEnabled: request.enabled,
        modId: record.modId,
        modName: record.modName,
        notes: [
          request.enabled
            ? `Moved ${record.modName} back into the active ~mods directory.`
            : `Moved ${record.modName} into mod backup storage.`,
        ],
        status: request.enabled ? 'enabled' : 'disabled',
      };
    },
    async uninstall(gamePath, request) {
      const records = await dependencies.repository.read();
      let record = records.find((item) => item.modId === request.modId);

      if (!record) {
        throw new Error(`No installed mod record exists for ${request.modId}.`);
      }

      if (!isRecordEnabled(record)) {
        await setRecordedModDirectoryState(
          gamePath,
          record,
          true,
          disabledStorageRootDirectory,
        );
        const enabledRecord: InstalledGameBananaModRecord = {
          ...record,
          isEnabled: true,
        };
        record = enabledRecord;
        await dependencies.repository.write(
          records.map((item) =>
            item.modId === enabledRecord.modId ? enabledRecord : item,
          ),
        );
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
      let records = await dependencies.repository.read();
      let record = records.find((item) => item.modId === request.modId);

      if (!record) {
        throw new Error(`No installed mod record exists for ${request.modId}.`);
      }

      const shouldReturnToDisabledState = !isRecordEnabled(record);

      if (shouldReturnToDisabledState) {
        await setRecordedModDirectoryState(
          gamePath,
          record,
          true,
          disabledStorageRootDirectory,
        );
        const enabledRecord: InstalledGameBananaModRecord = {
          ...record,
          isEnabled: true,
        };
        record = enabledRecord;
        records = records.map((item) =>
          item.modId === enabledRecord.modId ? enabledRecord : item,
        );
        await dependencies.repository.write(records);
      }

      const latestInstallResult =
        await dependencies.installerService.inspectLatest(request.modId);
      const requestedFileId =
        request.fileId ?? latestInstallResult.selectedFileId;

      if (requestedFileId === record.installedFileId) {
        if (shouldReturnToDisabledState) {
          await setRecordedModDirectoryState(
            gamePath,
            record,
            false,
            disabledStorageRootDirectory,
          );
          const restoredRecord = { ...record, isEnabled: false };
          await dependencies.repository.write(
            records.map((item) =>
              item.modId === record.modId ? restoredRecord : item,
            ),
          );
        }

        return {
          backupDirectory: null,
          downloadedFileName: null,
          downloadUrl: null,
          installedFiles: [],
          modId: record.modId,
          modName: record.modName,
          notes: [
            request.fileId
              ? `${record.modName} is already using the selected GameBanana file (${record.installedFileName}).`
              : `${record.modName} is already on the newest supported GameBanana file (${record.installedFileName}).`,
            ...(shouldReturnToDisabledState
              ? [`${record.modName} remains disabled.`]
              : []),
          ],
          previousFileId: record.installedFileId,
          selectedFileId: record.installedFileId,
          sigTemplateDirectory: null,
          status: 'already-latest',
        };
      }

      const installResult = await installRecordedMod(
        dependencies,
        disabledStorageRootDirectory,
        rollbackRootDirectory,
        gamePath,
        {
          fileId: requestedFileId,
          modId: record.modId,
        },
      );

      if (shouldReturnToDisabledState) {
        const updatedRecords = await dependencies.repository.read();
        const updatedRecord = updatedRecords.find(
          (item) => item.modId === record.modId,
        );

        if (updatedRecord) {
          await setRecordedModDirectoryState(
            gamePath,
            updatedRecord,
            false,
            disabledStorageRootDirectory,
          );
          await dependencies.repository.write(
            updatedRecords.map((item) =>
              item.modId === updatedRecord.modId
                ? { ...updatedRecord, isEnabled: false }
                : item,
            ),
          );
        }
      }

      return {
        backupDirectory: installResult.backupDirectory,
        downloadedFileName: installResult.downloadedFileName,
        downloadUrl: installResult.downloadUrl,
        installedFiles: installResult.installedFiles,
        modId: installResult.modId,
        modName: installResult.modName,
        notes: shouldReturnToDisabledState
          ? [
              ...installResult.notes,
              `${installResult.modName} remains disabled.`,
            ]
          : installResult.notes,
        previousFileId: record.installedFileId,
        selectedFileId: installResult.selectedFileId,
        sigTemplateDirectory: installResult.sigTemplateDirectory,
        status: 'updated',
      };
    },
  };
}

async function loadLiveFilesForRecord(
  dependencies: InstalledGameBananaModsServiceDependencies,
  record: InstalledGameBananaModRecord,
): Promise<CatalogModFile[]> {
  try {
    const latestInstallResult =
      await dependencies.installerService.inspectLatest(record.modId);
    return latestInstallResult.files;
  } catch {
    return [];
  }
}

function pickSelectedUpdateFileId(
  files: readonly CatalogModFile[],
  installedFileId: string,
): string | null {
  const installedFile = files.find((file) => file.id === installedFileId);

  if (installedFile && isSelectableCatalogModFile(installedFile)) {
    return installedFile.id;
  }

  return files.find((file) => isSelectableCatalogModFile(file))?.id ?? null;
}

function isSelectableCatalogModFile(file: CatalogModFile): boolean {
  return (
    !file.isArchived && isSupportedGameBananaArchiveFileName(file.fileName)
  );
}

async function installRecordedMod(
  dependencies: InstalledGameBananaModsServiceDependencies,
  disabledStorageRootDirectory: string,
  rollbackRootDirectory: string,
  gamePath: string,
  request: InstallGameBananaModRequest,
): Promise<InstallGameBananaModResult> {
  const records = await dependencies.repository.read();
  let existingRecord =
    records.find((record) => record.modId === request.modId) ?? null;

  if (existingRecord) {
    if (!isRecordEnabled(existingRecord)) {
      await setRecordedModDirectoryState(
        gamePath,
        existingRecord,
        true,
        disabledStorageRootDirectory,
      );
      existingRecord = {
        ...existingRecord,
        isEnabled: true,
      };
      await dependencies.repository.write(
        records.map((record) =>
          record.modId === existingRecord?.modId ? existingRecord : record,
        ),
      );
    }

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
    installDirectoryName: inferManagedModDirectoryName({
      installedFiles: result.installedFiles,
      modId: result.modId,
      modName: result.modName,
      sigTemplateDirectory: result.sigTemplateDirectory,
    }),
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
    isEnabled: true,
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

function isRecordEnabled(record: InstalledGameBananaModRecord): boolean {
  return record.isEnabled !== false;
}

async function setRecordedModDirectoryState(
  gamePath: string,
  record: InstalledGameBananaModRecord,
  enabled: boolean,
  disabledStorageRootDirectory: string,
): Promise<void> {
  const layout = await validateGameInstallLayout(gamePath);
  const installDirectoryName = inferManagedModDirectoryName({
    installDirectoryName: record.installDirectoryName,
    installedFiles: record.installedFiles,
    modId: record.modId,
    modName: record.modName,
    sigTemplateDirectory: record.sigTemplateDirectory,
  });
  const { disabledDirectoryPath, enabledDirectoryPath } =
    getManagedModDirectoryPaths(
      record.sigTemplateDirectory,
      installDirectoryName,
      {
        disabledStorageRootDirectory,
      },
    );

  await moveDirectoryWithinRoot(
    enabled ? disabledDirectoryPath : enabledDirectoryPath,
    enabled ? enabledDirectoryPath : disabledDirectoryPath,
    {
      additionalAllowedRoots: [disabledStorageRootDirectory],
      allowedRoot: layout.rootDirectory,
    },
  );
}
