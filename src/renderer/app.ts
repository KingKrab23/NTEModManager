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
type BrowseFilter = 'all' | 'installable' | 'previewed' | 'unsupported';
type BrowseSort = 'recent' | 'downloads' | 'likes' | 'name';
type InstalledFilter = 'all' | 'previewed' | 'recent';
type InstalledSort = 'recent' | 'name' | 'version';

interface AppState {
  activeTab: WorkspaceTab;
  activityLines: string[];
  activityTitle: string;
  browseFilter: BrowseFilter;
  browseQuery: string;
  browseSort: BrowseSort;
  catalogHasNextPage: boolean;
  catalogPage: number;
  installedFilter: InstalledFilter;
  installedMods: InstalledGameBananaModSummary[];
  installedQuery: string;
  installedSort: InstalledSort;
  isBusy: boolean;
  libraryMessage: string;
  message: string;
  mods: CatalogMod[];
  selectedFileIds: Record<number, string | null>;
  selectedInstalledModId: number | null;
  selectedModId: number | null;
  settings: AppSettings;
}

interface FocusSnapshot {
  action: string;
  end: number | null;
  start: number | null;
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

function getBrowseMods(state: AppState): CatalogMod[] {
  const query = normalizeSearchValue(state.browseQuery);
  const filtered = state.mods.filter((mod) => {
    if (!modMatchesQuery(mod, query)) {
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
      case 'previewed':
        return Boolean(mod.previewImageUrl);
      case 'recent': {
        const installedAt = new Date(mod.installedAt).getTime();
        const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
        return Date.now() - installedAt <= sevenDaysInMs;
      }
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

function getSelectedInstalledMod(
  state: AppState,
): InstalledGameBananaModSummary | null {
  const visibleMods = getInstalledMods(state);

  return (
    visibleMods.find((mod) => mod.modId === state.selectedInstalledModId) ??
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
      : 'Try clearing the search, switching the filter, or loading another GameBanana page.';
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
        <section class="spotlight-copy-block">
          <p class="section-label">Summary</p>
          <p class="detail-copy">${formatMultilineText(mod.body || mod.summary || 'No description provided.')}</p>
        </section>
        ${installInstructionsMarkup}
        <section class="spotlight-copy-block spotlight-copy-block-strong">
          <div class="file-row">
            <div>
              <p class="section-label">Installable file</p>
              <p class="supporting-copy">Supported non-archived .zip files stay enabled. Unsupported archive formats remain visible but disabled.</p>
            </div>
            <label class="select-shell">
              <span>Selected file</span>
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
                <p class="supporting-copy">This mod does not currently expose a supported non-archived .zip file for the installer.</p>
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
  const statusLabel = preferredFile ? 'Installable ZIP' : 'Unsupported archive';

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
        <p class="gallery-card-summary">${escapeHtml(mod.summary || 'No description provided.')}</p>
        <div class="gallery-card-meta">
          <span>${escapeHtml(formatNumber(mod.downloads))} downloads</span>
          <span>${escapeHtml(formatNumber(mod.likes))} likes</span>
          <span>${escapeHtml(preferredFile?.version ?? 'No ZIP')}</span>
        </div>
      </div>
    </button>
  `;
}

function renderEmptyInstalledDetail(visibleModsCount: number): string {
  const title =
    visibleModsCount > 0
      ? 'Select an installed mod'
      : 'No installed mods match these filters';
  const copy =
    visibleModsCount > 0
      ? 'Pick an installed mod to update it to the newest supported GameBanana file or uninstall it completely.'
      : 'Try clearing the search or switching the installed filter.';

  return `
    <article class="spotlight-card surface-card">
      <div class="empty-state">
        <p class="section-label">Installed mod details</p>
        <h2>${title}</h2>
        <p class="supporting-copy">${copy}</p>
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
    <article class="spotlight-card surface-card">
      ${renderModPreview(mod.previewImageUrl, mod.modName, 'No preview image')}
      <div class="spotlight-content">
        <div class="spotlight-heading">
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
        <section class="spotlight-copy-block spotlight-copy-block-strong">
          <p class="section-label">Recorded install</p>
          <div class="selected-file-card">
            <p><strong>${escapeHtml(mod.installedFileName)}</strong></p>
            <p>Installed file id ${escapeHtml(mod.installedFileId)}</p>
            <p>${escapeHtml(mod.installedFilesCount.toString())} tracked file write${mod.installedFilesCount === 1 ? '' : 's'} for uninstall and restore.</p>
          </div>
        </section>
        <div class="detail-actions detail-actions-stacked">
          <button class="primary-button primary-button-wide" data-action="update-installed-mod" ${
            canAct ? '' : 'disabled'
          }>
            ${state.isBusy ? 'Working…' : 'Download Newest Version'}
          </button>
          <button class="danger-button primary-button-wide" data-action="uninstall-installed-mod" ${
            canAct ? '' : 'disabled'
          }>
            ${state.isBusy ? 'Working…' : 'Uninstall Completely'}
          </button>
          <p class="supporting-copy detail-action-copy">
            Updates reuse the newest supported GameBanana file for this mod. Uninstall restores replaced files from recorded backups and removes files the mod created.
          </p>
        </div>
      </div>
    </article>
  `;
}

function renderInstalledModCard(
  state: AppState,
  mod: InstalledGameBananaModSummary,
): string {
  const isSelected = mod.modId === getSelectedInstalledMod(state)?.modId;

  return `
    <button
      class="gallery-card ${isSelected ? 'gallery-card-selected' : ''}"
      data-action="select-installed-mod"
      data-mod-id="${escapeHtml(String(mod.modId))}"
      ${state.isBusy ? 'disabled' : ''}
    >
      <div class="gallery-card-frame">
        ${
          mod.previewImageUrl
            ? `
              <img
                class="gallery-card-image"
                src="${escapeHtml(mod.previewImageUrl)}"
                alt="${escapeHtml(mod.modName)} preview"
              />
            `
            : `
              <div class="gallery-card-image gallery-card-image-empty">No preview</div>
            `
        }
        <span class="gallery-card-corner">Installed</span>
        <span class="gallery-card-status">${escapeHtml(mod.installedVersion ?? 'No version')}</span>
      </div>
      <div class="gallery-card-copy">
        <p class="gallery-card-title">${escapeHtml(mod.modName)}</p>
        <p class="gallery-card-author">by ${escapeHtml(mod.ownerName)}</p>
        <p class="gallery-card-summary">Installed ${escapeHtml(formatDateTime(mod.installedAt))}</p>
        <div class="gallery-card-meta">
          <span>${escapeHtml(String(mod.installedFilesCount))} files</span>
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
  const visibleMods = getBrowseMods(state);
  const selectedMod = getSelectedMod(state);
  const installableCount = state.mods.filter((mod) =>
    mod.files.some((file) => isSelectableModFile(file)),
  ).length;
  const previewCount = state.mods.filter((mod) =>
    Boolean(mod.previewImageUrl),
  ).length;
  const unsupportedCount = state.mods.filter(
    (mod) => !mod.files.some((file) => isSelectableModFile(file)),
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
            <span class="stage-stat">Page ${escapeHtml(String(state.catalogPage))}</span>
            <span class="stage-stat">Game ID 23012</span>
          </div>
        </div>
        <div class="toolbar-grid">
          <label class="search-shell">
            <span>Search the current feed page</span>
            <input
              class="search-input"
              type="search"
              value="${escapeHtml(state.browseQuery)}"
              placeholder="Search by mod, author, summary, or install notes"
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
        </div>
        <div class="filter-row">
          ${renderBrowseFilterChip(state, 'all', 'All mods', state.mods.length)}
          ${renderBrowseFilterChip(state, 'installable', 'Installable only', installableCount)}
          ${renderBrowseFilterChip(state, 'previewed', 'With preview', previewCount)}
          ${renderBrowseFilterChip(state, 'unsupported', 'Needs manual review', unsupportedCount)}
        </div>
      </header>
      ${detailMarkup}
      <section class="gallery-shell">
        <div class="gallery-header">
          <div>
            <p class="section-label">Library</p>
            <h3>${escapeHtml(String(visibleMods.length))} mod${visibleMods.length === 1 ? '' : 's'} on this view</h3>
          </div>
          <p class="supporting-copy">The feed stays page-based. Filters and search refine only the current loaded page so the browser remains predictable.</p>
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
                    <p class="supporting-copy">The current page has no mods matching these filters.</p>
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
  const selectedInstalledMod = getSelectedInstalledMod(state);
  const previewCount = state.installedMods.filter((mod) =>
    Boolean(mod.previewImageUrl),
  ).length;
  const recentCount = state.installedMods.filter((mod) => {
    const installedAt = new Date(mod.installedAt).getTime();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - installedAt <= sevenDaysInMs;
  }).length;
  const detailMarkup = selectedInstalledMod
    ? renderSelectedInstalledMod(state, selectedInstalledMod)
    : renderEmptyInstalledDetail(visibleMods.length);

  return `
    <section class="workspace-surface">
      <header class="workspace-stage surface-card">
        <div class="workspace-stage-heading">
          <div>
            <p class="section-label">Installed GameBanana mods</p>
            <h2>Recorded installs</h2>
            <p class="supporting-copy">Each recorded install tracks file writes and backups so the app can update the newest version or uninstall the mod cleanly.</p>
          </div>
          <div class="stage-stat-strip">
            <span class="stage-stat">${escapeHtml(String(visibleMods.length))} visible</span>
            <span class="stage-stat">${escapeHtml(String(state.installedMods.length))} tracked total</span>
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
          ${renderInstalledFilterChip(state, 'previewed', 'With preview', previewCount)}
          ${renderInstalledFilterChip(state, 'recent', 'Installed this week', recentCount)}
        </div>
      </header>
      ${detailMarkup}
      <section class="gallery-shell">
        <div class="gallery-header">
          <div>
            <p class="section-label">Registry</p>
            <h3>${escapeHtml(String(visibleMods.length))} installed mod${visibleMods.length === 1 ? '' : 's'} on this view</h3>
          </div>
          <p class="supporting-copy">The app registry is the source of truth for update and uninstall actions. Files outside the registry are intentionally ignored.</p>
        </div>
        <div class="gallery-grid">
          ${
            visibleMods.length > 0
              ? visibleMods
                  .map((mod) => renderInstalledModCard(state, mod))
                  .join('')
              : `
                  <div class="empty-state gallery-empty">
                    <h3>No installed mods found</h3>
                    <p class="supporting-copy">Install a GameBanana mod from the browse tab and it will appear here with update and uninstall actions.</p>
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
          <section class="hero-brand">
            <div class="brand-mark">
              <span>NTE</span>
            </div>
            <div>
              <p class="eyebrow">Neverness to Everness</p>
              <h1>Mod Manager</h1>
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
              Privileged file operations stay in the main process. The renderer only selects the game path, current page, active tab, and mod identifiers.
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

  const focusTarget = root.querySelector(`[data-action="${snapshot.action}"]`);

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
    browseFilter: 'all',
    browseQuery: '',
    browseSort: 'recent',
    catalogHasNextPage: false,
    catalogPage: 1,
    installedFilter: 'all',
    installedMods: [],
    installedQuery: '',
    installedSort: 'recent',
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
          nextFilter === 'previewed' ||
          nextFilter === 'recent'
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
