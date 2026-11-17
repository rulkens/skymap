import Store from 'electron-store';
import type { Settings } from './@types/Settings';

/**
 * <userData>/settings.json through electron-store (owner ruling 2026-11-06): the setup, the room code
 * and how the sky window was left. Files the app writes as data (certificates, the mirror's lists)
 * stay files of their own. No schema: a damaged value is the parser's to default, not a launch error.
 */
export function openSettings(userData: string): Settings {
  const store = new Store<Record<string, unknown>>({ cwd: userData, name: 'settings' });
  return {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
  };
}
