import type { SurfacePatchAnchor } from './SurfacePatchAnchor';
import type { ResolvedTileResidency } from './ResolvedTileResidency';

/**
 * SurfaceCutTile — one leaf of `cutSurfaceTiles`'s walk that is actually
 * drawable this frame: its own height tile resident AND some albedo in its
 * ancestor chain (a leaf missing either is dropped; the base globe covers it).
 *
 * `anchor` carries the leaf's angular footprint, not a corner DIRECTION: the
 * direction is derivable from it via `patchOriginRelEyeM`, and two parallel
 * statements of the same corner — one f32-rounded, one not — is exactly the
 * per-patch drift spec §7.1 warns about.
 */
export type SurfaceCutTile = {
  readonly id: { readonly z: number; readonly x: number; readonly y: number };
  readonly anchor: SurfacePatchAnchor;
  /** May be an ancestor's texels, flattened into this leaf's sub-rect. */
  readonly albedo: ResolvedTileResidency;
  /** Slot of this leaf's OWN `(z, x, y)` height tile in the height atlas —
   *  never an ancestor's (spec §5.2), which is what keeps edge-neighbouring
   *  patches on nested height lattices while tiles stream in. */
  readonly heightSlot: number;
  /** One bit per edge, `[west, east, south, north]` (R9): 1 where the
   *  neighbouring leaf is EXACTLY one level coarser, which is what lets F2's
   *  vertex stage collapse that edge onto the coarse neighbour's posts with
   *  no neighbour data beyond these four bits. `balanceSurfaceCut` fills it.
   *  A deeper step — a band ceiling the balance may not cross, or a parent it
   *  could not resolve — stays 0: the edge is left as a seam rather than
   *  collapsed onto posts the coarse side does not have. */
  readonly edgeCoarser: readonly [0 | 1, 0 | 1, 0 | 1, 0 | 1];
};
