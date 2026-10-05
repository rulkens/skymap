import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Filament-typed row of the SOURCE_REGISTRY — derived line-strip geometry
 * built from the DisPerSE skeleton of a 2MRS + GLADE density field.
 *
 * Single global asset; no per-record identity or per-vertex source code,
 * unlike galaxy catalog rows. The entry exists so every data source skymap
 * loads has one place to look — the .bin lives on disk under `binBaseName`.
 * Boot visibility and the default intensity multiplier live in
 * `state/cosmicWebFilaments/initialState.ts`, not on this row.
 */
export type CosmicWebFilamentsSourceEntry = SourceEntryBase & {
  readonly type: 'cosmicWebFilaments';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
  /** Filename stem under `public/data/` (the loader appends `.bin`). */
  readonly binBaseName: string;
};
