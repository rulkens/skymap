/**
 * ClusterAnchor — a named cluster anchor: sky coord + display label.
 *
 * Used by `src/data/clusterAnchors.ts` for the CLUSTER_ANCHORS /
 * SUPERCLUSTER_ANCHORS / VOID_ANCHORS tables and their CF-4 audit
 * consumers.  Distances are best-effort consensus values from the
 * literature (NED + simbad); small (±10 %) discrepancies don't
 * affect the audit's pass/fail percentile.
 */

import type { SkyCoord } from './SkyCoord';

/** A named cluster anchor — sky coord + display label. */
export type ClusterAnchor = SkyCoord & {
  readonly name: string;
};
