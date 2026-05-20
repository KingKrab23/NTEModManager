import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface InstalledGameBananaModFileRecord {
  action: 'created' | 'replaced';
  backupPath: string | null;
  destinationPath: string;
  origin: 'archive' | 'sig-template';
  sourceFileName: string;
}

export interface InstalledGameBananaModRecord {
  backupDirectory: string | null;
  installedAt: string;
  installedFileId: string;
  installedFileName: string;
  installedFiles: InstalledGameBananaModFileRecord[];
  installedVersion: string | null;
  modId: number;
  modName: string;
  ownerName: string;
  previewImageUrl: string | null;
  profileUrl: string;
  sigTemplateDirectory: string;
}

export interface InstalledGameBananaModsRepository {
  read: () => Promise<InstalledGameBananaModRecord[]>;
  write: (records: InstalledGameBananaModRecord[]) => Promise<void>;
}

export function createJsonInstalledGameBananaModsRepository(
  filePath: string,
): InstalledGameBananaModsRepository {
  return {
    async read() {
      try {
        const raw = await readFile(filePath, 'utf8');
        return parseInstalledGameBananaModRecords(JSON.parse(raw));
      } catch (error) {
        const fileMissing =
          error instanceof Error && 'code' in error && error.code === 'ENOENT';

        if (fileMissing) {
          return [];
        }

        throw error;
      }
    },
    async write(records) {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(
        filePath,
        `${JSON.stringify(records, null, 2)}\n`,
        'utf8',
      );
    },
  };
}

function parseInstalledGameBananaModRecords(
  input: unknown,
): InstalledGameBananaModRecord[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((entry) => {
    const parsed = parseInstalledGameBananaModRecord(entry);
    return parsed ? [parsed] : [];
  });
}

function parseInstalledGameBananaModRecord(
  input: unknown,
): InstalledGameBananaModRecord | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const modId = candidate.modId;
  const modName = candidate.modName;
  const ownerName = candidate.ownerName;
  const profileUrl = candidate.profileUrl;
  const installedAt = candidate.installedAt;
  const installedFileId = candidate.installedFileId;
  const installedFileName = candidate.installedFileName;
  const installedFiles = candidate.installedFiles;
  const sigTemplateDirectory = candidate.sigTemplateDirectory;

  if (
    typeof modId !== 'number' ||
    typeof modName !== 'string' ||
    typeof ownerName !== 'string' ||
    typeof profileUrl !== 'string' ||
    typeof installedAt !== 'string' ||
    typeof installedFileId !== 'string' ||
    typeof installedFileName !== 'string' ||
    typeof sigTemplateDirectory !== 'string' ||
    !Array.isArray(installedFiles)
  ) {
    return null;
  }

  const parsedFiles = installedFiles.flatMap((file) => {
    const parsed = parseInstalledGameBananaModFileRecord(file);
    return parsed ? [parsed] : [];
  });

  return {
    backupDirectory:
      typeof candidate.backupDirectory === 'string'
        ? candidate.backupDirectory
        : null,
    installedAt,
    installedFileId,
    installedFileName,
    installedFiles: parsedFiles,
    installedVersion:
      typeof candidate.installedVersion === 'string'
        ? candidate.installedVersion
        : null,
    modId,
    modName,
    ownerName,
    previewImageUrl:
      typeof candidate.previewImageUrl === 'string'
        ? candidate.previewImageUrl
        : null,
    profileUrl,
    sigTemplateDirectory,
  };
}

function parseInstalledGameBananaModFileRecord(
  input: unknown,
): InstalledGameBananaModFileRecord | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const candidate = input as Record<string, unknown>;

  if (
    (candidate.action !== 'created' && candidate.action !== 'replaced') ||
    (candidate.origin !== 'archive' && candidate.origin !== 'sig-template') ||
    typeof candidate.destinationPath !== 'string' ||
    typeof candidate.sourceFileName !== 'string'
  ) {
    return null;
  }

  return {
    action: candidate.action,
    backupPath:
      typeof candidate.backupPath === 'string' ? candidate.backupPath : null,
    destinationPath: candidate.destinationPath,
    origin: candidate.origin,
    sourceFileName: candidate.sourceFileName,
  };
}
