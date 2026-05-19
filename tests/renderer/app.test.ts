// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/renderer/app';
import type { AppApi, InstallModFrameworkResult } from '../../src/shared/ipc';

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createFakeAppApi(): AppApi {
  const installResult: InstallModFrameworkResult = {
    backupDirectory:
      'C:\\Users\\pimsh\\AppData\\Roaming\\NTE Mod Manager\\backups\\mod-framework\\2026-05-19T12-03-00.000Z',
    installedFiles: [
      {
        action: 'created',
        destinationPath: 'C:\\Games\\NTE\\version.dll',
        sourceFileName: 'version.dll',
      },
      {
        action: 'created',
        destinationPath:
          'C:\\Games\\NTE\\Client\\WindowsNoEditor\\HT\\Binaries\\Win64\\UniversalSigBypasser.asi',
        sourceFileName: 'UniversalSigBypasser.asi',
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

  return {
    chooseGameDirectory: vi.fn(async () => ({
      canceled: false,
      settings: {
        gamePath: 'C:\\Games\\NTE',
        lastUpdatedAt: '2026-05-19T12:00:00.000Z',
      },
    })),
    getSettings: vi.fn(async () => ({
      gamePath: null,
      lastUpdatedAt: null,
    })),
    installModFramework: vi.fn(async () => installResult),
  };
}

describe('createApp', () => {
  it('renders the initial settings state from the preload API', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    expect(root.textContent).toContain(
      'Select your NTE install folder to begin.',
    );
    expect(root.textContent).toContain('No game folder selected yet.');
  });

  it('updates the selected path after choosing a game directory', async () => {
    const root = document.createElement('div');
    const appApi = createFakeAppApi();

    createApp(root, appApi);
    await flushMicrotasks();

    const button = root.querySelector<HTMLButtonElement>(
      '[data-action="choose-game-directory"]',
    );

    button?.click();
    await flushMicrotasks();

    expect(root.textContent).toContain('C:\\Games\\NTE');
    expect(root.textContent).toContain('Game folder saved successfully.');
  });

  it('shows framework install activity after the installer runs', async () => {
    const root = document.createElement('div');
    const appApi: AppApi = {
      ...createFakeAppApi(),
      getSettings: vi.fn(async () => ({
        gamePath: 'C:\\Games\\NTE',
        lastUpdatedAt: '2026-05-19T12:00:00.000Z',
      })),
    };

    createApp(root, appApi);
    await flushMicrotasks();

    const button = root.querySelector<HTMLButtonElement>(
      '[data-action="install-mod-framework"]',
    );

    button?.click();
    await flushMicrotasks();

    expect(root.textContent).toContain(
      'Framework installed. New mods still need a matching .sig file.',
    );
    expect(root.textContent).toContain('UniversalSigBypasser.asi');
    expect(root.textContent).toContain(
      'C:\\Games\\NTE\\Client\\WindowsNoEditor\\HT\\Content\\Paks',
    );
  });
});
