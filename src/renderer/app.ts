import {
  isSupportedGameBananaArchiveFileName,
  nteCharacterCategories,
  type CatalogBrowseResult,
  type CatalogMod,
  type CatalogModCategory,
  type CatalogModFile,
} from '../shared/catalog';
import type {
  AppApi,
  InstallKnownGameBananaUtilityResult,
  InstallModFrameworkResult,
} from '../shared/ipc';
import type {
  InstallGameBananaModResult,
  InstalledGameBananaModSummary,
  SetInstalledGameBananaModEnabledResult,
  UninstallGameBananaModResult,
  UpdateInstalledGameBananaModResult,
} from '../shared/mods';
import { defaultAppSettings, type AppSettings } from '../shared/settings';

type WorkspaceTab = 'browse' | 'installed';
type BrowseFilter = 'all' | 'installable' | 'previewed' | 'unsupported';
type BrowseSort = 'recent' | 'downloads' | 'likes' | 'name';
type InstalledFilter = 'all' | 'disabled' | 'enabled' | 'previewed';
type InstalledSort = 'recent' | 'name' | 'version';

const initialCatalogPageWindow = 25;

interface AppState {
  activeTab: WorkspaceTab;
  activityLines: string[];
  activityTitle: string;
  browseCharacter: string;
  browseFilter: BrowseFilter;
  browseQuery: string;
  browseSort: BrowseSort;
  catalogFailedPageCount: number;
  catalogLoadedPageCount: number;
  installedFilter: InstalledFilter;
  installedMods: InstalledGameBananaModSummary[];
  installedQuery: string;
  installedSort: InstalledSort;
  isBusy: boolean;
  libraryMessage: string;
  message: string;
  mods: CatalogMod[];
  selectedInstalledFileIds: Record<number, string | null>;
  selectedFileIds: Record<number, string | null>;
  selectedModId: number | null;
  settings: AppSettings;
}

interface FocusSnapshot {
  action: string;
  end: number | null;
  modId: string | null;
  start: number | null;
}

interface CatalogWindowResult {
  failedPageNumbers: number[];
  loadedPageCount: number;
  mods: CatalogMod[];
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

function isInstalledWithinLastWeek(installedAt: string): boolean {
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(installedAt).getTime() <= sevenDaysInMs;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
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

function getSelectedInstalledFileId(
  state: AppState,
  mod: InstalledGameBananaModSummary,
): string | null {
  const candidateFileId =
    state.selectedInstalledFileIds[mod.modId] ?? mod.selectedUpdateFileId;

  if (!candidateFileId) {
    return null;
  }

  const selectedFile = mod.availableFiles.find(
    (file) => file.id === candidateFileId,
  );

  if (!selectedFile || !isSelectableModFile(selectedFile)) {
    return (
      mod.availableFiles.find((file) => isSelectableModFile(file))?.id ?? null
    );
  }

  return candidateFileId;
}

function getSelectedInstalledFile(
  state: AppState,
  mod: InstalledGameBananaModSummary,
): CatalogModFile | null {
  const selectedFileId = getSelectedInstalledFileId(state, mod);

  return mod.availableFiles.find((file) => file.id === selectedFileId) ?? null;
}

function formatModFileOptionLabel(file: CatalogModFile): string {
  return `${file.fileName} • ${file.version ?? 'No version'} • ${formatFileSize(file.fileSizeBytes)}${file.isArchived ? ' • Archived' : ''}${!isSupportedGameBananaArchiveFileName(file.fileName) ? ' • Unsupported format' : ''}`;
}

function modMatchesQuery(mod: CatalogMod, query: string): boolean {
  if (query.length === 0) {
    return true;
  }

  const haystack = [
    mod.name,
    mod.ownerName,
    mod.summary,
    mod.body,
    mod.installInstructions,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function getBrowseCharacterOptions(
  mods: CatalogMod[],
): ReadonlyArray<CatalogModCategory> {
  const liveCategories = mods
    .map((mod) => mod.category)
    .filter((category): category is CatalogModCategory => Boolean(category));
  const liveCategoryNames = new Set(
    liveCategories.map((category) => category.name),
  );
  const knownCategories = nteCharacterCategories.filter((category) =>
    liveCategoryNames.has(category.name),
  );
  const extraCategoriesByName = new Map<string, CatalogModCategory>();

  for (const category of liveCategories) {
    if (nteCharacterCategories.some((known) => known.name === category.name)) {
      continue;
    }

    extraCategoriesByName.set(category.name, category);
  }

  const extraCategories = [...extraCategoriesByName.values()].sort(
    (left, right) => left.name.localeCompare(right.name),
  );

  return [...knownCategories, ...extraCategories];
}

function getBrowseCharacterCount(
  mods: CatalogMod[],
  characterName: string,
): number {
  return mods.filter((mod) => mod.category?.name === characterName).length;
}

function renderBrowseCharacterButton(
  state: AppState,
  category: CatalogModCategory | null,
  label: string,
  count: number,
): string {
  const isActive =
    category === null
      ? state.browseCharacter.length === 0
      : state.browseCharacter === category.name;
  const iconMarkup = category?.iconUrl
    ? `<img class="character-pill-icon" src="${escapeHtml(category.iconUrl)}" alt="${escapeHtml(category.name)} icon" />`
    : `<span class="character-pill-icon character-pill-icon-fallback" aria-hidden="true">NTE</span>`;

  return `
    <button
      class="character-pill ${isActive ? 'character-pill-active' : ''}"
      data-action="set-browse-character"
      data-character="${escapeHtml(category?.name ?? '')}"
      ${state.isBusy ? 'disabled' : ''}
    >
      ${iconMarkup}
      <span class="character-pill-copy">
        <span class="character-pill-name">${escapeHtml(label)}</span>
        <span class="character-pill-count">(${escapeHtml(String(count))})</span>
      </span>
    </button>
  `;
}

function getBrowseMods(state: AppState): CatalogMod[] {
  const query = normalizeSearchValue(state.browseQuery);
  const filtered = state.mods.filter((mod) => {
    if (!modMatchesQuery(mod, query)) {
      return false;
    }

    if (
      state.browseCharacter.length > 0 &&
      mod.category?.name !== state.browseCharacter
    ) {
      return false;
    }

    switch (state.browseFilter) {
      case 'installable':
        return mod.files.some((file) => isSelectableModFile(file));
      case 'previewed':
        return Boolean(mod.previewImageUrl);
      case 'unsupported':
        return !mod.files.some((file) => isSelectableModFile(file));
      case 'all':
      default:
        return true;
    }
  });

  switch (state.browseSort) {
    case 'downloads':
      return [...filtered].sort(
        (left, right) => right.downloads - left.downloads,
      );
    case 'likes':
      return [...filtered].sort((left, right) => right.likes - left.likes);
    case 'name':
      return [...filtered].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    case 'recent':
    default:
      return filtered;
  }
}

function getInstalledMods(state: AppState): InstalledGameBananaModSummary[] {
  const query = normalizeSearchValue(state.installedQuery);
  const filtered = state.installedMods.filter((mod) => {
    if (query.length > 0) {
      const haystack = [
        mod.modName,
        mod.ownerName,
        mod.installedFileName,
        mod.installedVersion ?? '',
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(query)) {
        return false;
      }
    }

    switch (state.installedFilter) {
      case 'enabled':
        return mod.isEnabled;
      case 'disabled':
        return !mod.isEnabled;
      case 'previewed':
        return Boolean(mod.previewImageUrl);
      case 'all':
      default:
        return true;
    }
  });

  switch (state.installedSort) {
    case 'name':
      return [...filtered].sort((left, right) =>
        left.modName.localeCompare(right.modName),
      );
    case 'version':
      return [...filtered].sort((left, right) =>
        (right.installedVersion ?? '').localeCompare(
          left.installedVersion ?? '',
        ),
      );
    case 'recent':
    default:
      return [...filtered].sort((left, right) =>
        right.installedAt.localeCompare(left.installedAt),
      );
  }
}

function getSelectedMod(state: AppState): CatalogMod | null {
  const visibleMods = getBrowseMods(state);

  return (
    visibleMods.find((mod) => mod.id === state.selectedModId) ??
    visibleMods[0] ??
    null
  );
}

function renderModPreview(
  imageUrl: string | null,
  title: string,
  emptyLabel: string,
): string {
  return imageUrl
    ? `
        <div class="spotlight-media">
          <img
            class="spotlight-image"
            src="${escapeHtml(imageUrl)}"
            alt="${escapeHtml(title)} preview"
          />
        </div>
      `
    : `
        <div class="spotlight-media spotlight-media-empty">
          <span>${escapeHtml(emptyLabel)}</span>
        </div>
      `;
}

function renderBrowseFilterChip(
  state: AppState,
  filter: BrowseFilter,
  label: string,
  count: number,
): string {
  return `
    <button
      class="filter-chip ${state.browseFilter === filter ? 'filter-chip-active' : ''}"
      data-action="set-browse-filter"
      data-filter="${filter}"
      ${state.isBusy ? 'disabled' : ''}
    >
      <span>${label}</span>
      <strong>${escapeHtml(String(count))}</strong>
    </button>
  `;
}

function renderInstalledFilterChip(
  state: AppState,
  filter: InstalledFilter,
  label: string,
  count: number,
): string {
  return `
    <button
      class="filter-chip ${state.installedFilter === filter ? 'filter-chip-active' : ''}"
      data-action="set-installed-filter"
      data-filter="${filter}"
      ${state.isBusy ? 'disabled' : ''}
    >
      <span>${label}</span>
      <strong>${escapeHtml(String(count))}</strong>
    </button>
  `;
}

function renderEmptyBrowseDetail(
  state: AppState,
  visibleModsCount: number,
): string {
  const title =
    visibleModsCount > 0
      ? 'Select a mod'
      : 'No visible mods match these filters';
  const copy =
    visibleModsCount > 0
      ? 'Pick a card to inspect the preview image, supported files, and install notes.'
      : 'Try clearing the search, switching the filter, or refreshing the loaded GameBanana window.';
  const disabledLabel = state.settings.gamePath
    ? copy
    : 'Choose your NTE folder to unlock installs, then inspect a mod.';

  return `
    <article class="spotlight-card surface-card">
      <div class="empty-state">
        <p class="section-label">Mod details</p>
        <h2>${title}</h2>
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
        <section class="spotlight-copy-block">
          <p class="section-label">Install notes</p>
          <p class="detail-copy">${formatMultilineText(mod.installInstructions)}</p>
        </section>
      `
    : '';
  const categoryMarkup = mod.category
    ? `
        <div class="detail-meta">
          <span>Character ${escapeHtml(mod.category.name)}</span>
          <a class="text-link" href="${escapeHtml(mod.category.profileUrl)}" target="_blank" rel="noreferrer">Open category</a>
        </div>
      `
    : '';

  return `
    <article class="spotlight-card surface-card">
      ${renderModPreview(mod.previewImageUrl, mod.name, 'No preview image')}
      <div class="spotlight-content">
        <div class="spotlight-heading">
          <div>
            <p class="section-label">Selected mod</p>
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
        ${categoryMarkup}
        <section class="spotlight-copy-block">
          <p class="section-label">Summary</p>
          <p class="detail-copy">${formatMultilineText(mod.body || mod.summary || 'No description provided.')}</p>
        </section>
        ${installInstructionsMarkup}
        <section class="spotlight-copy-block spotlight-copy-block-strong">
          <div class="file-row">
            <div>
              <p class="section-label">Installable file</p>
              <p class="supporting-copy">Supported non-archived archive files (.zip, .7z, .rar) stay enabled. Unsupported archive formats remain visible but disabled.</p>
            </div>
            <label class="select-shell">
              <span>Selected file</span>
              <select class="file-select" data-action="select-mod-file" ${
                state.isBusy ? 'disabled' : ''
              }>
                ${
                  hasSelectableFiles
                    ? ''
                    : '<option value="" selected disabled>No supported non-archived .zip, .7z, or .rar file is available for this mod.</option>'
                }
                ${mod.files
                  .map((file) => {
                    return `<option value="${escapeHtml(file.id)}" ${
                      file.id === selectedFileId ? 'selected' : ''
                    } ${
                      file.isArchived ||
                      !isSupportedGameBananaArchiveFileName(file.fileName)
                        ? 'disabled'
                        : ''
                    }>${escapeHtml(formatModFileOptionLabel(file))}</option>`;
                  })
                  .join('')}
              </select>
            </label>
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
                <p class="supporting-copy">This mod does not currently expose a supported non-archived .zip, .7z, or .rar file for the installer.</p>
              `
          }
        </section>
        <div class="detail-actions detail-actions-stacked">
          <button class="primary-button primary-button-wide" data-action="install-selected-mod" ${
            canInstall ? '' : 'disabled'
          }>
            ${state.isBusy ? 'Working…' : 'Download And Install Mod'}
          </button>
          <p class="supporting-copy detail-action-copy">
            Downloads stay in the main process. Extraction happens in staging, then recognized Unreal assets are copied into the validated Pak directory with backup and rollback.
          </p>
        </div>
      </div>
    </article>
  `;
}

function renderBrowseModCard(state: AppState, mod: CatalogMod): string {
  const isSelected = mod.id === getSelectedMod(state)?.id;
  const preferredFile =
    mod.files.find((file) => file.id === mod.selectedFileId) ??
    getPreferredModFile(mod);
  const statusLabel = preferredFile
    ? 'Installable archive'
    : 'Unsupported archive';

  return `
    <button
      class="gallery-card ${isSelected ? 'gallery-card-selected' : ''}"
      data-action="select-mod"
      data-mod-id="${escapeHtml(String(mod.id))}"
      ${state.isBusy ? 'disabled' : ''}
    >
      <div class="gallery-card-frame">
        ${
          mod.previewImageUrl
            ? `
              <img
                class="gallery-card-image"
                src="${escapeHtml(mod.previewImageUrl)}"
                alt="${escapeHtml(mod.name)} preview"
              />
            `
            : `
              <div class="gallery-card-image gallery-card-image-empty">No preview</div>
            `
        }
        <span class="gallery-card-corner">Mod</span>
        <span class="gallery-card-status">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="gallery-card-copy">
        <p class="gallery-card-title">${escapeHtml(mod.name)}</p>
        <p class="gallery-card-author">by ${escapeHtml(mod.ownerName)}</p>
        <p class="gallery-card-author">${escapeHtml(mod.category?.name ?? 'Uncategorized')}</p>
        <p class="gallery-card-summary">${escapeHtml(mod.summary || 'No description provided.')}</p>
        <div class="gallery-card-meta">
          <span>${escapeHtml(formatNumber(mod.downloads))} downloads</span>
          <span>${escapeHtml(formatNumber(mod.likes))} likes</span>
          <span>${escapeHtml(preferredFile?.version ?? 'No archive')}</span>
        </div>
      </div>
    </button>
  `;
}

function renderInstalledModCard(
  state: AppState,
  mod: InstalledGameBananaModSummary,
): string {
  const selectedFileId = getSelectedInstalledFileId(state, mod);
  const selectedFile = getSelectedInstalledFile(state, mod);
  const canAct =
    !state.isBusy && Boolean(state.settings.gamePath) && Boolean(selectedFile);
  const stateLabel = mod.isEnabled ? 'Enabled' : 'Disabled';
  const toggleLabel = mod.isEnabled ? 'Disable Mod' : 'Enable Mod';
  const toggleClassName = mod.isEnabled
    ? 'secondary-button secondary-button-compact installed-toggle-button'
    : 'secondary-button secondary-button-compact installed-toggle-button installed-toggle-button-disabled';
  const installedMeta = isInstalledWithinLastWeek(mod.installedAt)
    ? 'Installed this week'
    : `Installed ${formatDate(mod.installedAt)}`;

  return `
    <article class="installed-card surface-card">
      <div class="installed-card-media">
        ${
          mod.previewImageUrl
            ? `
              <img
                class="installed-card-image"
                src="${escapeHtml(mod.previewImageUrl)}"
                alt="${escapeHtml(mod.modName)} preview"
              />
            `
            : `
              <div class="installed-card-image installed-card-image-empty">No preview</div>
            `
        }
      </div>
      <div class="installed-card-body">
        <div class="installed-card-heading">
          <div>
            <p class="installed-card-title">${escapeHtml(mod.modName)}</p>
            <p class="installed-card-author">by ${escapeHtml(mod.ownerName)}</p>
          </div>
          <div class="installed-card-badges">
            <span class="pill ${mod.isEnabled ? 'pill-cyan' : 'pill-pink'}">${escapeHtml(stateLabel)}</span>
            <span class="pill pill-neutral">${escapeHtml(mod.installedVersion ?? 'No version')}</span>
          </div>
        </div>
        <div class="installed-card-meta">
          <span>${escapeHtml(installedMeta)}</span>
          <span>${escapeHtml(String(mod.installedFilesCount))} tracked file${mod.installedFilesCount === 1 ? '' : 's'}</span>
        </div>
        <div class="installed-card-registry">
          <p class="installed-card-registry-title">${escapeHtml(mod.installedFileName)}</p>
          <p class="installed-card-registry-copy">File id ${escapeHtml(mod.installedFileId)}</p>
        </div>
        <div class="installed-card-update-shell">
          <label class="select-shell installed-card-select-shell">
            <span>GameBanana file</span>
            <select
              class="file-select"
              data-action="select-installed-mod-file"
              data-mod-id="${escapeHtml(String(mod.modId))}"
              ${state.isBusy ? 'disabled' : ''}
            >
              ${
                mod.availableFiles.some((file) => isSelectableModFile(file))
                  ? ''
                  : '<option value="" selected disabled>No supported non-archived .zip, .7z, or .rar file is currently available for this mod.</option>'
              }
              ${mod.availableFiles
                .map(
                  (file) =>
                    `<option value="${escapeHtml(file.id)}" ${
                      file.id === selectedFileId ? 'selected' : ''
                    } ${
                      file.isArchived ||
                      !isSupportedGameBananaArchiveFileName(file.fileName)
                        ? 'disabled'
                        : ''
                    }>${escapeHtml(formatModFileOptionLabel(file))}</option>`,
                )
                .join('')}
            </select>
          </label>
          ${
            selectedFile
              ? `
                <div class="selected-file-card installed-selected-file-card">
                  <p><strong>${escapeHtml(selectedFile.fileName)}</strong></p>
                  <p>${escapeHtml(selectedFile.version ?? 'No version label')} • ${escapeHtml(formatFileSize(selectedFile.fileSizeBytes))}</p>
                  <p>${escapeHtml(selectedFile.description ?? 'No file description.')}</p>
                </div>
              `
              : `
                <p class="installed-card-registry-copy">
                  GameBanana is not currently exposing a supported non-archived .zip, .7z, or .rar file for this recorded install.
                </p>
              `
          }
        </div>
        <div class="installed-card-controls">
          <button
            class="secondary-button secondary-button-compact"
            data-action="update-installed-mod"
            data-mod-id="${escapeHtml(String(mod.modId))}"
            ${canAct ? '' : 'disabled'}
          >
            ${state.isBusy ? 'Working…' : 'Install Selected File'}
          </button>
          <button
            class="${toggleClassName}"
            data-action="toggle-installed-mod-enabled"
            data-enabled="${mod.isEnabled ? 'false' : 'true'}"
            data-mod-id="${escapeHtml(String(mod.modId))}"
            ${canAct ? '' : 'disabled'}
          >
            ${state.isBusy ? 'Working…' : escapeHtml(toggleLabel)}
          </button>
          <button
            class="danger-button danger-button-compact"
            data-action="uninstall-installed-mod"
            data-mod-id="${escapeHtml(String(mod.modId))}"
            ${canAct ? '' : 'disabled'}
          >
            ${state.isBusy ? 'Working…' : 'Uninstall'}
          </button>
        </div>
        <div class="installed-card-footer">
          <a class="text-link" href="${escapeHtml(mod.profileUrl)}" target="_blank" rel="noreferrer">Open GameBanana page</a>
        </div>
      </div>
    </article>
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
  const visibleMods = getBrowseMods(state);
  const selectedMod = getSelectedMod(state);
  const browseCharacterOptions = getBrowseCharacterOptions(state.mods);
  const installableCount = state.mods.filter((mod) =>
    mod.files.some((file) => isSelectableModFile(file)),
  ).length;
  const previewCount = state.mods.filter((mod) =>
    Boolean(mod.previewImageUrl),
  ).length;
  const detailMarkup = selectedMod
    ? renderSelectedBrowseMod(state, selectedMod)
    : renderEmptyBrowseDetail(state, visibleMods.length);

  return `
    <section class="workspace-surface">
      <header class="workspace-stage surface-card">
        <div class="workspace-stage-heading">
          <div>
            <p class="section-label">GameBanana recent mods</p>
            <h2>Online library for NTE</h2>
            <p class="supporting-copy">${escapeHtml(state.libraryMessage)}</p>
          </div>
          <div class="stage-stat-strip">
            <span class="stage-stat">${escapeHtml(String(visibleMods.length))} visible</span>
            <span class="stage-stat">Pages 1-${escapeHtml(String(initialCatalogPageWindow))}</span>
            <span class="stage-stat">${escapeHtml(String(state.catalogLoadedPageCount))} loaded${state.catalogFailedPageCount > 0 ? ` / ${escapeHtml(String(state.catalogFailedPageCount))} failed` : ''}</span>
            <span class="stage-stat">Game ID 23012</span>
          </div>
        </div>
        <div class="toolbar-grid">
          <label class="search-shell">
            <span>Search the loaded 25-page window</span>
            <input
              class="search-input"
              type="search"
              value="${escapeHtml(state.browseQuery)}"
              placeholder="Search the first 25 recent pages by mod, author, summary, or install notes"
              data-action="set-browse-query"
              ${state.isBusy ? 'disabled' : ''}
            />
          </label>
          <label class="select-shell">
            <span>Sort by</span>
            <select class="toolbar-select" data-action="set-browse-sort" ${state.isBusy ? 'disabled' : ''}>
              <option value="recent" ${state.browseSort === 'recent' ? 'selected' : ''}>Recent feed order</option>
              <option value="downloads" ${state.browseSort === 'downloads' ? 'selected' : ''}>Most downloads</option>
              <option value="likes" ${state.browseSort === 'likes' ? 'selected' : ''}>Most likes</option>
              <option value="name" ${state.browseSort === 'name' ? 'selected' : ''}>Name A-Z</option>
            </select>
          </label>
          <div class="toolbar-actions">
            <button class="secondary-button" data-action="refresh-browse-window" ${
              state.isBusy ? 'disabled' : ''
            }>
              Reload 25 Pages
            </button>
          </div>
        </div>
        <div class="character-row">
          <p class="character-row-label">Characters</p>
          <div class="character-strip">
            ${renderBrowseCharacterButton(
              state,
              null,
              'All',
              state.mods.length,
            )}
            ${browseCharacterOptions
              .map((category) =>
                renderBrowseCharacterButton(
                  state,
                  category,
                  category.name,
                  getBrowseCharacterCount(state.mods, category.name),
                ),
              )
              .join('')}
          </div>
        </div>
        <div class="filter-row">
          ${renderBrowseFilterChip(state, 'all', 'All mods', state.mods.length)}
          ${renderBrowseFilterChip(state, 'installable', 'Installable only', installableCount)}
          ${renderBrowseFilterChip(state, 'previewed', 'With preview', previewCount)}
        </div>
      </header>
      ${detailMarkup}
      <section class="gallery-shell">
        <div class="gallery-header">
          <div>
            <p class="section-label">Library</p>
            <h3>${escapeHtml(String(visibleMods.length))} mod${visibleMods.length === 1 ? '' : 's'} on this view</h3>
          </div>
          <p class="supporting-copy">The browser preloads the first 25 recent GameBanana pages on startup, then filters and search work across that combined window.</p>
        </div>
        <div class="gallery-grid">
          ${
            visibleMods.length > 0
              ? visibleMods
                  .map((mod) => renderBrowseModCard(state, mod))
                  .join('')
              : `
                  <div class="empty-state gallery-empty">
                    <h3>No mods found</h3>
                    <p class="supporting-copy">The loaded 25-page window has no mods matching these filters.</p>
                  </div>
                `
          }
        </div>
      </section>
    </section>
  `;
}

function renderInstalledWorkspace(state: AppState): string {
  const visibleMods = getInstalledMods(state);
  const enabledCount = state.installedMods.filter(
    (mod) => mod.isEnabled,
  ).length;
  const disabledCount = state.installedMods.length - enabledCount;
  const previewCount = state.installedMods.filter((mod) =>
    Boolean(mod.previewImageUrl),
  ).length;

  return `
    <section class="workspace-surface">
      <header class="workspace-stage surface-card">
        <div class="workspace-stage-heading">
          <div>
            <p class="section-label">Installed GameBanana mods</p>
            <h2>Recorded installs</h2>
            <p class="supporting-copy">Each recorded install tracks file writes and backups so the app can reinstall a selected supported GameBanana file or uninstall the mod cleanly.</p>
          </div>
          <div class="stage-stat-strip">
            <span class="stage-stat">${escapeHtml(String(visibleMods.length))} visible</span>
            <span class="stage-stat">${escapeHtml(String(state.installedMods.length))} tracked total</span>
            <span class="stage-stat">${escapeHtml(String(enabledCount))} enabled</span>
            <span class="stage-stat">${escapeHtml(String(disabledCount))} disabled</span>
          </div>
        </div>
        <div class="toolbar-grid">
          <label class="search-shell">
            <span>Search installed mods</span>
            <input
              class="search-input"
              type="search"
              value="${escapeHtml(state.installedQuery)}"
              placeholder="Search installed mod names, versions, or archive names"
              data-action="set-installed-query"
              ${state.isBusy ? 'disabled' : ''}
            />
          </label>
          <label class="select-shell">
            <span>Sort by</span>
            <select class="toolbar-select" data-action="set-installed-sort" ${state.isBusy ? 'disabled' : ''}>
              <option value="recent" ${state.installedSort === 'recent' ? 'selected' : ''}>Most recent install</option>
              <option value="name" ${state.installedSort === 'name' ? 'selected' : ''}>Name A-Z</option>
              <option value="version" ${state.installedSort === 'version' ? 'selected' : ''}>Version label</option>
            </select>
          </label>
          <div class="toolbar-actions">
            <button class="secondary-button" data-action="refresh-installed" ${
              state.isBusy ? 'disabled' : ''
            }>
              Refresh Installed List
            </button>
          </div>
        </div>
        <div class="filter-row">
          ${renderInstalledFilterChip(state, 'all', 'All installs', state.installedMods.length)}
          ${renderInstalledFilterChip(state, 'enabled', 'Enabled', enabledCount)}
          ${renderInstalledFilterChip(state, 'disabled', 'Disabled', disabledCount)}
          ${renderInstalledFilterChip(state, 'previewed', 'With preview', previewCount)}
        </div>
      </header>
      <section class="gallery-shell installed-gallery-shell">
        <div class="gallery-header">
          <div>
            <p class="section-label">Registry</p>
            <h3>${escapeHtml(String(visibleMods.length))} installed mod${visibleMods.length === 1 ? '' : 's'} on this view</h3>
          </div>
          <p class="supporting-copy">Each installed mod stays in a compact card with a small preview, live GameBanana file selection, enable or disable toggle, and uninstall action.</p>
        </div>
        <div class="installed-grid">
          ${
            visibleMods.length > 0
              ? visibleMods
                  .map((mod) => renderInstalledModCard(state, mod))
                  .join('')
              : `
                  <div class="empty-state gallery-empty">
                    <h3>No installed mods found</h3>
                    <p class="supporting-copy">Install a GameBanana mod from the browse tab and it will appear here with file selection, reinstall, and uninstall actions.</p>
                  </div>
                `
          }
        </div>
      </section>
    </section>
  `;
}

function renderTemplate(state: AppState): string {
  const selectedPath =
    state.settings.gamePath ?? 'No game folder selected yet.';
  const statusLabel = state.settings.gamePath ? 'Ready' : 'Needs setup';
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
            The browser preloads the first 25 recent GameBanana pages into one local window. Installing a mod downloads the selected archive, copies recognized Unreal assets into a dedicated folder under the configured Pak ~mods directory, and records enough file metadata to update or uninstall the mod later.
          </p>
        `;

  return `
    <div class="app-shell">
      <aside class="hero-panel">
        <div class="hero-stack">
          <section class="hero-brand">
          <div class="brand-mark">
              <span>NTE</span>
            </div>

            <div>
              <p class="eyebrow">Neverness to Everness</p>

              <h1>NTE Mod Manager</h1>
              <p class="hero-copy">
                Browse the live GameBanana feed, inspect installable files, and manage recorded installs without blurring the filesystem boundary.
              </p>
            </div>
          </section>

          ${renderWorkspaceTabs(state)}

          <section class="surface-card surface-card-lead">
            <div class="status-row">
              <div>
                <p class="section-label">Game install</p>
                <h2>${escapeHtml(selectedPath)}</h2>
              </div>
              <span class="status-badge">${escapeHtml(statusLabel)}</span>
            </div>
            <p class="supporting-copy">
              Privileged file operations stay in the main process. The renderer only selects the game path, loaded browse window, active tab, and mod identifiers.
            </p>
            <div class="action-row">
              <button class="primary-button" data-action="choose-game-directory" ${state.isBusy ? 'disabled' : ''}>
                ${state.isBusy ? 'Working…' : 'Choose Game Folder'}
              </button>
              <div class="action-stack">
                <button class="secondary-button" data-action="install-mod-framework" ${
                  state.isBusy || !state.settings.gamePath ? 'disabled' : ''
                }>
                  ${state.isBusy ? 'Working…' : 'Install Loader + Sig Bypass'}
                </button>
                <button class="secondary-button" data-action="install-censorship-remover" ${
                  state.isBusy || !state.settings.gamePath ? 'disabled' : ''
                }>
                  ${state.isBusy ? 'Working…' : 'Install Censorship Remover'}
                </button>
              </div>
              <button class="secondary-button" data-action="refresh-all" ${state.isBusy ? 'disabled' : ''}>
                Refresh All
              </button>
            </div>
            <p class="config-value">
              Pak signature template path:
              <strong>${escapeHtml(sigTemplateDirectory)}</strong>
            </p>
          </section>

          <section class="surface-card surface-card-tight">
            <div class="surface-card-header">
              <p class="section-label">Status</p>
              <span class="inline-pill">Main process</span>
            </div>
            <p class="status-message">${escapeHtml(state.message)}</p>
            <p class="supporting-copy subtle-copy">
              Last settings update: ${escapeHtml(formatDateTime(state.settings.lastUpdatedAt))}
            </p>
          </section>

          <section class="surface-card surface-card-tight">
            <div class="surface-card-header">
              <p class="section-label">${escapeHtml(state.activityTitle)}</p>
              <span class="inline-pill">Rollback-aware</span>
            </div>
            ${operationDetailsMarkup}
          </section>
        </div>
      </aside>

      <main class="workspace-panel">
        ${
          state.activeTab === 'browse'
            ? renderBrowseWorkspace(state)
            : renderInstalledWorkspace(state)
        }
      </main>
    </div>
  `;
}

function syncCatalogState(state: AppState, result: CatalogWindowResult): void {
  state.catalogFailedPageCount = result.failedPageNumbers.length;
  state.catalogLoadedPageCount = result.loadedPageCount;
  state.libraryMessage =
    result.mods.length > 0
      ? `Loaded ${result.mods.length} recent mods from ${result.loadedPageCount} of ${initialCatalogPageWindow} GameBanana pages.${result.failedPageNumbers.length > 0 ? ` Failed pages: ${result.failedPageNumbers.join(', ')}.` : ''}`
      : `No recent mods were loaded from the first ${initialCatalogPageWindow} GameBanana pages.${result.failedPageNumbers.length > 0 ? ` Failed pages: ${result.failedPageNumbers.join(', ')}.` : ''}`;
  state.mods = result.mods;

  for (const mod of result.mods) {
    state.selectedFileIds[mod.id] ??= mod.selectedFileId;
  }

  const hasSelectedBrowseCharacter =
    state.browseCharacter.length === 0 ||
    getBrowseCharacterOptions(result.mods).some(
      (category) => category.name === state.browseCharacter,
    );
  state.browseCharacter = hasSelectedBrowseCharacter
    ? state.browseCharacter
    : '';

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

  const liveModIds = new Set(state.installedMods.map((mod) => mod.modId));

  for (const mod of state.installedMods) {
    state.selectedInstalledFileIds[mod.modId] ??= mod.selectedUpdateFileId;
  }

  for (const modId of Object.keys(state.selectedInstalledFileIds)) {
    if (!liveModIds.has(Number(modId))) {
      delete state.selectedInstalledFileIds[Number(modId)];
    }
  }
}

async function loadCatalogWindow(
  state: AppState,
  appApi: AppApi,
): Promise<void> {
  const pageNumbers = Array.from(
    { length: initialCatalogPageWindow },
    (_value, index) => index + 1,
  );
  const results = await Promise.allSettled(
    pageNumbers.map((pageNumber) => appApi.listGameBananaMods(pageNumber)),
  );
  const successfulPages: CatalogBrowseResult[] = [];
  const failedPageNumbers: number[] = [];

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      successfulPages.push(result.value);
      continue;
    }

    const failedPageNumber = pageNumbers[index];

    if (failedPageNumber !== undefined) {
      failedPageNumbers.push(failedPageNumber);
    }
  }

  const mods = successfulPages.flatMap((page) => page.mods);
  const uniqueMods = new Map<number, CatalogMod>();

  for (const mod of mods) {
    uniqueMods.set(mod.id, mod);
  }

  syncCatalogState(state, {
    failedPageNumbers,
    loadedPageCount: successfulPages.length,
    mods: [...uniqueMods.values()],
  });
}

async function loadInstalledMods(
  state: AppState,
  appApi: AppApi,
): Promise<void> {
  const installedMods = await appApi.listInstalledGameBananaMods();
  syncInstalledMods(state, installedMods);
}

async function refreshState(state: AppState, appApi: AppApi): Promise<void> {
  const [settings, installedMods] = await Promise.all([
    appApi.getSettings(),
    appApi.listInstalledGameBananaMods(),
  ]);

  state.settings = settings;
  await loadCatalogWindow(state, appApi);
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

function formatKnownUtilityInstallDetails(
  result: InstallKnownGameBananaUtilityResult,
): string[] {
  const fileLines = result.installedFiles.map((file) => {
    const verb = file.action === 'replaced' ? 'Replaced' : 'Installed';
    return `${verb} ${file.sourceFileName} at ${file.destinationPath}.`;
  });
  const backupLine = result.backupDirectory
    ? `Backed up replaced files to ${result.backupDirectory}.`
    : 'No existing Win64 files needed a backup.';

  return [
    `Resolved ${result.modName} from ${result.profileUrl}.`,
    `Selected file id ${result.selectedFileId} resolved to ${result.downloadUrl}.`,
    ...result.notes,
    ...fileLines,
    backupLine,
  ];
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

function formatInstalledEnabledDetails(
  result: SetInstalledGameBananaModEnabledResult,
): string[] {
  return result.notes;
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

function captureFocusSnapshot(root: HTMLElement): FocusSnapshot | null {
  const activeElement = document.activeElement;

  if (
    !(activeElement instanceof HTMLInputElement) &&
    !(activeElement instanceof HTMLSelectElement)
  ) {
    return null;
  }

  if (!root.contains(activeElement)) {
    return null;
  }

  const action = activeElement.dataset.action;

  if (!action) {
    return null;
  }

  return {
    action,
    end:
      activeElement instanceof HTMLInputElement
        ? activeElement.selectionEnd
        : null,
    modId: activeElement.dataset.modId ?? null,
    start:
      activeElement instanceof HTMLInputElement
        ? activeElement.selectionStart
        : null,
  };
}

function restoreFocusSnapshot(
  root: HTMLElement,
  snapshot: FocusSnapshot | null,
): void {
  if (!snapshot) {
    return;
  }

  const focusTarget = snapshot.modId
    ? root.querySelector(
        `[data-action="${snapshot.action}"][data-mod-id="${snapshot.modId}"]`,
      )
    : root.querySelector(`[data-action="${snapshot.action}"]`);

  if (
    !(focusTarget instanceof HTMLInputElement) &&
    !(focusTarget instanceof HTMLSelectElement)
  ) {
    return;
  }

  focusTarget.focus();

  if (
    focusTarget instanceof HTMLInputElement &&
    snapshot.start !== null &&
    snapshot.end !== null
  ) {
    focusTarget.setSelectionRange(snapshot.start, snapshot.end);
  }
}

export function createApp(root: HTMLElement, appApi: AppApi): void {
  const state: AppState = {
    activeTab: 'browse',
    activityLines: [],
    activityTitle: 'Latest activity',
    browseCharacter: '',
    browseFilter: 'all',
    browseQuery: '',
    browseSort: 'recent',
    catalogFailedPageCount: 0,
    catalogLoadedPageCount: 0,
    installedFilter: 'all',
    installedMods: [],
    installedQuery: '',
    installedSort: 'recent',
    isBusy: false,
    libraryMessage: `Loading the first ${initialCatalogPageWindow} recent GameBanana pages…`,
    message: 'Booting application shell…',
    mods: [],
    selectedInstalledFileIds: {},
    selectedFileIds: {},
    selectedModId: null,
    settings: defaultAppSettings,
  };

  const render = (): void => {
    const focusSnapshot = captureFocusSnapshot(root);
    root.innerHTML = renderTemplate(state);
    restoreFocusSnapshot(root, focusSnapshot);

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
      .querySelector<HTMLButtonElement>(
        '[data-action="install-censorship-remover"]',
      )
      ?.addEventListener('click', async () => {
        state.isBusy = true;
        state.message =
          'Resolving the latest Censorship Remover download from GameBanana…';
        state.activityLines = [];
        state.activityTitle = 'Censorship Remover activity';
        render();

        try {
          const result = await appApi.installCensorshipRemover();
          state.activityLines = formatKnownUtilityInstallDetails(result);
          state.message =
            'Censorship Remover installed into Win64 successfully.';
        } catch (error) {
          state.message =
            error instanceof Error
              ? `Censorship Remover install failed: ${error.message}`
              : 'Censorship Remover install failed.';
          state.activityLines = [
            'If any file copy failed after writes began, the installer restored the previous Win64 files.',
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
      .querySelector<HTMLButtonElement>('[data-action="refresh-browse-window"]')
      ?.addEventListener('click', async () => {
        state.isBusy = true;
        state.message = `Reloading the first ${initialCatalogPageWindow} GameBanana pages…`;
        render();

        try {
          await loadCatalogWindow(state, appApi);
          state.message = `Reloaded the first ${initialCatalogPageWindow} GameBanana pages.`;
        } catch (error) {
          state.message =
            error instanceof Error
              ? `Could not reload the recent-page window: ${error.message}`
              : 'Could not reload the recent-page window.';
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
      '[data-action="set-browse-filter"]',
    )) {
      button.addEventListener('click', () => {
        const nextFilter = button.dataset.filter;

        if (
          nextFilter === 'all' ||
          nextFilter === 'installable' ||
          nextFilter === 'previewed' ||
          nextFilter === 'unsupported'
        ) {
          state.browseFilter = nextFilter;
          render();
        }
      });
    }

    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-action="set-installed-filter"]',
    )) {
      button.addEventListener('click', () => {
        const nextFilter = button.dataset.filter;

        if (
          nextFilter === 'all' ||
          nextFilter === 'enabled' ||
          nextFilter === 'disabled' ||
          nextFilter === 'previewed'
        ) {
          state.installedFilter = nextFilter;
          render();
        }
      });
    }

    root
      .querySelector<HTMLInputElement>('[data-action="set-browse-query"]')
      ?.addEventListener('input', (event) => {
        state.browseQuery = (event.currentTarget as HTMLInputElement).value;
        render();
      });

    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-action="set-browse-character"]',
    )) {
      button.addEventListener('click', () => {
        state.browseCharacter = button.dataset.character ?? '';
        render();
      });
    }

    root
      .querySelector<HTMLInputElement>('[data-action="set-installed-query"]')
      ?.addEventListener('input', (event) => {
        state.installedQuery = (event.currentTarget as HTMLInputElement).value;
        render();
      });

    root
      .querySelector<HTMLSelectElement>('[data-action="set-browse-sort"]')
      ?.addEventListener('change', (event) => {
        const nextSort = (event.currentTarget as HTMLSelectElement).value;

        if (
          nextSort === 'recent' ||
          nextSort === 'downloads' ||
          nextSort === 'likes' ||
          nextSort === 'name'
        ) {
          state.browseSort = nextSort;
          render();
        }
      });

    root
      .querySelector<HTMLSelectElement>('[data-action="set-installed-sort"]')
      ?.addEventListener('change', (event) => {
        const nextSort = (event.currentTarget as HTMLSelectElement).value;

        if (
          nextSort === 'recent' ||
          nextSort === 'name' ||
          nextSort === 'version'
        ) {
          state.installedSort = nextSort;
          render();
        }
      });

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

    for (const select of root.querySelectorAll<HTMLSelectElement>(
      '[data-action="select-installed-mod-file"]',
    )) {
      select.addEventListener('change', (event) => {
        const target = event.currentTarget as HTMLSelectElement;
        const modId = Number(target.dataset.modId);

        if (!Number.isInteger(modId)) {
          return;
        }

        state.selectedInstalledFileIds[modId] = target.value;
        render();
      });
    }

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

    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-action="update-installed-mod"]',
    )) {
      button.addEventListener('click', async () => {
        const modId = Number(button.dataset.modId);
        const selectedInstalledMod = state.installedMods.find(
          (mod) => mod.modId === modId,
        );

        if (!selectedInstalledMod) {
          return;
        }

        const selectedFileId = getSelectedInstalledFileId(
          state,
          selectedInstalledMod,
        );

        state.isBusy = true;
        state.message = `Installing the selected ${selectedInstalledMod.modName} GameBanana file…`;
        state.activityLines = [];
        state.activityTitle = 'Installed mod activity';
        render();

        try {
          const result = await appApi.updateInstalledGameBananaMod({
            fileId: selectedFileId,
            modId,
          });
          state.activityLines = formatUpdateDetails(result);
          await loadInstalledMods(state, appApi);
          state.message =
            result.status === 'already-latest'
              ? selectedFileId === selectedInstalledMod.installedFileId
                ? `${result.modName} is already using that GameBanana file.`
                : `${result.modName} is already on the newest supported file.`
              : `${result.modName} installed the selected GameBanana file.`;
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
    }

    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-action="toggle-installed-mod-enabled"]',
    )) {
      button.addEventListener('click', async () => {
        const modId = Number(button.dataset.modId);
        const enabled = button.dataset.enabled === 'true';
        const selectedInstalledMod = state.installedMods.find(
          (mod) => mod.modId === modId,
        );

        if (!selectedInstalledMod) {
          return;
        }

        state.isBusy = true;
        state.message = `${enabled ? 'Enabling' : 'Disabling'} ${selectedInstalledMod.modName}…`;
        state.activityLines = [];
        state.activityTitle = 'Installed mod activity';
        render();

        try {
          const result = await appApi.setInstalledGameBananaModEnabled({
            enabled,
            modId,
          });
          state.activityLines = formatInstalledEnabledDetails(result);
          await loadInstalledMods(state, appApi);
          state.message = `${result.modName} ${result.isEnabled ? 'enabled' : 'disabled'} successfully.`;
        } catch (error) {
          state.message =
            error instanceof Error
              ? `Toggle failed: ${error.message}`
              : 'Toggle failed.';
          state.activityLines = [
            'If the mod folder was locked, close the game, launcher, and other modding tools before trying again.',
          ];
        } finally {
          state.isBusy = false;
        }

        render();
      });
    }

    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-action="uninstall-installed-mod"]',
    )) {
      button.addEventListener('click', async () => {
        const modId = Number(button.dataset.modId);
        const selectedInstalledMod = state.installedMods.find(
          (mod) => mod.modId === modId,
        );

        if (!selectedInstalledMod) {
          return;
        }

        state.isBusy = true;
        state.message = `Uninstalling ${selectedInstalledMod.modName}…`;
        state.activityLines = [];
        state.activityTitle = 'Installed mod activity';
        render();

        try {
          const result = await appApi.uninstallGameBananaMod({ modId });
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
    }
  };

  render();

  void (async () => {
    state.isBusy = true;
    state.message = `Loading saved settings, the first ${initialCatalogPageWindow} recent GameBanana pages, and the installed-mod registry…`;
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
