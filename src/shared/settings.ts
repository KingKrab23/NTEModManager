export interface AppSettings {
  gamePath: string | null;
  lastUpdatedAt: string | null;
}

export const defaultAppSettings: AppSettings = {
  gamePath: null,
  lastUpdatedAt: null,
};

export function parseStoredSettings(input: unknown): AppSettings {
  if (!input || typeof input !== 'object') {
    return defaultAppSettings;
  }

  const candidate = input as Record<string, unknown>;

  return {
    gamePath:
      typeof candidate.gamePath === 'string' ? candidate.gamePath : null,
    lastUpdatedAt:
      typeof candidate.lastUpdatedAt === 'string'
        ? candidate.lastUpdatedAt
        : null,
  };
}

export function withUpdatedTimestamp(settings: AppSettings): AppSettings {
  return {
    ...settings,
    lastUpdatedAt: new Date().toISOString(),
  };
}
