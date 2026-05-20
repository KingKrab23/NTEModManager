import { mkdir } from 'node:fs/promises';
import { basename } from 'node:path';

import { path7za } from '7zip-bin';
import { createExtractorFromFile, type UnrarError } from 'node-unrar-js';
import {
  extractFull,
  list,
  type Data as SevenZipData,
  type ZipStream,
} from 'node-7z';

import {
  getSupportedGameBananaArchiveFormat,
  type SupportedGameBananaArchiveFormat,
} from '../../shared/catalog';

export type ExtractArchiveFunction = (
  archivePath: string,
  options: { dir: string },
) => Promise<void>;

export async function extractArchive(
  archivePath: string,
  options: { dir: string },
): Promise<void> {
  const fileName = basename(archivePath);
  const archiveFormat = getSupportedGameBananaArchiveFormat(fileName);

  if (!archiveFormat) {
    throw new Error(`Unsupported archive format for ${fileName}.`);
  }

  await mkdir(options.dir, { recursive: true });

  switch (archiveFormat) {
    case 'zip':
      await extractZipArchive(archivePath, options.dir);
      return;
    case '7z':
      await extractSevenZipArchive(archivePath, options.dir);
      return;
    case 'rar':
      await extractRarArchive(archivePath, options.dir);
      return;
  }
}

async function extractZipArchive(
  archivePath: string,
  outputDirectory: string,
): Promise<void> {
  const module = await import('extract-zip');
  const extractZip = module.default as (
    archivePath: string,
    options: { dir: string },
  ) => Promise<void>;

  await extractZip(archivePath, { dir: outputDirectory });
}

async function extractSevenZipArchive(
  archivePath: string,
  outputDirectory: string,
): Promise<void> {
  const entryPaths: string[] = [];

  await waitForSevenZipStream(
    list(archivePath, {
      $bin: path7za,
    }),
    (event) => {
      if (event.file) {
        entryPaths.push(event.file);
      }
    },
  );

  validateArchiveEntryPaths(archivePath, entryPaths);

  await waitForSevenZipStream(
    extractFull(archivePath, outputDirectory, {
      $bin: path7za,
      yes: true,
    }),
  );
}

async function extractRarArchive(
  archivePath: string,
  outputDirectory: string,
): Promise<void> {
  const extractor = await createExtractorFromFile({
    filepath: archivePath,
    targetPath: outputDirectory,
  });
  const fileHeaders = [...extractor.getFileList().fileHeaders];

  validateArchiveEntryPaths(
    archivePath,
    fileHeaders.map((fileHeader) => fileHeader.name),
  );

  const extractedFiles = extractor.extract();

  for (const _file of extractedFiles.files) {
    void _file;
  }
}

async function waitForSevenZipStream(
  stream: ZipStream,
  onData?: (event: SevenZipData) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (event) => {
      onData?.(event);
    });
    stream.once('end', resolve);
    stream.once('error', reject);
  });
}

function validateArchiveEntryPaths(
  archivePath: string,
  entryPaths: readonly string[],
): void {
  for (const entryPath of entryPaths) {
    if (!isSafeArchiveEntryPath(entryPath)) {
      throw new Error(
        `Archive ${basename(archivePath)} contains an unsafe entry path: ${entryPath}`,
      );
    }
  }
}

function isSafeArchiveEntryPath(entryPath: string): boolean {
  const normalizedEntryPath = entryPath.replaceAll('\\', '/');

  if (
    normalizedEntryPath.startsWith('/') ||
    /^[A-Za-z]:/.test(normalizedEntryPath)
  ) {
    return false;
  }

  const segments = normalizedEntryPath.split('/').filter(Boolean);

  return !segments.some((segment) => segment === '..');
}

export function getArchiveSignatureLabel(
  archiveFormat: SupportedGameBananaArchiveFormat,
): string {
  switch (archiveFormat) {
    case '7z':
      return '7Z';
    case 'rar':
      return 'RAR';
    case 'zip':
    default:
      return 'ZIP';
  }
}

export function isArchivePayloadSignatureValid(
  fileName: string,
  archiveBuffer: Buffer,
): boolean {
  const archiveFormat = getSupportedGameBananaArchiveFormat(fileName);

  if (!archiveFormat) {
    return false;
  }

  switch (archiveFormat) {
    case 'zip':
      return matchesAnySignature(archiveBuffer, [
        [0x50, 0x4b, 0x03, 0x04],
        [0x50, 0x4b, 0x05, 0x06],
        [0x50, 0x4b, 0x07, 0x08],
      ]);
    case '7z':
      return matchesAnySignature(archiveBuffer, [
        [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
      ]);
    case 'rar':
      return matchesAnySignature(archiveBuffer, [
        [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00],
        [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00],
      ]);
  }
}

function matchesAnySignature(
  archiveBuffer: Buffer,
  signatures: readonly number[][],
): boolean {
  return signatures.some((signature) => {
    if (archiveBuffer.length < signature.length) {
      return false;
    }

    return signature.every(
      (signatureByte, index) => archiveBuffer[index] === signatureByte,
    );
  });
}

export function isKnownInvalidArchiveError(
  error: unknown,
): error is Error | (UnrarError & Error) {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithStderr = error as Error & { stderr?: unknown };
  const stderr =
    typeof errorWithStderr.stderr === 'string' ? errorWithStderr.stderr : '';
  const normalizedMessage = `${error.message} ${stderr}`.toLowerCase();

  return (
    normalizedMessage.includes('end of central directory') ||
    normalizedMessage.includes('invalid central directory') ||
    normalizedMessage.includes('invalid zip') ||
    normalizedMessage.includes('is not archive') ||
    normalizedMessage.includes('not rar archive') ||
    normalizedMessage.includes('bad archive') ||
    normalizedMessage.includes('unknown archive format') ||
    normalizedMessage.includes('can not open the file as') ||
    normalizedMessage.includes('unexpected end of archive')
  );
}

export function formatArchiveExtractionErrorMessage(
  archiveFormat: SupportedGameBananaArchiveFormat,
  fileName: string,
  error: unknown,
): string {
  if (isKnownInvalidArchiveError(error)) {
    return `Downloaded ${fileName} is not a valid ${getArchiveSignatureLabel(archiveFormat)} archive or was truncated before extraction finished.`;
  }

  if (error instanceof Error) {
    return `Could not extract ${fileName}: ${error.message}`;
  }

  return `Could not extract ${fileName}.`;
}
