import { describe, expect, it } from 'vitest';

import { appIpcChannels } from '../../src/shared/ipc';

describe('appIpcChannels', () => {
  it('uses stable, unique channel names', () => {
    const values = Object.values(appIpcChannels);
    const uniqueCount = new Set(values).size;

    expect(uniqueCount).toBe(values.length);
    expect(values).toEqual([
      'app:choose-game-directory',
      'app:get-settings',
      'app:install-mod-framework',
    ]);
  });
});
