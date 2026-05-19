import type { AppApi, InstallModFrameworkResult } from '../shared/ipc';
import { defaultAppSettings, type AppSettings } from '../shared/settings';

interface AppState {
  isBusy: boolean;
  message: string;
  operationDetails: string[];
  settings: AppSettings;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderTemplate(state: AppState): string {
  const selectedPath =
    state.settings.gamePath ?? 'No game folder selected yet.';
  const installButtonLabel = state.isBusy
    ? 'Installing…'
    : 'Install Loader + Sig Bypass';
  const statusLabel = state.settings.gamePath ? 'Configured' : 'Needs setup';
  const sigTemplateDirectory = state.settings.gamePath
    ? `${state.settings.gamePath}\\Client\\WindowsNoEditor\\HT\\Content\\Paks`
    : 'Choose a game folder to reveal the Pak signature folder.';
  const updatedLabel = state.settings.lastUpdatedAt
    ? new Date(state.settings.lastUpdatedAt).toLocaleString()
    : 'Never';
  const operationDetailsMarkup =
    state.operationDetails.length > 0
      ? `
        <ul class="activity-list">
          ${state.operationDetails
            .map((line) => `<li>${escapeHtml(line)}</li>`)
            .join('')}
        </ul>
      `
      : `
        <p class="status-message">
          The installer downloads the latest framework files during the action,
          copies <code>version.dll</code> into the root, <code>NTEGlobal</code>,
          and <code>Win64</code> folders, then adds the latest
          <code>.asi</code> file to <code>Win64</code>.
        </p>
      `;

  return `
    <div class="app-shell">
      <aside class="hero-panel">
        <p class="eyebrow">Neverness to Everness</p>
        <h1>NTE Mod Manager</h1>
        <p class="hero-copy">
          Keep installs safe, paths explicit, and mod changes easy to recover.
        </p>
        <div class="hero-pills">
          <span class="pill pill-cyan">Electron + TypeScript</span>
          <span class="pill pill-pink">Harness-first repo</span>
        </div>
      </aside>
      <main class="content-panel">
        <section class="surface-card surface-card-lead">
          <div class="status-row">
            <div>
              <p class="section-label">Game install</p>
              <h2>${escapeHtml(selectedPath)}</h2>
            </div>
            <span class="status-badge">${escapeHtml(statusLabel)}</span>
          </div>
          <p class="supporting-copy">
            The app stores settings in the main process and keeps renderer access
            behind a typed preload bridge.
          </p>
          <div class="action-row">
            <button class="primary-button" data-action="choose-game-directory" ${state.isBusy ? 'disabled' : ''}>
              ${state.isBusy ? 'Working…' : 'Choose Game Folder'}
            </button>
            <button class="secondary-button" data-action="install-mod-framework" ${state.isBusy || !state.settings.gamePath ? 'disabled' : ''}>
              ${installButtonLabel}
            </button>
            <button class="secondary-button" data-action="refresh-settings" ${state.isBusy ? 'disabled' : ''}>
              Refresh Settings
            </button>
          </div>
          <p class="config-value">
            Current value:
            <strong>${escapeHtml(state.settings.gamePath ?? 'Not set')}</strong>
          </p>
        </section>
        <section class="surface-grid">
          <article class="surface-card">
            <p class="section-label">Status</p>
            <p class="status-message">${escapeHtml(state.message)}</p>
          </article>
          <article class="surface-card">
            <p class="section-label">Last settings update</p>
            <p class="status-message">${escapeHtml(updatedLabel)}</p>
          </article>
        </section>
        <section class="surface-grid surface-grid-secondary">
          <article class="surface-card">
            <p class="section-label">Framework notes</p>
            <p class="status-message">
              Uses the configured game folder for all writes and keeps backups of
              replaced framework files in the main-process app data directory.
            </p>
          </article>
          <article class="surface-card">
            <p class="section-label">Mod .sig reminder</p>
            <p class="status-message">
              When you add a mod, copy any <code>.sig</code> file from
              <strong>${escapeHtml(sigTemplateDirectory)}</strong> and rename it
              to match the mod package name.
            </p>
          </article>
        </section>
        <section class="surface-card surface-card-activity">
          <p class="section-label">Latest framework activity</p>
          ${operationDetailsMarkup}
        </section>
      </main>
    </div>
  `;
}

async function refreshState(state: AppState, appApi: AppApi): Promise<void> {
  state.isBusy = true;
  state.message = 'Loading saved settings…';
  state.settings = await appApi.getSettings();
  state.isBusy = false;
  state.message = state.settings.gamePath
    ? 'Settings loaded. Choose a new path any time.'
    : 'Select your NTE install folder to begin.';
}

function formatInstallDetails(result: InstallModFrameworkResult): string[] {
  const sourceLines = result.sources.map(
    (source) =>
      `Downloaded ${source.name} ${source.version} from ${source.releaseUrl} using ${source.assetName}.`,
  );
  const fileLines = result.installedFiles.map((file) => {
    const verb = file.action === 'replaced' ? 'Replaced' : 'Installed';
    return `${verb} ${file.sourceFileName} at ${file.destinationPath}.`;
  });
  const backupLine = result.backupDirectory
    ? `Backed up replaced files to ${result.backupDirectory}.`
    : 'No existing framework files needed a backup.';
  const sigReminder = `For each mod, copy an existing .sig file from ${result.sigTemplateDirectory} and rename it to match the mod package.`;

  return [...sourceLines, ...fileLines, backupLine, sigReminder];
}

export function createApp(root: HTMLElement, appApi: AppApi): void {
  const state: AppState = {
    isBusy: false,
    message: 'Booting application shell…',
    operationDetails: [],
    settings: defaultAppSettings,
  };

  const render = (): void => {
    root.innerHTML = renderTemplate(state);

    const chooseButton = root.querySelector<HTMLButtonElement>(
      '[data-action="choose-game-directory"]',
    );
    const installFrameworkButton = root.querySelector<HTMLButtonElement>(
      '[data-action="install-mod-framework"]',
    );
    const refreshButton = root.querySelector<HTMLButtonElement>(
      '[data-action="refresh-settings"]',
    );

    chooseButton?.addEventListener('click', async () => {
      state.isBusy = true;
      state.message = 'Waiting for a folder selection…';
      render();

      try {
        const result = await appApi.chooseGameDirectory();
        state.settings = result.settings;
        state.message = result.canceled
          ? 'Folder selection canceled.'
          : 'Game folder saved successfully.';
      } catch (error) {
        state.message =
          error instanceof Error
            ? `Folder selection failed: ${error.message}`
            : 'Folder selection failed.';
      } finally {
        state.isBusy = false;
      }

      render();
    });

    installFrameworkButton?.addEventListener('click', async () => {
      state.isBusy = true;
      state.message =
        'Downloading and installing the latest mod framework files…';
      state.operationDetails = [];
      render();

      try {
        const result = await appApi.installModFramework();
        state.operationDetails = formatInstallDetails(result);
        state.message =
          'Framework installed. New mods still need a matching .sig file.';
      } catch (error) {
        state.message =
          error instanceof Error
            ? `Framework install failed: ${error.message}`
            : 'Framework install failed.';
        state.operationDetails = [
          'If any file copy failed after writes began, the installer restored the previous framework files.',
        ];
      } finally {
        state.isBusy = false;
      }

      render();
    });

    refreshButton?.addEventListener('click', async () => {
      await refreshState(state, appApi);
      render();
    });
  };

  render();

  void (async () => {
    await refreshState(state, appApi);
    render();
  })();
}
