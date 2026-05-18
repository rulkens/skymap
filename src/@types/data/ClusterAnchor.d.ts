/**
 * ClusterAnchor — a named cluster anchor: sky coord + display label +
 * literature-grounded physical extent.
 *
 * Used by `src/data/clusterAnchors.ts` for the CLUSTER_ANCHORS /
 * SUPERCLUSTER_ANCHORS / VOID_ANCHORS tables and their CF-4 audit
 * consumers.  Distances are best-effort consensus values from the
 * literature (NED + simbad); small (±10 %) discrepancies don't
 * affect the audit's pass/fail percentile.
 */

import type { SkyCoord } from './SkyCoord';

/**
 * A named cluster anchor — sky coord + display label + a literature-
 * grounded physical radius.
 *
 * `physicalRadiusMpc` is the structure's characteristic extent in Mpc,
 * sourced from the per-anchor citation comment in
 * `src/data/clusterAnchors.ts`. Consumers use it for two purposes
 * (introduced in the cluster-viz sub-plans 2–4):
 *
 *   1. The on-screen ring radius (sub-plan 2 — at-rest viz)
 *   2. The member cone-search radius (sub-plan 4 — focus mode)
 *
 * Required (not optional) so every anchor has a value at table-edit
 * time rather than at consumer-edit time.
 */
export type ClusterAnchor = SkyCoord & {
  readonly name: string;
  readonly physicalRadiusMpc: number;
};
