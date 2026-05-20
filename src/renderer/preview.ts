import './styles.css';

import { createApp } from './app';

import type { CatalogBrowseResult } from '../shared/catalog';
import type { AppApi, InstallModFrameworkResult } from '../shared/ipc';
import type {
  InstallGameBananaModResult,
  InstalledGameBananaModSummary,
  UninstallGameBananaModResult,
  UpdateInstalledGameBananaModResult,
} from '../shared/mods';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Expected #app root element to exist.');
}

const recentInstalledAt = new Date(
  Date.now() - 2 * 24 * 60 * 60 * 1000,
).toISOString();
const oldInstalledAt = new Date(
  Date.now() - 14 * 24 * 60 * 60 * 1000,
).toISOString();

function createCatalogPage(page: number): CatalogBrowseResult {
  if (page === 2) {
    return {
      gameId: 23012,
      hasNextPage: false,
      mods: [
        {
          body: 'A darker alternate outfit with neon accents and a clean install ZIP.',
          createdAt: '2026-05-18T12:00:00.000Z',
          downloads: 2050,
          files: [
            {
              addedAt: '2026-05-18T12:00:00.000Z',
              description: 'Alternate outfit build',
              downloadCount: 208,
              downloadUrl: 'https://gamebanana.com/dl/2705000',
              fileName: 'second-page.zip',
              fileSizeBytes: 18500000,
              id: '2705000',
              isArchived: false,
              version: '2.0',
            },
          ],
          id: 675900,
          installInstructions: 'Install into Paks.',
          likes: 422,
          name: 'Second page mod',
          ownerName: 'AnotherAuthor',
          previewImageUrl:
            'https://images.gamebanana.com/img/ss/mods/220-90_69ff0f702dc90.jpg',
          profileUrl: 'https://gamebanana.com/mods/675900',
          selectedFileId: '2705000',
          summary:
            'A darker alternate outfit with neon accents and a clean install ZIP.',
        },
      ],
      page,
    };
  }

  return {
    gameId: 23012,
    hasNextPage: true,
    mods: [
      {
        body: 'High-detail body mod with a supported ZIP build and clean packaging.',
        createdAt: '2026-05-19T12:00:00.000Z',
        downloads: 5970,
        files: [
          {
            addedAt: '2026-05-19T12:00:00.000Z',
            description: 'Latest build',
            downloadCount: 995,
            downloadUrl: 'https://gamebanana.com/dl/1703928',
            fileName: 'nanally_b79c4.zip',
            fileSizeBytes: 17788073,
            id: '1703928',
            isArchived: false,
            version: 'V1.3',
          },
        ],
        id: 675802,
        installInstructions: 'Drop into Paks',
        likes: 348,
        name: 'Nanally - Nude!!!',
        ownerName: 'LinStar_',
        previewImageUrl:
          'https://images.gamebanana.com/img/ss/mods/220-90_69ff0f702dc90.jpg',
        profileUrl: 'https://gamebanana.com/mods/675801',
        selectedFileId: '1703928',
        summary:
          'High-detail body mod with a supported ZIP build and clean packaging.',
      },
      {
        body: 'Sharper UI panels and higher-contrast status cards.',
        createdAt: '2026-05-18T12:00:00.000Z',
        downloads: 1120,
        files: [
          {
            addedAt: '2026-05-18T12:00:00.000Z',
            description: 'UI zip',
            downloadCount: 102,
            downloadUrl: 'https://gamebanana.com/dl/1704100',
            fileName: 'ui-contrast-pack.zip',
            fileSizeBytes: 7200000,
            id: '1704100',
            isArchived: false,
            version: '1.0',
          },
        ],
        id: 675803,
        installInstructions: '',
        likes: 71,
        name: 'UI Contrast Pack',
        ownerName: 'PixelAdjust',
        previewImageUrl: null,
        profileUrl: 'https://gamebanana.com/mods/675803',
        selectedFileId: '1704100',
        summary: 'Sharper UI panels and higher-contrast status cards.',
      },
      {
        body: 'This entry stays visible for inspection but uses an unsupported 7z archive.',
        createdAt: '2026-05-17T12:00:00.000Z',
        downloads: 20,
        files: [
          {
            addedAt: '2026-05-17T12:00:00.000Z',
            description: '7z build',
            downloadCount: 5,
            downloadUrl: 'https://gamebanana.com/dl/unsupported',
            fileName: 'unsupported-build.7z',
            fileSizeBytes: 2048,
            id: 'unsupported',
            isArchived: false,
            version: '2.0',
          },
        ],
        id: 800001,
        installInstructions: '',
        likes: 3,
        name: 'Unsupported archive mod',
        ownerName: 'Uploader',
        previewImageUrl: null,
        profileUrl: 'https://gamebanana.com/mods/800001',
        selectedFileId: null,
        summary:
          'This entry stays visible for inspection but uses an unsupported 7z archive.',
      },
    ],
    page,
  };
}

const installFrameworkResult: InstallModFrameworkResult = {
  backupDirectory:
    'C:\\Users\\pimsh\\AppData\\Roaming\\NTE Mod Manager\\backups\\mod-framework\\2026-05-19T12-03-00.000Z',
  installedFiles: [
    {
      action: 'created',
      destinationPath: 'C:\\Games\\NTE\\version.dll',
      sourceFileName: 'version.dll',
    },
  ],
  sigTemplateDirectory:
    'C:\\Games\\NTE\\Client\\WindowsNoEditor\\HT\\Content\\Paks',
  sources: [
    {
      assetName: 'version-x64.zip',
      name: 'Ultimate ASI Loader v9.7.1',
      releaseUrl:
        'https://github.com/ThirteenAG/Ultimate-ASI-Loader/releases/tag/v9.7.1',
      version: 'v9.7.1',
    },
  ],
};

const installModResult: InstallGameBananaModResult = {
  backupDirectory: null,
  downloadedFileName: 'nanally_b79c4.zip',
  downloadUrl: 'https://gamebanana.com/dl/1703928',
  installedFiles: [
    {
      action: 'created',
      destinationPath:
        'C:\\Games\\NTE\\Client\\WindowsNoEditor\\HT\\Content\\Paks\\Nanally_v13.pak',
      origin: 'archive',
      sourceFileName: 'Nanally_v13.pak',
    },
  ],
  modId: 675802,
  modName: 'Nanally - Nude!!!',
  notes: [
    'Downloaded nanally_b79c4.zip from https://gamebanana.com/dl/1703928.',
  ],
  previousFileId: null,
  selectedFileId: '1703928',
  sigTemplateDirectory:
    'C:\\Games\\NTE\\Client\\WindowsNoEditor\\HT\\Content\\Paks',
  status: 'installed',
};

const installedMods: InstalledGameBananaModSummary[] = [
  {
    installedAt: recentInstalledAt,
    installedFileId: '1703928',
    installedFileName: 'nanally_b79c4.zip',
    installedFilesCount: 2,
    installedVersion: 'V1.3',
    modId: 675802,
    modName: 'Nanally - Nude!!!',
    ownerName: 'LinStar_',
    previewImageUrl:
      'https://images.gamebanana.com/img/ss/mods/220-90_69ff0f702dc90.jpg',
    profileUrl: 'https://gamebanana.com/mods/675801',
  },
  {
    installedAt: oldInstalledAt,
    installedFileId: '1704100',
    installedFileName: 'ui-contrast-pack.zip',
    installedFilesCount: 1,
    installedVersion: '1.0',
    modId: 675803,
    modName: 'UI Contrast Pack',
    ownerName: 'PixelAdjust',
    previewImageUrl: null,
    profileUrl: 'https://gamebanana.com/mods/675803',
  },
];

const updateInstalledModResult: UpdateInstalledGameBananaModResult = {
  backupDirectory: null,
  downloadedFileName: 'nanally_v14.zip',
  downloadUrl: 'https://gamebanana.com/dl/1705000',
  installedFiles: [
    {
      action: 'created',
      destinationPath:
        'C:\\Games\\NTE\\Client\\WindowsNoEditor\\HT\\Content\\Paks\\Nanally_v14.pak',
      origin: 'archive',
      sourceFileName: 'Nanally_v14.pak',
    },
  ],
  modId: 675802,
  modName: 'Nanally - Nude!!!',
  notes: ['Downloaded nanally_v14.zip from https://gamebanana.com/dl/1705000.'],
  previousFileId: '1703928',
  selectedFileId: '1705000',
  sigTemplateDirectory:
    'C:\\Games\\NTE\\Client\\WindowsNoEditor\\HT\\Content\\Paks',
  status: 'updated',
};

const uninstallResult: UninstallGameBananaModResult = {
  modId: 675802,
  modName: 'Nanally - Nude!!!',
  notes: ['Removed Nanally - Nude!!! from the installed-mod registry.'],
  removedFiles: [
    {
      action: 'created',
      destinationPath:
        'C:\\Games\\NTE\\Client\\WindowsNoEditor\\HT\\Content\\Paks\\Nanally_v13.pak',
      origin: 'archive',
      sourceFileName: 'Nanally_v13.pak',
    },
  ],
};

const appApi: AppApi = {
  chooseGameDirectory: async () => ({
    canceled: false,
    settings: {
      gamePath: 'C:\\Games\\NTE',
      lastUpdatedAt: '2026-05-19T12:00:00.000Z',
    },
  }),
  getSettings: async () => ({
    gamePath: 'C:\\Games\\NTE',
    lastUpdatedAt: '2026-05-19T12:00:00.000Z',
  }),
  installGameBananaMod: async () => installModResult,
  installModFramework: async () => installFrameworkResult,
  listInstalledGameBananaMods: async () => installedMods,
  listGameBananaMods: async (page) => createCatalogPage(page),
  uninstallGameBananaMod: async () => uninstallResult,
  updateInstalledGameBananaMod: async () => updateInstalledModResult,
};

createApp(root, appApi);
