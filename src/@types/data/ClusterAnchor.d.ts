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
 * A named cluster anchor — sky coord + display label + two literature-
 * grounded radii.
 *
 * Two radii, two purposes:
 *
 *   `physicalRadiusMpc` — the structure's CORE extent in Mpc (virial
 *   radius / R_200 for clusters; characteristic scale for superclusters
 *   and voids).  Drives:
 *     - Camera-focus tween distance (how close `f` / Focus button parks)
 *     - InfoCard's "r {value}" line (the citable literature number)
 *
 *   `apparentRadiusMpc` — the NAMED/VISUAL extent in Mpc.  For clusters
 *   this is typically 2-3× the core radius and encloses the wider
 *   membership the casual reader associates with the name (Virgo's
 *   ~6 Mpc envelope including the M84/M86 subgroup; Coma's outer
 *   ~5-6 Mpc reach to NGC 4839).  For superclusters and voids the
 *   distinction collapses — those structures have no "virial core" —
 *   so apparent == physical and the existing literature value already
 *   IS the apparent extent.  Drives:
 *     - The on-screen ring + halo half-extent (cluster marker render)
 *     - Future galaxy-membership cone search (sub-plan 4) — gates
 *       which galaxies count as "part of this cluster" for visual
 *       hide/show
 *
 * Both required (not optional) so every anchor has both values at
 * table-edit time rather than at consumer-edit time.  See the per-
 * anchor comments in `src/data/clusterAnchors.ts` for the citation
 * each value is sourced from.
 */
export type ClusterAnchor = SkyCoord & {
  readonly name: string;
  readonly physicalRadiusMpc: number;
  readonly apparentRadiusMpc: number;
};
