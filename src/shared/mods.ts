import type { CatalogModFile } from './catalog';

export type InstalledModFileAction = 'created' | 'replaced';
export type InstalledModFileOrigin = 'archive' | 'sig-template';

export interface InstallGameBananaModRequest {
  fileId: string | null;
  modId: number;
}

export interface InstalledGameBananaModSummary {
  availableFiles: CatalogModFile[];
  installedAt: string;
  installedFileId: string;
  installedFileName: string;
  installedFilesCount: number;
  installedVersion: string | null;
  isEnabled: boolean;
  modId: number;
  modName: string;
  ownerName: string;
  previewImageUrl: string | null;
  profileUrl: string;
  selectedUpdateFileId: string | null;
}

export interface InstalledModFile {
  action: InstalledModFileAction;
  destinationPath: string;
  origin: InstalledModFileOrigin;
  sourceFileName: string;
}

export interface InstallGameBananaModResult {
  backupDirectory: string | null;
  downloadedFileName: string;
  downloadUrl: string;
  installedFiles: InstalledModFile[];
  modId: number;
  modName: string;
  notes: string[];
  previousFileId: string | null;
  selectedFileId: string;
  status: 'installed' | 'updated';
  sigTemplateDirectory: string;
}

export interface UpdateInstalledGameBananaModRequest {
  fileId: string | null;
  modId: number;
}

export interface SetInstalledGameBananaModEnabledRequest {
  enabled: boolean;
  modId: number;
}

export interface UpdateInstalledGameBananaModResult {
  backupDirectory: string | null;
  downloadedFileName: string | null;
  downloadUrl: string | null;
  installedFiles: InstalledModFile[];
  modId: number;
  modName: string;
  notes: string[];
  previousFileId: string;
  selectedFileId: string;
  status: 'already-latest' | 'updated';
  sigTemplateDirectory: string | null;
}

export interface SetInstalledGameBananaModEnabledResult {
  isEnabled: boolean;
  modId: number;
  modName: string;
  notes: string[];
  status: 'already-disabled' | 'already-enabled' | 'disabled' | 'enabled';
}

export interface UninstallGameBananaModRequest {
  modId: number;
}

export interface UninstallGameBananaModResult {
  modId: number;
  modName: string;
  notes: string[];
  removedFiles: InstalledModFile[];
}
