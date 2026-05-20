import {
  isSupportedGameBananaArchiveFileName,
  type CatalogBrowseResult,
  type CatalogMod,
  type CatalogModFile,
} from '../shared/catalog';
import type { AppApi, InstallModFrameworkResult } from '../shared/ipc';
import type {
  InstallGameBananaModResult,
  InstalledGameBananaModSummary,
  UninstallGameBananaModResult,
  UpdateInstalledGameBananaModResult,
} from '../shared/mods';
import { defaultAppSettings, type AppSettings } from '../shared/settings';

type WorkspaceTab = 'browse' | 'installed';

interface AppState {
  activeTab: WorkspaceTab;
  activityLines: string[];
  activityTitle: string;
  catalogHasNextPage: boolean;
  catalogPage: number;
  installedMods: InstalledGameBananaModSummary[];
  isBusy: boolean;
  libraryMessage: string;
  message: string;
  mods: CatalogMod[];
  selectedFileIds: Record<number, string | null>;
  selectedInstalledModId: number | null;
  selectedModId: number | null;
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

function formatMultilineText(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br>');
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : 'Unknown date';
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function getSelectedMod(state: AppState): CatalogMod | null {
  return state.mods.find((mod) => mod.id === state.selectedModId) ?? null;
}

function getSelectedInstalledMod(
  state: AppState,
): InstalledGameBananaModSummary | null {
  return (
    state.installedMods.find(
      (mod) => mod.modId === state.selectedInstalledModId,
    ) ?? null
  );
}

function isSelectableModFile(file: CatalogModFile): boolean {
  return (
    !file.isArchived && isSupportedGameBananaArchiveFileName(file.fileName)
  );
}

function getPreferredModFile(mod: CatalogMod | null): CatalogModFile | null {
  if (!mod) {
    return null;
  }

  return mod.files.find((file) => isSelectableModFile(file)) ?? null;
}

function getSelectedFileId(
  state: AppState,
  mod: CatalogMod | null,
): string | null {
  if (!mod) {
    return null;
  }

  const candidateFileId = state.selectedFileIds[mod.id] ?? mod.selectedFileId;

  if (!candidateFileId) {
    return getPreferredModFile(mod)?.id ?? null;
  }

  const selectedFile = mod.files.find((file) => file.id === candidateFileId);

  if (!selectedFile || !isSelectableModFile(selectedFile)) {
    return getPreferredModFile(mod)?.id ?? null;
  }

  return candidateFileId;
}

function getSelectedFile(state: AppState): CatalogModFile | null {
  const mod = getSelectedMod(state);

  if (!mod) {
    return null;
  }

  const selectedFileId = getSelectedFileId(state, mod);

  return mod.files.find((file) => file.id === selectedFileId) ?? null;
}

function renderModPreview(
  imageUrl: string | null,
  title: string,
  emptyLabel: string,
): string {
  return imageUrl
    ? `
        <div class="detail-preview">
          <img
            class="detail-preview-image"
            src="${escapeHtml(imageUrl)}"
            alt="${escapeHtml(title)} preview"
          />
        </div>
      `
    : `
        <div class="detail-preview detail-preview-empty">
          <span>${escapeHtml(emptyLabel)}</span>
        </div>
      `;
}

function renderEmptyBrowseDetail(state: AppState): string {
  const disabledLabel = state.settings.gamePath
    ? 'Select a GameBanana mod to inspect its files.'
    : 'Choose your NTE folder to unlock installs, then inspect a mod.';

  return `
    <article class="detail-panel surface-card">
      <p class="section-label">Mod details</p>
      <div class="empty-state">
        <h2>Browser waiting</h2>
        <p class="supporting-copy">${escapeHtml(disabledLabel)}</p>
      </div>
    </article>
  `;
}

function renderSelectedBrowseMod(state: AppState, mod: CatalogMod): string {
  const selectedFileId = getSelectedFileId(state, mod);
  const selectedFile =
    mod.files.find((file) => file.id === selectedFileId) ??
    getPreferredModFile(mod) ??
    null;
  const canInstall =
    !state.isBusy && Boolean(state.settings.gamePath) && Boolean(selectedFile);
  const hasSelectableFiles = mod.files.some((file) =>
    isSelectableModFile(file),
  );
  const installInstructionsMarkup = mod.installInstructions
    ? `
        <section class="detail-copy-block">
          <p class="section-label">Install notes</p>
          <p class="detail-copy">${formatMultilineText(mod.installInstructions)}</p>
        </section>
      `
    : '';

  return `
    <article class="detail-panel surface-card">
      ${renderModPreview(mod.previewImageUrl, mod.name, 'No preview image')}
      <div class="detail-header">
        <div>
          <p class="section-label">GameBanana mod</p>
          <h2>${escapeHtml(mod.name)}</h2>
          <p class="detail-byline">by ${escapeHtml(mod.ownerName)}</p>
        </div>
        <div class="detail-badges">
          <span class="pill pill-cyan">${formatNumber(mod.downloads)} downloads</span>
          <span class="pill pill-pink">${formatNumber(mod.likes)} likes</span>
        </div>
      </div>
      <div class="detail-meta">
        <span>Published ${escapeHtml(formatDate(mod.createdAt))}</span>
        <a class="text-link" href="${escapeHtml(mod.profileUrl)}" target="_blank" rel="noreferrer">Open GameBanana page</a>
      </div>
      <section class="detail-copy-block">
        <p class="section-label">Summary</p>
        <p class="detail-copy">${formatMultilineText(mod.body || mod.summary || 'No description provided.')}</p>
      </section>
      ${installInstructionsMarkup}
      <section class="detail-copy-block">
        <div class="file-row">
          <div>
            <p class="section-label">Downloadable file</p>
            <p class="supporting-copy">Pick a non-archived .zip file entry to install. Unsupported archive formats stay disabled.</p>
          </div>
          <select class="file-select" data-action="select-mod-file" ${
            state.isBusy ? 'disabled' : ''
          }>
            ${
              hasSelectableFiles
                ? ''
                : '<option value="" selected disabled>No supported non-archived .zip file is available for this mod.</option>'
            }
            ${mod.files
              .map((file) => {
                const optionLabel = `${file.fileName} • ${file.version ?? 'No version'} • ${formatFileSize(file.fileSizeBytes)}${file.isArchived ? ' • Archived' : ''}${!isSupportedGameBananaArchiveFileName(file.fileName) ? ' • Unsupported format' : ''}`;
                return `<option value="${escapeHtml(file.id)}" ${
                  file.id === selectedFileId ? 'selected' : ''
                } ${
                  file.isArchived ||
                  !isSupportedGameBananaArchiveFileName(file.fileName)
                    ? 'disabled'
                    : ''
                }>${escapeHtml(optionLabel)}</option>`;
              })
              .join('')}
          </select>
        </div>
        ${
          selectedFile
            ? `
              <div class="selected-file-card">
                <p><strong>${escapeHtml(selectedFile.fileName)}</strong></p>
                <p>${escapeHtml(selectedFile.version ?? 'No version label')} • ${escapeHtml(formatFileSize(selectedFile.fileSizeBytes))}</p>
                <p>${escapeHtml(selectedFile.description ?? 'No file description.')}</p>
                <p>Added ${escapeHtml(formatDate(selectedFile.addedAt))} • ${escapeHtml(formatNumber(selectedFile.downloadCount))} file downloads</p>
              </div>
            `
            : `
              <p class="supporting-copy">This mod does not currently expose a supported non-archived .zip file for the installer.</p>
            `
        }
      </section>
      <div class="detail-actions">
        <button class="primary-button" data-action="install-selected-mod" ${
          canInstall ? '' : 'disabled'
        }>
          ${state.isBusy ? 'Working…' : 'Download And Install Mod'}
        </button>
        <p class="supporting-copy detail-action-copy">
          Files are downloaded in the main process, extracted in staging, then copied into the validated Pak directory with backup and rollback.
        </p>
      </div>
    </article>
  `;
}

function renderBrowseModCard(state: AppState, mod: CatalogMod): string {
  const isSelected = mod.id === state.selectedModId;
  const preferredFile =
    mod.files.find((file) => file.id === mod.selectedFileId) ??
    getPreferredModFile(mod);

  return `
    <button
      class="mod-card ${isSelected ? 'mod-card-selected' : ''}"
      data-action="select-mod"
      data-mod-id="${escapeHtml(String(mod.id))}"
      ${state.isBusy ? 'disabled' : ''}
    >
      ${
        mod.previewImageUrl
          ? `
            <img
              class="mod-card-thumbnail"
              src="${escapeHtml(mod.previewImageUrl)}"
              alt="${escapeHtml(mod.name)} preview"
            />
          `
          : `
            <div class="mod-card-thumbnail mod-card-thumbnail-empty">No preview</div>
          `
      }
      <div class="mod-card-content">
        <div class="mod-card-header">
          <div>
            <p class="mod-card-title">${escapeHtml(mod.name)}</p>
            <p class="mod-card-author">by ${escapeHtml(mod.ownerName)}</p>
          </div>
          <span class="mod-card-id">#${escapeHtml(String(mod.id))}</span>
        </div>
        <p class="mod-card-summary">${escapeHtml(mod.summary || 'No description provided.')}</p>
        <div class="mod-card-footer">
          <span>${escapeHtml(formatNumber(mod.downloads))} downloads</span>
          <span>${escapeHtml(formatNumber(mod.likes))} likes</span>
          <span>${preferredFile ? escapeHtml(preferredFile.version ?? preferredFile.fileName) : 'No supported ZIP'}</span>
        </div>
      </div>
    </button>
  `;
}

function renderEmptyInstalledDetail(): string {
  return `
    <article class="detail-panel surface-card">
      <p class="section-label">Installed mod details</p>
      <div class="empty-state">
        <h2>No installed mod selected</h2>
        <p class="supporting-copy">Select an installed mod to update it to the newest GameBanana file or uninstall it completely.</p>
      </div>
    </article>
  `;
}

function renderSelectedInstalledMod(
  state: AppState,
  mod: InstalledGameBananaModSummary,
): string {
  const canAct = !state.isBusy && Boolean(state.settings.gamePath);

  return `
    <article class="detail-panel surface-card">
      ${renderModPreview(mod.previewImageUrl, mod.modName, 'No preview image')}
      <div class="detail-header">
        <div>
          <p class="section-label">Installed mod</p>
          <h2>${escapeHtml(mod.modName)}</h2>
          <p class="detail-byline">by ${escapeHtml(mod.ownerName)}</p>
        </div>
        <div class="detail-badges">
          <span class="pill pill-cyan">${escapeHtml(mod.installedVersion ?? 'No version')}</span>
          <span class="pill pill-pink">${escapeHtml(String(mod.installedFilesCount))} files</span>
        </div>
      </div>
      <div class="detail-meta">
        <span>Installed ${escapeHtml(formatDateTime(mod.installedAt))}</span>
        <a class="text-link" href="${escapeHtml(mod.profileUrl)}" target="_blank" rel="noreferrer">Open GameBanana page</a>
      </div>
      <section class="detail-copy-block">
        <p class="section-label">Recorded install</p>
        <div class="selected-file-card">
          <p><strong>${escapeHtml(mod.installedFileName)}</strong></p>
          <p>Installed file id ${escapeHtml(mod.installedFileId)}</p>
          <p>${escapeHtml(mod.installedFilesCount.toString())} tracked file write${mod.installedFilesCount === 1 ? '' : 's'} for uninstall and restore.</p>
        </div>
      </section>
      <div class="detail-actions detail-actions-stacked">
        <button class="primary-button" data-action="update-installed-mod" ${
          canAct ? '' : 'disabled'
        }>
          ${state.isBusy ? 'Working…' : 'Download Newest Version'}
        </button>
        <button class="danger-button" data-action="uninstall-installed-mod" ${
          canAct ? '' : 'disabled'
        }>
          ${state.isBusy ? 'Working…' : 'Uninstall Completely'}
        </button>
        <p class="supporting-copy detail-action-copy">
          Updates use the newest supported GameBanana file for this mod. Uninstall restores replaced files from recorded backups and removes files the mod created.
        </p>
      </div>
    </article>
  `;
}

function renderInstalledModCard(
  state: AppState,
  mod: InstalledGameBananaModSummary,
): string {
  const isSelected = mod.modId === state.selectedInstalledModId;

  return `
    <button
      class="mod-card ${isSelected ? 'mod-card-selected' : ''}"
      data-action="select-installed-mod"
      data-mod-id="${escapeHtml(String(mod.modId))}"
      ${state.isBusy ? 'disabled' : ''}
    >
      ${
        mod.previewImageUrl
          ? `
            <img
              class="mod-card-thumbnail"
              src="${escapeHtml(mod.previewImageUrl)}"
              alt="${escapeHtml(mod.modName)} preview"
            />
          `
          : `
            <div class="mod-card-thumbnail mod-card-thumbnail-empty">No preview</div>
          `
      }
      <div class="mod-card-content">
        <div class="mod-card-header">
          <div>
            <p class="mod-card-title">${escapeHtml(mod.modName)}</p>
            <p class="mod-card-author">by ${escapeHtml(mod.ownerName)}</p>
          </div>
          <span class="mod-card-id">#${escapeHtml(String(mod.modId))}</span>
        </div>
        <p class="mod-card-summary">Installed ${escapeHtml(formatDateTime(mod.installedAt))}</p>
        <div class="mod-card-footer">
          <span>${escapeHtml(mod.installedVersion ?? 'No version')}</span>
          <span>${escapeHtml(mod.installedFileName)}</span>
        </div>
      </div>
    </button>
  `;
}

function renderWorkspaceTabs(state: AppState): string {
  return `
    <div class="workspace-tabs">
      <button
        class="tab-button ${state.activeTab === 'browse' ? 'tab-button-active' : ''}"
        data-action="switch-tab"
        data-tab="browse"
        ${state.isBusy ? 'disabled' : ''}
      >
        Browse Mods
      </button>
      <button
        class="tab-button ${state.activeTab === 'installed' ? 'tab-button-active' : ''}"
        data-action="switch-tab"
        data-tab="installed"
        ${state.isBusy ? 'disabled' : ''}
      >
        Installed Mods
      </button>
    </div>
  `;
}

function renderBrowseWorkspace(state: AppState): string {
  const selectedMod = getSelectedMod(state);
  const detailMarkup = selectedMod
    ? renderSelectedBrowseMod(state, selectedMod)
    : renderEmptyBrowseDetail(state);

  return `
    <header class="workspace-header surface-card">
      <div>
        <p class="section-label">GameBanana recent mods</p>
        <h2>Game ID 23012 · Page ${escapeHtml(String(state.catalogPage))}</h2>
        <p class="supporting-copy">${escapeHtml(state.libraryMessage)}</p>
      </div>
      <div class="browser-controls">
        <button class="secondary-button" data-action="page-prev" ${
          state.isBusy || state.catalogPage <= 1 ? 'disabled' : ''
        }>
          Previous Page
        </button>
        <button class="secondary-button" data-action="page-next" ${
          state.isBusy || !state.catalogHasNextPage ? 'disabled' : ''
        }>
          Next Page
        </button>
      </div>
    </header>
    <section class="browser-layout">
      <article class="library-panel surface-card">
        <div class="library-list">
          ${
            state.mods.length > 0
              ? state.mods
                  .map((mod) => renderBrowseModCard(state, mod))
                  .join('')
              : `
                  <div class="empty-state">
                    <h3>No mods on this page</h3>
                    <p class="supporting-copy">The recent feed returned no entries for this page.</p>
                  </div>
                `
          }
        </div>
      </article>
      ${detailMarkup}
    </section>
  `;
}

function renderInstalledWorkspace(state: AppState): string {
  const selectedInstalledMod = getSelectedInstalledMod(state);
  const detailMarkup = selectedInstalledMod
    ? renderSelectedInstalledMod(state, selectedInstalledMod)
    : renderEmptyInstalledDetail();

  return `
    <header class="workspace-header surface-card">
      <div>
        <p class="section-label">Installed GameBanana mods</p>
        <h2>${escapeHtml(String(state.installedMods.length))} recorded installs</h2>
        <p class="supporting-copy">Recorded installs track file writes and backups so the app can update the newest version or uninstall the mod cleanly.</p>
      </div>
      <div class="browser-controls">
        <button class="secondary-button" data-action="refresh-installed" ${
          state.isBusy ? 'disabled' : ''
        }>
          Refresh Installed List
        </button>
      </div>
    </header>
    <section class="browser-layout">
      <article class="library-panel surface-card">
        <div class="library-list">
          ${
            state.installedMods.length > 0
              ? state.installedMods
                  .map((mod) => renderInstalledModCard(state, mod))
                  .join('')
              : `
                  <div class="empty-state">
                    <h3>No installed mods yet</h3>
                    <p class="supporting-copy">Install a GameBanana mod from the browse tab and it will appear here with update and uninstall actions.</p>
                  </div>
                `
          }
        </div>
      </article>
      ${detailMarkup}
    </section>
  `;
}

function renderTemplate(state: AppState): string {
  const selectedPath =
    state.settings.gamePath ?? 'No game folder selected yet.';
  const statusLabel = state.settings.gamePath
    ? 'Ready for installs'
    : 'Needs setup';
  const sigTemplateDirectory = state.settings.gamePath
    ? `${state.settings.gamePath}\\Client\\WindowsNoEditor\\HT\\Content\\Paks`
    : 'Choose a game folder to reveal the Pak signature folder.';
  const operationDetailsMarkup =
    state.activityLines.length > 0
      ? `
          <ul class="activity-list">
            ${state.activityLines
              .map((line) => `<li>${escapeHtml(line)}</li>`)
              .join('')}
          </ul>
        `
      : `
          <p class="status-message">
            Recent GameBanana mods load page by page. Installing a mod downloads the selected archive, copies recognized Unreal assets into the configured Pak directory, and records enough file metadata to update or uninstall the mod later.
          </p>
        `;

  return `
    <div class="app-shell">
      <aside class="hero-panel">
        <div class="hero-stack">
          <div>
            <p class="eyebrow">Neverness to Everness</p>
            <h1>NTE Mod Manager</h1>
            <p class="hero-copy">
              Browse the live GameBanana feed, inspect mod files, and manage installed mods with explicit filesystem boundaries.
            </p>
            <div class="hero-pills">
              <span class="pill pill-cyan">GameBanana browser</span>
              <span class="pill pill-pink">Recorded installs</span>
            </div>
          </div>

          <section class="surface-card surface-card-lead">
            <div class="status-row">
              <div>
                <p class="section-label">Game install</p>
                <h2>${escapeHtml(selectedPath)}</h2>
              </div>
              <span class="status-badge">${escapeHtml(statusLabel)}</span>
            </div>
            <p class="supporting-copy">
              Privileged file operations stay in the main process. The renderer only selects the game path, page number, tab, and mod identifiers.
            </p>
            <div class="action-row">
              <button class="primary-button" data-action="choose-game-directory" ${state.isBusy ? 'disabled' : ''}>
                ${state.isBusy ? 'Working…' : 'Choose Game Folder'}
              </button>
              <button class="secondary-button" data-action="install-mod-framework" ${
                state.isBusy || !state.settings.gamePath ? 'disabled' : ''
              }>
                ${state.isBusy ? 'Working…' : 'Install Loader + Sig Bypass'}
              </button>
              <button class="secondary-button" data-action="refresh-all" ${state.isBusy ? 'disabled' : ''}>
                Refresh All
              </button>
            </div>
            <p class="config-value">
              Pak signature template path:
              <strong>${escapeHtml(sigTemplateDirectory)}</strong>
            </p>
          </section>

          <section class="surface-card">
            <p class="section-label">Status</p>
            <p class="status-message">${escapeHtml(state.message)}</p>
            <p class="supporting-copy subtle-copy">
              Last settings update: ${escapeHtml(formatDateTime(state.settings.lastUpdatedAt))}
            </p>
          </section>

          <section class="surface-card">
            <p class="section-label">${escapeHtml(state.activityTitle)}</p>
            ${operationDetailsMarkup}
          </section>
        </div>
      </aside>

      <main class="workspace-panel">
        ${renderWorkspaceTabs(state)}
        ${
          state.activeTab === 'browse'
            ? renderBrowseWorkspace(state)
            : renderInstalledWorkspace(state)
        }
      </main>
    </div>
  `;
}

function syncCatalogState(state: AppState, result: CatalogBrowseResult): void {
  state.catalogHasNextPage = result.hasNextPage;
  state.catalogPage = result.page;
  state.libraryMessage =
    result.mods.length > 0
      ? `Loaded ${result.mods.length} recent mods from GameBanana.`
      : 'This recent-mod page is empty.';
  state.mods = result.mods;

  for (const mod of result.mods) {
    state.selectedFileIds[mod.id] ??= mod.selectedFileId;
  }

  const hasSelectedMod = result.mods.some(
    (mod) => mod.id === state.selectedModId,
  );
  state.selectedModId = hasSelectedMod
    ? state.selectedModId
    : (result.mods[0]?.id ?? null);
}

function syncInstalledMods(
  state: AppState,
  installedMods: InstalledGameBananaModSummary[],
): void {
  state.installedMods = [...installedMods].sort((left, right) =>
    right.installedAt.localeCompare(left.installedAt),
  );

  const hasSelectedInstalledMod = state.installedMods.some(
    (mod) => mod.modId === state.selectedInstalledModId,
  );
  state.selectedInstalledModId = hasSelectedInstalledMod
    ? state.selectedInstalledModId
    : (state.installedMods[0]?.modId ?? null);
}

async function loadCatalogPage(
  state: AppState,
  appApi: AppApi,
  page: number,
): Promise<void> {
  const result = await appApi.listGameBananaMods(page);
  syncCatalogState(state, result);
}

async function loadInstalledMods(
  state: AppState,
  appApi: AppApi,
): Promise<void> {
  const installedMods = await appApi.listInstalledGameBananaMods();
  syncInstalledMods(state, installedMods);
}

async function refreshState(state: AppState, appApi: AppApi): Promise<void> {
  const [settings, catalogResult, installedMods] = await Promise.all([
    appApi.getSettings(),
    appApi.listGameBananaMods(state.catalogPage),
    appApi.listInstalledGameBananaMods(),
  ]);

  state.settings = settings;
  syncCatalogState(state, catalogResult);
  syncInstalledMods(state, installedMods);
  state.message = state.settings.gamePath
    ? 'Settings loaded. Browse mods or manage installed ones from the separate tab.'
    : 'Select your NTE install folder to unlock mod installs.';
}

function formatFrameworkInstallDetails(
  result: InstallModFrameworkResult,
): string[] {
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
  const sigReminder = `For each mod, copy an existing .sig file from ${result.sigTemplateDirectory} and rename it to match the mod package when the archive does not already provide one.`;

  return [...sourceLines, ...fileLines, backupLine, sigReminder];
}

function formatModInstallDetails(result: InstallGameBananaModResult): string[] {
  const installedLines = result.installedFiles.map((file) => {
    const verb = file.action === 'replaced' ? 'Replaced' : 'Installed';
    const originLabel =
      file.origin === 'sig-template'
        ? 'from a signature template'
        : 'from the downloaded archive';

    return `${verb} ${file.sourceFileName} at ${file.destinationPath} ${originLabel}.`;
  });
  const backupLine = result.backupDirectory
    ? `Backed up replaced files to ${result.backupDirectory}.`
    : 'No existing mod files needed a backup.';

  return [
    `${result.status === 'updated' ? 'Updated' : 'Installed'} ${result.modName} using file ${result.downloadedFileName}.`,
    `Selected file id ${result.selectedFileId} resolved to ${result.downloadUrl}.`,
    ...result.notes,
    ...installedLines,
    backupLine,
  ];
}

function formatUpdateDetails(
  result: UpdateInstalledGameBananaModResult,
): string[] {
  if (result.status === 'already-latest') {
    return result.notes;
  }

  return formatModInstallDetails({
    ...result,
    downloadedFileName: result.downloadedFileName ?? 'Unknown file',
    downloadUrl: result.downloadUrl ?? 'Unknown URL',
    previousFileId: result.previousFileId,
    status: 'updated',
    sigTemplateDirectory: result.sigTemplateDirectory ?? 'Unknown directory',
  });
}

function formatUninstallDetails(
  result: UninstallGameBananaModResult,
): string[] {
  const removedLines = result.removedFiles.map((file) => {
    const actionLabel =
      file.action === 'replaced'
        ? 'Restored previous file at'
        : 'Removed installed file at';

    return `${actionLabel} ${file.destinationPath}.`;
  });

  return [...result.notes, ...removedLines];
}

export function createApp(root: HTMLElement, appApi: AppApi): void {
  const state: AppState = {
    activeTab: 'browse',
    activityLines: [],
    activityTitle: 'Latest activity',
    catalogHasNextPage: false,
    catalogPage: 1,
    installedMods: [],
    isBusy: false,
    libraryMessage: 'Loading the recent GameBanana feed…',
    message: 'Booting application shell…',
    mods: [],
    selectedFileIds: {},
    selectedInstalledModId: null,
    selectedModId: null,
    settings: defaultAppSettings,
  };

  const render = (): void => {
    root.innerHTML = renderTemplate(state);

    root
      .querySelector<HTMLButtonElement>('[data-action="choose-game-directory"]')
      ?.addEventListener('click', async () => {
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

    root
      .querySelector<HTMLButtonElement>('[data-action="install-mod-framework"]')
      ?.addEventListener('click', async () => {
        state.isBusy = true;
        state.message =
          'Downloading and installing the latest mod framework files…';
        state.activityLines = [];
        state.activityTitle = 'Framework activity';
        render();

        try {
          const result = await appApi.installModFramework();
          state.activityLines = formatFrameworkInstallDetails(result);
          state.message =
            'Framework installed. GameBanana mods can now reuse existing Pak signatures when needed.';
        } catch (error) {
          state.message =
            error instanceof Error
              ? `Framework install failed: ${error.message}`
              : 'Framework install failed.';
          state.activityLines = [
            'If any file copy failed after writes began, the installer restored the previous framework files.',
          ];
        } finally {
          state.isBusy = false;
        }

        render();
      });

    root
      .querySelector<HTMLButtonElement>('[data-action="refresh-all"]')
      ?.addEventListener('click', async () => {
        state.isBusy = true;
        state.message = 'Refreshing settings, recent mods, and installed mods…';
        render();

        try {
          await refreshState(state, appApi);
        } catch (error) {
          state.message =
            error instanceof Error
              ? `Refresh failed: ${error.message}`
              : 'Refresh failed.';
        } finally {
          state.isBusy = false;
        }

        render();
      });

    root
      .querySelector<HTMLButtonElement>('[data-action="refresh-installed"]')
      ?.addEventListener('click', async () => {
        state.isBusy = true;
        state.message = 'Refreshing the installed-mod registry…';
        render();

        try {
          await loadInstalledMods(state, appApi);
          state.message = 'Installed-mod registry refreshed.';
        } catch (error) {
          state.message =
            error instanceof Error
              ? `Installed-mod refresh failed: ${error.message}`
              : 'Installed-mod refresh failed.';
        } finally {
          state.isBusy = false;
        }

        render();
      });

    root
      .querySelector<HTMLButtonElement>('[data-action="page-prev"]')
      ?.addEventListener('click', async () => {
        state.isBusy = true;
        state.message = 'Loading the previous GameBanana page…';
        render();

        try {
          await loadCatalogPage(state, appApi, state.catalogPage - 1);
          state.message = 'Loaded the previous GameBanana page.';
        } catch (error) {
          state.message =
            error instanceof Error
              ? `Could not load the previous page: ${error.message}`
              : 'Could not load the previous page.';
        } finally {
          state.isBusy = false;
        }

        render();
      });

    root
      .querySelector<HTMLButtonElement>('[data-action="page-next"]')
      ?.addEventListener('click', async () => {
        state.isBusy = true;
        state.message = 'Loading the next GameBanana page…';
        render();

        try {
          await loadCatalogPage(state, appApi, state.catalogPage + 1);
          state.message = 'Loaded the next GameBanana page.';
        } catch (error) {
          state.message =
            error instanceof Error
              ? `Could not load the next page: ${error.message}`
              : 'Could not load the next page.';
        } finally {
          state.isBusy = false;
        }

        render();
      });

    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-action="switch-tab"]',
    )) {
      button.addEventListener('click', () => {
        const nextTab = button.dataset.tab;

        if (nextTab === 'browse' || nextTab === 'installed') {
          state.activeTab = nextTab;
          render();
        }
      });
    }

    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-action="select-mod"]',
    )) {
      button.addEventListener('click', () => {
        const modId = Number(button.dataset.modId);

        if (!Number.isInteger(modId)) {
          return;
        }

        state.selectedModId = modId;
        render();
      });
    }

    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-action="select-installed-mod"]',
    )) {
      button.addEventListener('click', () => {
        const modId = Number(button.dataset.modId);

        if (!Number.isInteger(modId)) {
          return;
        }

        state.selectedInstalledModId = modId;
        render();
      });
    }

    root
      .querySelector<HTMLSelectElement>('[data-action="select-mod-file"]')
      ?.addEventListener('change', (event) => {
        const selectedMod = getSelectedMod(state);

        if (!selectedMod) {
          return;
        }

        const target = event.currentTarget as HTMLSelectElement;
        state.selectedFileIds[selectedMod.id] = target.value;
        render();
      });

    root
      .querySelector<HTMLButtonElement>('[data-action="install-selected-mod"]')
      ?.addEventListener('click', async () => {
        const selectedMod = getSelectedMod(state);
        const selectedFile = getSelectedFile(state);

        if (!selectedMod || !selectedFile) {
          return;
        }

        state.isBusy = true;
        state.message = `Downloading and installing ${selectedMod.name}…`;
        state.activityLines = [];
        state.activityTitle = 'Mod install activity';
        render();

        try {
          const result = await appApi.installGameBananaMod({
            fileId: selectedFile.id,
            modId: selectedMod.id,
          });
          state.activityLines = formatModInstallDetails(result);
          await loadInstalledMods(state, appApi);
          state.selectedInstalledModId = result.modId;
          state.message =
            result.status === 'updated'
              ? `${result.modName} updated successfully.`
              : `${result.modName} installed successfully.`;
        } catch (error) {
          state.message =
            error instanceof Error
              ? `Mod install failed: ${error.message}`
              : 'Mod install failed.';
          state.activityLines = [
            'If any file copy failed after writes began, the installer restored the previous mod files.',
          ];
        } finally {
          state.isBusy = false;
        }

        render();
      });

    root
      .querySelector<HTMLButtonElement>('[data-action="update-installed-mod"]')
      ?.addEventListener('click', async () => {
        const selectedInstalledMod = getSelectedInstalledMod(state);

        if (!selectedInstalledMod) {
          return;
        }

        state.isBusy = true;
        state.message = `Checking GameBanana for the newest ${selectedInstalledMod.modName} file…`;
        state.activityLines = [];
        state.activityTitle = 'Installed mod activity';
        render();

        try {
          const result = await appApi.updateInstalledGameBananaMod({
            modId: selectedInstalledMod.modId,
          });
          state.activityLines = formatUpdateDetails(result);
          await loadInstalledMods(state, appApi);
          state.selectedInstalledModId = result.modId;
          state.message =
            result.status === 'already-latest'
              ? `${result.modName} is already on the newest supported file.`
              : `${result.modName} updated to the newest supported file.`;
        } catch (error) {
          state.message =
            error instanceof Error
              ? `Installed-mod update failed: ${error.message}`
              : 'Installed-mod update failed.';
          state.activityLines = [
            'If an uninstall or reinstall step failed after writes began, the service attempted to roll the filesystem back to the previous recorded state.',
          ];
        } finally {
          state.isBusy = false;
        }

        render();
      });

    root
      .querySelector<HTMLButtonElement>(
        '[data-action="uninstall-installed-mod"]',
      )
      ?.addEventListener('click', async () => {
        const selectedInstalledMod = getSelectedInstalledMod(state);

        if (!selectedInstalledMod) {
          return;
        }

        state.isBusy = true;
        state.message = `Uninstalling ${selectedInstalledMod.modName}…`;
        state.activityLines = [];
        state.activityTitle = 'Installed mod activity';
        render();

        try {
          const result = await appApi.uninstallGameBananaMod({
            modId: selectedInstalledMod.modId,
          });
          state.activityLines = formatUninstallDetails(result);
          await loadInstalledMods(state, appApi);
          state.message = `${result.modName} uninstalled successfully.`;
        } catch (error) {
          state.message =
            error instanceof Error
              ? `Uninstall failed: ${error.message}`
              : 'Uninstall failed.';
          state.activityLines = [
            'If an uninstall step failed after writes began, the service attempted to restore the previous recorded files.',
          ];
        } finally {
          state.isBusy = false;
        }

        render();
      });
  };

  render();

  void (async () => {
    state.isBusy = true;
    state.message =
      'Loading saved settings, recent GameBanana mods, and the installed-mod registry…';
    render();

    try {
      await refreshState(state, appApi);
    } catch (error) {
      state.message =
        error instanceof Error
          ? `Startup failed: ${error.message}`
          : 'Startup failed.';
    } finally {
      state.isBusy = false;
    }

    render();
  })();
}
