import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Constellations-typed row of the SOURCE_REGISTRY — the true-3D asterism
 * stick-figure overlay. The classical constellation lines drawn between the
 * real heliocentric positions of their member stars, built at data time into
 * a single `constellations.json` artifact (not a tiered `.bin`, so no
 * `binBaseName`).
 *
 * A singleton overlay like `filament` / `milkyWay` / `flow`: one global asset,
 * no per-record identity or pick code. Boot visibility and the default
 * line-intensity multiplier live in `state/constellations/initialState.ts`,
 * not on this row — an entry describes the asset, not what the app does
 * with it at boot.
 */
export type ConstellationsSourceEntry = SourceEntryBase & {
  readonly type: 'constellations';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
