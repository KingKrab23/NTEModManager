import type { AppSettings } from './settings';

export const appIpcChannels = {
  chooseGameDirectory: 'app:choose-game-directory',
  getSettings: 'app:get-settings',
  installModFramework: 'app:install-mod-framework',
} as const;

export interface ChooseGameDirectoryResult {
  canceled: boolean;
  settings: AppSettings;
}

export type InstalledFrameworkFileAction = 'created' | 'replaced';

export interface InstalledFrameworkFile {
  action: InstalledFrameworkFileAction;
  destinationPath: string;
  sourceFileName: string;
}

export interface FrameworkDownloadSource {
  assetName: string;
  name: string;
  releaseUrl: string;
  version: string;
}

export interface InstallModFrameworkResult {
  backupDirectory: string | null;
  installedFiles: InstalledFrameworkFile[];
  sigTemplateDirectory: string;
  sources: FrameworkDownloadSource[];
}

export interface AppApi {
  chooseGameDirectory: () => Promise<ChooseGameDirectoryResult>;
  getSettings: () => Promise<AppSettings>;
  installModFramework: () => Promise<InstallModFrameworkResult>;
}
