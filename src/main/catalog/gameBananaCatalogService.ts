import {
  isSupportedGameBananaArchiveFileName,
  nteGameBananaGameId,
  type CatalogBrowseResult,
  type CatalogMod,
  type CatalogModCategory,
  type CatalogModFile,
} from '../../shared/catalog';

const defaultPageSize = 20;
const gameBananaApiRoot = 'https://api.gamebanana.com';
const gameBananaSiteApiRoot = 'https://gamebanana.com/apiv11';
const recentModFields = [
  'name',
  'Owner().name',
  'description',
  'Preview().sStructuredDataFullsizeUrl()',
  'Preview().sSubFeedImageUrl()',
  'Files().aFiles()',
  'downloads',
  'likes',
  'date',
  'Url().sProfileUrl()',
  'text',
  'install_instructions',
] as const;

interface GameBananaCatalogServiceDependencies {
  fetchImpl?: typeof fetch;
}

export interface GameBananaCatalogService {
  browseRecentMods: (page: number) => Promise<CatalogBrowseResult>;
  getMod: (modId: number) => Promise<CatalogMod>;
}

export function createGameBananaCatalogService(
  dependencies: GameBananaCatalogServiceDependencies = {},
): GameBananaCatalogService {
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  return {
    async browseRecentMods(page) {
      const normalizedPage = normalizePage(page);
      const modIds = await fetchRecentModIds(fetchImpl, normalizedPage);
      const mods = await Promise.all(
        modIds.map(async (modId) => getMod(fetchImpl, modId)),
      );

      return {
        gameId: nteGameBananaGameId,
        hasNextPage: modIds.length === defaultPageSize,
        mods,
        page: normalizedPage,
      };
    },
    async getMod(modId) {
      return getMod(fetchImpl, modId);
    },
  };
}

async function fetchRecentModIds(
  fetchImpl: typeof fetch,
  page: number,
): Promise<number[]> {
  const response = await fetchJson(
    fetchImpl,
    `${gameBananaApiRoot}/Core/List/New?itemtype=Mod&gameid=${nteGameBananaGameId}&page=${page}&format=json_min`,
    'GameBanana recent mod list',
  );

  return parseRecentModIdList(response);
}

async function getMod(
  fetchImpl: typeof fetch,
  modId: number,
): Promise<CatalogMod> {
  const [detailResponse, profileResponse] = await Promise.all([
    fetchJson(
      fetchImpl,
      `${gameBananaApiRoot}/Core/Item/Data?itemtype=Mod&itemid=${modId}&fields=${encodeURIComponent(
        recentModFields.join(','),
      )}&return_keys=1&format=json_min`,
      `GameBanana mod ${modId}`,
    ),
    fetchJson(
      fetchImpl,
      `${gameBananaSiteApiRoot}/Mod/${modId}/ProfilePage`,
      `GameBanana mod ${modId} profile`,
    ),
  ]);

  return parseCatalogMod(detailResponse, profileResponse, modId);
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  label: string,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'NTE-Mod-Manager',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load ${label} (${response.status} ${response.statusText}).`,
    );
  }

  return response.json();
}

function parseRecentModIdList(input: unknown): number[] {
  if (!Array.isArray(input)) {
    throw new Error('Invalid GameBanana recent mod list payload.');
  }

  return input.map((entry, index) => parseRecentModIdEntry(entry, index));
}

function parseRecentModIdEntry(input: unknown, index: number): number {
  if (!Array.isArray(input) || input.length !== 2) {
    throw new Error(`Invalid GameBanana mod list entry at index ${index}.`);
  }

  const [itemType, itemId] = input;

  if (itemType !== 'Mod') {
    throw new Error(
      `Unexpected GameBanana item type in recent mod list: ${String(itemType)}.`,
    );
  }

  return readRequiredNumber(itemId, `recent mod id at index ${index}`);
}

function parseCatalogMod(
  input: unknown,
  profileInput: unknown,
  modId: number,
): CatalogMod {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`Invalid GameBanana mod payload for mod ${modId}.`);
  }

  const candidate = input as Record<string, unknown>;
  const files = parseCatalogFiles(candidate['Files().aFiles()'], modId);
  const body = chooseBodyText(
    readOptionalString(candidate.description),
    readOptionalString(candidate.text),
  );

  return {
    body,
    category: parseCatalogModCategory(profileInput, modId),
    createdAt: unixSecondsToIso(candidate.date),
    downloads: readRequiredNumber(
      candidate.downloads,
      `mod ${modId} downloads`,
    ),
    files,
    id: modId,
    installInstructions: sanitizeText(
      readOptionalString(candidate.install_instructions),
    ),
    likes: readRequiredNumber(candidate.likes, `mod ${modId} likes`),
    name: readRequiredString(candidate.name, `mod ${modId} name`),
    ownerName: readRequiredString(
      candidate['Owner().name'],
      `mod ${modId} owner`,
    ),
    previewImageUrl: pickPreviewImageUrl(candidate),
    profileUrl: readRequiredString(
      candidate['Url().sProfileUrl()'],
      `mod ${modId} profile URL`,
    ),
    selectedFileId: pickPreferredFile(files)?.id ?? null,
    summary: summarize(body),
  };
}

function parseCatalogModCategory(
  input: unknown,
  modId: number,
): CatalogModCategory | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`Invalid GameBanana mod profile payload for mod ${modId}.`);
  }

  const profileCandidate = input as Record<string, unknown>;
  const categoryInput = profileCandidate._aCategory;

  if (
    !categoryInput ||
    typeof categoryInput !== 'object' ||
    Array.isArray(categoryInput)
  ) {
    return null;
  }

  const categoryCandidate = categoryInput as Record<string, unknown>;

  return {
    iconUrl: readOptionalString(categoryCandidate._sIconUrl),
    id: readRequiredNumber(
      categoryCandidate._idRow,
      `mod ${modId} category id`,
    ),
    name: readRequiredString(
      categoryCandidate._sName,
      `mod ${modId} category name`,
    ),
    profileUrl: readRequiredString(
      categoryCandidate._sProfileUrl,
      `mod ${modId} category profile URL`,
    ),
  };
}

function pickPreviewImageUrl(
  candidate: Record<string, unknown>,
): string | null {
  return (
    readOptionalString(candidate['Preview().sStructuredDataFullsizeUrl()']) ??
    readOptionalString(candidate['Preview().sSubFeedImageUrl()'])
  );
}

function parseCatalogFiles(input: unknown, modId: number): CatalogModFile[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`Invalid file list for mod ${modId}.`);
  }

  const files = Object.values(input as Record<string, unknown>).map((entry) =>
    parseCatalogFile(entry, modId),
  );

  return files.sort(compareCatalogFiles);
}

function parseCatalogFile(input: unknown, modId: number): CatalogModFile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`Invalid file entry for mod ${modId}.`);
  }

  const candidate = input as Record<string, unknown>;

  return {
    addedAt: unixSecondsToIso(candidate._tsDateAdded),
    description: sanitizeText(readOptionalString(candidate._sDescription)),
    downloadCount: readRequiredNumber(
      candidate._nDownloadCount,
      `mod ${modId} file download count`,
    ),
    downloadUrl: readRequiredString(
      candidate._sDownloadUrl,
      `mod ${modId} file download URL`,
    ),
    fileName: readRequiredString(candidate._sFile, `mod ${modId} file name`),
    fileSizeBytes: readRequiredNumber(
      candidate._nFilesize,
      `mod ${modId} file size`,
    ),
    id: readRequiredString(candidate._idRow, `mod ${modId} file id`),
    isArchived: readRequiredBoolean(
      candidate._bIsArchived,
      `mod ${modId} file archive state`,
    ),
    version: readOptionalString(candidate._sVersion),
  };
}

function compareCatalogFiles(
  left: CatalogModFile,
  right: CatalogModFile,
): number {
  if (left.isArchived !== right.isArchived) {
    return left.isArchived ? 1 : -1;
  }

  const leftIsSupported = isSupportedGameBananaArchiveFileName(left.fileName);
  const rightIsSupported = isSupportedGameBananaArchiveFileName(right.fileName);

  if (leftIsSupported !== rightIsSupported) {
    return leftIsSupported ? -1 : 1;
  }

  const leftAddedAt = left.addedAt ?? '';
  const rightAddedAt = right.addedAt ?? '';

  return rightAddedAt.localeCompare(leftAddedAt);
}

function pickPreferredFile(files: CatalogModFile[]): CatalogModFile | null {
  return (
    files.find(
      (file) =>
        !file.isArchived && isSupportedGameBananaArchiveFileName(file.fileName),
    ) ?? null
  );
}

function chooseBodyText(
  description: string | null,
  htmlText: string | null,
): string {
  const sanitizedDescription = sanitizeText(description);

  if (sanitizedDescription.length > 0) {
    return sanitizedDescription;
  }

  return sanitizeText(htmlText);
}

function summarize(input: string): string {
  if (input.length <= 220) {
    return input;
  }

  return `${input.slice(0, 217).trimEnd()}...`;
}

function sanitizeText(input: string | null): string {
  if (!input) {
    return '';
  }

  return input
    .replaceAll(/<br\s*\/?>/gi, '\n')
    .replaceAll(/<\/p>/gi, '\n')
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll(/&nbsp;/gi, ' ')
    .replaceAll(/&amp;/gi, '&')
    .replaceAll(/&quot;/gi, '"')
    .replaceAll(/&#39;/gi, "'")
    .replaceAll(/&lt;/gi, '<')
    .replaceAll(/&gt;/gi, '>')
    .replaceAll(/\s+\n/g, '\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .replaceAll(/[ \t]{2,}/g, ' ')
    .trim();
}

function readRequiredBoolean(input: unknown, label: string): boolean {
  if (typeof input !== 'boolean') {
    throw new Error(`Invalid ${label}.`);
  }

  return input;
}

function readRequiredNumber(input: unknown, label: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    throw new Error(`Invalid ${label}.`);
  }

  return input;
}

function readRequiredString(input: unknown, label: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error(`Invalid ${label}.`);
  }

  return input;
}

function readOptionalString(input: unknown): string | null {
  return typeof input === 'string' ? input : null;
}

function unixSecondsToIso(input: unknown): string | null {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return null;
  }

  return new Date(input * 1000).toISOString();
}

function normalizePage(page: number): number {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('GameBanana page numbers must be positive integers.');
  }

  return page;
}
