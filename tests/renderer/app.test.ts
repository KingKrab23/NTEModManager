// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/renderer/app';
import type { CatalogBrowseResult } from '../../src/shared/catalog';
import type { AppApi, InstallModFrameworkResult } from '../../src/shared/ipc';
import type {
  InstallGameBananaModResult,
  InstalledGameBananaModSummary,
  UninstallGameBananaModResult,
  UpdateInstalledGameBananaModResult,
} from '../../src/shared/mods';

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

function createCatalogPage(page: number): CatalogBrowseResult {
  if (page === 2) {
    return {
      gameId: 23012,
      hasNextPage: false,
      mods: [
        {
          body: 'Second page body text',
          category: {
            iconUrl:
              'https://images.gamebanana.com/img/ico/ModCategory/69851d5e05b77.png',
            id: 43038,
            name: 'Hotori',
            profileUrl: 'https://gamebanana.com/mods/cats/43038',
          },
          createdAt: '2026-05-18T12:00:00.000Z',
          downloads: 2050,
          files: [
            {
              addedAt: '2026-05-18T12:00:00.000Z',
              description: 'Second page ZIP',
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
            'https://images.gamebanana.com/img/ss/mods/220-90_secondpage.jpg',
          profileUrl: 'https://gamebanana.com/mods/675900',
          selectedFileId: '2705000',
          summary: 'Second page body text',
        },
      ],
      page,
    };
  }

  if (page > 2) {
    return {
      gameId: 23012,
      hasNextPage: page < 25,
      mods: [],
      page,
    };
  }

  return {
    gameId: 23012,
    hasNextPage: true,
    mods: [
      {
        body: 'First line\nSecond line',
        category: {
          iconUrl:
            'https://images.gamebanana.com/img/ico/ModCategory/69851ded7f026.png',
          id: 43041,
          name: 'Nanally',
          profileUrl: 'https://gamebanana.com/mods/cats/43041',
        },
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
        summary: 'First line\nSecond line',
      },
      {
        body: 'High contrast interface pass',
        category: {
          iconUrl:
            'https://images.gamebanana.com/img/ico/ModCategory/6985183637847.png',
          id: 43029,
          name: 'UI',
          profileUrl: 'https://gamebanana.com/mods/cats/43029',
        },
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
        summary: 'High contrast interface pass',
      },
      {
        body: 'Requires manual extraction from tar.',
        category: {
          iconUrl:
            'https://images.gamebanana.com/img/ico/ModCategory/69851c064c65d.png',
          id: 43031,
          name: 'NPCs and Entities',
          profileUrl: 'https://gamebanana.com/mods/cats/43031',
        },
        createdAt: '2026-05-17T12:00:00.000Z',
        downloads: 20,
        files: [
          {
            addedAt: '2026-05-17T12:00:00.000Z',
            description: 'Tar build',
            downloadCount: 5,
            downloadUrl: 'https://gamebanana.com/dl/unsupported',
            fileName: 'unsupported-build.tar',
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
        summary: 'Requires manual extraction from tar.',
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
        category: {
          iconUrl:
            'https://images.gamebanana.com/img/ico/ModCategory/69851c064c65d.png',
          id: 43031,
          name: 'NPCs and Entities',
          profileUrl: 'https://gamebanana.com/mods/cats/43031',
        },
        createdAt: '2026-05-19T12:00:00.000Z',
        downloads: 20,
        files: [
          {
            addedAt: '2026-05-19T12:00:00.000Z',
            description: 'Tar build',
            downloadCount: 5,
            downloadUrl: 'https://gamebanana.com/dl/unsupported',
            fileName: 'unsupported-build.tar',
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
  const now = Date.now();
  const recentInstalledAt = new Date(
    now - 2 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const oldInstalledAt = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

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
  it('renders the refreshed GameBanana browser from the first 25 recent pages on startup', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    expect(root.textContent).toContain('Online library for NTE');
    expect(root.textContent).toContain('Nanally - Nude!!!');
    expect(root.textContent).toContain('Second page mod');
    expect(root.textContent).toContain('Pages 1-25');
    expect(root.textContent).toContain('Installable only');
    expect(
      root.querySelector('[data-action="set-browse-query"]'),
    ).not.toBeNull();
    expect(appApi.listGameBananaMods).toHaveBeenCalledTimes(25);
  });

  it('reloads the first 25 pages from the browse toolbar', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    root
      .querySelector<HTMLButtonElement>('[data-action="refresh-browse-window"]')
      ?.click();
    await flushMicrotasks();

    expect(root.textContent).toContain('Second page mod');
    expect(root.textContent).toContain(
      'Reloaded the first 25 GameBanana pages.',
    );
    expect(appApi.listGameBananaMods).toHaveBeenCalledTimes(50);
  });

  it('filters the loaded browse window by search text across pages', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    const searchInput = root.querySelector<HTMLInputElement>(
      '[data-action="set-browse-query"]',
    );
    expect(searchInput).not.toBeNull();

    searchInput!.value = 'second page';
    searchInput!.dispatchEvent(new Event('input', { bubbles: true }));
    await flushMicrotasks();

    const browseCards = root.querySelectorAll('[data-action="select-mod"]');
    expect(browseCards).toHaveLength(1);
    expect(root.textContent).toContain('Second page mod');
    expect(root.textContent).not.toContain('Nanally - Nude!!!');
  });

  it('filters the loaded browse window by NTE character category', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    const characterButton = root.querySelector<HTMLButtonElement>(
      '[data-action="set-browse-character"][data-character="Hotori"]',
    );
    expect(characterButton).not.toBeNull();

    characterButton!.click();
    await flushMicrotasks();

    const browseCards = root.querySelectorAll('[data-action="select-mod"]');
    expect(browseCards).toHaveLength(1);
    expect(root.textContent).toContain('Second page mod');
    expect(root.textContent).not.toContain('Nanally - Nude!!!');
  });

  it('filters browse mods to installable entries only', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    root
      .querySelector<HTMLButtonElement>(
        '[data-action="set-browse-filter"][data-filter="installable"]',
      )
      ?.click();
    await flushMicrotasks();

    const browseCards = root.querySelectorAll('[data-action="select-mod"]');
    expect(browseCards).toHaveLength(3);
    expect(root.textContent).not.toContain('Unsupported archive mod');
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

    expect(root.textContent).toContain('Recorded installs');
    expect(root.textContent).toContain('Download Newest Version');
    expect(root.textContent).toContain('Uninstall Completely');
  });

  it('filters installed mods with the recent-install chip', async () => {
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
        '[data-action="set-installed-filter"][data-filter="recent"]',
      )
      ?.click();
    await flushMicrotasks();

    const installedCards = root.querySelectorAll(
      '[data-action="select-installed-mod"]',
    );
    expect(installedCards).toHaveLength(1);
    expect(root.textContent).toContain('Nanally - Nude!!!');
    expect(root.textContent).not.toContain('UI Contrast Pack');
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

  it('disables installs when the selected mod has no supported non-archived archive file', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();
    appApi.listGameBananaMods = vi.fn(async () =>
      createUnsupportedCatalogPage(),
    );

    createApp(root, appApi);
    await flushMicrotasks();

    expect(root.textContent).toContain(
      'No supported non-archived .zip, .7z, or .rar file is available for this mod.',
    );
    expect(
      root.querySelector<HTMLButtonElement>(
        '[data-action="install-selected-mod"]',
      )?.disabled,
    ).toBe(true);
  });
});
