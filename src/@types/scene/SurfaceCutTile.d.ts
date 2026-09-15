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
  /** Per edge, in R9 order `[west, east, south, north]`, how far the
   *  neighbouring leaf steps UP: 0 = same level, finer, or no neighbour;
   *  1 = exactly one level coarser (F2 collapses that edge onto the coarse
   *  neighbour's posts); 2 = coarser by more than one level — a band seam the
   *  2:1 balance may not cross (spec §6 R12), which F2 hides with a skirt and
   *  never collapses, since the coarse side has no post at the even index.
   *  `balanceSurfaceCut` fills it; only the FINE side of a step carries one. */
  readonly edgeCoarser: readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2];
};
