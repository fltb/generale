export interface GlobalSettings {
  locale: string;
  theme: string;
  soundMuted: boolean;
}

export const GLOBAL_SETTINGS_KEYS: readonly (keyof GlobalSettings)[] = [
  "locale",
  "theme",
  "soundMuted",
] as const;
