import type { AppSettings } from './settings';
import type { CatalogBrowseResult } from './catalog';
import type {
  InstallGameBananaModRequest,
  InstallGameBananaModResult,
  InstalledGameBananaModSummary,
  UninstallGameBananaModRequest,
  UninstallGameBananaModResult,
  UpdateInstalledGameBananaModRequest,
  UpdateInstalledGameBananaModResult,
} from './mods';

export const appIpcChannels = {
  chooseGameDirectory: 'app:choose-game-directory',
  getSettings: 'app:get-settings',
  installModFramework: 'app:install-mod-framework',
  listGameBananaMods: 'app:list-gamebanana-mods',
  installGameBananaMod: 'app:install-gamebanana-mod',
  listInstalledGameBananaMods: 'app:list-installed-gamebanana-mods',
  uninstallGameBananaMod: 'app:uninstall-gamebanana-mod',
  updateInstalledGameBananaMod: 'app:update-installed-gamebanana-mod',
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
  installGameBananaMod: (
    request: InstallGameBananaModRequest,
  ) => Promise<InstallGameBananaModResult>;
  installModFramework: () => Promise<InstallModFrameworkResult>;
  listInstalledGameBananaMods: () => Promise<InstalledGameBananaModSummary[]>;
  listGameBananaMods: (page: number) => Promise<CatalogBrowseResult>;
  uninstallGameBananaMod: (
    request: UninstallGameBananaModRequest,
  ) => Promise<UninstallGameBananaModResult>;
  updateInstalledGameBananaMod: (
    request: UpdateInstalledGameBananaModRequest,
  ) => Promise<UpdateInstalledGameBananaModResult>;
}
