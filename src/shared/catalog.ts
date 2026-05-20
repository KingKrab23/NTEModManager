export const nteGameBananaGameId = 23012;

export function isSupportedGameBananaArchiveFileName(
  fileName: string,
): boolean {
  return fileName.trim().toLowerCase().endsWith('.zip');
}

export interface CatalogModFile {
  addedAt: string | null;
  description: string | null;
  downloadCount: number;
  downloadUrl: string;
  fileName: string;
  fileSizeBytes: number;
  id: string;
  isArchived: boolean;
  version: string | null;
}

export interface CatalogMod {
  body: string;
  createdAt: string | null;
  downloads: number;
  files: CatalogModFile[];
  id: number;
  installInstructions: string;
  likes: number;
  name: string;
  ownerName: string;
  previewImageUrl: string | null;
  profileUrl: string;
  selectedFileId: string | null;
  summary: string;
}

export interface CatalogBrowseResult {
  gameId: number;
  hasNextPage: boolean;
  mods: CatalogMod[];
  page: number;
}
