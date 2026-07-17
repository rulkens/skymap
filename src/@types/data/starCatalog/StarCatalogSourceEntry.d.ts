import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * StarCatalog-typed row of the SOURCE_REGISTRY — the survey-wide Gaia
 * stellar catalog, streamed as tiered `stars-<tier>.bin` point clouds.
 *
 * The wide-field twin of the curated `famousStar` neighbourhood: where
 * that row seeds a hand-picked map from the body store, this one loads
 * millions of Gaia stars from disk and hands them to the star renderer.
 * Its presentation defaults live in-row (like `VolumeSourceEntry`) rather
 * than in a separate settings table, so the draw budget and the crossfade
 * band that hands off to the procedural Milky-Way cloud sit next to the
 * `binBaseName` they govern. Stars are not persisted to a stable id and
 * not pickable — the `code` is a registry key only.
 */
export type StarCatalogSourceEntry = SourceEntryBase & {
  readonly type: 'starCatalog';
  /** Stable numeric tag; registry key only — not persisted, not packed. */
  readonly code: number;
  /** Filename stem under public/data/; loader appends `-<tier>.bin`. */
  readonly binBaseName: string;
  /** Ships per-tier `.bin` variants (always true for this source). */
  readonly tiered: boolean;
  /** Per-frame drawn-point budget: typical + hard cap (§ renderer, Task 7). */
  readonly drawBudget: { readonly typical: number; readonly hardCap: number };
  /** Camera-distance crossfade band to the procedural MW cloud, parsecs. */
  readonly crossfadePc: { readonly inner: number; readonly outer: number };
};
