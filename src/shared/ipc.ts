import type { AppSettings } from './settings';
import type { CatalogBrowseResult } from './catalog';
import type {
  InstallGameBananaModRequest,
  InstallGameBananaModResult,
  InstallLocalArchiveModRequest,
  InstallLocalArchiveModResult,
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
  chooseLocalModArchive: 'app:choose-local-mod-archive',
  getSettings: 'app:get-settings',
  installCensorshipRemover: 'app:install-censorship-remover',
  installModFramework: 'app:install-mod-framework',
  listGameBananaMods: 'app:list-gamebanana-mods',
  installGameBananaMod: 'app:install-gamebanana-mod',
  installLocalArchiveMod: 'app:install-local-archive-mod',
  listInstalledGameBananaMods: 'app:list-installed-gamebanana-mods',
  setInstalledGameBananaModEnabled: 'app:set-installed-gamebanana-mod-enabled',
  showMessageBox: 'app:show-message-box',
  uninstallGameBananaMod: 'app:uninstall-gamebanana-mod',
  updateInstalledGameBananaMod: 'app:update-installed-gamebanana-mod',
} as const;

export interface ChooseGameDirectoryResult {
  canceled: boolean;
  settings: AppSettings;
}

export interface ChooseLocalModArchiveResult {
  archivePath: string | null;
  canceled: boolean;
}

export interface ShowMessageBoxRequest {
  message: string;
  title: string;
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
  chooseLocalModArchive: () => Promise<ChooseLocalModArchiveResult>;
  getSettings: () => Promise<AppSettings>;
  installCensorshipRemover: () => Promise<InstallKnownGameBananaUtilityResult>;
  installGameBananaMod: (
    request: InstallGameBananaModRequest,
  ) => Promise<InstallGameBananaModResult>;
  installLocalArchiveMod: (
    request: InstallLocalArchiveModRequest,
  ) => Promise<InstallLocalArchiveModResult>;
  installModFramework: () => Promise<InstallModFrameworkResult>;
  listInstalledGameBananaMods: () => Promise<InstalledGameBananaModSummary[]>;
  listGameBananaMods: (page: number) => Promise<CatalogBrowseResult>;
  setInstalledGameBananaModEnabled: (
    request: SetInstalledGameBananaModEnabledRequest,
  ) => Promise<SetInstalledGameBananaModEnabledResult>;
  showMessageBox: (request: ShowMessageBoxRequest) => Promise<void>;
  uninstallGameBananaMod: (
    request: UninstallGameBananaModRequest,
  ) => Promise<UninstallGameBananaModResult>;
  updateInstalledGameBananaMod: (
    request: UpdateInstalledGameBananaModRequest,
  ) => Promise<UpdateInstalledGameBananaModResult>;
}
