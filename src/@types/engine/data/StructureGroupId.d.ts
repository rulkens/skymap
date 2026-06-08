/**
 * StructureGroupId — which slot a structure record occupies within the
 * structure store.
 *
 * `anchors` holds the hand-curated featured structures,
 * `bulk` holds the catalog-derived remainder.  Famous galaxies are galaxy
 * data, not structures, so they live outside the structure store entirely.
 *
 * The store's `all()` concatenation order is `anchors` then `bulk`.  That
 * order is load-bearing: it preserves the ring marker pick-index alignment
 * (anchors are appended first so their pick indices stay stable as bulk
 * entries come and go).
 */

/** Structure-store group — `anchors` (featured) then `bulk` (catalog). */
export type StructureGroupId = 'anchors' | 'bulk';
