import type { Settings } from '../../../src/main/settings/@types/Settings';
import type { SettingsKey } from '../../../src/main/settings/@types/SettingsKey';

/** Settings held in a Map, for tests: electron-store itself needs a running Electron. */
export function memorySettings(initial: Partial<Record<SettingsKey, unknown>> = {}) {
  const values = new Map<SettingsKey, unknown>(Object.entries(initial) as [SettingsKey, unknown][]);
  const settings: Settings = {
    get: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
  };
  return { settings, values };
}
