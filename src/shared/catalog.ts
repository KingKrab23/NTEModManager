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

export interface CatalogModCategory {
  iconUrl: string | null;
  id: number;
  name: string;
  profileUrl: string;
}

export const nteCharacterCategories: ReadonlyArray<CatalogModCategory> = [
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851c6998829.png',
    id: 43034,
    name: 'Adler',
    profileUrl: 'https://gamebanana.com/mods/cats/43034',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851c807a6fd.png',
    id: 43035,
    name: 'Baicang',
    profileUrl: 'https://gamebanana.com/mods/cats/43035',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69fb8f011ef27.png',
    id: 45472,
    name: 'Chiz',
    profileUrl: 'https://gamebanana.com/mods/cats/45472',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69fb8f16e41b3.png',
    id: 45474,
    name: 'Daffodill',
    profileUrl: 'https://gamebanana.com/mods/cats/45474',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69fb8f1eebe18.png',
    id: 45475,
    name: 'Edgar',
    profileUrl: 'https://gamebanana.com/mods/cats/45475',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851cb8819c7.png',
    id: 43036,
    name: 'Fadia',
    profileUrl: 'https://gamebanana.com/mods/cats/43036',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69fb8f0e33464.png',
    id: 45473,
    name: 'Haniel',
    profileUrl: 'https://gamebanana.com/mods/cats/45473',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851cc9eee81.png',
    id: 43037,
    name: 'Hathor',
    profileUrl: 'https://gamebanana.com/mods/cats/43037',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851d5e05b77.png',
    id: 43038,
    name: 'Hotori',
    profileUrl: 'https://gamebanana.com/mods/cats/43038',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69fb8f28d5608.png',
    id: 45476,
    name: 'Jiuyuan',
    profileUrl: 'https://gamebanana.com/mods/cats/45476',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851d6ab8f61.png',
    id: 43039,
    name: 'Lacrimosa',
    profileUrl: 'https://gamebanana.com/mods/cats/43039',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851dda0f442.png',
    id: 43040,
    name: 'Mint',
    profileUrl: 'https://gamebanana.com/mods/cats/43040',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851ded7f026.png',
    id: 43041,
    name: 'Nanally',
    profileUrl: 'https://gamebanana.com/mods/cats/43041',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851c064c65d.png',
    id: 43031,
    name: 'NPCs and Entities',
    profileUrl: 'https://gamebanana.com/mods/cats/43031',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851e05c5fbd.png',
    id: 43042,
    name: 'Sakiri',
    profileUrl: 'https://gamebanana.com/mods/cats/43042',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851e0f2f79b.png',
    id: 43043,
    name: 'Skia',
    profileUrl: 'https://gamebanana.com/mods/cats/43043',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851c1c8670c.png',
    id: 43032,
    name: 'Zero (F)',
    profileUrl: 'https://gamebanana.com/mods/cats/43032',
  },
  {
    iconUrl:
      'https://images.gamebanana.com/img/ico/ModCategory/69851c2f5fd0e.png',
    id: 43033,
    name: 'Zero (M)',
    profileUrl: 'https://gamebanana.com/mods/cats/43033',
  },
] as const;

export interface CatalogMod {
  body: string;
  category: CatalogModCategory | null;
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
