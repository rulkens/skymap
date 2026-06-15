/**
 * `dedupeByProximity` — curated-wins 3D proximity merge.
 *
 * When building the clusters layer we combine a hand-tuned set of
 * featured anchors (e.g. a named Coma entry with a carefully chosen
 * radius) with a bulk MCXC/MSCC candidate list.  Without deduplication
 * the same structure appears twice: once from the curated anchor and
 * once from the catalog bulk pull.
 *
 * This helper enforces the curated-wins rule: any bulk candidate whose
 * Euclidean distance to ANY featured anchor is ≤ max(anchor.radiusMpc,
 * floorMpc) is dropped.  The floor ensures that even anchors with a
 * nominally tiny radius still suppress obvious duplicates within a
 * sensible neighbourhood.
 *
 * "Exceeds" is strict (>), so a candidate exactly at the threshold
 * distance is dropped — conservative, consistent with the radius being
 * an exclusion boundary.
 *
 * Distance comparisons use squared magnitudes to avoid sqrt on every
 * pair.  Pure function; preserves input order of surviving candidates.
 */

import type { Vec3 } from '../../src/@types/math/Vec3';

export type ProximityPoint = { worldPos: Vec3 };

type FeaturedAnchor = { worldPos: Vec3; radiusMpc: number };

/** Squared Euclidean distance between two world positions. */
function distSq(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Return the subset of `candidates` that lie strictly outside every
 * featured anchor's exclusion sphere.
 *
 * The exclusion radius for each anchor is `max(anchor.radiusMpc, floorMpc)`.
 * A candidate at distance d from an anchor is dropped when d ≤ threshold
 * (i.e. kept only when d > threshold for ALL anchors).
 */
export function dedupeByProximity<C extends ProximityPoint>(
  featured: readonly FeaturedAnchor[],
  candidates: readonly C[],
  floorMpc: number,
): C[] {
  if (featured.length === 0) return candidates.slice();

  return candidates.filter((candidate) => {
    for (const anchor of featured) {
      const threshold = Math.max(anchor.radiusMpc, floorMpc);
      const thresholdSq = threshold * threshold;
      if (distSq(candidate.worldPos, anchor.worldPos) <= thresholdSq) {
        // Within (or exactly at) this anchor's exclusion sphere — drop it.
        return false;
      }
    }
    return true;
  });
}
