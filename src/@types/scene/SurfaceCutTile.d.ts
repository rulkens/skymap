import type { SurfacePatchAnchor } from './SurfacePatchAnchor';
import type { ResolvedTileResidency } from './ResolvedTileResidency';

/**
 * SurfaceCutTile — one leaf of `cutSurfaceTiles`'s walk that is actually
 * drawable this frame: some albedo AND some height in its ancestor chain (a
 * leaf missing either is dropped; the base globe covers it).
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
  /** The height lattice this leaf samples: the deepest resident tile in its own
   *  ancestor chain, `levelDelta` levels above `id.z` (0 = its own tile), and
   *  the origin in posts of the leaf's sub-rect inside that slot. `cells` is
   *  `128 >> levelDelta`. Balance may raise `levelDelta` (never lower it). */
  readonly height: {
    readonly slot: number;
    readonly levelDelta: number;
    readonly originPosts: readonly [number, number];
  };
  /** One bit per edge, `[west, east, south, north]` (R9): 1 where the
   *  neighbouring leaf's HEIGHT level is exactly one coarser, which lets F2's
   *  vertex stage collapse that edge onto the coarse neighbour's posts with
   *  no neighbour data beyond these four bits. `balanceSurfaceCut` fills it.
   *  A deeper step — a band ceiling the balance may not cross, or a parent it
   *  could not resolve — stays 0: the edge is left as a seam rather than
   *  collapsed onto posts the coarse side does not have. */
  readonly edgeCoarser: readonly [0 | 1, 0 | 1, 0 | 1, 0 | 1];
};
