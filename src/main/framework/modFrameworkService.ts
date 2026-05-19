import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import type {
  FrameworkDownloadSource,
  InstallModFrameworkResult,
} from '../../shared/ipc';
import { copyFilesWithRollback } from '../filesystem/fileTransaction';
import { normalizeGamePath } from '../settings/settingsService';

const githubHeaders = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'NTE-Mod-Manager',
};

interface GitHubReleaseAsset {
  browserDownloadUrl: string;
  name: string;
}

interface GitHubRelease {
  assets: GitHubReleaseAsset[];
  htmlUrl: string;
  name: string;
  tagName: string;
}

interface DownloadableFrameworkAsset {
  browserDownloadUrl: string;
  name: string;
}

interface GameInstallLayout {
  binariesDirectory: string;
  launcherDataDirectory: string;
  paksDirectory: string;
  rootDirectory: string;
}

interface ModFrameworkServiceDependencies {
  backupRootDirectory?: string;
  extractZipImpl?: ExtractZipFunction;
  fetchImpl?: typeof fetch;
  stagingRootDirectory?: string;
}

type ExtractZipFunction = (
  archivePath: string,
  options: { dir: string },
) => Promise<void>;

export interface ModFrameworkService {
  install: (gamePath: string) => Promise<InstallModFrameworkResult>;
}

export function createModFrameworkService(
  dependencies: ModFrameworkServiceDependencies = {},
): ModFrameworkService {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const extractZipImpl = dependencies.extractZipImpl ?? defaultExtractZipImpl;
  const stagingRootDirectory =
    dependencies.stagingRootDirectory ?? join(tmpdir(), 'nte-mod-manager');
  const backupRootDirectory =
    dependencies.backupRootDirectory ??
    join(tmpdir(), 'nte-mod-manager', 'backups', 'mod-framework');

  return {
    async install(gamePath) {
      const normalizedGamePath = normalizeGamePath(gamePath);
      const layout = await validateGameInstallLayout(normalizedGamePath);

      await mkdir(stagingRootDirectory, { recursive: true });
      await mkdir(backupRootDirectory, { recursive: true });

      const stagingDirectory = await mkdtemp(
        join(stagingRootDirectory, 'mod-framework-'),
      );

      try {
        const [asiLoaderRelease, sigBypasserRelease] = await Promise.all([
          fetchLatestRelease(
            fetchImpl,
            'ThirteenAG/Ultimate-ASI-Loader',
            'Ultimate ASI Loader',
          ),
          fetchLatestRelease(
            fetchImpl,
            'rm-NoobInCoding/UniversalSigBypasser',
            'UniversalSigBypasser',
          ),
        ]);

        const asiLoaderAsset = createUltimateAsiLoaderVersionAsset();
        const sigBypasserAsset = selectAsset(
          sigBypasserRelease,
          (asset) => asset.name.endsWith('.zip'),
          'a UniversalSigBypasser release zip',
        );

        const downloadDirectory = join(stagingDirectory, 'downloads');
        const extractionDirectory = join(stagingDirectory, 'extracted');
        const asiLoaderArchivePath = join(
          downloadDirectory,
          asiLoaderAsset.name,
        );
        const sigBypasserArchivePath = join(
          downloadDirectory,
          sigBypasserAsset.name,
        );
        const asiLoaderExtractedPath = join(extractionDirectory, 'asi-loader');
        const sigBypasserExtractedPath = join(
          extractionDirectory,
          'sig-bypasser',
        );

        await mkdir(downloadDirectory, { recursive: true });
        await mkdir(extractionDirectory, { recursive: true });

        await Promise.all([
          downloadToFile(
            fetchImpl,
            asiLoaderAsset.browserDownloadUrl,
            asiLoaderArchivePath,
          ),
          downloadToFile(
            fetchImpl,
            sigBypasserAsset.browserDownloadUrl,
            sigBypasserArchivePath,
          ),
        ]);

        await Promise.all([
          extractZipImpl(asiLoaderArchivePath, { dir: asiLoaderExtractedPath }),
          extractZipImpl(sigBypasserArchivePath, {
            dir: sigBypasserExtractedPath,
          }),
        ]);

        const versionDllPath = await findExtractedFile(
          asiLoaderExtractedPath,
          (filePath) => basename(filePath).toLowerCase() === 'version.dll',
          'version.dll',
        );
        const sigBypasserPath = await findExtractedFile(
          sigBypasserExtractedPath,
          (filePath) => filePath.toLowerCase().endsWith('.asi'),
          'a .asi file',
        );

        const timestampLabel = new Date().toISOString().replaceAll(':', '-');
        const backupDirectory = join(backupRootDirectory, timestampLabel);
        const copyResult = await copyFilesWithRollback(
          [
            {
              destinationPath: join(layout.rootDirectory, 'version.dll'),
              sourcePath: versionDllPath,
            },
            {
              destinationPath: join(
                layout.launcherDataDirectory,
                'version.dll',
              ),
              sourcePath: versionDllPath,
            },
            {
              destinationPath: join(layout.binariesDirectory, 'version.dll'),
              sourcePath: versionDllPath,
            },
            {
              destinationPath: join(
                layout.binariesDirectory,
                basename(sigBypasserPath),
              ),
              sourcePath: sigBypasserPath,
            },
          ],
          {
            allowedRoot: layout.rootDirectory,
            backupDirectory,
          },
        );

        return {
          backupDirectory: copyResult.backupDirectory,
          installedFiles: copyResult.files.map((file) => ({
            action: file.action,
            destinationPath: file.destinationPath,
            sourceFileName: basename(file.sourcePath),
          })),
          sigTemplateDirectory: layout.paksDirectory,
          sources: [
            toFrameworkDownloadSource(asiLoaderRelease, asiLoaderAsset),
            toFrameworkDownloadSource(sigBypasserRelease, sigBypasserAsset),
          ],
        };
      } finally {
        await rm(stagingDirectory, { force: true, recursive: true });
      }
    },
  };
}

async function validateGameInstallLayout(
  gamePath: string,
): Promise<GameInstallLayout> {
  const rootDirectory = resolve(gamePath);
  const launcherDataDirectory = join(rootDirectory, 'NTEGlobal');
  const binariesDirectory = join(
    rootDirectory,
    'Client',
    'WindowsNoEditor',
    'HT',
    'Binaries',
    'Win64',
  );
  const paksDirectory = join(
    rootDirectory,
    'Client',
    'WindowsNoEditor',
    'HT',
    'Content',
    'Paks',
  );

  await Promise.all([
    assertDirectoryExists(rootDirectory, 'game root'),
    assertDirectoryExists(launcherDataDirectory, 'NTEGlobal'),
    assertDirectoryExists(binariesDirectory, 'Win64 binaries'),
    assertDirectoryExists(paksDirectory, 'Pak files directory'),
  ]);

  return {
    binariesDirectory,
    launcherDataDirectory,
    paksDirectory,
    rootDirectory,
  };
}

async function assertDirectoryExists(
  directoryPath: string,
  label: string,
): Promise<void> {
  let directoryStats;

  try {
    directoryStats = await stat(directoryPath);
  } catch (error) {
    if (isFileMissingError(error)) {
      throw new Error(
        `The configured game folder is missing the expected ${label}: ${directoryPath}`,
        { cause: error },
      );
    }

    throw error;
  }

  if (!directoryStats.isDirectory()) {
    throw new Error(
      `The configured game folder has an invalid ${label} path: ${directoryPath}`,
    );
  }
}

async function fetchLatestRelease(
  fetchImpl: typeof fetch,
  repository: string,
  repositoryLabel: string,
): Promise<GitHubRelease> {
  const response = await fetchImpl(
    `https://api.github.com/repos/${repository}/releases/latest`,
    {
      headers: githubHeaders,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to read the latest ${repositoryLabel} release (${response.status} ${response.statusText}).`,
    );
  }

  const payload = await response.json();
  return parseGitHubRelease(payload, repositoryLabel);
}

async function downloadToFile(
  fetchImpl: typeof fetch,
  sourceUrl: string,
  destinationPath: string,
): Promise<void> {
  const response = await fetchImpl(sourceUrl, {
    headers: githubHeaders,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download ${sourceUrl} (${response.status} ${response.statusText}).`,
    );
  }

  const archiveBuffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destinationPath, archiveBuffer);
}

function parseGitHubRelease(
  input: unknown,
  repositoryLabel: string,
): GitHubRelease {
  if (!input || typeof input !== 'object') {
    throw new Error(`Invalid ${repositoryLabel} release payload.`);
  }

  const candidate = input as Record<string, unknown>;
  const assetsInput = candidate.assets;

  if (!Array.isArray(assetsInput)) {
    throw new Error(`Invalid ${repositoryLabel} release asset list.`);
  }

  const assets = assetsInput.map((assetInput) =>
    parseGitHubReleaseAsset(assetInput, repositoryLabel),
  );
  const tagName = readRequiredString(
    candidate.tag_name,
    `${repositoryLabel} tag name`,
  );
  const name = readRequiredString(candidate.name, `${repositoryLabel} name`);
  const htmlUrl = readRequiredString(
    candidate.html_url,
    `${repositoryLabel} release URL`,
  );

  return {
    assets,
    htmlUrl,
    name,
    tagName,
  };
}

function parseGitHubReleaseAsset(
  input: unknown,
  repositoryLabel: string,
): GitHubReleaseAsset {
  if (!input || typeof input !== 'object') {
    throw new Error(`Invalid ${repositoryLabel} release asset payload.`);
  }

  const candidate = input as Record<string, unknown>;

  return {
    browserDownloadUrl: readRequiredString(
      candidate.browser_download_url,
      `${repositoryLabel} asset download URL`,
    ),
    name: readRequiredString(candidate.name, `${repositoryLabel} asset name`),
  };
}

function readRequiredString(input: unknown, label: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error(`Invalid ${label}.`);
  }

  return input;
}

function selectAsset(
  release: GitHubRelease,
  predicate: (asset: GitHubReleaseAsset) => boolean,
  description: string,
): DownloadableFrameworkAsset {
  const selectedAsset = release.assets.find(predicate);

  if (!selectedAsset) {
    throw new Error(
      `Could not find ${description} in ${release.name} (${release.tagName}).`,
    );
  }

  return selectedAsset;
}

function toFrameworkDownloadSource(
  release: GitHubRelease,
  asset: DownloadableFrameworkAsset,
): FrameworkDownloadSource {
  return {
    assetName: asset.name,
    name: release.name,
    releaseUrl: release.htmlUrl,
    version: release.tagName,
  };
}

function createUltimateAsiLoaderVersionAsset(): DownloadableFrameworkAsset {
  return {
    browserDownloadUrl:
      'https://github.com/ThirteenAG/Ultimate-ASI-Loader/releases/download/x64-latest/version-x64.zip',
    name: 'version-x64.zip',
  };
}

async function findExtractedFile(
  directoryPath: string,
  predicate: (filePath: string) => boolean,
  description: string,
): Promise<string> {
  const matches = await findFilesRecursively(directoryPath, predicate);
  const firstMatch = matches[0];

  if (!firstMatch) {
    throw new Error(`The downloaded archive did not contain ${description}.`);
  }

  return firstMatch;
}

async function findFilesRecursively(
  directoryPath: string,
  predicate: (filePath: string) => boolean,
): Promise<string[]> {
  const directoryEntries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const matches: string[] = [];

  for (const entry of directoryEntries) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      matches.push(...(await findFilesRecursively(entryPath, predicate)));
      continue;
    }

    if (entry.isFile() && predicate(entryPath)) {
      matches.push(entryPath);
    }
  }

  return matches;
}

function isFileMissingError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function defaultExtractZipImpl(
  archivePath: string,
  options: { dir: string },
): Promise<void> {
  const module = await import('extract-zip');
  const extractZip = module.default as ExtractZipFunction;

  return extractZip(archivePath, options);
}
