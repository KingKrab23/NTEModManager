import { describe, expect, it } from 'vitest';

import { appIpcChannels } from '../../src/shared/ipc';

describe('appIpcChannels', () => {
  it('uses stable, unique channel names', () => {
    const values = Object.values(appIpcChannels);
    const uniqueCount = new Set(values).size;

    expect(uniqueCount).toBe(values.length);
    expect(values).toEqual([
      'app:choose-game-directory',
      'app:choose-local-mod-archive',
      'app:get-settings',
      'app:install-censorship-remover',
      'app:install-mod-framework',
      'app:list-gamebanana-mods',
      'app:install-gamebanana-mod',
      'app:install-local-archive-mod',
      'app:list-installed-gamebanana-mods',
      'app:set-installed-gamebanana-mod-enabled',
      'app:show-message-box',
      'app:uninstall-gamebanana-mod',
      'app:update-installed-gamebanana-mod',
    ]);
  });
});
