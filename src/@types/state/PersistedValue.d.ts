/**
 * PersistedValue — one store value mirrored to a localStorage key.
 *
 * Read once at boot (`readPersisted`) to seed the store, written back on change
 * (`persistValues`). `parse` returning null means "use the caller's default".
 * `serialize`/`skip` use method syntax on purpose: bivariant parameters let a
 * `PersistedValue<number | null>` sit in a `PersistedValue<unknown>[]` table.
 */
import type { RootState } from '../../store/types';

export type PersistedValue<T> = {
  /** Never rename without a migration: returning users' values live under it. */
  readonly key: string;
  readonly select: (s: RootState) => T;
  readonly parse: (raw: string) => T | null;
  serialize(v: T): string;
  /** Values not worth writing (splash: null is not a dismissal). */
  skip?(v: T): boolean;
};
