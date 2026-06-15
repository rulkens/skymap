import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Filament-typed row of the SOURCE_REGISTRY — derived line-strip geometry
 * built from the DisPerSE skeleton of a 2MRS + GLADE density field.
 *
 * Single global asset; no per-record identity or per-vertex source code,
 * unlike galaxy catalog rows. The entry exists so every data source skymap loads
 * has one place to look — visibility default + intensity multiplier come
 * from here, the .bin lives on disk under `binBaseName`.
 */
export type FilamentSourceEntry = SourceEntryBase & {
  readonly type: 'filament';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
  /** Filename stem under `public/data/` (the loader appends `.bin`). */
  readonly binBaseName: string;
  /**
   * Default intensity multiplier applied to the line-strip alpha at
   * render time. Lives here so a future "Filaments" panel can read the
   * starting slider value from the same registry every other asset reads.
   */
  readonly intensity: number;
};
