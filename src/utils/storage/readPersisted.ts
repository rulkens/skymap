import type { PersistedValue } from '../../@types/state/PersistedValue';

/** Null on absence, unparsable value, SSR, or a private-mode storage throw. */
export function readPersisted<T>(row: PersistedValue<T>): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(row.key);
    return raw === null ? null : row.parse(raw);
  } catch {
    return null;
  }
}
