import type { AppSettings } from './settings';
import type { CatalogBrowseResult } from './catalog';
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
} from './mods';

export const appIpcChannels = {
  chooseGameDirectory: 'app:choose-game-directory',
  getSettings: 'app:get-settings',
  installCensorshipRemover: 'app:install-censorship-remover',
  installModFramework: 'app:install-mod-framework',
  listGameBananaMods: 'app:list-gamebanana-mods',
  installGameBananaMod: 'app:install-gamebanana-mod',
  listInstalledGameBananaMods: 'app:list-installed-gamebanana-mods',
  setInstalledGameBananaModEnabled: 'app:set-installed-gamebanana-mod-enabled',
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

export interface InstallKnownGameBananaUtilityResult {
  backupDirectory: string | null;
  downloadedFileName: string;
  downloadUrl: string;
  installDirectory: string;
  installedFiles: InstalledFrameworkFile[];
  modId: number;
  modName: string;
  notes: string[];
  profileUrl: string;
  selectedFileId: string;
}

export interface AppApi {
  chooseGameDirectory: () => Promise<ChooseGameDirectoryResult>;
  getSettings: () => Promise<AppSettings>;
  installCensorshipRemover: () => Promise<InstallKnownGameBananaUtilityResult>;
  installGameBananaMod: (
    request: InstallGameBananaModRequest,
  ) => Promise<InstallGameBananaModResult>;
  installModFramework: () => Promise<InstallModFrameworkResult>;
  listInstalledGameBananaMods: () => Promise<InstalledGameBananaModSummary[]>;
  listGameBananaMods: (page: number) => Promise<CatalogBrowseResult>;
  setInstalledGameBananaModEnabled: (
    request: SetInstalledGameBananaModEnabledRequest,
  ) => Promise<SetInstalledGameBananaModEnabledResult>;
  uninstallGameBananaMod: (
    request: UninstallGameBananaModRequest,
  ) => Promise<UninstallGameBananaModResult>;
  updateInstalledGameBananaMod: (
    request: UpdateInstalledGameBananaModRequest,
  ) => Promise<UpdateInstalledGameBananaModResult>;
}
