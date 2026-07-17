import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * FamousStar-typed row of the SOURCE_REGISTRY — the curated, true-scale stellar
 * neighbourhood (the Sun plus the hand-picked nearby-star map) in the near-field
 * descent. The curated overlay twin of the survey-wide Gaia star bin: a single
 * seeded collection (positions live in the body store, not this row), drawn by
 * its own content-layer.
 *
 * Bodies are not pickable and carry no COSMO label/marker: their captions ship
 * through the foreground-labels layer rather than the structure/galaxy-name
 * label systems the `bearsLabel`/`bearsMarker` flags drive. So this variant
 * adds only `code` to the base — no on-disk asset stem, no per-record identity.
 */
export type FamousStarSourceEntry = SourceEntryBase & {
  readonly type: 'famousStar';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
