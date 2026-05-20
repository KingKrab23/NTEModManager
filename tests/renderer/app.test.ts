// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/renderer/app';
import type { AppApi, InstallModFrameworkResult } from '../../src/shared/ipc';
import type { CatalogBrowseResult } from '../../src/shared/catalog';
import type {
  InstallGameBananaModResult,
  InstalledGameBananaModSummary,
  UninstallGameBananaModResult,
  UpdateInstalledGameBananaModResult,
} from '../../src/shared/mods';

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createCatalogPage(page: number): CatalogBrowseResult {
  return {
    gameId: 23012,
    hasNextPage: page === 1,
    mods: [
      {
        body: 'First line\nSecond line',
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
        id: 675801 + page,
        installInstructions: 'Drop into Paks',
        likes: 348,
        name: page === 1 ? 'Nanally - Nude!!!' : 'Second page mod',
        ownerName: 'LinStar_',
        previewImageUrl:
          'https://images.gamebanana.com/img/ss/mods/220-90_69ff0f702dc90.jpg',
        profileUrl: 'https://gamebanana.com/mods/675801',
        selectedFileId: '1703928',
        summary: 'First line\nSecond line',
      },
    ],
    page,
  };
}

function createUnsupportedCatalogPage(): CatalogBrowseResult {
  return {
    gameId: 23012,
    hasNextPage: false,
    mods: [
      {
        body: 'Unsupported archive example',
        createdAt: '2026-05-19T12:00:00.000Z',
        downloads: 20,
        files: [
          {
            addedAt: '2026-05-19T12:00:00.000Z',
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
        summary: 'Unsupported archive example',
      },
    ],
    page: 1,
  };
}

function createFakeAppApi(): AppApi {
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
    status: 'installed',
    sigTemplateDirectory:
      'C:\\Games\\NTE\\Client\\WindowsNoEditor\\HT\\Content\\Paks',
  };
  const installedMods: InstalledGameBananaModSummary[] = [
    {
      installedAt: '2026-05-19T12:04:00.000Z',
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
    notes: [
      'Downloaded nanally_v14.zip from https://gamebanana.com/dl/1705000.',
    ],
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

  return {
    chooseGameDirectory: vi.fn(async () => ({
      canceled: false,
      settings: {
        gamePath: 'C:\\Games\\NTE',
        lastUpdatedAt: '2026-05-19T12:00:00.000Z',
      },
    })),
    getSettings: vi.fn(async () => ({
      gamePath: 'C:\\Games\\NTE',
      lastUpdatedAt: '2026-05-19T12:00:00.000Z',
    })),
    installGameBananaMod: vi.fn(async () => installModResult),
    installModFramework: vi.fn(async () => installFrameworkResult),
    listInstalledGameBananaMods: vi.fn(async () => installedMods),
    listGameBananaMods: vi.fn(async (page: number) => createCatalogPage(page)),
    uninstallGameBananaMod: vi.fn(async () => uninstallResult),
    updateInstalledGameBananaMod: vi.fn(async () => updateInstalledModResult),
  };
}

describe('createApp', () => {
  it('renders the recent GameBanana mod browser on startup', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    expect(root.textContent).toContain('GameBanana recent mods');
    expect(root.textContent).toContain('Nanally - Nude!!!');
    expect(root.textContent).toContain('Download And Install Mod');
    expect(root.querySelector('img')).not.toBeNull();
  });

  it('loads the next page from the GameBanana browser controls', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    root.querySelector<HTMLButtonElement>('[data-action="page-next"]')?.click();
    await flushMicrotasks();

    expect(root.textContent).toContain('Second page mod');
    expect(root.textContent).toContain('Page 2');
  });

  it('shows mod install activity after installing the selected GameBanana file', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    root
      .querySelector<HTMLButtonElement>('[data-action="install-selected-mod"]')
      ?.click();
    await flushMicrotasks();

    expect(root.textContent).toContain(
      'Nanally - Nude!!! installed successfully.',
    );
    expect(root.textContent).toContain('nanally_b79c4.zip');
    expect(root.textContent).toContain('Nanally_v13.pak');
  });

  it('shows installed mods in a separate tab with update and uninstall actions', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    root
      .querySelector<HTMLButtonElement>(
        '[data-action="switch-tab"][data-tab="installed"]',
      )
      ?.click();
    await flushMicrotasks();

    expect(root.textContent).toContain('Installed GameBanana mods');
    expect(root.textContent).toContain('Download Newest Version');
    expect(root.textContent).toContain('Uninstall Completely');
  });

  it('shows installed-mod update activity from the installed tab', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    root
      .querySelector<HTMLButtonElement>(
        '[data-action="switch-tab"][data-tab="installed"]',
      )
      ?.click();
    await flushMicrotasks();

    root
      .querySelector<HTMLButtonElement>('[data-action="update-installed-mod"]')
      ?.click();
    await flushMicrotasks();

    expect(root.textContent).toContain(
      'Nanally - Nude!!! updated to the newest supported file.',
    );
    expect(root.textContent).toContain('nanally_v14.zip');
  });

  it('shows uninstall activity from the installed tab', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    root
      .querySelector<HTMLButtonElement>(
        '[data-action="switch-tab"][data-tab="installed"]',
      )
      ?.click();
    await flushMicrotasks();

    root
      .querySelector<HTMLButtonElement>(
        '[data-action="uninstall-installed-mod"]',
      )
      ?.click();
    await flushMicrotasks();

    expect(root.textContent).toContain(
      'Nanally - Nude!!! uninstalled successfully.',
    );
    expect(root.textContent).toContain('Removed installed file at');
  });

  it('disables installs when the selected mod has no supported non-archived zip file', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();
    appApi.listGameBananaMods = vi.fn(async () =>
      createUnsupportedCatalogPage(),
    );

    createApp(root, appApi);
    await flushMicrotasks();

    expect(root.textContent).toContain(
      'No supported non-archived .zip file is available for this mod.',
    );
    expect(
      root.querySelector<HTMLButtonElement>(
        '[data-action="install-selected-mod"]',
      )?.disabled,
    ).toBe(true);
  });
});
