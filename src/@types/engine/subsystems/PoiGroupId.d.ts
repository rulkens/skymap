/**
 * Identifies one of the three independently-arriving POI groups merged
 * by the subsystem into a single ordered list.
 *
 * ### Why a union instead of a free string
 *
 * The group key determines merge order (staticAnchors → famous →
 * clusterBulk) and must be stable across the engine lifecycle.  A
 * union makes typos a compile error, and the finite set can be
 * exhaustively checked wherever order matters.
 *
 * ### Group semantics
 *
 *   - `staticAnchors` — hand-curated cluster / supercluster / void
 *     anchors, built synchronously at boot from `buildStaticAnchorPois`.
 *   - `famous` — famous-galaxy POIs; needs both the meta sidecar and
 *     the Famous catalog, so it arrives asynchronously.
 *   - `clusterBulk` — bulk cluster/SC POIs parsed from the cluster
 *     catalog; available once the cluster-catalog asset slot lands.
 *
 * The three-group order matches the historical merge in `wireSlots`:
 * `[...staticAnchorPois, ...famousPois, ...clusterBulkPois]`.  Keeping
 * the same order preserves the ring pick-path's `instance_index →
 * getPoisForCategory(cat)[poiIndex]` alignment.
 */
export type PoiGroupId = 'staticAnchors' | 'famous' | 'clusterBulk';
