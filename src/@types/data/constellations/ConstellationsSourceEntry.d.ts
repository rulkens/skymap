import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Constellations-typed row of the SOURCE_REGISTRY — the true-3D asterism
 * stick-figure overlay. The classical constellation lines drawn between the
 * real heliocentric positions of their member stars, built at data time into
 * a single `constellations.json` artifact (not a tiered `.bin`, so no
 * `binBaseName`).
 *
 * A singleton overlay like `filament` / `milkyWay` / `flow`: one global asset,
 * no per-record identity or pick code. The entry is the single home for the
 * layer's default-visible master toggle (`visible`, from the base) plus the
 * line-intensity multiplier — `settings.constellations` seeds its defaults
 * from this row.
 */
export type ConstellationsSourceEntry = SourceEntryBase & {
  readonly type: 'constellations';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
  /**
   * Default intensity multiplier applied to the stick-figure line alpha at
   * render time. Lives here so the Constellations panel reads the starting
   * slider value from the same registry every other overlay reads.
   */
  readonly intensity: number;
};
