import type { SettingsKey } from './SettingsKey';

/**
 * The settings file as its readers and writers see it (openSettings, electron-store underneath).
 * Values come back unknown: each owner parses its own, so a damaged file falls back to defaults.
 * `set` writes the file at once, atomically, and throws when it cannot.
 */
export type Settings = {
  get: (key: SettingsKey) => unknown;
  set: (key: SettingsKey, value: unknown) => void;
  has: (key: SettingsKey) => boolean;
};
