import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Earth-typed row of the SOURCE_REGISTRY — the textured true-scale planet in
 * the near-field descent. A single seeded body (positions live in the body
 * store, not this row), drawn by its own content-layer.
 *
 * Bodies are not pickable and carry no COSMO label/marker: their captions ship
 * through the foreground-labels layer rather than the structure/galaxy-name
 * label systems the `bearsLabel`/`bearsMarker` flags drive. So this variant
 * adds only `code` to the base — no on-disk asset stem, no per-record identity.
 */
export type EarthSourceEntry = SourceEntryBase & {
  readonly type: 'earth';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
