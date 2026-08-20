import type { Vec3 } from '../math/Vec3';

/**
 * SurfaceCutTile — one leaf of `cutSurfaceTiles`'s walk that is actually
 * resident this frame (a leaf with no resident tile anywhere in its
 * ancestor chain is dropped; the base globe covers it instead — see the
 * Task 2 brief). `originLocal` is the direction of the tile's uv-origin
 * corner — `originLocal = equirectUvToDirection([u0, v0])`, `[u0, v0]` the
 * tile's uv footprint origin — a binding cross-task contract Task 3's mesh
 * baker shares.
 */
export type SurfaceCutTile = {
  readonly id: { readonly z: number; readonly x: number; readonly y: number };
  readonly originLocal: Vec3;
  readonly resident: {
    readonly slot: number;
    readonly atlasUvOrigin: readonly [number, number];
    readonly atlasUvScale: readonly [number, number];
    /** Ancestor steps it took to find a resident tile; 0 = the leaf's own
     *  exact tile. */
    readonly levelDelta: number;
    /** The uv-origin corner's `[0,1)` fractional position inside the
     *  resolved ancestor's atlas rect — the CPU-side, once-per-leaf twin of
     *  `earth/fragment.wesl`'s per-fragment `cellCols`/`fract` math. */
    readonly quadrantOffset: readonly [number, number];
  };
};
