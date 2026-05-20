import { describe, expect, it, vi } from 'vitest';

import { createGameBananaCatalogService } from '../../src/main/catalog/gameBananaCatalogService';

function createFetchResponse(
  body: string,
  init?: { status?: number; statusText?: string },
): Response {
  return new Response(body, init);
}

describe('createGameBananaCatalogService', () => {
  it('prefers the newest active zip file when GameBanana exposes mixed archive formats', async () => {
    const fetchImpl = vi.fn(async () =>
      createFetchResponse(
        JSON.stringify({
          'Files().aFiles()': {
            rar: {
              _bIsArchived: false,
              _idRow: 'rar-file',
              _nDownloadCount: 7,
              _nFilesize: 2048,
              _sDescription: 'RAR build',
              _sDownloadUrl: 'https://gamebanana.com/dl/rar-file',
              _sFile: 'mod-release.7z',
              _sVersion: '2.0.0',
              _tsDateAdded: 200,
            },
            zip: {
              _bIsArchived: false,
              _idRow: 'zip-file',
              _nDownloadCount: 14,
              _nFilesize: 1024,
              _sDescription: 'ZIP build',
              _sDownloadUrl: 'https://gamebanana.com/dl/zip-file',
              _sFile: 'mod-release.zip',
              _sVersion: '1.9.0',
              _tsDateAdded: 100,
            },
          },
          'Owner().name': 'Uploader',
          'Preview().sSubFeedImageUrl()': null,
          'Url().sProfileUrl()': 'https://gamebanana.com/mods/1',
          date: 100,
          description: 'Description',
          downloads: 12,
          install_instructions: '',
          likes: 4,
          name: 'Example mod',
          text: '',
        }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const service = createGameBananaCatalogService({ fetchImpl });

    const mod = await service.getMod(1);

    expect(mod.selectedFileId).toBe('zip-file');
  });

  it('leaves the selected file empty when no active zip file is available', async () => {
    const fetchImpl = vi.fn(async () =>
      createFetchResponse(
        JSON.stringify({
          'Files().aFiles()': {
            unsupported: {
              _bIsArchived: false,
              _idRow: 'unsupported-file',
              _nDownloadCount: 7,
              _nFilesize: 2048,
              _sDescription: '7z build',
              _sDownloadUrl: 'https://gamebanana.com/dl/unsupported-file',
              _sFile: 'mod-release.7z',
              _sVersion: '2.0.0',
              _tsDateAdded: 200,
            },
            archivedZip: {
              _bIsArchived: true,
              _idRow: 'archived-zip-file',
              _nDownloadCount: 14,
              _nFilesize: 1024,
              _sDescription: 'Old ZIP build',
              _sDownloadUrl: 'https://gamebanana.com/dl/archived-zip-file',
              _sFile: 'mod-release.zip',
              _sVersion: '1.9.0',
              _tsDateAdded: 100,
            },
          },
          'Owner().name': 'Uploader',
          'Preview().sSubFeedImageUrl()': null,
          'Url().sProfileUrl()': 'https://gamebanana.com/mods/1',
          date: 100,
          description: 'Description',
          downloads: 12,
          install_instructions: '',
          likes: 4,
          name: 'Example mod',
          text: '',
        }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const service = createGameBananaCatalogService({ fetchImpl });

    const mod = await service.getMod(1);

    expect(mod.selectedFileId).toBeNull();
  });
});
