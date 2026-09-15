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
  /** Per edge, in R9 order `[west, east, south, north]`: 1 when the
   *  neighbouring leaf's HEIGHT level is exactly one coarser, which F2 samples
   *  at doubled stride — that neighbour's own lattice. 0 otherwise, a step of
   *  two or more (R12's band seam) included: no stride meets it, and F2's
   *  skirt — drawn on every edge — is what hides it. `balanceSurfaceCut` fills
   *  it; only the fine side of a pair carries a bit. */
  readonly edgeCoarser: readonly [0 | 1, 0 | 1, 0 | 1, 0 | 1];
};
